#ifndef LIBRARY_SCANNER_HPP
#define LIBRARY_SCANNER_HPP

#include <string>
#include <vector>
#include <functional>
#include <cstdint>

namespace Panamedia {

    // Mirrors the shape the renderer already consumes:
    //   { name, path, size, mtime, category, ext }
    struct MediaFile {
        std::string path;
        std::string name;
        std::string ext;          // includes leading dot, e.g. ".mp4"
        uint64_t    sizeBytes = 0;
        uint64_t    modifiedTime = 0; // milliseconds since Unix epoch
        std::string category;     // "videos" | "audios" | "docx" | "files"
    };

    struct DuplicateGroup {
        std::string name;                 // normalised base name
        std::vector<MediaFile> list;
    };

    struct ScanStats {
        size_t directoriesVisited = 0;
        size_t filesConsidered   = 0;
        size_t skipped           = 0;
        uint64_t elapsedMs       = 0;
        bool     hitFileCap      = false;
        bool     hitDepthCap     = false;
    };

    struct ScanOptions {
        int  maxDepth       = 8;      // matches previous Node behaviour
        size_t maxFiles     = 10000;  // matches previous Node behaviour
        bool  detectDuplicates = true;
        // Directory names never descended into.
        std::vector<std::string> skipDirNames;
    };

    class LibraryScanner {
    public:
        using ProgressCallback = std::function<void(const std::string& currentDir, size_t foundCount)>;

        // Thread-pool recursive scan across one or more roots.
        // Roots may overlap; duplicate paths are emitted only once.
        static std::vector<MediaFile> scanRoots(
            const std::vector<std::string>& roots,
            const ScanOptions& options,
            ProgressCallback progress = nullptr,
            ScanStats* stats = nullptr);

        // Groups files whose normalised base names collide at distinct paths.
        // Normalisation strips copy markers such as " (1)", "_2", " - Copy".
        static std::vector<DuplicateGroup> findDuplicates(const std::vector<MediaFile>& files);

        // Legacy single-root entry point retained for the existing "scan" action.
        static std::vector<MediaFile> scanDirectory(const std::string& folderPath,
                                                    ProgressCallback callback = nullptr);

        // Drops all memoised directory listings. Used when the app wants a
        // guaranteed-cold rescan (manual library refresh, or after a bulk
        // file operation that may have changed a tree wholesale).
        static void clearCache();

        // Exposed for testing.
        static std::string normalizeDupName(const std::string& filename);
        static std::string classifyExtension(const std::string& filename,
                                             const std::string& extLower,
                                             bool isNetTs);
        static bool looksLikeMpegTs(const std::string& filePath, uint64_t fileSize);
        static std::vector<std::string> defaultSkipDirNames();
    };

} // namespace Panamedia

#endif // LIBRARY_SCANNER_HPP
