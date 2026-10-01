#ifndef DECODER_HPP
#define DECODER_HPP

#include <string>
#include <atomic>

namespace Panamedia {

    class Decoder {
    public:
        Decoder();
        ~Decoder();

        bool openFile(const std::string& filePath);
        void play();
        void pause();
        void stop();
        void close();
        void seek(double seconds);
        void setSpeed(double speed);

        double getDuration() const { return m_duration; }
        int getWidth() const { return m_width; }
        int getHeight() const { return m_height; }
        bool isPlaying() const { return m_isPlaying; }

    private:
        std::string m_currentFile;
        double m_duration;
        int m_width;
        int m_height;
        double m_speed;
        std::atomic<bool> m_isPlaying;
    };

} // namespace Panamedia

#endif // DECODER_HPP
