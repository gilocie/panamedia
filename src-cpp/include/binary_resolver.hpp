#ifndef BINARY_RESOLVER_HPP
#define BINARY_RESOLVER_HPP

#include <string>
#include <vector>

namespace Panamedia {

    // Locates the ffmpeg/ffprobe executables the same way the Node side does in
    // panamedia-downloader/youtube.cjs (resolveBinary), then verifies the
    // candidate actually runs before committing to it.
    //
    // This exists because a candidate can be present and still be useless: a
    // corrupt ffprobe.exe in the primary bin directory hard-crashes (0xC0000005)
    // on every invocation, which silently degrades every probe to "unknown".
    // Health-checking once and falling through to the next candidate turns that
    // silent failure into a working binary.
    class BinaryResolver {
    public:
        // Returns a path to a *working* ffmpeg/ffprobe, or an empty string if
        // none could be verified. Results are cached for the process lifetime.
        static std::string ffmpeg();
        static std::string ffprobe();

        // Candidate paths in resolution order, without any health check.
        // Exposed for diagnostics.
        static std::vector<std::string> candidates(const std::string& exeName);
    };

} // namespace Panamedia

#endif // BINARY_RESOLVER_HPP