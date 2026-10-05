#include "library_scanner.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cctype>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace fs = std::filesystem;

namespace Panamedia {

    // ── Extension classification ────────────────────────────────────────────
    static const std::vector<std::string> VIDEO_EXTS = {
        ".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".mpg", ".mpeg", ".mpeg4",
        ".dat", ".3gp", ".wmv", ".m4v", ".ts", ".net.ts", ".ogv", ".m2ts", ".3g2",
        ".f4v", ".divx", ".mpg4", ".rm", ".rmvb", ".asf", ".asx", ".swf", ".vob"
    };

    static const std::vector<std::string> AUDIO_EXTS = {
        ".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".wma", ".alac",
        ".aiff", ".ape", ".amr", ".m4b", ".mka", ".m4r", ".mid", ".midi", ".mp2",
        ".mpa", ".wv"
    };

    static const std::vector<std::string> DOC_EXTS = {
        ".docx", ".doc", ".pdf", ".txt", ".pptx", ".xlsx", ".rtf",
        ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp", ".tiff"
    };

    static bool inList(const std::vector<std::string>& list, const std::string& v) {
        return std::find(list.begin(), list.end(), v) != list.end();
    }

    std::vector<std::string> LibraryScanner::defaultSkipDirNames() {
        return {
            "node_modules", "Windows", "Program Files", "Program Files (x86)",
            "AppData", "$RECYCLE.BIN", "System Volume Information",
            ".git", ".svn", ".vscode", ".idea", "target", "vendor",
            "__pycache__", "dist", "build", ".agents"
        };
    }

    // Mirrors isMpegTsVideo() from electron.cjs — reads a 565-byte header and
    // looks for MPEG-TS (188), M2TS (192) or DVB (204) sync-byte spacing.
    bool LibraryScanner::looksLikeMpegTs(const std::string& filePath, uint64_t fileSize) {
        if (filePath.empty()) return false;
        std::string lower = filePath;
        std::transform(lower.begin(), lower.end(), lower.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });
        if (lower.size() >= 7 && lower.compare(lower.size() - 7, 7, ".net.ts") == 0) return true;
        if ((lower.size() >= 5 && lower.compare(lower.size() - 5, 5, ".d.ts") == 0) ||
            (lower.size() >= 8 && lower.compare(lower.size() - 8, 8, ".test.ts") == 0) ||
            (lower.size() >= 8 && lower.compare(lower.size() - 8, 8, ".spec.ts") == 0) ||
            (lower.size() >= 10 && lower.compare(lower.size() - 10, 10, ".config.ts") == 0)) {
            return false;
        }
        if (fileSize == 0 || fileSize < 512) return false;

        std::ifstream in(filePath, std::ios::binary);
        if (!in.is_open()) return false;
        char buf[565];
        in.read(buf, sizeof(buf));
        std::streamsize bytesRead = in.gcount();
        if (bytesRead < 189) return false;
        auto B = [&](std::streamsize i) -> int { return static_cast<unsigned char>(buf[i]); };

