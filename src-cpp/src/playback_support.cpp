#include "playback_support.hpp"

#include <algorithm>
#include <cctype>
#include <vector>

namespace Panamedia {

    namespace {

        std::string lower(const std::string& s) {
            std::string out = s;
            std::transform(out.begin(), out.end(), out.begin(),
                           [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            return out;
        }

        bool inList(const std::string& value, const std::vector<std::string>& list) {
            return std::find(list.begin(), list.end(), value) != list.end();
        }

        std::string extensionOf(const std::string& filePath) {
            size_t dotPos = filePath.find_last_of('.');
            if (dotPos == std::string::npos) return "";
            return lower(filePath.substr(dotPos));
        }

        // Video codecs Chromium decodes itself, so re-encoding them to H.264
        // buys nothing and costs a whole core per file.
        //
        // HEVC is deliberately absent: Chromium's HEVC support varies by Windows
        // build and GPU, so transcoding it is the safe choice rather than
        // gambling on the user's hardware.
        const std::vector<std::string>& nativeVideoCodecs() {
            static const std::vector<std::string> list = { "h264", "avc1", "vp8", "vp9", "av1", "av01" };
            return list;
        }

        const std::vector<std::string>& nativeAudioCodecs() {
            static const std::vector<std::string> list = { "aac", "mp3", "opus", "vorbis", "flac" };
            return list;
        }

        // Pixel formats a browser will accept in an MP4/WebM stream.
        const std::vector<std::string>& nativePixelFormats() {
            static const std::vector<std::string> list = { "yuv420p", "yuvj420p", "yuv420p10le", "" };
            return list;
        }

    } // namespace

    bool PlaybackSupport::canStreamCopy(const MediaInfo& info) {
        const std::string vc = lower(info.videoCodec);
        const std::string ac = lower(info.audioCodec);
        const std::string px = lower(info.pixelFormat);

        // An audio-only file never takes the video copy path.
        if (vc.empty() && ac.empty()) return false;
        if (vc.empty()) return false;

        if (!inList(vc, nativeVideoCodecs())) return false;
        if (!inList(px, nativePixelFormats())) return false;
        // An audio codec the browser cannot play blocks the copy too, even
        // though the video alone would have been fine.
        if (!ac.empty() && !inList(ac, nativeAudioCodecs())) return false;

        return true;
    }

    bool PlaybackSupport::isPlayableContainer(const std::string& filePath) {
        const std::string ext = extensionOf(filePath);
        return ext == ".mp4" || ext == ".m4v" || ext == ".webm";
    }

    bool PlaybackSupport::needsTranscode(const std::string& filePath, const MediaInfo& info) {
        if (!isPlayableContainer(filePath)) return true;
        return !canStreamCopy(info);
    }

    int PlaybackSupport::transcodeBitrateKbps(int width, int height, long long sourceBitrate) {
        const long long pixels = static_cast<long long>(width) * static_cast<long long>(height);
        // A resolution ladder for sources whose bitrate is unknown.
        int ladder = 2000;
        if (pixels >= 1920LL * 1080LL) ladder = 8000;
        else if (pixels >= 1280LL * 720LL) ladder = 4500;

        const int sourceKbps = sourceBitrate > 0 ? static_cast<int>((sourceBitrate + 500) / 1000) : 0;
        const int wanted = sourceKbps > 0 ? sourceKbps : ladder;

        // Never exceed the ladder's cap, and never emit something degenerate.
        const int capped = std::min(wanted, ladder * 2);
        return std::max(300, capped);
    }

} // namespace Panamedia