#include "conversion_support.hpp"
#include "binary_resolver.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <utility>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>
#include <thread>
#include <vector>

#include <nlohmann/json.hpp>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shlobj.h>    // SHGetKnownFolderPath / FOLDERID_Documents
#include <winioctl.h>  // IOCTL_STORAGE_EJECT_MEDIA / IOCTL_STORAGE_MEDIA_REMOVAL
#include <cwchar>      // wcslen
#include <cstring>     // _strnicmp / strlen
#define popen _popen
#define pclose _pclose
#endif

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace Panamedia {

    // ── helpers ──────────────────────────────────────────────────────────────

    // ffmpeg/ffprobe locations are resolved (and health-checked) by
    // BinaryResolver, which mirrors youtube.cjs's candidate order but skips
    // binaries that crash on startup.

    // Runs a command and captures stdout. On Windows we wrap the whole thing in
    // an extra pair of quotes to survive cmd.exe quote-stripping; this mirrors
    // what media_prober.cpp already does.
    static std::string captureCommand(const std::string& exe, const std::string& args,
                                      int* outExitCode = nullptr) {
        std::stringstream cmd;
#ifdef _WIN32
        cmd << "\"\"" << exe << "\" " << args << "\"";
#else
        cmd << "\"" << exe << "\" " << args;
#endif
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            if (outExitCode) *outExitCode = -1;
            return "";
        }

        std::string out;
        std::array<char, 4096> buf;
        while (fgets(buf.data(), static_cast<int>(buf.size()), pipe) != nullptr) {
            out += buf.data();
        }
        int rc = pclose(pipe);
        if (outExitCode) *outExitCode = rc;
        return out;
    }

    static uint64_t toEpochMs(const fs::file_time_type& ft) {
        // MSVC's fs::file_time_type counts 100ns ticks since 1601-01-01 UTC.
        auto ticks = ft.time_since_epoch().count();
        const int64_t kTicksPerSecond = 10000000LL;
        const int64_t kEpochDeltaSeconds = 11644473600LL;
        int64_t unixTicks = (int64_t)ticks - kEpochDeltaSeconds * kTicksPerSecond;
        if (unixTicks < 0) return 0;
        return (uint64_t)(unixTicks / 10000LL);
    }

    // Mirrors Node's path.extname(f).toLowerCase().replace('.', ''):
    // the substring from the last dot, lowercased, without the dot.
    // A leading dot is part of the name, not an extension, so ".gitignore"
    // yields "" just like Node does.
    static std::string extensionOf(const std::string& fileName) {
        size_t dot = fileName.find_last_of('.');
        if (dot == std::string::npos || dot == 0 || dot + 1 >= fileName.size()) {
            return "";
        }
        std::string ext = fileName.substr(dot + 1);
        std::transform(ext.begin(), ext.end(), ext.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });
        return ext;
    }

#ifdef _WIN32
    static std::wstring utf8ToWide(const std::string& s) {
        if (s.empty()) return std::wstring();
        int needed = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
        if (needed <= 0) {
            needed = MultiByteToWideChar(CP_ACP, 0, s.c_str(), (int)s.size(), nullptr, 0);
            if (needed <= 0) return std::wstring();
        }
        std::wstring out((size_t)needed, L'\0');
        MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], needed);
        return out;
    }

    static std::string wideToUtf8(const std::wstring& w) {
        if (w.empty()) return "";
        int needed = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
        if (needed <= 0) return "";
        std::string out((size_t)needed, '\0');
        WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), out.data(), needed, nullptr, nullptr);
        return out;
    }
#endif

    // Attributes + size + mtime in a single syscall. std::filesystem needs a
    // separate call for is_regular_file / file_size / last_write_time, which is
    // roughly 4x the I/O and measurably slower than Node's one fs.statSync.
    struct FileStat {
        bool ok = false;
        bool isRegular = false;
        uint64_t sizeBytes = 0;
        uint64_t mtimeMs = 0;
    };

