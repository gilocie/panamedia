#include "conversion_engine.hpp"
#include "binary_resolver.hpp"
#include "conversion_support.hpp"
#include "ipc_bridge.hpp"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <thread>
#include <vector>

#include <nlohmann/json.hpp>

#ifdef _WIN32
// windows.h defines min/max macros that would break std::min and std::max.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
// NtSuspendProcess / NtResumeProcess share this signature.
typedef LONG (NTAPI *PfnNtProcessFn)(HANDLE);
#endif

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace Panamedia {

    // ── job model ────────────────────────────────────────────────────────────

    struct Job {
        std::string jobId;
        std::string inputPath;
        std::string outputPath;
        std::string optionsJson;

#ifdef _WIN32
        HANDLE process = nullptr;
#endif
        // Guards `process`: written by the worker right after CreateProcess and
        // read by the IPC thread when pausing, resuming or cancelling.
        std::mutex handleMutex;
        unsigned long pid = 0;
        unsigned long long startTick = 0;

        std::atomic<bool> cancelled{false};
        std::atomic<bool> paused{false};
        std::atomic<bool> finished{false};
        std::atomic<double> progress{0.0};

        std::mutex stateMutex;
        std::string status = "pending";
        std::string error;
        std::string diagnostics;   // ffmpeg stderr tail; not an error by itself

        // Per-job folder holding plain-named copies of any file a filter
        // has to open by name (subtitles, logo). See stageFilterInputs.
        std::string stageDir;
    };

    static std::mutex g_jobsMutex;
    static std::map<std::string, std::shared_ptr<Job>> g_jobs;

    static std::shared_ptr<Job> findJob(const std::string& jobId) {
        std::lock_guard<std::mutex> lock(g_jobsMutex);
        auto it = g_jobs.find(jobId);
        return it == g_jobs.end() ? nullptr : it->second;
    }

    // Removes finished jobs. Safe because worker threads are detached and hold
    // their own shared_ptr, so destroying a Job here cannot terminate the
    // process or free memory a running thread still touches.
    static void pruneFinishedLocked() {
        for (auto it = g_jobs.begin(); it != g_jobs.end();) {
            if (it->second->finished.load()) it = g_jobs.erase(it);
            else ++it;
        }
    }

    static unsigned long long nowTick() {
#ifdef _WIN32
        return GetTickCount64();
#else
        return 0;
#endif
    }

    // ── argument construction ────────────────────────────────────────────────

    // Quotes one argument following the CommandLineToArgvW backslash rules, so
    // paths with spaces and quotes survive.
    // Derives the name a filter input is addressed by once it has been
    // staged. Everything except a sanitised extension is discarded, so
    // the result is always safe to embed in a filter argument: no drive
    // colon, no backslash, no space, no punctuation.
    static std::string stagedFilterName(const std::string& sourcePath,
                                        const std::string& stem) {
        std::string ext;
        // u8path: these strings arrive as UTF-8 from the renderer, while a
        // plain fs::path would read them in the active ANSI code page and
        // mangle any non-ASCII folder name.
        fs::path p = fs::u8path(sourcePath);
        if (p.has_extension()) {
            // The extension has to survive, dot included: ffmpeg picks the
            // subtitle demuxer from it, and a bare "subsrt" fails to load.
            // Only alphanumerics are kept from the raw extension.
            std::string raw = p.extension().u8string();
            std::string cleaned;
            for (char ch : raw) {
                if (std::isalnum(static_cast<unsigned char>(ch))) cleaned += ch;
            }
            if (!cleaned.empty()) ext = "." + cleaned;
        }
        return stem + ext;
    }

    // Widens a UTF-8 command line to UTF-16 for CreateProcessW.
    //
    // This must not be a byte-per-wchar_t copy. Paths reach us as UTF-8
    // from the renderer, and one byte per character turns "café" into
    // four separate characters, so ffmpeg receives a mangled name and
    // reports "No such file or directory" for a file that plainly
    // exists. Decode UTF-8 properly instead, with a narrow fallback for
    // the (unreachable in practice) case of a bad sequence.
    static std::wstring widenUtf8(const std::string& s) {
        if (s.empty()) return std::wstring();
        int need = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
        if (need <= 0) {
            need = MultiByteToWideChar(CP_ACP, 0, s.data(), (int)s.size(), nullptr, 0);
            if (need <= 0) return std::wstring();
            std::wstring w((size_t)need, L'\0');
            MultiByteToWideChar(CP_ACP, 0, s.data(), (int)s.size(), &w[0], need);
            return w;
        }
        std::wstring w((size_t)need, L'\0');
        MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], need);
        return w;
    }

    static std::string quoteArg(const std::string& arg) {
        if (arg.empty()) return "\"\"";
        if (arg.find_first_of(" \t\n\v\"") == std::string::npos) return arg;

        std::string out = "\"";
        size_t backslashes = 0;
        for (char c : arg) {
            if (c == '\\') { backslashes++; continue; }
            if (c == '"') {
                out.append(backslashes * 2 + 1, '\\');
                out += '"';
            } else {
                out.append(backslashes, '\\');
                out += c;
            }
            backslashes = 0;
        }
        out.append(backslashes * 2, '\\');
        out += "\"";
        return out;
    }

