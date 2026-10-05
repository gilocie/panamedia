#include "media_prober.hpp"
#include "playback_support.hpp"
#include "binary_resolver.hpp"
#include <iostream>
#include <memory>
#include <array>
#include <cstdlib>
#include <filesystem>
#include <sstream>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#define popen _popen
#define pclose _pclose
#endif

namespace Panamedia {

    static std::string getFFprobePath() {
        // Health-checked resolution. The previous hardcoded
        // %APPDATA%/net-downloader/bin lookup ignored the app's primary bin
        // directory and could not detect a corrupt binary; a crashing ffprobe
        // silently produced "File not found"-style probe failures everywhere.
        return BinaryResolver::ffprobe();
    }

    std::string MediaProber::probeFile(const std::string& filePath) {
        if (!std::filesystem::exists(filePath)) {
            return "{\"success\":false,\"error\":\"File not found\"}";
        }

        std::string ffprobe = getFFprobePath();
        
        // Build command with properly quoted paths for Windows command line execution
        std::stringstream cmd;
#ifdef _WIN32
        // Wrap the entire command in outer double quotes to bypass Windows cmd.exe quote-stripping behavior
        cmd << "\"\"" << ffprobe << "\" -v error -show_entries format=duration,bit_rate:stream=codec_name,codec_type,pix_fmt,profile,width,height,duration,bit_rate -of json \"" << filePath << "\"\"";
#else
        cmd << "\"" << ffprobe << "\" -v error -show_entries format=duration,bit_rate:stream=codec_name,codec_type,pix_fmt,profile,width,height,duration,bit_rate -of json \"" << filePath << "\"";
#endif

        std::array<char, 512> buffer;
        std::string result;

        // Open pipe to capture output
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            return "{\"success\":false,\"error\":\"Failed to execute probe backend\"}";
        }

        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result += buffer.data();
        }

        int exitCode = pclose(pipe);
        if (exitCode != 0 || result.empty()) {
            return "{\"success\":false,\"error\":\"Probe process returned failure\"}";
        }

        try {
            auto j = nlohmann::json::parse(result);
            double duration = 0.0;
            
            // 1. Get container level duration if available and valid
            if (j.contains("format") && j["format"].contains("duration") && !j["format"]["duration"].is_null()) {
                std::string dStr = j["format"]["duration"];
                try { duration = std::stod(dStr); } catch (...) {}
            }
            
            // 2. Scan streams for durations if format duration is missing or too short
            if ((duration <= 1.0) && j.contains("streams")) {
                for (const auto& stream : j["streams"]) {
                    if (stream.contains("duration") && !stream["duration"].is_null()) {
                        std::string dStr = stream["duration"];
                        try {
                            double d = std::stod(dStr);
                            if (d > duration) duration = d;
                        } catch (...) {}
                    }
                }
            }

            // 3. Fallback to stream bitrate estimation if duration is still invalid
            if (duration <= 1.0) {
                double bitrate = 0.0;
                if (j.contains("format") && j["format"].contains("bit_rate") && !j["format"]["bit_rate"].is_null()) {
                    std::string bStr = j["format"]["bit_rate"];
                    try { bitrate = std::stod(bStr); } catch (...) {}
                }
                if (bitrate <= 0.0 && j.contains("streams")) {
                    for (const auto& stream : j["streams"]) {
                        if (stream.contains("bit_rate") && !stream["bit_rate"].is_null()) {
                            std::string bStr = stream["bit_rate"];
                            try {
                                double b = std::stod(bStr);
                                if (b > bitrate) bitrate = b;
                            } catch (...) {}
                        }
                    }
                }
                if (bitrate > 0.0) {
                    try {
                        auto fileSize = std::filesystem::file_size(filePath);
                        duration = (fileSize * 8.0) / bitrate;
                    } catch (...) {}
                }
            }
            
            nlohmann::json response;
            response["success"] = true;
            response["duration"] = duration;
            response["streams"] = j.contains("streams") ? j["streams"] : nlohmann::json::array();
            
            std::string videoCodec = "";
            std::string audioCodec = "";
            std::string pixelFormat = "";
            int width = 0;
            int height = 0;
            
            if (j.contains("streams")) {
                for (const auto& stream : j["streams"]) {
                    if (stream.contains("codec_type") && !stream["codec_type"].is_null()) {
                        std::string type = stream["codec_type"];
                        if (type == "video") {
                            if (stream.contains("codec_name") && !stream["codec_name"].is_null()) {
                                videoCodec = stream["codec_name"];
                            }
                            if (stream.contains("pix_fmt") && !stream["pix_fmt"].is_null()) {
                                pixelFormat = stream["pix_fmt"];
                            }
                            if (stream.contains("width") && !stream["width"].is_null()) {
                                width = stream["width"];
                            }
                            if (stream.contains("height") && !stream["height"].is_null()) {
                                height = stream["height"];
                            }
                        } else if (type == "audio") {
                            if (stream.contains("codec_name") && !stream["codec_name"].is_null()) {
                                audioCodec = stream["codec_name"];
                            }
                        }
                    }
                }
            }
            
            // Check container extension
            std::string ext = "";
            size_t dotPos = filePath.find_last_of('.');
            if (dotPos != std::string::npos) {
                ext = filePath.substr(dotPos);
                for (auto& c : ext) c = std::tolower(c);
            }
            bool isAudioExt = (ext == ".mp3" || ext == ".m4a" || ext == ".wav" || ext == ".flac" || ext == ".ogg" || ext == ".aac" || ext == ".opus" || ext == ".wma" || ext == ".weba");

            // Shared with the HTTP server and Electron so all three agree on
            // what the browser can play. This file previously carried a fourth
            // copy of the rule, with yet another codec list.
            PlaybackSupport::MediaInfo info;
            info.videoCodec = videoCodec;
            info.audioCodec = audioCodec;
            info.pixelFormat = pixelFormat;
            info.width = width;
            info.height = height;
            // Audio extensions play directly; the container list does not
            // include them because a video container is what needs demuxing.
            bool needsTranscode = isAudioExt
                ? false
                : PlaybackSupport::needsTranscode(filePath, info);
            
            response["videoCodec"] = videoCodec;
            response["audioCodec"] = audioCodec;
            response["pixelFormat"] = pixelFormat;
            response["width"] = width;
            response["height"] = height;
            response["directPlay"] = !needsTranscode;
            response["needsTranscode"] = needsTranscode;
            
            return response.dump();
        } catch (const std::exception& e) {
            return "{\"success\":false,\"error\":\"JSON parsing failed\"}";
        }
    }

} // namespace Panamedia