#ifdef _WIN32
    static uint64_t fileTimeToEpochMs(const FILETIME& ft) {
        ULARGE_INTEGER u;
        u.LowPart = ft.dwLowDateTime;
        u.HighPart = ft.dwHighDateTime;
        const uint64_t kEpochDelta100ns = 116444736000000000ULL; // 1601 -> 1970
        if (u.QuadPart < kEpochDelta100ns) return 0;
        return (u.QuadPart - kEpochDelta100ns) / 10000ULL;
    }

    static FileStat statFast(const fs::path& p) {
        FileStat s;
        WIN32_FILE_ATTRIBUTE_DATA fad;
        if (!GetFileAttributesExW(p.wstring().c_str(), GetFileExInfoStandard, &fad)) return s;
        s.ok = true;
        s.isRegular = (fad.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
        ULARGE_INTEGER sz;
        sz.LowPart = fad.nFileSizeLow;
        sz.HighPart = fad.nFileSizeHigh;
        s.sizeBytes = sz.QuadPart;
        s.mtimeMs = fileTimeToEpochMs(fad.ftLastWriteTime);
        return s;
    }
#else
    static FileStat statFast(const fs::path& p) {
        FileStat s;
        std::error_code ec;
        if (!fs::exists(p, ec)) return s;
        s.ok = true;
        s.isRegular = fs::is_regular_file(p, ec);
        if (ec) { s.isRegular = false; return s; }
        s.sizeBytes = fs::file_size(p, ec);
        if (ec) s.sizeBytes = 0;
        std::error_code mtEc;
        s.mtimeMs = toEpochMs(fs::last_write_time(p, mtEc));
        if (mtEc) s.mtimeMs = 0;
        return s;
    }
#endif

    // ── hardware acceleration ────────────────────────────────────────────────

    // Cached for the engine's lifetime.
    static std::string s_gpuCodec;
    static std::mutex s_gpuMutex;

    // Encoding one tiny synthetic frame is the only reliable way to know whether
    // a hardware encoder can actually initialise on this machine.
    //
    // `ffmpeg -encoders` lists encoders *compiled into the binary*, which says
    // nothing about the hardware present. A gyan.dev build ships with
    // --enable-nvenc, so on an Intel-only machine it still advertises h264_nvenc;
    // selecting it then makes every video conversion fail with
    // "Cannot load nvcuda.dll" and exit code 1.
    static bool encoderActuallyWorks(const std::string& encoder) {
        std::string args =
            "-v error -f lavfi -i color=c=black:s=64x64:d=0.2 -frames:v 1 "
            "-c:v " + encoder + " -f null -";
        int rc = 1;
        captureCommand(BinaryResolver::ffmpeg(), args, &rc);
        return rc == 0;
    }

    std::string ConversionSupport::detectHardwareAcceleration() {
        std::lock_guard<std::mutex> lock(s_gpuMutex);

        bool wasCached = !s_gpuCodec.empty();
        if (wasCached) {
            json r;
            r["codec"] = s_gpuCodec;
            r["cached"] = true;
            return r.dump();
        }

        // Cheap pre-filter: only probe encoders this ffmpeg build even has.
        std::string encoders = captureCommand(BinaryResolver::ffmpeg(), "-hide_banner -encoders");

        // Preference order, best available first.
        const std::pair<const char*, const char*> kCandidates[] = {
            {"nvenc", "h264_nvenc"},
            {"qsv",   "h264_qsv"},
            {"amf",   "h264_amf"},
            {"mf",    "h264_mf"},
        };

        std::string codec = "cpu";
        for (const auto& c : kCandidates) {
            if (encoders.find(c.second) == std::string::npos) continue;  // not built in
            // Built in but possibly unusable here (no NVIDIA/AMD device, or no
            // Media Foundation). Probe rather than trust the listing.
            if (encoderActuallyWorks(c.second)) { codec = c.first; break; }
        }

        s_gpuCodec = codec;

        json r;
        r["codec"] = codec;
        r["cached"] = false;
        return r.dump();
    }

    // ── thread budget ────────────────────────────────────────────────────────

    int ConversionSupport::getOptimalThreadCount() {
        unsigned int cores = std::thread::hardware_concurrency();
        if (cores == 0) cores = 4;
        // Keep at least half the machine free for the UI and the OS.
        int threads = (int)(cores / 2);
        if (threads < 1) threads = 1;
        if (threads > 4) threads = 4;

#ifdef _WIN32
        // Phase G: on battery, take the ceiling down to 2. A four-thread
        // x264 run is perfectly reasonable on mains and is exactly the kind
        // of thing that turns a laptop unusable twenty minutes into a flight
        // -- so the queue gets gentler the moment the cable comes out. The
        // user can still convert everything at once; it just takes longer.
        SYSTEM_POWER_STATUS pwr;
        ZeroMemory(&pwr, sizeof(pwr));
        if (GetSystemPowerStatus(&pwr) && pwr.ACLineStatus == 0) {
            if (threads > 2) threads = 2;
        }
#endif
        return threads;
    }

    std::string ConversionSupport::getPowerStatus() {
        json r;
#ifdef _WIN32
        SYSTEM_POWER_STATUS pwr;
        ZeroMemory(&pwr, sizeof(pwr));
        if (GetSystemPowerStatus(&pwr)) {
            // BatteryLife is 255 for a desktop with no battery fitted, and
            // is byte-clamped by the API, so both sentinels are folded away.
            int percent = (pwr.BatteryLifePercent == 255) ? -1 : (int)pwr.BatteryLifePercent;
            r["percent"] = percent;
            r["charging"] = (pwr.BatteryFlag & 8) != 0;   // BATTERY_FLAG_CHARGING
            bool onBattery = (pwr.ACLineStatus == 0);
            r["onBattery"] = onBattery;
            r["reason"] = onBattery ? "battery" : ((pwr.ACLineStatus == 1) ? "AC" : "unknown");
        } else {
            r["percent"] = -1;
            r["charging"] = false;
            r["onBattery"] = false;
            r["reason"] = "unavailable";
        }
#else
        r["percent"] = -1;
        r["charging"] = false;
        r["onBattery"] = false;
        r["reason"] = "unavailable";
#endif
        return r.dump();
    }

    std::string ConversionSupport::describeVolume(const std::string& path) {
        json r;
        r["freeBytes"] = 0;
        r["totalBytes"] = 0;
        r["writable"] = false;
        r["volumeLabel"] = "";

#ifdef _WIN32
        std::wstring wide = utf8ToWide(path);
        if (wide.size() < 2 || wide[1] != L':') {
            // Not a drive-rooted path (UNC, relative or extended form).
            // Report it as unwritable rather than guessing: the caller asked
            // about a volume and there is no volume to describe.
            return r.dump();
        }
        std::wstring root;
        root += wide[0];
        root += L":\\";

        DWORD driveType = GetDriveTypeW(root.c_str());
        // DRIVE_NO_ROOT_DIR means the letter is not mounted at all -- the
        // classic signature of a USB stick that has been pulled.
        if (driveType == DRIVE_NO_ROOT_DIR) {
            r["reason"] = "drive not present";
            return r.dump();
        }

        wchar_t labelBuf[MAX_PATH + 1];
        ZeroMemory(labelBuf, sizeof(labelBuf));
        GetVolumeInformationW(root.c_str(), labelBuf, MAX_PATH, nullptr, nullptr, nullptr, nullptr, 0);
        std::string label = wideToUtf8(std::wstring(labelBuf));
        if (label.empty()) label = wideToUtf8(root);
        r["volumeLabel"] = label;

        ULARGE_INTEGER avail, total, totalFree;
        ZeroMemory(&avail, sizeof(avail));
        if (GetDiskFreeSpaceExW(root.c_str(), &avail, &total, &totalFree)) {
            r["freeBytes"] = (uint64_t)avail.QuadPart;
            r["totalBytes"] = (uint64_t)total.QuadPart;
        }

        // Writability is probed in the directory that will actually receive the
        // file, not at the volume root.
        //
        // Two reasons that matters. The root of a drive is not writable by an
        // ordinary user account on current Windows, so probing there reports
        // "C: is read-only" on a perfectly healthy system. And writability is
        // really a property of the directory -- a folder can be read-only or
        // permission-locked while the drive around it is fine, which is the
        // case that matters when an export is refused.
        fs::path target = fs::u8path(path);
        fs::path probeDir = target;
        std::error_code pec;
        while (!probeDir.empty() && !fs::is_directory(probeDir, pec)) {
            fs::path up = probeDir.parent_path();
            if (up.empty() || up == probeDir) { probeDir = fs::path(); break; }
            probeDir = up;
        }
        if (probeDir.empty()) probeDir = fs::path(root);

        fs::path probeFile = probeDir / ".panamedia-write-test";
        HANDLE h = CreateFileW(probeFile.c_str(), GENERIC_WRITE,
                               FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, CREATE_ALWAYS,
                               FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE, nullptr);
        if (h != INVALID_HANDLE_VALUE) {
            CloseHandle(h);
            r["writable"] = true;
        } else {
            DWORD err = GetLastError();
            r["writable"] = false;
            // ERROR_NOT_READY is what a card reader with no card in it
            // reports; ERROR_DEV_NOT_EXIST and ERROR_PATH_NOT_FOUND are what a
            // pulled stick looks like once its letter has been cleared.
            if (err == ERROR_NOT_READY || err == ERROR_DEV_NOT_EXIST) {
                r["reason"] = "no media in the drive";
            } else if (err == ERROR_PATH_NOT_FOUND) {
                r["reason"] = "the drive is no longer connected";
            } else if (err == ERROR_ACCESS_DENIED || err == ERROR_WRITE_PROTECT ||
                       err == ERROR_USER_MAPPED_FILE) {
                r["reason"] = "the destination is read-only or access is denied";
            } else {
                r["reason"] = "the destination cannot be written to (error " +
                              std::to_string((unsigned long)err) + ")";
            }
        }
#else
        (void)path;
#endif
        return r.dump();
    }

    std::string ConversionSupport::longPathIfNeeded(const std::string& path) {
        if (path.empty()) return path;
#ifdef _WIN32
        // Below the safe length there is nothing to gain, and leaving short
        // paths alone keeps log output and error messages readable.
        static const size_t kExtendedFrom = 240;
        if (path.size() < kExtendedFrom) return path;

        if (path.rfind("\\\\?\\", 0) == 0) return path;   // already extended

        if (path.rfind("\\\\", 0) == 0) {
            // UNC share: \\server\share\... -> \\?\UNC\server\share\...
            return "\\\\?\\UNC" + path.substr(1);
        }
        if (path.size() >= 3 && path[1] == ':' && (path[2] == '\\' || path[2] == '/')) {
            // Strip the trailing separator GetDiskFreeSpaceExW and friends
            // dislike in extended form; root paths keep theirs.
            std::string body = path.substr(2);
            while (body.size() > 1 && (body.back() == '\\' || body.back() == '/')) body.pop_back();
            return "\\\\?\\" + path.substr(0, 2) + body;
        }
        return path;
#else
        return path;
#endif
    }

    // ── duration probe ───────────────────────────────────────────────────────

    std::string ConversionSupport::probeDuration(const std::string& filePath) {
        json r;
        std::error_code ec;
        if (filePath.empty() || !fs::exists(fs::u8path(filePath), ec)) {
            r["duration"] = 0.0;
            return r.dump();
        }

        std::string quoted = "\"" + filePath + "\"";
        int rc = 0;
        std::string out = captureCommand(
            BinaryResolver::ffprobe(),
            "-v error -show_entries format=duration "
            "-of default=noprint_wrappers=1:nokey=1 " + quoted,
            &rc);

        double duration = 0.0;
        try {
            std::string trimmed = out;
            // ffprobe may emit a trailing newline
            while (!trimmed.empty() && (trimmed.back() == '\n' || trimmed.back() == '\r' ||
                                        trimmed.back() == ' ' || trimmed.back() == '\t')) {
                trimmed.pop_back();
            }
            if (!trimmed.empty()) {
                duration = std::stod(trimmed);
                if (duration < 0 || std::isnan(duration)) duration = 0.0;
            }
        } catch (...) {
            duration = 0.0;
        }

        r["duration"] = duration;
        // Surface the probe outcome instead of silently reporting 0. A duration
        // of 0 makes callers fall back to estimated progress, which reads as a
        // hung conversion -- exactly the failure we are trying to make visible.
        r["ok"] = (rc == 0 && duration > 0);
        r["exitCode"] = rc;
        r["backend"] = BinaryResolver::ffprobe();
        return r.dump();
    }

    // ── full source inspection ────────────────────────────────────────────────

    // ffprobe prints stream "tags" as a JSON object whose keys are lowercased,
    // but "language" is spelled "Language" in some containers and folded
    // inconsistently, so the lookup is case-insensitive.
    static std::string tagValue(const json& tags, const char* key) {
        if (!tags.is_object()) return "";
        for (auto it = tags.begin(); it != tags.end(); ++it) {
            if (it.key().size() == std::strlen(key) &&
                _strnicmp(it.key().c_str(), key, std::strlen(key)) == 0) {
                if (it.value().is_string()) return it.value().get<std::string>();
            }
        }
        return "";
    }

    // "30000/1001" and "29.97" both mean ~30 frames per second. ffprobe reports
    // a rational string, so it cannot simply be read as a double.
    static double parseRational(const std::string& s) {
        if (s.empty()) return 0.0;
        size_t slash = s.find('/');
        try {
            if (slash == std::string::npos) return std::stod(s);
            double num = std::stod(s.substr(0, slash));
            double den = std::stod(s.substr(slash + 1));
            if (den == 0.0) return 0.0;
            return num / den;
        } catch (...) {
            return 0.0;
        }
    }

    static double parseNumber(const json& obj, const char* key) {
        if (!obj.is_object()) return 0.0;
        auto it = obj.find(key);
        if (it == obj.end()) return 0.0;
        if (it->is_number()) return it->get<double>();
        if (it->is_string()) return parseRational(it->get<std::string>());
        return 0.0;
    }

    std::string ConversionSupport::probeMedia(const std::string& filePath) {
        json out;
        std::error_code ec;

        if (filePath.empty() || !fs::exists(fs::u8path(filePath), ec)) {
            out["ok"] = false;
            out["error"] = "file not found";
            out["duration"] = 0.0;
            out["sizeBytes"] = 0;
            out["video"] = nullptr;
            out["audioTracks"] = json::array();
            out["chapters"] = json::array();
            out["tags"] = json::object();
            return out.dump();
        }

        // One pass for everything. The audio-track picker and the metadata tool
        // used to each spawn their own ffprobe for the same file.
        std::string quoted = "\"" + filePath + "\"";
        int rc = 0;
        std::string raw = captureCommand(
            BinaryResolver::ffprobe(),
            "-v error -print_format json -show_format -show_streams -show_chapters " + quoted,
            &rc);

        json doc = json::object();
        if (rc == 0 && !raw.empty()) {
            try {
                doc = json::parse(raw);
            } catch (...) {
                doc = json::object();
            }
        }

        const json& format = doc.contains("format") && doc["format"].is_object() ? doc["format"] : json::object();
        double duration = parseNumber(format, "duration");
        if (duration < 0 || std::isnan(duration)) duration = 0.0;

        uint64_t sizeBytes = 0;
        try {
            sizeBytes = static_cast<uint64_t>(fs::file_size(fs::u8path(filePath), ec));
            if (ec) sizeBytes = 0;
        } catch (...) {
            sizeBytes = 0;
        }

        // Audio tracks, numbered the way `-map 0:a:N` numbers them: by order
        // of appearance among audio streams, counting from zero.
        json audio = json::array();
        if (doc.contains("streams") && doc["streams"].is_array()) {
            int audioIndex = 0;
            for (const auto& s : doc["streams"]) {
                if (!s.is_object()) continue;
                std::string type = s.value("codec_type", std::string());
                if (type != "audio") continue;

                json t;
                t["index"] = audioIndex++;
                t["codec"] = s.value("codec_name", std::string());
                t["language"] = tagValue(s.contains("tags") ? s["tags"] : json::object(), "language");
                t["title"] = tagValue(s.contains("tags") ? s["tags"] : json::object(), "title");
                t["channels"] = static_cast<int>(s.value("channels", 0));
                t["sampleRate"] = static_cast<int>(parseNumber(s, "sample_rate"));
                t["bitrate"] = static_cast<int>(parseNumber(s, "bit_rate"));
                // A track with no language tag is usually the only one, so a
                // sensible default label saves the UI inventing a name.
                if (t["language"].get<std::string>().empty()) t["language"] = "und";
                audio.push_back(t);
            }
        }

        json chapters = json::array();
        if (doc.contains("chapters") && doc["chapters"].is_array()) {
            for (const auto& c : doc["chapters"]) {
                if (!c.is_object()) continue;
                json e;
                // Chapters report absolute start/end; start_time is relative to
                // the stream start and is what a trim UI actually wants.
                e["start"] = parseNumber(c, "start_time");
                e["end"] = parseNumber(c, "end_time");
                e["title"] = tagValue(c.contains("tags") ? c["tags"] : json::object(), "title");
                if (e["start"].get<double>() < 0) e["start"] = 0.0;
                chapters.push_back(e);
            }
        }

        json tags = json::object();
        if (format.contains("tags") && format["tags"].is_object()) {
            for (const char* key : {"title", "artist", "album", "album_artist",
                                    "date", "genre", "comment", "encoder",
                                    "track", "disc"}) {
                std::string v = tagValue(format["tags"], key);
                if (!v.empty()) tags[key] = v;
            }
        }

        // First video stream only, matching what the converter actually keeps
        // (`-map 0:v:0`). Reporting a second stream's dimensions would make the
        // crop tool scale the wrong picture.
        json video = nullptr;
        if (doc.contains("streams") && doc["streams"].is_array()) {
            for (const auto& s : doc["streams"]) {
                if (!s.is_object()) continue;
                if (s.value("codec_type", std::string()) != "video") continue;
                json v;
                v["codec"] = s.value("codec_name", std::string());
                v["width"] = s.value("width", 0);
                v["height"] = s.value("height", 0);
                v["fps"] = parseRational(s.value("avg_frame_rate", std::string("0/0")));
                if (v["fps"].get<double>() <= 0.0) {
                    v["fps"] = parseRational(s.value("r_frame_rate", std::string("0/0")));
                }
                v["duration"] = parseNumber(s, "duration");
                v["bitrate"] = static_cast<int>(parseNumber(s, "bit_rate"));
                v["pixFmt"] = s.value("pix_fmt", std::string());
                if (v["duration"].get<double>() <= 0.0) v["duration"] = duration;
                video = v;
                break;
            }
        }

        out["ok"] = (rc == 0 && doc.is_object() && !doc.empty());
        out["duration"] = duration;
        out["sizeBytes"] = sizeBytes;
        out["formatName"] = format.value("format_name", std::string());
        out["bitrate"] = static_cast<int>(parseNumber(format, "bit_rate"));
        out["video"] = video;
        out["audioTracks"] = audio;
        out["chapters"] = chapters;
        out["tags"] = tags;
        out["exitCode"] = rc;
        out["backend"] = BinaryResolver::ffprobe();
        if (!out["ok"].get<bool>()) out["error"] = "ffprobe returned no data";
        return out.dump();
    }

    // ── post-conversion system actions ────────────────────────────────────────

    // "E:" -> the \\?\Volume{GUID}\ that backs it.
    //
    // CM_Request_Device_Eject wants a DEVINST, not a drive letter, so the
    // lookup has to cross two indirections: the letter names a mount point,
    // the mount point belongs to a volume, and the volume has a device
    // instance. Walking it with FindFirstVolume avoids assuming a
    // HarddiskVolumeN number, which is renumbered as drives come and go.
    static bool volumePathForDriveLetter(const std::wstring& letter,
                                         std::wstring* outVolumePath) {
        WCHAR volumeBuf[512];
        HANDLE search = FindFirstVolumeW(volumeBuf, (DWORD)(sizeof(volumeBuf) / sizeof(volumeBuf[0])));
        if (search == INVALID_HANDLE_VALUE) return false;

        bool found = false;
        do {
            WCHAR names[1024];
            DWORD namesLen = 0;
            if (!GetVolumePathNamesForVolumeNameW(volumeBuf, names,
                                                 (DWORD)(sizeof(names) / sizeof(names[0])),
                                                 &namesLen)) {
                continue;
            }

            // names is a multi-string of "E:\\\0F:\\\0\0"
            const WCHAR* p = names;
            while (*p && !found) {
                if (_wcsicmp(p, letter.c_str()) == 0) {
                    *outVolumePath = volumeBuf;
                    found = true;
                }
                p += wcslen(p) + 1;
            }
        } while (!found && FindNextVolumeW(search, volumeBuf,
                                          (DWORD)(sizeof(volumeBuf) / sizeof(volumeBuf[0]))));

        FindVolumeClose(search);
        return found;
    }

    std::string ConversionSupport::systemPowerAction(const std::string& requestJson) {
        json out;
        json req;
        try {
            req = requestJson.empty() ? json::object() : json::parse(requestJson);
        } catch (...) {
            req = json::object();
        }
        if (!req.is_object()) req = json::object();

        std::string action = req.value("action", std::string());
        std::transform(action.begin(), action.end(), action.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });

        out["action"] = action;
        out["ok"] = false;
#ifndef _WIN32
        out["error"] = "system actions are only implemented on Windows";
        return out.dump();
#else
        if (action == "eject") {
            std::string letter = req.value("driveLetter", std::string());
            // Accept "E", "E:" and "E:\\" -- callers are not careful about this.
            //
            // Anything longer than a bare root is rejected rather than
            // truncated. A caller that passes "C:\\Windows" has a bug, and
            // quietly acting on C: anyway would eject or shut down a drive
            // nobody asked about.
            std::string trimmed = letter;
            while (!trimmed.empty() && (trimmed.back() == ' ' || trimmed.back() == '\t')) {
                trimmed.pop_back();
            }
            std::string root;
            bool bad = false;
            if (trimmed.size() == 1 && std::isalpha(static_cast<unsigned char>(trimmed[0]))) {
                root = trimmed + ":\\";
            } else if (trimmed.size() == 2 && trimmed[1] == ':' &&
                       std::isalpha(static_cast<unsigned char>(trimmed[0]))) {
                root = trimmed + "\\";
            } else if (trimmed.size() == 3 && trimmed[1] == ':' &&
                       (trimmed[2] == '\\' || trimmed[2] == '/') &&
                       std::isalpha(static_cast<unsigned char>(trimmed[0]))) {
                root = trimmed.substr(0, 2) + "\\";
            } else {
                bad = true;
            }
            if (bad || root.size() != 3 || root[1] != ':') {
                out["error"] = "driveLetter must be a single drive letter, "
                               "e.g. \"E\", \"E:\" or \"E:\\\\\"";
                return out.dump();
            }
            root[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(root[0])));

            out["driveLetter"] = root;
            std::wstring wideRoot = utf8ToWide(root);

            std::wstring volumePath;
            if (!volumePathForDriveLetter(wideRoot, &volumePath)) {
                out["error"] = "no volume is mounted at " + root;
                return out.dump();
            }
            out["volumePath"] = wideToUtf8(volumePath);

            // GetDriveType is what decides whether ejecting is even a sensible
            // offer. It answers about the requested letter itself, so there is
            // no inference involved: E: is removable or it is not.
            UINT driveType = GetDriveTypeW(wideRoot.c_str());
            static const char* kDriveTypeNames[] = {
                "unknown", "invalid", "removable", "fixed", "remote", "cdrom", "ramdisk"
            };
            out["driveType"] = kDriveTypeNames[driveType <= DRIVE_RAMDISK ? driveType : 0];
            out["removable"] = (driveType == DRIVE_REMOVABLE || driveType == DRIVE_CDROM);

            if (driveType == DRIVE_NO_ROOT_DIR) {
                out["error"] = root + " is not ready: it is not mounted";
                return out.dump();
            }
            if (!out["removable"].get<bool>()) {
                out["error"] = root + " is a " + out["driveType"].get<std::string>() +
                               " drive and cannot be ejected";
                return out.dump();
            }

            // Lets the UI ask "could I eject this?" without pulling anything.
            if (req.value("dryRun", false)) {
                out["ok"] = true;
                out["detail"] = "ready to eject";
                return out.dump();
            }

            // The eject is sent to the volume's own device handle rather than
            // to a device tree node.
            //
            // CM_Request_Device_Eject is the richer API -- it flushes and
            // brings up its own "please wait" UI -- but it wants a DEVINST, and
            // going from a drive letter to that DEVINST means enumerating
            // device interfaces. With two USB drives attached, a step that
            // silently mis-resolves would pull the wrong one, so this does not
            // guess: it asks the volume that was actually named.
            //
            // A handle to \\.\E: is by definition the requested drive, and a
            // driver that refuses simply returns ERROR_NOT_SUPPORTED, which is
            // surfaced rather than papered over.
            std::wstring volumeDevice = L"\\\\.\\" + wideRoot.substr(0, 2);
            HANDLE hVolume = CreateFileW(volumeDevice.c_str(), GENERIC_READ,
                                         FILE_SHARE_READ | FILE_SHARE_WRITE,
                                         nullptr, OPEN_EXISTING, 0, nullptr);
            if (hVolume == INVALID_HANDLE_VALUE) {
                out["error"] = "the drive could not be opened for ejection (win32 " +
                               std::to_string(GetLastError()) + ")";
                out["win32Error"] = static_cast<int>(GetLastError());
                return out.dump();
            }

            // Eject the medium itself; if the driver has no eject code, ask
            // whether the medium is removable first. Either answer is about
            // this volume, never about a guess.
            DWORD returned = 0;
            BOOL ejected = DeviceIoControl(hVolume, IOCTL_STORAGE_EJECT_MEDIA,
                                           nullptr, 0, nullptr, 0, &returned, nullptr);
            if (!ejected) {
                DWORD firstError = GetLastError();
                ejected = DeviceIoControl(hVolume, IOCTL_STORAGE_MEDIA_REMOVAL,
                                          nullptr, 0, nullptr, 0, &returned, nullptr);
                if (!ejected) {
                    DWORD secondError = GetLastError();
                    CloseHandle(hVolume);
                    // ERROR_NOT_SUPPORTED means the storage driver will not do
                    // this for us. Reporting it plainly is the honest answer:
                    // the user needs the system eject dialog.
                    out["error"] = "this drive's driver does not support ejecting "
                                   "(win32 " + std::to_string(secondError) +
                                   "). Use 'Safely Remove Hardware' from the system tray.";
                    out["win32Error"] = static_cast<int>(secondError);
                    out["firstWin32Error"] = static_cast<int>(firstError);
                    return out.dump();
                }
            }
            CloseHandle(hVolume);

            out["ok"] = true;
            out["detail"] = "ejected";
            return out.dump();
        }

        // Shutdown, restart, sleep and logoff are refused here, permanently, for now.
        //
        // This code once enabled SE_SHUTDOWN_NAME and called
        // InitiateSystemShutdownExW. That is a machine-level action with no
        // undo, reachable over the engine's JSON transport, and its dryRun
        // guard only covered eject -- so a single test payload could power the
        // machine off with an OS countdown the user never asked for and might
        // never see coming.
        //
        // A media converter has no business powering off someone's machine on
        // its own initiative. If this is ever wanted it should be an explicit
        // user action behind a visible, cancellable confirmation -- never a
        // post-conversion side effect, and never reachable from a bare JSON
        // request. Until that exists, the answer is a hard no.
        if (action == "shutdown" || action == "restart" || action == "poweroff" ||
            action == "reboot" || action == "sleep" || action == "hibernate" ||
            action == "suspend" || action == "logoff" || action == "lock") {
            out["error"] = "power actions are not supported: Panamedia will not "
                           "shut down, restart, sleep or log off the computer. "
                           "Use the system's own controls.";
            out["supportedActions"] = json::array({ "eject" });
            return out.dump();
        }

        out["error"] = "action must be 'eject'";
        return out.dump();
