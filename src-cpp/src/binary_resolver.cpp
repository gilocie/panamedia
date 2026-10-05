#include "binary_resolver.hpp"

#include <array>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <mutex>
#include <sstream>

#ifdef _WIN32
#include <windows.h>
#define popen _popen
#define pclose _pclose
#endif

namespace fs = std::filesystem;

namespace Panamedia {

    // Exit code Windows raises for a hard crash (STATUS_ACCESS_VIOLATION and
    // friends). ffmpeg returns these when the binary itself is corrupt, which is
    // indistinguishable from success if you only look for "non-empty output".
    static bool isCrashExit(int rawExit) {
#ifdef _WIN32
        unsigned int code = (unsigned int)rawExit;
        // pclose returns the process exit code directly on Windows.
        if (code >= 0xC0000000u && code <= 0xC000FFFFu) return true; // NTSTATUS range
        if ((int)rawExit < 0) return true;
#else
        (void)rawExit;
#endif
        return false;
    }

    // Runs `<exe> -version` and reports whether the binary is healthy.
    static bool isHealthy(const std::string& exe) {
        std::stringstream cmd;
#ifdef _WIN32
        cmd << "\"\"" << exe << "\" -version\"";
#else
        cmd << "\"" << exe << "\" -version";
#endif

        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) return false;

        std::string out;
        std::array<char, 1024> buf;
        while (fgets(buf.data(), (int)buf.size(), pipe) != nullptr) {
            out += buf.data();
            if (out.size() > 4096) break; // plenty to prove liveness
        }
        int rc = pclose(pipe);
        if (isCrashExit(rc)) return false;
        return out.find("ffmpeg version") != std::string::npos ||
               out.find("ffprobe version") != std::string::npos;
    }

    std::vector<std::string> BinaryResolver::candidates(const std::string& exeName) {
        std::vector<std::string> out;

        const char* appData = std::getenv("APPDATA");
        const char* localAppData = std::getenv("LOCALAPPDATA");

        // Primary: the app's own bin directory (Electron's userData resolves to
        // %APPDATA%\panamedia for this product).
        if (appData) {
            out.push_back((fs::path(appData) / "panamedia" / "bin" / exeName).string());
            out.push_back((fs::path(appData) / "net-downloader" / "bin" / exeName).string());
            out.push_back((fs::path(appData) / "Electron" / "bin" / exeName).string());
        }
        if (localAppData) {
            out.push_back((fs::path(localAppData) / "panamedia" / "bin" / exeName).string());
            out.push_back((fs::path(localAppData) / "net-downloader" / "bin" / exeName).string());
        }

        // Repo-local fallbacks, so a dev checkout works without APPDATA set.
        std::error_code ec;
        fs::path cwd = fs::current_path(ec);
        if (!ec) {
            out.push_back((cwd / "bin" / exeName).string());
            out.push_back((cwd / "src-cpp" / "bin" / exeName).string());
        }

        return out;
    }

    static std::string resolveOne(const std::string& exeName) {
        for (const auto& c : BinaryResolver::candidates(exeName)) {
            std::error_code ec;
            if (!fs::exists(c, ec) || fs::is_directory(c, ec)) continue;
            if (!isHealthy(c)) continue;   // skip corrupt/crashing binaries
            return c;
        }
        // Nothing verified. Return the bare name and let the OS resolve it via
        // PATH, matching the previous behaviour as a last resort.
        return exeName;
    }

    static std::mutex s_mutex;
    static std::string s_ffmpeg;
    static std::string s_ffprobe;

    std::string BinaryResolver::ffmpeg() {
        std::lock_guard<std::mutex> lock(s_mutex);
        if (s_ffmpeg.empty()) s_ffmpeg = resolveOne("ffmpeg.exe");
        return s_ffmpeg;
    }

    std::string BinaryResolver::ffprobe() {
        std::lock_guard<std::mutex> lock(s_mutex);
        if (s_ffprobe.empty()) s_ffprobe = resolveOne("ffprobe.exe");
        return s_ffprobe;
    }

} // namespace Panamedia