#ifndef HTTP_SERVER_HPP
#define HTTP_SERVER_HPP

#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>

namespace Panamedia {

    class HTTPServer {
    public:
        HTTPServer(int port);
        ~HTTPServer();

        // Start server on a background thread
        bool start();
        
        // Stop the server
        void stop();

        int getPort() const { return m_port; }
        void setFFmpegPath(const std::string& path) { m_ffmpegPath = path; }

    private:
        void runServer();
        void handleClient(unsigned long long clientSocket);
        void handleTranscode(unsigned long long clientSocket, const std::string& decodedPath, double startSec, const std::string& quality);
        void handleThumbnail(unsigned long long clientSocket, const std::string& decodedPath);
        void handleWaveform(unsigned long long clientSocket, const std::string& decodedPath, int width, int height);
        void handleTimelinePreview(unsigned long long clientSocket, const std::string& decodedPath, double timeSec);
        
        // Helper functions for transcoding/subtitles/binaries
        std::string findFFmpegExecutable();
        std::string findThumbnailCacheDir();
        bool hasExternalSubtitles(const std::string& filePath, std::string& subPath);
        bool hasInternalSubtitles(const std::string& filePath);
        std::string escapeSubtitlePath(const std::string& path);
        std::string escapeArg(const std::string& arg);
        bool getVideoResolution(const std::string& filePath, int& width, int& height);
        void handleProbe(unsigned long long clientSocket, const std::string& decodedPath);

        struct SafeProbeResult {
            bool success = false;
            double duration = 0.0;
            std::string videoCodec;
            std::string audioCodec;
            std::string pixelFormat;
            int width = 0;
            int height = 0;
            bool hasAudio = false;
            bool hasSubtitles = false;
        };

        SafeProbeResult probeWithFFmpeg(const std::string& filePath);

        int m_port;
        std::atomic<bool> m_running;
        std::atomic<bool> m_bound;
        std::atomic<unsigned long long> m_listenerSocket; // cross-platform socket representation
        std::thread m_serverThread;

        // Concurrent connection limit variables
        std::atomic<int> m_activeConnections;
        std::mutex m_connMutex;
        std::condition_variable m_connCV;
        
        std::string m_ffmpegPath;
        static const int MAX_CONCURRENT_CLIENTS = 32; // limit to 32 concurrent streaming threads
    };

} // namespace Panamedia

#endif // HTTP_SERVER_HPP