#endif
    }

    // ── output directory listing ─────────────────────────────────────────────

    std::string ConversionSupport::listOutputFiles(const std::string& dirPath) {
        json arr = json::array();

        std::error_code ec;
        if (dirPath.empty() || !fs::exists(dirPath, ec) || !fs::is_directory(dirPath, ec)) {
            return arr.dump();
        }

        struct Entry {
            std::string name;
            std::string path;
            std::string ext;
            uint64_t sizeBytes;
            uint64_t mtimeMs;
        };
        std::vector<Entry> entries;

        for (fs::directory_iterator it(dirPath, ec), end; !ec && it != end; it.increment(ec)) {
            const fs::path& p = it->path();

            FileStat st = statFast(p);
            if (!st.ok || !st.isRegular) continue;

            std::string name = p.filename().u8string();
            if (name.empty() || name[0] == '.') continue; // matches Node's dotfile skip

            Entry e;
            e.name = name;
            e.path = p.u8string();
            e.ext = extensionOf(name);
            e.sizeBytes = st.sizeBytes;
            e.mtimeMs = st.mtimeMs;

            entries.push_back(std::move(e));
        }

        // Newest first, matching Node's descending-date sort. stable_sort keeps
        // directory order for equal timestamps, which is what V8's (stable)
        // Array.prototype.sort did, so ties line up instead of shuffling.
        std::stable_sort(entries.begin(), entries.end(),
                         [](const Entry& a, const Entry& b) { return a.mtimeMs > b.mtimeMs; });

        for (const auto& e : entries) {
            json o;
            o["name"] = e.name;
            o["path"] = e.path;
            o["ext"] = e.ext;
            o["sizeBytes"] = e.sizeBytes;
            o["mtimeMs"] = e.mtimeMs;
            arr.push_back(std::move(o));
        }

        return arr.dump();
    }

    // ── removable drives ─────────────────────────────────────────────────────

    std::string ConversionSupport::listRemovableDrives() {
        json arr = json::array();

#ifdef _WIN32
        DWORD mask = GetLogicalDrives();
        for (int i = 0; i < 26; ++i) {
            if (!(mask & (1UL << i))) continue;

            std::wstring root;
            root += (wchar_t)('A' + i);
            root += L":\\";

            if (GetDriveTypeW(root.c_str()) != DRIVE_REMOVABLE) continue;

            wchar_t labelBuf[MAX_PATH + 1];
            ZeroMemory(labelBuf, sizeof(labelBuf));
            GetVolumeInformationW(root.c_str(), labelBuf, MAX_PATH, nullptr, nullptr, nullptr, nullptr, 0);

            std::string letter;
            letter += (char)('A' + i);
            letter += ":\\";

            std::string label = wideToUtf8(std::wstring(labelBuf));
            if (label.empty()) label = "USB Drive";

            json d;
            d["letter"] = letter;
            d["label"] = label;

            // Phase G: readiness is probed, not assumed. A card reader with
            // no card, or a stick that is still enumerating right after
            // being plugged in, both report removable but accept no writes.
            json v = json::parse(describeVolume(letter));
            d["ready"] = v.value("writable", false);
            d["freeBytes"] = v.value("freeBytes", (uint64_t)0);
            arr.push_back(std::move(d));
        }
#else
        (void)arr;
#endif

        return arr.dump();
    }

