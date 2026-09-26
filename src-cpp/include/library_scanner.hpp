#ifndef LIBRARY_SCANNER_HPP
#define LIBRARY_SCANNER_HPP

#include <string>
#include <vector>
#include <functional>

namespace Panamedia {

    struct MediaFile {
        std::string path;
        std::string name;
        std::string ext;
        uint64_t sizeBytes;
        uint64_t modifiedTime;
    };

    class LibraryScanner {
    public:
        using ProgressCallback = std::function<void(const std::string& currentDir, size_t foundCount)>;

        // Crawls folderPath recursively and index media files
        static std::vector<MediaFile> scanDirectory(const std::string& folderPath, 
                                                   ProgressCallback callback = nullptr);
    };

} // namespace Panamedia

#endif // LIBRARY_SCANNER_HPP
