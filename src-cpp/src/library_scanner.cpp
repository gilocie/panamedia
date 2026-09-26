#include "library_scanner.hpp"
#include <filesystem>
#include <algorithm>
#include <iostream>

namespace fs = std::filesystem;

namespace Panamedia {

    static const std::vector<std::string> VIDEO_EXTS = {
        ".mp4", ".mkv", ".webm", ".avi", ".mov", ".mpeg", ".mpg", ".ts", ".m4v"
    };

    static const std::vector<std::string> AUDIO_EXTS = {
        ".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".wma"
    };

    static bool isMediaExtension(const std::string& ext) {
        std::string lowerExt = ext;
        std::transform(lowerExt.begin(), lowerExt.end(), lowerExt.begin(), ::tolower);
        
        if (std::find(VIDEO_EXTS.begin(), VIDEO_EXTS.end(), lowerExt) != VIDEO_EXTS.end()) return true;
        if (std::find(AUDIO_EXTS.begin(), AUDIO_EXTS.end(), lowerExt) != AUDIO_EXTS.end()) return true;
        return false;
    }

    std::vector<MediaFile> LibraryScanner::scanDirectory(const std::string& folderPath, 
                                                              ProgressCallback callback) {
        std::vector<MediaFile> mediaFiles;
        
        if (!fs::exists(folderPath) || !fs::is_directory(folderPath)) {
            return mediaFiles;
        }

        size_t tick = 0;
        
        try {
            // Recursive crawler with custom skip-on-error logic
            for (auto const& entry : fs::recursive_directory_iterator(folderPath, fs::directory_options::skip_permission_denied)) {
                try {
                    if (entry.is_regular_file()) {
                        std::string ext = entry.path().extension().string();
                        
                        if (isMediaExtension(ext)) {
                            MediaFile mf;
                            mf.path = entry.path().string();
                            mf.name = entry.path().filename().string();
                            mf.ext = ext.empty() ? "" : ext.substr(1); // strip the leading dot
                            mf.sizeBytes = entry.file_size();
                            
                            auto ftime = entry.last_write_time();
                            auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                                ftime - decltype(ftime)::clock::now() + std::chrono::system_clock::now()
                            );
                            mf.modifiedTime = std::chrono::duration_cast<std::chrono::milliseconds>(
                                sctp.time_since_epoch()
                            ).count();

                            mediaFiles.push_back(mf);

                            // Send progress status every 20 media files
                            if (callback && (++tick % 20 == 0)) {
                                callback(entry.path().parent_path().string(), mediaFiles.size());
                            }
                        }
                    }
                }
                catch (const fs::filesystem_error&) {
                    // Ignore inaccessible single files or directories and continue recursion
                    continue;
                }
            }
        }
        catch (const fs::filesystem_error& err) {
            // General crawl failure
            std::cerr << "Filesystem crawl error: " << err.what() << std::endl;
        }

        return mediaFiles;
    }

} // namespace Panamedia