// Builds the ordered -vf filter chain from the tool settings.
//
// Order matters: geometry first (crop/scale), then orientation, then colour,
// then overlays, then text. Mirrors how a NLE applies them.
static std::string buildFilterChain(const json& tools, bool hasVideo) {
    if (!hasVideo || !tools.is_object() || tools.empty()) return "";

    std::vector<std::string> chain;

    // Crop / aspect ratio
    if (tools.contains("crop") && tools["crop"].is_object()) {
        const json& c = tools["crop"];
        std::string ar = c.value("aspectRatio", std::string(""));
        double zoom = c.value("zoom", 1.0);
        if (ar == "16:9") {
            chain.push_back("scale=ih*16/9:ih");
            chain.push_back("crop=iw:ih");
        } else if (ar == "4:3") {
            chain.push_back("scale=ih*4/3:ih");
            chain.push_back("crop=iw:ih");
        } else if (ar == "1:1") {
            chain.push_back("scale='min(iw,ih)':'min(iw,ih)'");
            chain.push_back("crop=iw:ih");
        } else if (ar == "9:16") {
            chain.push_back("scale=iw:'ih*9/16'");
            chain.push_back("crop=iw:ih");
        }
        if (zoom > 1.001) {
            // Zoom in around the centre.
            chain.push_back("scale=iw*" + std::to_string(zoom) + ":ih*" + std::to_string(zoom));
            chain.push_back("crop=iw/" + std::to_string(zoom) + ":ih/" + std::to_string(zoom));
        }
    }

    // Rotate / flip (RotateTool also backs the "Mirror & Flip" entry)
    if (tools.contains("rotate") && tools["rotate"].is_object()) {
        const json& r = tools["rotate"];
        int angle = r.value("angle", 0);
        if (angle == 90) chain.push_back("transpose=1");
        else if (angle == 180) chain.push_back("transpose=1,transpose=1");
        else if (angle == 270) chain.push_back("transpose=2");
        if (r.value("flipH", false)) chain.push_back("hflip");
        if (r.value("flipV", false)) chain.push_back("vflip");
    }

    // Colour adjustments
    if (tools.contains("effect") && tools["effect"].is_object()) {
        const json& e = tools["effect"];
        double b = e.value("brightness", 0.0);
        double ct = e.value("contrast", 1.0);
        double sa = e.value("saturation", 1.0);
        double hu = e.value("hue", 0.0);
        auto num = [](double v) {
            std::ostringstream ss;
            ss << v;
            return ss.str();
        };
        std::string eq = "eq=brightness=" + num(b) + ":contrast=" + num(ct) +
                         ":saturation=" + num(sa) + ":hue=" + num(hu);
        chain.push_back(eq);
    }

    // Denoise / audio cleanup (video side no-op; audio handled below)
    if (tools.contains("denoise") && tools["denoise"].is_object()) {
        const json& d = tools["denoise"];
        if (d.value("videoDenoise", false)) {
            chain.push_back("hqdn3d=" + std::to_string(d.value("strength", 1.0)));
        }
    }

    // Watermark overlay
    if (tools.contains("watermark") && tools["watermark"].is_object()) {
        const json& w = tools["watermark"];
        std::string type = w.value("type", std::string("image"));
        double opacity = w.value("opacity", 1.0);
        std::string pos = w.value("position", std::string("bottom-right"));
        std::string posExpr;
        if (pos == "top-left") posExpr = "10:10";
        else if (pos == "top-right") posExpr = "main_w-overlay_w-10:10";
        else if (pos == "bottom-left") posExpr = "10:main_h-overlay_h-10";
        else posExpr = "main_w-overlay_w-10:main_h-overlay_h-10";

        if (type == "image") {
            std::string img = w.value("imagePath", std::string());
            if (!img.empty()) {
                // Staged under a plain name for the same reason as
                // subtitles: the movie filter reads a filename, and a
                // real Windows path cannot be escaped reliably.
                chain.push_back("movie=" + stagedFilterName(img, "logo") +
                                ",scale=120:-1,format=rgba,colorchannelmixer=aa=" +
                                std::to_string(opacity));
                chain.push_back("overlay=" + posExpr);
            }
        } else {
            std::string text = w.value("text", std::string());
            if (!text.empty()) {
                std::string esc;
                for (char ch : text) {
                    if (ch == ':' || ch == '\\' || ch == '\'' || ch == '%') esc += '\\';
                    esc += ch;
                }
                chain.push_back("drawtext=text='" + esc + "':fontcolor=white@" +
                                std::to_string(opacity) + ":fontsize=36:x=" + posExpr);
            }
        }
    }

    // Subtitles.
    //
    // The filter is given a bare staged name, never the real path.
    // ffmpeg unescapes a filter filename at three separate layers --
    // the filtergraph parser, the filter's own key=value splitter and
    // libass -- and the drive colon has to survive all three. Measured
    // against the shipped ffmpeg, every hand-written escape failed: the
    // colon was consumed as an option separator, so the path after it
    // was parsed as the `original_size` option and the filter aborted.
    // stageFilterInputs() copies the file into a per-job folder and
    // ffmpeg starts with that folder as its working directory, so the
    // argument is simply "sub.srt" and there is nothing to escape.
    if (tools.contains("subtitle") && tools["subtitle"].is_object()) {
        const json& s = tools["subtitle"];
        if (s.value("burnIn", false)) {
            std::string sp = s.value("subPath", std::string());
            if (!sp.empty()) {
                chain.push_back("subtitles=" + stagedFilterName(sp, "sub"));
            }
        }
    }

    std::string out;
    for (size_t i = 0; i < chain.size(); ++i) {
        if (i) out += ",";
        out += chain[i];
    }
    return out;
}
    static std::vector<std::string> buildArgVector(const std::string& inputPath,
                                                  const std::string& outputPath,
                                                  const std::string& optionsJson) {
        json opts = json::parse(optionsJson.empty() ? "{}" : optionsJson);

        std::string mode = opts.value("mode", std::string("extract_audio"));
        std::string format = opts.value("format", mode == "extract_audio" ? "mp3" : "mp4");
        std::transform(format.begin(), format.end(), format.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });

        std::string bitrate = opts.value("bitrate",
                                         mode == "extract_audio" ? "320k" : "1080p");
        bool useHw = opts.value("useHwAccel", true);
        bool deinterlace = opts.value("deinterlacing", false);
        json tools = opts.contains("tools") && opts["tools"].is_object() ? opts["tools"] : json::object();
        const json& trim = tools.contains("cut") && tools["cut"].is_object() ? tools["cut"] : json::object();
        const json& subTool = tools.contains("subtitle") && tools["subtitle"].is_object() ? tools["subtitle"] : json::object();
        const json& denoiseTool = tools.contains("denoise") && tools["denoise"].is_object() ? tools["denoise"] : json::object();
        const json& gifTool = tools.contains("gif") && tools["gif"].is_object() ? tools["gif"] : json::object();
        const json& splitTool = tools.contains("split") && tools["split"].is_object() ? tools["split"] : json::object();
        // "High Quality Engine": a slower preset and a lower
        // quantiser. Previously this checkbox was stored and
        // then never read anywhere.
        bool highQuality = opts.value("highQuality", false);
        // Audio target for video conversions. The settings modal carries
        // it separately from the video resolution label, so it arrives
        // in its own field rather than inside `bitrate`.
        std::string audioBitrate = opts.value("audioBitrate", std::string("192k"));
        if (audioBitrate.find('k') == std::string::npos &&
            audioBitrate.find('M') == std::string::npos) {
            audioBitrate = "192k";
        }

        std::vector<std::string> a;
        bool codecIsX264 = false;
        a.push_back("-y");

        // Trim range. Applied before -i so ffmpeg seeks instead of decoding the
        // discarded part.
        if (trim.contains("startSec") && trim.contains("endSec")) {
            double s0 = trim.value("startSec", 0.0);
            double s1 = trim.value("endSec", 0.0);
            // Each flag and its value must be separate argv elements, otherwise
            // quoting turns "-ss 12.5" into one token ffmpeg cannot parse.
            if (s0 > 0) { a.push_back("-ss"); a.push_back(std::to_string(s0)); }
            if (s1 > s0) { a.push_back("-to"); a.push_back(std::to_string(s1)); }
        }

        a.push_back("-i");
        // Phase G: long library trees produce paths past the legacy 260
        // character ceiling, which ffmpeg's file APIs reject. The extended
        // form lifts that limit and is harmless below it.
        a.push_back(ConversionSupport::longPathIfNeeded(inputPath));

        // Soft subtitle track: muxed as a second input so the viewer
        // can toggle it, instead of burning it into the picture. Only
        // MP4, MOV and MKV carry subtitle tracks -- WebM and AVI
        // cannot, so those formats keep the burn-in path.
        bool softSub = false;
        if (!subTool.empty() && !subTool.value("burnIn", false)) {
            std::string sp = subTool.value("subPath", std::string());
            if (!sp.empty() && (format == "mp4" || format == "mov" || format == "mkv")) {
                a.push_back("-i");
                a.push_back(ConversionSupport::longPathIfNeeded(sp));
                softSub = true;
            }
        }

        // Machine-readable progress on stdout, keeping stderr free for
        // diagnostics. This replaces the old stderr regex scraping.
        a.push_back("-progress");
        a.push_back("pipe:1");
        a.push_back("-nostats");

        // The renderer splits the core budget across the concurrent job
        // pool and hands each job its share. Fall back to the engine's
        // own estimate when the caller does not know the pool size.
        int threadBudget = opts.value("threadBudget", 0);
        int maxThreads = ConversionSupport::getOptimalThreadCount();
        if (threadBudget > 0) {
            threadBudget = std::min(threadBudget, maxThreads);
            if (threadBudget < 1) threadBudget = 1;
        } else {
            threadBudget = maxThreads;
        }
        a.push_back("-threads");
        a.push_back(std::to_string(threadBudget));

        if (mode == "extract_audio") {
            a.push_back("-vn");
            std::string extractBitrate =
                bitrate.find('k') != std::string::npos ? bitrate : "320k";

            if (format == "mp3") {
                a.push_back("-c:a"); a.push_back("libmp3lame");
                a.push_back("-b:a"); a.push_back(extractBitrate);
                a.push_back("-q:a"); a.push_back("0");
            } else if (format == "aac" || format == "m4a") {
                a.push_back("-c:a"); a.push_back("aac");
                a.push_back("-b:a"); a.push_back(extractBitrate);
            } else if (format == "wav") {
                a.push_back("-c:a"); a.push_back("pcm_s16le");
            } else if (format == "flac") {
                a.push_back("-c:a"); a.push_back("flac");
            } else {
                a.push_back("-c:a"); a.push_back("libmp3lame");
                a.push_back("-b:a"); a.push_back(extractBitrate);
            }
        } else if (!gifTool.empty()) {
            // Animated GIF. A palette is generated once from the
            // video and reused for every frame, which is what keeps
            // GIFs small and their colours stable. The tool's own
            // scale target lives inside the palette chain, so the
            // generic filter chain below is skipped.
            int fps = gifTool.value("fps", 15);
            int width = gifTool.value("width", 480);
            if (fps < 1) fps = 1;
            if (fps > 60) fps = 60;
            if (width < 64) width = 64;
            std::string fc = "fps=" + std::to_string(fps) +
                             ",scale=" + std::to_string(width) + ":-1:flags=lanczos" +
                             ",split[a][b];[a]palettegen[p];[b][p]paletteuse";
            a.push_back("-filter_complex");
            a.push_back(fc);
            a.push_back("-loop");
            a.push_back("0");
            // GIF carries no audio track.
            a.push_back("-an");
        } else {
            // Container-native codecs. The format presets advertise
            // specific codecs for a reason: WebM only accepts
            // VP8/VP9/AV1 video with Vorbis/Opus audio, so emitting
            // H.264/AAC into a .webm makes ffmpeg abort mid-write.
            // The container decides the codec family.
            if (format == "webm") {
                // No common hardware VP9 encoder, so this always runs
                // on the CPU. row-mt parallelises it across cores.
                a.push_back("-c:v"); a.push_back("libvpx-vp9");
                a.push_back("-crf"); a.push_back(std::to_string(highQuality ? 30 : 32));
                a.push_back("-b:v"); a.push_back("0");
                a.push_back("-row-mt"); a.push_back("1");
                a.push_back("-pix_fmt"); a.push_back("yuv420p");
                a.push_back("-c:a"); a.push_back("libopus");
                a.push_back("-b:a"); a.push_back(audioBitrate);
            } else if (format == "avi") {
                // Classic AVI pairing: MPEG-4 Part 2 (Xvid-compatible)
                // video with MP3 audio. AAC inside AVI is poorly
                // supported by players.
                a.push_back("-c:v"); a.push_back("mpeg4");
                a.push_back("-q:v"); a.push_back(std::to_string(highQuality ? 2 : 3));
                a.push_back("-pix_fmt"); a.push_back("yuv420p");
                a.push_back("-c:a"); a.push_back("libmp3lame");
                a.push_back("-b:a"); a.push_back(audioBitrate);
            } else {
                // mp4 / mov / mkv: H.264 video (hardware when the
                // runtime probe found a fixed-function encoder) with
                // AAC audio.
                std::string gpu = "cpu";
                if (useHw) {
                    gpu = json::parse(ConversionSupport::detectHardwareAcceleration())
                              .value("codec", std::string("cpu"));
                }

                if (gpu == "nvenc") {
                    a.push_back("-c:v"); a.push_back("h264_nvenc");
                    // NVENC presets run p1 (fastest) to p7
                    // (slowest, best); p4 is the balanced default.
                    a.push_back("-preset"); a.push_back(highQuality ? "p5" : "p4");
                    a.push_back("-b:v"); a.push_back("4500k");
                } else if (gpu == "qsv") {
                    a.push_back("-c:v"); a.push_back("h264_qsv");
                    // QSV quality is a quantiser: lower is better.
                    a.push_back("-global_quality"); a.push_back(highQuality ? "21" : "23");
                } else if (gpu == "amf") {
                    a.push_back("-c:v"); a.push_back("h264_amf");
                    a.push_back("-quality"); a.push_back(highQuality ? "balanced" : "speed");
                } else {
                    codecIsX264 = true;
                    a.push_back("-c:v"); a.push_back("libx264");
                    // medium trades encode speed for compression
                    // efficiency; ultrafast is the throughput mode.
                    a.push_back("-preset"); a.push_back(highQuality ? "medium" : "ultrafast");
                    a.push_back("-crf"); a.push_back(std::to_string(highQuality ? 22 : 24));
                    a.push_back("-pix_fmt"); a.push_back("yuv420p");
                }

                a.push_back("-c:a"); a.push_back("aac");
                a.push_back("-b:a"); a.push_back(audioBitrate);
                if (format != "mkv") {
                    // +faststart is an ISO-BMFF option: meaningful for
                    // mp4/mov, ignored by mkv/webm/avi.
                    a.push_back("-movflags"); a.push_back("+faststart");
                }
            }

            // Resolution target from the quality selector. min()
            // against the source height means a smaller source is
            // never upscaled.
            std::string vf;
            if (bitrate == "1080p" || bitrate == "720p" || bitrate == "480p") {
                int target = bitrate == "1080p" ? 1080 : (bitrate == "720p" ? 720 : 480);
                vf = "scale=-2:'min(" + std::to_string(target) + ",ih)'";
            }
            // Tool filters compose after the scale so crop and rotate
            // operate on the sized frame; deinterlace runs first, on
            // the original picture. Emitting a second -vf would make
            // ffmpeg silently ignore the first.
            std::string toolVf = buildFilterChain(tools, true);
            if (!toolVf.empty()) vf = vf.empty() ? toolVf : (vf + "," + toolVf);
            if (deinterlace) vf = vf.empty() ? "yadif" : ("yadif," + vf);
            if (!vf.empty()) { a.push_back("-vf"); a.push_back(vf); }

            if (softSub) {
                // With a second input present, ffmpeg's default stream
                // selection would grab the wrong tracks, so map them
                // explicitly. The "?" suffix makes each optional: a
                // source without audio, or a subtitle file without a
                // subtitle stream, must not fail the conversion.
                a.push_back("-map"); a.push_back("0:v:0");
                a.push_back("-map"); a.push_back("0:a:0?");
                a.push_back("-map"); a.push_back("1:s:0?");
                a.push_back("-c:s"); a.push_back(format == "mkv" ? "ass" : "mov_text");
            }
        }

        // Audio-side tools. afftdn is an FFT denoiser; loudnorm
        // normalises loudness to broadcast levels (EBU R128).
        // GIF carries no audio, so it is skipped there.
        if (gifTool.empty() && !denoiseTool.empty()) {
            std::string af;
            if (denoiseTool.value("audioDenoise", false)) af = "afftdn";
            if (denoiseTool.value("loudness", false)) {
                af = af.empty() ? "loudnorm" : (af + ",loudnorm");
            }
            if (!af.empty()) { a.push_back("-af"); a.push_back(af); }
        }

        // Compress: heavier quantisation. Every encoder family has its own quality knob, so the reduction targets whichever one this format selected.
        if (tools.contains("compress") && tools["compress"].is_object()) {
            const json& cp = tools["compress"];
            double reduction = cp.value("targetReduction", 0.5);
            // The slider in the UI is a percentage (0-95); this code works in
            // fractions (0.0-1.0). Without normalising, a value of 20 is read
            // as 2000% and clamps to the same maximum as 50 and 80 -- which
            // made the entire slider range collapse to one setting.
            if (reduction > 1.0) reduction = reduction / 100.0;
            if (reduction < 0.0) reduction = 0.0;
            if (reduction > 1.0) reduction = 1.0;
            // 0.0 = no reduction, 1.0 = maximum.
            if (format == "webm") {
                // VP9's CRF scale runs 0-63; the default is 32.
                int crf = 32 + (int)std::lround(reduction * 16.0);
                if (crf > 63) crf = 63;
                bool replaced = false;
                for (size_t k = 0; k + 1 < a.size(); ++k) {
                    if (a[k] == "-crf") { a[k + 1] = std::to_string(crf); replaced = true; break; }
                }
                if (!replaced) { a.push_back("-crf"); a.push_back(std::to_string(crf)); }
            } else if (format == "avi") {
                // MPEG-4 Part 2 quality is -q:v on a 1-31 scale
                // where higher means a smaller file.
                int q = 3 + (int)std::lround(reduction * 20.0);
                if (q > 31) q = 31;
                bool replaced = false;
                for (size_t k = 0; k + 1 < a.size(); ++k) {
                    if (a[k] == "-q:v") { a[k + 1] = std::to_string(q); replaced = true; break; }
                }
                if (!replaced) { a.push_back("-q:v"); a.push_back(std::to_string(q)); }
            } else if (codecIsX264) {
                // Rewrite the encoder's default crf in place. Appending a
                // second -crf relied on last-one-wins ordering, which is fragile.
                int crf = 23 + (int)std::lround(reduction * 12.0);
                if (crf > 51) crf = 51;
                bool replaced = false;
                for (size_t k = 0; k + 1 < a.size(); ++k) {
                    if (a[k] == "-crf") { a[k + 1] = std::to_string(crf); replaced = true; break; }
                }
                if (!replaced) { a.push_back("-crf"); a.push_back(std::to_string(crf)); }
            }
            else if (reduction > 0.01) {
                // Hardware encoders are bitrate driven. NVENC and
                // AMF take -b:v; QSV takes -global_quality, which
                // is a quantiser rather than a bitrate.
                int kbps = (int)std::lround(4500.0 * (1.0 - reduction * 0.7));
                if (kbps < 200) kbps = 200;
                int quality = 23 + (int)std::lround(reduction * 20.0);
                if (quality > 51) quality = 51;
                bool replaced = false;
                for (size_t k = 0; k + 1 < a.size(); ++k) {
                    if (a[k] == "-b:v") { a[k + 1] = std::to_string(kbps) + "k"; replaced = true; break; }
                    if (a[k] == "-global_quality") { a[k + 1] = std::to_string(quality); replaced = true; break; }
                }
                if (!replaced) { a.push_back("-b:v"); a.push_back(std::to_string(kbps) + "k"); }
            }
        }

        // Split: segment muxing writes a numbered series of
        // files instead of one. reset_timestamps makes each
        // segment independently playable from any position.
        std::string outputArg = outputPath;
        if (!splitTool.empty()) {
            int segmentSec = splitTool.value("segmentSec", 60);
            if (segmentSec < 1) segmentSec = 1;
            a.push_back("-f"); a.push_back("segment");
            a.push_back("-segment_time"); a.push_back(std::to_string(segmentSec));
            a.push_back("-reset_timestamps"); a.push_back("1");
            fs::path p = fs::u8path(outputPath);
            std::string stem = p.stem().u8string();
            std::string ext = p.has_extension() ? ("." + p.extension().u8string()) : "";
            outputArg = (p.parent_path() / (stem + "%03d" + ext)).u8string();
        }
        a.push_back(ConversionSupport::longPathIfNeeded(outputArg));
        return a;
    }

    static std::string joinArgList(const std::vector<std::string>& args) {
        std::string out;
        for (size_t i = 0; i < args.size(); ++i) {
            if (i) out += " ";
            out += quoteArg(args[i]);
        }
        return out;
    }

    std::string ConversionEngine::buildArgs(const std::string& inputPath,
                                            const std::string& outputPath,
                                            const std::string& optionsJson) {
        return joinArgList(buildArgVector(inputPath, outputPath, optionsJson));
    }

    // ── progress emission ────────────────────────────────────────────────────

    static void emitProgress(const std::shared_ptr<Job>& job, double pct,
                             const std::string& status, const std::string& error = "") {
        job->progress.store(pct);
        json p;
        p["jobId"] = job->jobId;
        p["filePath"] = job->inputPath;
        p["outputPath"] = job->outputPath;
        p["progress"] = pct;
        p["status"] = status;
        if (!error.empty()) p["error"] = error;
        IPCBridge::sendEvent("convert_progress", p.dump());
    }

    static double parseDurationSeconds(const std::string& probeJson) {
        try {
            return json::parse(probeJson).value("duration", 0.0);
        } catch (...) { return 0.0; }
    }

    // Single terminal path for a job. Every exit route -- missing input, spawn
    // failure, cancellation, success -- must go through here, because the Node
    // side waits on convert_complete to settle its promise. A path that reports
    // progress but never completes leaves the UI spinning forever.
    static void finalizeJob(const std::shared_ptr<Job>& job, const std::string& status,
                            double progress, const std::string& error = "") {
        {
            std::lock_guard<std::mutex> lk(job->stateMutex);
            job->status = status;
            if (!error.empty()) job->error = error;
        }

        if (error.empty()) emitProgress(job, progress, status);
        else emitProgress(job, progress, status, error);

        job->finished.store(true);

        json done;
        done["jobId"] = job->jobId;
        done["filePath"] = job->inputPath;
        done["outputPath"] = job->outputPath;
        done["status"] = status;
        done["progress"] = job->progress.load();
        {
            std::lock_guard<std::mutex> lk(job->stateMutex);
            if (!job->error.empty()) done["error"] = job->error;
        }
        IPCBridge::sendEvent("convert_complete", done.dump());
    }

    // ── worker ───────────────────────────────────────────────────────────────

    // Copies every input that a filter has to open by name into a
    // per-job folder under %LOCALAPPDATA%, keeping a plain filename.
    // See the subtitles branch in buildFilterChain for why this exists.
    // Returns an empty string on success, or a message describing the
    // failure. Records the folder on the job so it can be removed once
    // ffmpeg has exited.
    static std::string stageFilterInputs(const std::shared_ptr<Job>& job) {
        json opts;
        try {
            opts = json::parse(job->optionsJson.empty() ? "{}" : job->optionsJson);
        } catch (...) {
            return "Invalid conversion options";
        }
        if (!opts.contains("tools") || !opts["tools"].is_object()) return "";
        const json& tools = opts["tools"];

        std::string subSrc;
        std::string logoSrc;
        if (tools.contains("subtitle") && tools["subtitle"].is_object()) {
            const json& s = tools["subtitle"];
            if (s.value("burnIn", false)) subSrc = s.value("subPath", std::string());
        }
        if (tools.contains("watermark") && tools["watermark"].is_object()) {
            const json& w = tools["watermark"];
            if (w.value("type", std::string("image")) == "image") {
                std::string img = w.value("imagePath", std::string());
                std::error_code ec;
                if (!img.empty() && fs::exists(fs::u8path(img), ec)) logoSrc = img;
            }
        }
        if (subSrc.empty() && logoSrc.empty()) return "";

#ifdef _WIN32
        wchar_t localAppData[MAX_PATH + 1];
        ZeroMemory(localAppData, sizeof(localAppData));
        if (!GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, MAX_PATH)) return "";

        // The job id reaches this process from the renderer, so it is
        // reduced to characters that are always safe in a folder name.
        std::string safeId;
        for (char ch : job->jobId) {
            safeId += (std::isalnum(static_cast<unsigned char>(ch)) || ch == '-' || ch == '_')
                ? ch : '_';
        }
        if (safeId.empty()) safeId = "job";

        fs::path root = fs::path(localAppData) / "Panamedia" / "conv" / safeId;
        std::error_code ec;
        fs::remove_all(root, ec);
        fs::create_directories(root, ec);
        if (ec) return "Cannot create a staging folder for the subtitle or logo";

        auto place = [&](const std::string& src, const std::string& stem) -> bool {
            if (src.empty()) return true;
            std::error_code ec2;
            if (!fs::exists(fs::u8path(src), ec2)) return false;
            fs::copy_file(fs::u8path(src), root / stagedFilterName(src, stem),
                          fs::copy_options::overwrite_existing, ec2);
            if (ec2) return false;
            return true;
        };
        if (!place(subSrc, "sub")) {
            std::error_code ec3;
            fs::remove_all(root, ec3);
            return "Cannot read the subtitle file: " + subSrc;
        }
        if (!place(logoSrc, "logo")) {
            std::error_code ec3;
            fs::remove_all(root, ec3);
            return "Cannot read the logo image: " + logoSrc;
        }
        job->stageDir = root.u8string();
        return "";
