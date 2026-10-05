#ifndef PLAYBACK_SUPPORT_HPP
#define PLAYBACK_SUPPORT_HPP

#include <string>

namespace Panamedia {

    // Playback decisions for the streaming server and the /probe endpoint.
    //
    // This exists as one shared header because the same rule was previously
    // written out three separate times -- once in the HTTP server, once in the
    // media prober, and once in Electron -- and all three copies disagreed with
    // each other about what the browser can play. The copies that only knew
    // "h264/avc1" marked every VP8, VP9 and AV1 file as needing transcoding,
    // which sent the player down a full libx264 re-encode of the entire file to
    // display a picture Chromium already decodes natively.
    class PlaybackSupport {
    public:
        struct MediaInfo {
            std::string videoCodec;
            std::string audioCodec;
            std::string pixelFormat;
            int width = 0;
            int height = 0;
        };

        // True when ffmpeg only has to remux: every stream survives the trip to
        // the browser and nothing needs to change. A false result means a real
        // transcode, which costs a core per file.
        static bool canStreamCopy(const MediaInfo& info);

        // True when the container is one Chromium reliably demuxes. Containers
        // outside this set may still play, but not reliably enough to promise,
        // so they go through /transcode -- which stream-copies when the codecs
        // themselves allow it.
        static bool isPlayableContainer(const std::string& filePath);

        // The full direct-play decision: container AND codecs. This is what
        // `needsTranscode` in every /probe response should be built from.
        static bool needsTranscode(const std::string& filePath, const MediaInfo& info);

        // Bitrate ceiling in kbit/s for a transcode that genuinely has to
        // happen. With neither -b:v nor -crf, libx264 defaults to CRF 23,
        // which on an already well-compressed source emits a *larger* file than
        // the one we started from: full CPU cost, more data to stream, and a
        // worse result. Sizing from the source and capping it prevents that.
        //
        // sourceBitrate is in bits/sec and may be 0 when unknown.
        static int transcodeBitrateKbps(int width, int height, long long sourceBitrate);
    };

} // namespace Panamedia

#endif // PLAYBACK_SUPPORT_HPP