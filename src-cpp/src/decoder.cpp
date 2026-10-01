#include "../include/decoder.hpp"

namespace Panamedia {

    Decoder::Decoder()
        : m_duration(0.0), m_width(1920), m_height(1080), m_speed(1.0), m_isPlaying(false) {}

    Decoder::~Decoder() {
        stop();
    }

    bool Decoder::openFile(const std::string& filePath) {
        m_currentFile = filePath;
        m_duration = 0.0;
        m_isPlaying = false;
        return !filePath.empty();
    }

    void Decoder::play() {
        m_isPlaying = true;
    }

    void Decoder::pause() {
        m_isPlaying = false;
    }

    void Decoder::stop() {
        m_isPlaying = false;
    }

    void Decoder::close() {
        stop();
        m_currentFile.clear();
    }

    void Decoder::seek(double seconds) {
        // Seek implementation placeholder
        (void)seconds;
    }

    void Decoder::setSpeed(double speed) {
        m_speed = speed > 0.0 ? speed : 1.0;
    }

} // namespace Panamedia