#else
        return "";
#endif
    }

    static void cleanupFilterStaging(const std::shared_ptr<Job>& job) {
        if (job->stageDir.empty()) return;
        std::error_code ec;
        fs::remove_all(fs::u8path(job->stageDir), ec);
        job->stageDir.clear();
    }

    static void runJob(std::shared_ptr<Job> job) {
        job->startTick = nowTick();

        std::error_code ec;
        if (job->inputPath.empty() || !fs::exists(job->inputPath, ec)) {
            finalizeJob(job, "failed", 0.0, "Source file does not exist: " + job->inputPath);
            return;
        }

        try {
            fs::path outDir = fs::u8path(job->outputPath).parent_path();
            if (!outDir.empty()) fs::create_directories(outDir, ec);
        } catch (...) {}

        // Anything a filter opens by name is copied into a plain-named
        // folder first, and ffmpeg is started inside it. Must happen
        // before the arguments are built, because the argument carries
        // the staged name rather than the real path.
        if (std::string stageErr = stageFilterInputs(job); !stageErr.empty()) {
            finalizeJob(job, "failed", 0.0, stageErr);
            return;
        }

        double duration = parseDurationSeconds(
            ConversionSupport::probeDuration(job->inputPath));

        std::string cmdLine = quoteArg(BinaryResolver::ffmpeg()) + " " +
            joinArgList(buildArgVector(job->inputPath, job->outputPath, job->optionsJson));

        emitProgress(job, 0.05, "converting");

#ifdef _WIN32
        SECURITY_ATTRIBUTES sa;
        sa.nLength = sizeof(sa);
        sa.lpSecurityDescriptor = nullptr;
        sa.bInheritHandle = TRUE;

        HANDLE outRd = nullptr, outWr = nullptr, errRd = nullptr, errWr = nullptr;
        if (!CreatePipe(&outRd, &outWr, &sa, 0) ||
            !CreatePipe(&errRd, &errWr, &sa, 0)) {
            finalizeJob(job, "failed", 0.0, "Failed to create ffmpeg pipes");
            return;
        }
        // Only the write ends may be inherited by the child.
        SetHandleInformation(outRd, HANDLE_FLAG_INHERIT, 0);
        SetHandleInformation(errRd, HANDLE_FLAG_INHERIT, 0);

        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        ZeroMemory(&si, sizeof(si));
        ZeroMemory(&pi, sizeof(pi));
        si.cb = sizeof(si);
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdOutput = outWr;
        si.hStdError = errWr;
        si.hStdInput = nullptr;

        std::wstring wideCmdLine = widenUtf8(cmdLine);
        std::vector<wchar_t> cmd(wideCmdLine.begin(), wideCmdLine.end());
        cmd.push_back(L'\0');

        // Working directory is what makes the staged relative names
        // resolve. Every path in the argument list is absolute, so
        // nothing else is affected by it.
        std::vector<wchar_t> cwd;
        if (!job->stageDir.empty()) {
            std::wstring wideCwd = widenUtf8(job->stageDir);
            cwd.assign(wideCwd.begin(), wideCwd.end());
            cwd.push_back(L'\0');
        }

        BOOL spawned = CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, TRUE,
                                      CREATE_NO_WINDOW, nullptr,
                                      cwd.empty() ? nullptr : cwd.data(), &si, &pi);

        CloseHandle(outWr);
        CloseHandle(errWr);

        if (!spawned) {
            CloseHandle(outRd);
            CloseHandle(errRd);
            finalizeJob(job, "failed", 0.0, "Failed to launch ffmpeg");
            return;
        }

        {
            std::lock_guard<std::mutex> lk(job->handleMutex);
            job->process = pi.hProcess;
        }
        job->pid = pi.dwProcessId;

        // Keeps a conversion from starving the UI or the OS, matching the
        // previous PRIORITY_BELOW_NORMAL behaviour.
        SetPriorityClass(pi.hProcess, BELOW_NORMAL_PRIORITY_CLASS);

        // Drain stderr on a helper thread: an unread pipe would eventually fill
        // and block ffmpeg mid-encode. We only retain the tail for diagnostics.
        std::thread errThread([job, errRd]() {
            std::string tail;
            char buf[4096];
            DWORD n = 0;
            while (ReadFile(errRd, buf, sizeof(buf), &n, nullptr) && n > 0) {
                tail.append(buf, n);
                if (tail.size() > 4000) tail.erase(0, tail.size() - 4000);
            }
            std::lock_guard<std::mutex> lk(job->stateMutex);
            job->diagnostics = tail;
        });

        double lastReported = 0.05;
        std::string pending;
        char buf[4096];
        DWORD n = 0;
        while (ReadFile(outRd, buf, sizeof(buf), &n, nullptr) && n > 0) {
            if (job->cancelled.load()) break;
            pending.append(buf, n);

            size_t pos;
            while ((pos = pending.find('\n')) != std::string::npos) {
                std::string line = pending.substr(0, pos);
                pending.erase(0, pos + 1);
                while (!line.empty() && line.back() == '\r') line.pop_back();

                auto eq = line.find('=');
                if (eq == std::string::npos) continue;
                std::string key = line.substr(0, eq);
                if (key != "out_time_us" && key != "out_time_ms") continue;

                // Both keys carry microseconds in ffmpeg's -progress output.
                double micros = 0;
                try { micros = std::stod(line.substr(eq + 1)); } catch (...) { continue; }
                if (micros <= 0) continue;

                double pct;
                if (duration > 0) {
                    pct = std::min(0.99, std::max(0.05, (micros / 1e6) / duration));
                } else {
                    // Duration unknown (unreadable container): ramp gently so the
                    // UI still moves instead of appearing stuck.
                    double elapsedMs = (double)(nowTick() - job->startTick);
                    pct = std::min(0.90, 0.05 + 0.85 * (elapsedMs / 180000.0));
                }

                if (pct > lastReported) {
                    lastReported = pct;
                    emitProgress(job, pct, job->paused.load() ? "paused" : "converting");
                }
            }
        }
        CloseHandle(outRd);

        WaitForSingleObject(pi.hProcess, INFINITE);

        DWORD exitCode = 1;
        GetExitCodeProcess(pi.hProcess, &exitCode);

        // A suspended process must run again before it can exit or be killed.
        if (job->paused.load()) {
            HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
            if (ntdll) {
                auto resume = reinterpret_cast<PfnNtProcessFn>(
                    GetProcAddress(ntdll, "NtResumeProcess"));
                if (resume) resume(pi.hProcess);
            }
        }

        errThread.join();
        CloseHandle(errRd);

        bool wasCancelled = job->cancelled.load();
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        job->process = nullptr;

        // ffmpeg has exited, so nothing is reading the staged copies.
        cleanupFilterStaging(job);

        std::error_code sec;
        // Split jobs write a numbered series (name000.ext,
        // name001.ext, ...) rather than one file, so success
        // is judged on the first segment instead of the
        // pattern that was handed to ffmpeg.
        bool isSplit = false;
        try {
            json opts = json::parse(job->optionsJson.empty() ? "{}" : job->optionsJson);
            isSplit = opts.contains("tools") && opts["tools"].is_object() &&
                      opts["tools"].contains("split") && opts["tools"]["split"].is_object();
        } catch (...) {}
        // u8path: outputPath is UTF-8 from the renderer. Reading it as a
        // narrow path would fail to find a perfectly valid file whose name
        // contains an accent or a CJK character, and the job would be
        // reported as failed even though ffmpeg exited 0 and wrote it.
        fs::path checkPath = fs::u8path(job->outputPath);
        if (isSplit) {
            std::string stem = checkPath.stem().u8string();
            std::string ext = checkPath.has_extension() ? ("." + checkPath.extension().u8string()) : "";
            checkPath = checkPath.parent_path() / (stem + "000" + ext);
        }
        uintmax_t outSize = fs::exists(checkPath, sec) && !sec
            ? fs::file_size(checkPath, sec) : 0;

        if (wasCancelled) {
            finalizeJob(job, "cancelled", 0.0);
        } else if (exitCode == 0 && outSize > 0) {
            finalizeJob(job, "completed", 1.0);
        } else {
            std::string tail = job->diagnostics;
            if (tail.size() > 500) tail = tail.substr(tail.size() - 500);
            finalizeJob(job, "failed", 0.0,
                "Conversion exited with code " + std::to_string(exitCode) +
                (tail.empty() ? "" : (". " + tail)));
        }