        if (B(0) == 0x47 && B(188) == 0x47 && (bytesRead < 377 || B(376) == 0x47)) return true;
        if ((B(4) == 0x47 && bytesRead >= 196 && B(196) == 0x47) ||
            (B(0) == 0x47 && bytesRead >= 193 && B(192) == 0x47)) return true;
        if (B(0) == 0x47 && bytesRead >= 205 && B(204) == 0x47) return true;
        return false;
    }

    std::string LibraryScanner::classifyExtension(const std::string& filename,
                                                  const std::string& extLower,
                                                  bool isNetTs) {
        if (isNetTs) return "videos";
        if (extLower == ".ts") return "files";   // refined by caller via MPEG-TS sniff
        if (inList(VIDEO_EXTS, extLower)) return "videos";
        if (inList(AUDIO_EXTS, extLower)) return "audios";
        if (inList(DOC_EXTS, extLower)) return "docx";
        return "files";
    }

    // Mirrors normalizeDupName() from electron.cjs.
    std::string LibraryScanner::normalizeDupName(const std::string& filename) {
        if (filename.empty()) return "";
        size_t dotPos = filename.find_last_of('.');
        std::string ext = (dotPos == std::string::npos) ? "" : filename.substr(dotPos);
        std::string base = (dotPos == std::string::npos) ? filename : filename.substr(0, dotPos);

        // strip trailing " (N)"
        {
            size_t p = base.rfind(" (");
            if (p != std::string::npos && base.back() == ')') {
                std::string inner = base.substr(p + 2, base.size() - p - 3);
                if (!inner.empty() && inner.find_first_not_of("0123456789") == std::string::npos) {
                    base = base.substr(0, p);
                }
            }
        }
        // strip trailing "_N"
        {
            size_t p = base.rfind('_');
            if (p != std::string::npos && p + 1 < base.size()) {
                std::string inner = base.substr(p + 1);
                if (inner.find_first_not_of("0123456789") == std::string::npos) {
                    base = base.substr(0, p);
                }
            }
        }
        // strip trailing " - Copy"
        {
            std::string lower = base;
            std::transform(lower.begin(), lower.end(), lower.begin(),
                           [](unsigned char c) { return (char)std::tolower(c); });
            const std::string a = " - copy";
            if (lower.size() >= a.size() &&
                lower.compare(lower.size() - a.size(), a.size(), a) == 0) {
                base = base.substr(0, base.size() - a.size());
            }
            const std::string b = " (copy)";
            if (lower.size() >= b.size() &&
                lower.compare(lower.size() - b.size(), b.size(), b) == 0) {
                base = base.substr(0, base.size() - b.size());
            }
        }
        // trim
        {
            size_t s = base.find_first_not_of(" \t");
            size_t e = base.find_last_not_of(" \t");
            base = (s == std::string::npos) ? "" : base.substr(s, e - s + 1);
        }
        std::string lowerBase = base;
        std::transform(lowerBase.begin(), lowerBase.end(), lowerBase.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });
        std::string lowerExt = ext;
        std::transform(lowerExt.begin(), lowerExt.end(), lowerExt.begin(),
                       [](unsigned char c) { return (char)std::tolower(c); });
        return lowerBase + lowerExt;
    }

    // ── Parallel scanner ────────────────────────────────────────────────────
    namespace {

        struct WorkItem {
            fs::path dir;
            int depth;
        };

        struct SharedState {
            std::mutex mtx;
            std::condition_variable cv;
            std::deque<WorkItem> queue;
            std::vector<MediaFile> files;
            std::unordered_set<std::string> seenPaths;   // guards overlapping roots
            std::atomic<size_t> fileCount{0};
            std::atomic<size_t> dirsVisited{0};
            std::atomic<size_t> filesConsidered{0};
            std::atomic<bool> stop{false};
            size_t activeWorkers = 0;   // guarded by mtx
            bool hitFileCap = false;
            bool hitDepthCap = false;
        };

        static uint64_t toEpochMs(const fs::file_time_type& ft) {
            // MSVC's fs::file_time_type counts 100-nanosecond ticks since
            // 1601-01-01 UTC. Converting exactly avoids the precision loss of the
            // "ft - now() + system_clock::now()" trick, which drifts enough to
            // disagree with Node's stat.mtimeMs on many files.
            auto ticks = ft.time_since_epoch().count();          // 100ns since 1601
            const int64_t kTicksPerSecond = 10000000LL;
            const int64_t kEpochDeltaSeconds = 11644473600LL;    // 1601 -> 1970
            int64_t unixTicks = (int64_t)ticks - kEpochDeltaSeconds * kTicksPerSecond;
            if (unixTicks < 0) return 0;
            return (uint64_t)(unixTicks / 10000LL);               // 100ns -> ms
        }

        // ── Incremental directory cache ──────────────────────────────────────
        // Mirrors the `dirCache` Map in electron.cjs: when a directory's mtime is
        // unchanged we reuse its recorded files and subdirectories instead of
        // re-reading it. Process-global so it survives across library_sync calls
        // for the engine's lifetime, which is what makes repeat syncs cheap.
        struct DirCacheEntry {
            uint64_t dirMtimeMs = 0;
            std::vector<MediaFile> directFiles;
            std::vector<std::string> subdirs;      // UTF-8 absolute paths
        };

        std::mutex& cacheMutex() {
            static std::mutex m;
            return m;
        }

        std::unordered_map<std::string, DirCacheEntry>& dirCache() {
            static std::unordered_map<std::string, DirCacheEntry> c;
            return c;
        }
    }

    void LibraryScanner::clearCache() {
        std::lock_guard<std::mutex> lock(cacheMutex());
        dirCache().clear();
    }

    namespace {

        static void worker(SharedState& st, const ScanOptions& opts,
                           const std::vector<std::string>& skipDirs,
                           const LibraryScanner::ProgressCallback& progress) {
            std::vector<MediaFile> local;
            size_t sinceProgress = 0;

            for (;;) {
                WorkItem item;
                {
                    std::unique_lock<std::mutex> lock(st.mtx);
                    while (st.queue.empty() && !st.stop) st.cv.wait(lock);
                    if (st.stop) break;
                    item = st.queue.front();
                    st.queue.pop_front();
                    st.activeWorkers++;
                }

                st.dirsVisited.fetch_add(1, std::memory_order_relaxed);

                // Everything from here to the activeWorkers decrement runs inside a
                // try: an exception escaping a thread calls std::terminate, which
                // MSVC surfaces as __fastfail (0xC0000409) and kills the whole
                // engine. Windows rejects or mis-decodes some paths (non-ASCII
                // names, trailing spaces), and path::string() throws on those, so
                // no single directory may be allowed to take the process down.
                try {
                std::string dirKey;
                uint64_t dirMtime = 0;
                {
                    std::error_code sec;
                    dirKey = item.dir.u8string();
                    if (!sec) dirMtime = toEpochMs(fs::last_write_time(item.dir, sec));
                    else sec.clear();
                }

                // Cache lookup: unchanged directory ⇒ reuse recorded contents.
                bool cacheHit = false;
                std::vector<MediaFile> cachedFiles;
                std::vector<std::string> cachedSubdirs;
                if (dirMtime != 0) {
                    std::lock_guard<std::mutex> clock_(cacheMutex());
                    auto cit = dirCache().find(dirKey);
                    if (cit != dirCache().end() && cit->second.dirMtimeMs == dirMtime) {
                        cacheHit = true;
                        cachedFiles = cit->second.directFiles;
                        cachedSubdirs = cit->second.subdirs;
                    }
                }

                if (cacheHit) {
                    for (const auto& mf : cachedFiles) {
                        {
                            std::lock_guard<std::mutex> lock(st.mtx);
                            if (st.stop) break;
                            if (st.seenPaths.count(mf.path)) continue;
                            if (st.fileCount.load() >= opts.maxFiles) {
                                st.stop = true; st.hitFileCap = true; break;
                            }
                            st.seenPaths.insert(mf.path);
                            st.fileCount.fetch_add(1, std::memory_order_relaxed);
                        }
                        local.push_back(mf);
                    }
                    {
                        std::lock_guard<std::mutex> lock(st.mtx);
                        for (const auto& sub : cachedSubdirs) {
                            if (!st.stop && item.depth + 1 <= opts.maxDepth) {
                                st.queue.push_back({ fs::u8path(sub), item.depth + 1 });
                            }
                        }
                    }
                } else {
                std::error_code ec;
                fs::directory_iterator it(item.dir, fs::directory_options::skip_permission_denied, ec);
                const fs::directory_iterator end;

                DirCacheEntry entry;
                entry.dirMtimeMs = dirMtime;

                // NB: if construction failed, ec is set and the loop body never
                // runs. We must still fall through to the activeWorkers decrement
                // below — bailing out early here would leak the slot and deadlock
                // the drain loop (Windows rejects some paths, e.g. trailing spaces).
                for (; !ec && it != end; it.increment(ec)) {
                    if (st.stop) break;
                    if (ec) { ec.clear(); continue; }

                    if (item.depth + 1 > opts.maxDepth) {
                        std::lock_guard<std::mutex> lock(st.mtx);
                        st.hitDepthCap = true;
                    }

                    // .u8string() gives UTF-8. .string() would go through the ANSI
                    // code page and mangle non-ASCII names (e.g. "Русский"), which
                    // breaks dedup keys and the JSON we hand to the renderer.
                    const std::string name = it->path().filename().u8string();
                    if (!name.empty() && name[0] == '.') continue;
                    if (inList(skipDirs, name)) continue;

                    std::error_code sec;
                    const auto status = it->symlink_status(sec);
                    if (sec) continue;

                    if (fs::is_directory(status)) {
                        entry.subdirs.push_back(it->path().u8string());
                        std::lock_guard<std::mutex> lock(st.mtx);
                        if (!st.stop && item.depth + 1 <= opts.maxDepth) {
                            st.queue.push_back({ it->path(), item.depth + 1 });
                        }
                        continue;
                    }
                    if (!fs::is_regular_file(status)) continue;

                    st.filesConsidered.fetch_add(1, std::memory_order_relaxed);

                    // Dedup across overlapping roots.
                    const std::string fullPath = it->path().u8string();
                    {
                        std::lock_guard<std::mutex> lock(st.mtx);
                        if (st.seenPaths.count(fullPath)) continue;
                        if (st.fileCount.load() >= opts.maxFiles) {
                            st.stop = true;
                            st.hitFileCap = true;
                            break;
                        }
                        st.seenPaths.insert(fullPath);
                        st.fileCount.fetch_add(1, std::memory_order_relaxed);
                    }

                    std::error_code stec;
                    const auto sz = fs::file_size(it->path(), stec);
                    const uint64_t sizeBytes = stec ? 0ULL : (uint64_t)sz;

                    std::string lowerName = name;
                    std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(),
                                   [](unsigned char c) { return (char)std::tolower(c); });
                    const bool isNetTs = (lowerName.size() >= 7 &&
                        lowerName.compare(lowerName.size() - 7, 7, ".net.ts") == 0);
                    std::string ext = isNetTs ? std::string(".net.ts")
                                              : fs::path(name).extension().string();
                    std::string extLower = ext;
                    std::transform(extLower.begin(), extLower.end(), extLower.begin(),
                                   [](unsigned char c) { return (char)std::tolower(c); });

                    std::string category = LibraryScanner::classifyExtension(name, extLower, isNetTs);
                    if (extLower == ".ts" && !isNetTs) {
                        category = LibraryScanner::looksLikeMpegTs(fullPath, sizeBytes)
                                 ? "videos" : "files";
                    }

                    MediaFile mf;
                    mf.path = fullPath;
                    mf.name = name;
                    // Node emitted path.extname(file).toLowerCase(); match that
                    // exactly so the renderer's ext handling is unchanged.
                    mf.ext = extLower;
                    mf.sizeBytes = sizeBytes;
                    mf.category = category;
                    std::error_code mtEc;
                    mf.modifiedTime = toEpochMs(fs::last_write_time(it->path(), mtEc));

                    local.push_back(mf);
                    entry.directFiles.push_back(std::move(mf));

                    if (progress && ++sinceProgress >= 200) {
                        sinceProgress = 0;
                        std::lock_guard<std::mutex> lock(st.mtx);
                        progress(dirKey, st.fileCount.load());
                    }
                }

                // Only record a cache entry for a directory we actually read, and
                // only when its mtime was readable (otherwise a later run could
                // wrongly treat a changed dir as unchanged).
                if (dirMtime != 0) {
                    std::lock_guard<std::mutex> clock_(cacheMutex());
                    dirCache()[dirKey] = std::move(entry);
                }
                }

                } catch (const std::exception& ex) {
                    fprintf(stderr, "[Scanner] skipping unreadable directory at depth %d: %s\n",
                            item.depth, ex.what());
                    fflush(stderr);
                }

                // Release this slot so the drain loop can detect completion.
                {
                    std::lock_guard<std::mutex> lock(st.mtx);
                    if (st.activeWorkers > 0) st.activeWorkers--;
                }
                st.cv.notify_all();
            }

            if (!local.empty()) {
                std::lock_guard<std::mutex> lock(st.mtx);
                st.files.insert(st.files.end(), local.begin(), local.end());
            }
        }
    }

    std::vector<MediaFile> LibraryScanner::scanRoots(
        const std::vector<std::string>& roots,
        const ScanOptions& options,
        ProgressCallback progress,
        ScanStats* stats) {

        const auto t0 = std::chrono::steady_clock::now();

        ScanOptions opts = options;
        if (opts.skipDirNames.empty()) opts.skipDirNames = defaultSkipDirNames();

        SharedState st;
        {
            std::lock_guard<std::mutex> lock(st.mtx);
            for (const auto& r : roots) {
                if (r.empty()) continue;
                std::error_code ec;
                fs::path p = fs::u8path(r);
                if (!fs::exists(p, ec) || ec) continue;
                if (fs::is_directory(p, ec) && !ec) st.queue.push_back({ p, 0 });
            }
        }

        unsigned hw = std::thread::hardware_concurrency();
        if (hw == 0) hw = 4;
        // Scanning is I/O bound; a small oversubscription helps hide latency.
        size_t workerCount = std::min<size_t>(hw * 2, 16);
        // Escape hatch for diagnosing pathological trees.
        if (const char* envThreads = std::getenv("PANAMEDIA_SCAN_THREADS")) {
            int n = std::atoi(envThreads);
            if (n > 0) workerCount = (size_t)n;
        }
        if (st.queue.empty()) workerCount = 0;

        std::vector<std::thread> pool;
        pool.reserve(workerCount);
        for (size_t i = 0; i < workerCount; ++i) {
            pool.emplace_back([&st, &opts, &progress] {
                worker(st, opts, opts.skipDirNames, progress);
            });
        }

        // Drain: done once the queue is empty AND no worker is mid-directory.
        {
            std::unique_lock<std::mutex> lock(st.mtx);
            st.cv.wait_for(lock, std::chrono::milliseconds(20), [&] {
                return st.stop || (st.queue.empty() && st.activeWorkers == 0);
            });
            while (!st.stop && !(st.queue.empty() && st.activeWorkers == 0)) {
                st.cv.wait_for(lock, std::chrono::milliseconds(20));
            }
            st.stop = true;
        }
        st.cv.notify_all();

        for (auto& t : pool) t.join();

        // Stable ordering keeps renderer diffing and caching predictable.
        std::sort(st.files.begin(), st.files.end(),
                  [](const MediaFile& a, const MediaFile& b) { return a.path < b.path; });

        if (stats) {
            stats->directoriesVisited = st.dirsVisited.load();
            stats->filesConsidered   = st.filesConsidered.load();
            stats->skipped           = st.files.size();
            stats->hitFileCap        = st.hitFileCap;
            stats->hitDepthCap       = st.hitDepthCap;
            stats->elapsedMs = (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - t0).count();
        }

        return std::move(st.files);
    }

    std::vector<DuplicateGroup> LibraryScanner::findDuplicates(const std::vector<MediaFile>& files) {
        std::unordered_map<std::string, std::vector<MediaFile>> groups;
        groups.reserve(files.size());
        for (const auto& f : files) groups[normalizeDupName(f.name)].push_back(f);

        std::vector<DuplicateGroup> out;
        for (auto& kv : groups) {
            if (kv.second.size() < 2) continue;
            std::unordered_set<std::string> distinct;
            for (const auto& f : kv.second) distinct.insert(f.path);
            if (distinct.size() < 2) continue;
            DuplicateGroup g;
            g.name = kv.first;
            g.list = std::move(kv.second);
            std::sort(g.list.begin(), g.list.end(),
                      [](const MediaFile& a, const MediaFile& b) { return a.path < b.path; });
            out.push_back(std::move(g));
        }
        std::sort(out.begin(), out.end(),
                  [](const DuplicateGroup& a, const DuplicateGroup& b) { return a.name < b.name; });
        return out;
    }

    std::vector<MediaFile> LibraryScanner::scanDirectory(const std::string& folderPath,
                                                         ProgressCallback callback) {
        ScanOptions opts;
        ScanStats stats;
        return scanRoots({ folderPath }, opts, callback, &stats);
    }

} // namespace Panamedia
