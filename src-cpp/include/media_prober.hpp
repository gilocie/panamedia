#ifndef MEDIA_PROBER_HPP
#define MEDIA_PROBER_HPP

#include <string>

namespace Panamedia {

    class MediaProber {
    public:
        // Probes the media file and returns a JSON-formatted string with info
        static std::string probeFile(const std::string& filePath);
    };

} // namespace Panamedia

#endif // MEDIA_PROBER_HPP