#else
        finalizeJob(job, "failed", 0.0, "Conversion is only implemented on Windows");
#endif
    }

    // ── suspend / resume ─────────────────────────────────────────────────────

    // The job is registered before ffmpeg is spawned, so an immediate pause/cancel
    // can arrive while `process` is still null. Wait briefly rather than failing
    // the control action. Costs nothing on the happy path -- only pause/cancel
    // ever call this.
    static HANDLE acquireProcessHandle(const std::shared_ptr<Job>& job, int timeoutMs) {
        auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
        for (;;) {
            {
                std::lock_guard<std::mutex> lk(job->handleMutex);
                if (job->process) return job->process;
            }
            if (job->finished.load()) return nullptr;
            if (std::chrono::steady_clock::now() >= deadline) return nullptr;
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    static bool setSuspended(const std::shared_ptr<Job>& job, bool suspend, int timeoutMs = 5000) {
#ifdef _WIN32
        if (!job) return false;
        HANDLE h = acquireProcessHandle(job, timeoutMs);
        if (!h) return false;
        HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
        if (!ntdll) return false;
        auto fn = reinterpret_cast<PfnNtProcessFn>(
            GetProcAddress(ntdll, suspend ? "NtSuspendProcess" : "NtResumeProcess"));
        if (!fn) return false;
        if (fn(h) != 0) return false; // NTSTATUS_SUCCESS == 0
        job->paused.store(suspend);
        return true;
#else
        (void)job; (void)suspend; (void)timeoutMs;
        return false;
#endif
    }

    // Terminates ffmpeg, waking it first if suspended: a suspended process cannot
    // act on TerminateProcess until it is scheduled again.
    static void terminateJob(const std::shared_ptr<Job>& job, int waitMs) {
        if (!job) return;
        job->cancelled.store(true);
        if (job->paused.load()) setSuspended(job, false, 0);
#ifdef _WIN32
        HANDLE h = acquireProcessHandle(job, waitMs);
        if (h) TerminateProcess(h, 1);
#endif
    }

    // ── public API ───────────────────────────────────────────────────────────

    std::string ConversionEngine::start(const std::string& jobIdIn,
                                        const std::string& inputPath,
                                        const std::string& outputPath,
                                        const std::string& optionsJson) {
        json err;
        if (jobIdIn.empty() || inputPath.empty() || outputPath.empty()) {
            err["error"] = "jobId, inputPath and outputPath are required";
            return err.dump();
        }

        // Retire any previous job with this id so retries are not blocked.
        std::shared_ptr<Job> old;
        {
            std::lock_guard<std::mutex> lock(g_jobsMutex);
            auto it = g_jobs.find(jobIdIn);
            if (it != g_jobs.end() && !it->second->finished.load()) old = it->second;
            pruneFinishedLocked();
        }
        if (old) {
            terminateJob(old, 2000);
        }

        json opts = json::parse(optionsJson.empty() ? "{}" : optionsJson);

        // --- Phase G: refuse up front what cannot possibly succeed. ---
        //
        // Two cases are worth stopping here rather than discovering minutes
        // later inside ffmpeg:
        //
        //  1. The destination volume is gone or not writable. A USB stick that
        //     was pulled mid-session still leaves its drive letter assigned, so
        //     without this check ffmpeg starts, runs the full duration, and
        //     then reports "No such file or directory".
        //  2. There is not even enough room to plausibly finish. The cutoff is
        //     deliberately far below the working estimate so ordinary tight
        //     cases still run -- they carry a warning instead.
        {
            json vol = json::parse(ConversionSupport::describeVolume(outputPath));
            if (!vol.value("writable", true)) {
                std::string reason = vol.value("reason",
                    std::string("The destination drive is not available"));
                json e;
                e["error"] = "Cannot write to " + vol.value("volumeLabel",
                    std::string("the destination")) + ": " + reason;
                return e.dump();
            }

            uint64_t freeBytes = vol.value("freeBytes", (uint64_t)0);
            std::error_code sec;
            uintmax_t srcBytes = 0;
            if (fs::is_regular_file(fs::u8path(inputPath), sec) && !sec) {
                srcBytes = fs::file_size(fs::u8path(inputPath), sec);
            }
            // 10% of the source, with a 50 MB floor: past this point truncation
            // is certain rather than merely likely.
            uintmax_t floorBytes = (uintmax_t)((double)srcBytes * 0.10);
            if (floorBytes < (uintmax_t)52428800ULL) floorBytes = 52428800ULL;
            if (srcBytes > 0 && freeBytes < floorBytes) {
                json e;
                e["error"] = "Not enough free space on the destination drive to "
                            "hold this conversion";
                e["freeBytes"] = freeBytes;
                e["sourceBytes"] = srcBytes;
                return e.dump();
            }
        }

        auto job = std::make_shared<Job>();
        job->jobId = jobIdIn;
        job->inputPath = inputPath;
        job->outputPath = outputPath;
        job->optionsJson = optionsJson;
        job->status = "running";

        {
            std::lock_guard<std::mutex> lock(g_jobsMutex);
            g_jobs[jobIdIn] = job;
        }

        // Detached and holding its own shared_ptr: the registry may drop this
        // Job at any time without endangering the running thread.
        std::thread([job]() { runJob(job); }).detach();

        json res;
        res["jobId"] = jobIdIn;
        res["started"] = true;
        return res.dump();
    }

    std::string ConversionEngine::pause(const std::string& jobId) {
        auto job = findJob(jobId);
        json res;
        if (!job) { res["error"] = "No such job: " + jobId; return res.dump(); }
        if (job->finished.load()) {
            res["error"] = "Job already finished";
            res["status"] = job->status;
            return res.dump();
        }
        if (!setSuspended(job, true)) {
            res["error"] = "Failed to suspend ffmpeg process";
            return res.dump();
        }
        emitProgress(job, job->progress.load(), "paused");
        res["paused"] = true;
        res["jobId"] = jobId;
        return res.dump();
    }

    std::string ConversionEngine::resume(const std::string& jobId) {
        auto job = findJob(jobId);
        json res;
        if (!job) { res["error"] = "No such job: " + jobId; return res.dump(); }
        if (job->finished.load()) {
            res["error"] = "Job already finished";
            res["status"] = job->status;
            return res.dump();
        }
        if (!setSuspended(job, false)) {
            res["error"] = "Failed to resume ffmpeg process";
            return res.dump();
        }
        emitProgress(job, job->progress.load(), "converting");
        res["paused"] = false;
        res["jobId"] = jobId;
        return res.dump();
    }

    std::string ConversionEngine::cancel(const std::string& jobId) {
        auto job = findJob(jobId);
        json res;
        if (!job) { res["error"] = "No such job: " + jobId; return res.dump(); }
        terminateJob(job, 3000);
        res["cancelled"] = true;
        res["jobId"] = jobId;
        return res.dump();
    }

    std::string ConversionEngine::status(const std::string& jobId) {
        auto job = findJob(jobId);
        json res;
        if (!job) { res["found"] = false; return res.dump(); }
        std::lock_guard<std::mutex> lk(job->stateMutex);
        res["found"] = true;
        res["jobId"] = job->jobId;
        res["status"] = job->status;
        res["progress"] = job->progress.load();
        res["paused"] = job->paused.load();
        res["cancelled"] = job->cancelled.load();
        if (!job->error.empty()) res["error"] = job->error;
        return res.dump();
    }

    std::string ConversionEngine::listActive() {
        std::lock_guard<std::mutex> lock(g_jobsMutex);
        pruneFinishedLocked();
        json arr = json::array();
        for (auto& kv : g_jobs) {
            auto& job = kv.second;
            if (job->finished.load()) continue;
            json o;
            o["jobId"] = kv.first;
            o["filePath"] = job->inputPath;
            o["status"] = job->status;
            o["progress"] = job->progress.load();
            o["paused"] = job->paused.load();
            arr.push_back(std::move(o));
        }
        return arr.dump();
    }

    void ConversionEngine::cancelAll() {
        std::vector<std::shared_ptr<Job>> jobs;
        {
            std::lock_guard<std::mutex> lock(g_jobsMutex);
            for (auto& kv : g_jobs) jobs.push_back(kv.second);
        }
        for (auto& job : jobs) {
            if (job->finished.load()) continue;
            terminateJob(job, 0);   // do not block shutdown waiting for a spawn
        }
    }

} // namespace Panamedia