// ── output path planning ─────────────────────────────────────────────────

#ifdef _WIN32
    // Documents via the Known Folder API, so we agree with Explorer instead of
    // assuming %USERPROFILE%\Documents (which is redirected on many setups).
    static std::string getDocumentsDir() {
        PWSTR raw = nullptr;
        if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Documents, 0, nullptr, &raw)) && raw) {
            std::wstring w(raw);
            CoTaskMemFree(raw);
            if (!w.empty()) return wideToUtf8(w);
        }
        const char* profile = std::getenv("USERPROFILE");
        if (profile) return (fs::path(profile) / "Documents").string();
        return (fs::path(".") / "Documents").string();
    }

    static std::string getSendtrayDir() {
        return (fs::path(getDocumentsDir()) / "Panamedia" / "Sendtray").string();
    }
#else
    static std::string getSendtrayDir() {
        const char* home = std::getenv("HOME");
        return (fs::path(home ? home : ".") / "Panamedia" / "Sendtray").string();
    }
#endif

    // Case-insensitive path comparison. Separators are unified, repeats
    // collapsed and a trailing slash dropped, so "C:/a//b/" and
    // "C:\a\b" compare equal.
    static bool samePath(const std::string& a, const std::string& b) {
        auto norm = [](std::string s) {
            std::replace(s.begin(), s.end(), '\\', '/');
            std::string t;
            t.reserve(s.size());
            for (size_t i = 0; i < s.size(); ++i) {
                if (s[i] == '/' && !t.empty() && t.back() == '/') continue;
                t += s[i];
            }
            while (t.size() > 1 && t.back() == '/') t.pop_back();
            std::transform(t.begin(), t.end(), t.begin(),
                           [](unsigned char c) { return (char)std::tolower(c); });
            return t;
        };
        return norm(a) == norm(b);
    }

    static bool pathExists(const fs::path& p) {
        std::error_code ec;
        return fs::exists(p, ec);
    }

    std::string ConversionSupport::planOutputPath(const std::string& filePath,
                                                  const std::string& optionsJson) {
        json opts = json::parse(optionsJson.empty() ? "{}" : optionsJson);
        json out;

        if (filePath.empty()) {
            out["error"] = "filePath is required";
            return out.dump();
        }

        std::string mode = opts.value("mode", std::string("extract_audio"));
        std::string format = opts.value("format", mode == "extract_audio" ? "mp3" : "mp4");
        std::transform(format.begin(), format.end(), format.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });

        std::string destination = opts.value("destination", std::string("source"));

        fs::path srcPath = fs::u8path(filePath);
        fs::path srcDir = srcPath.parent_path();
        fs::path targetDir = srcDir;

        if (destination == "folder" && opts.contains("destPath") && opts["destPath"].is_string()) {
            std::string dp = opts["destPath"].get<std::string>();
            if (!dp.empty()) targetDir = fs::u8path(dp);
        } else if (destination == "sendtray") {
            targetDir = fs::path(getSendtrayDir());
        } else if (destination == "drive" && opts.contains("driveLetter") && opts["driveLetter"].is_string()) {
            std::string dl = opts["driveLetter"].get<std::string>();
            if (!dl.empty()) targetDir = fs::u8path(dl);
        }

        std::string stem = srcPath.stem().u8string();
        std::string fileName = stem + "." + format;
        fs::path candidate = targetDir / fileName;

        // Never write over the file being read.
        if (samePath(candidate.u8string(), filePath)) {
            fileName = stem + "_converted." + format;
            candidate = targetDir / fileName;
            out["collision"] = "source";
        } else {
            out["collision"] = false;
            // Never clobber an existing export either.
            if (pathExists(candidate)) {
                for (int n = 1; n <= 999 && pathExists(candidate); ++n) {
                    fileName = stem + " (" + std::to_string(n) + ")." + format;
                    candidate = targetDir / fileName;
                }
                out["collision"] = "existing";
            }
        }

        std::error_code ec;
        fs::create_directories(targetDir, ec);
        if (ec) {
            out["error"] = "Cannot create destination directory: " + targetDir.u8string();
            return out.dump();
        }

        out["outputPath"] = candidate.u8string();
        out["directory"] = targetDir.u8string();
        out["fileName"] = fileName;
        out["isSourceDir"] = samePath(targetDir.u8string(), srcDir.u8string());

        // --- Phase G: will the result actually fit, and can we write there? ---
        //
        // Running out of room part-way through leaves a truncated file that
        // looks like a successful export, which is worse than refusing. So the
        // space needed is estimated before any work starts.
        uintmax_t srcBytes = 0;
        std::error_code sec;
        if (fs::is_regular_file(srcPath, sec) && !sec) srcBytes = fs::file_size(srcPath, sec);

        // The estimate is deliberately pessimistic: assume the output is as
        // large as the input unless something tells us otherwise. Over-asking
        // produces a warning; under-asking produces a corrupt export.
        double factor = 1.15;                       // same size, plus container overhead
        if (mode == "extract_audio") {
            factor = 0.35;                           // audio track only
        }
        try {
            if (opts.contains("tools") && opts["tools"].is_object() &&
                opts["tools"].contains("compress") && opts["tools"]["compress"].is_object()) {
                const json& cz = opts["tools"]["compress"];
                // Same unit rule as the encoder: anything above 1 is the UI's
                // percentage rather than a fraction.
                double reduction = cz.value("targetReduction", 0.0);
                if (reduction > 1.0) reduction = reduction / 100.0;
                if (reduction > 0.0 && reduction < 0.95) {
                    factor = (1.0 - reduction) * 1.15;
                }
            }
        } catch (...) {}

        uintmax_t estimated = (uintmax_t)((double)srcBytes * factor);

        json vol = json::parse(describeVolume(candidate.u8string()));
        uintmax_t freeBytes = vol.value("freeBytes", (uint64_t)0);
        bool writable = vol.value("writable", false);

        out["sourceBytes"] = srcBytes;
        out["estimatedBytes"] = estimated;
        out["freeBytes"] = freeBytes;
        out["writable"] = writable;
        out["volumeLabel"] = vol.value("volumeLabel", std::string());

        bool sufficient = freeBytes >= estimated;
        out["sufficient"] = sufficient;

        // A warning, not an error: the caller decides whether to proceed.
        // It is reported for a locked or absent drive and for tight space,
        // so the UI can speak before the job rather than after it fails.
        std::string warning;
        if (!writable) {
            warning = vol.value("reason", std::string("The destination is not writable"));
        } else if (!sufficient) {
            warning = "Not enough free space at the destination for this conversion";
        }
        out["warning"] = warning;
        return out.dump();
    }

} // namespace Panamedia
