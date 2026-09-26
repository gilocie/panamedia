#include "engine.hpp"
#include "media_prober.hpp"
#include "library_scanner.hpp"
#include "http_server.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <sstream>

using json = nlohmann::json;

namespace Panamedia {

    static std::unique_ptr<HTTPServer> s_httpServer;

    MediaEngine::MediaEngine() : m_running(false) {
        m_decoder = std::make_unique<Decoder>();
        m_ipcBridge = std::make_unique<IPCBridge>([this](const IPCRequest& req) {
            this->handleRequest(req);
        });
    }

    MediaEngine::~MediaEngine() {
        if (s_httpServer) {
            s_httpServer->stop();
        }
    }

    void MediaEngine::run() {
        m_running = true;
        m_ipcBridge->startListening();
    }

    void MediaEngine::handleRequest(const IPCRequest& request) {
        try {
            json payload = json::parse(request.payload.empty() ? "{}" : request.payload);

            if (request.action == "probe") {
                if (!payload.contains("filePath") || !payload["filePath"].is_string()) {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Missing filePath parameter\"}");
                    return;
                }
                std::string filePath = payload["filePath"].get<std::string>();
                std::string infoJson = MediaProber::probeFile(filePath);
                IPCBridge::sendResponse(request.id, "success", infoJson);
            }
            else if (request.action == "scan") {
                if (!payload.contains("folderPath") || !payload["folderPath"].is_string()) {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Missing folderPath parameter\"}");
                    return;
                }
                std::string folderPath = payload["folderPath"].get<std::string>();

                auto progressCallback = [&request](const std::string& currentDir, size_t foundCount) {
                    json eventPayload;
                    eventPayload["directory"] = currentDir;
                    eventPayload["foundCount"] = foundCount;
                    eventPayload["scanId"] = request.id;
                    IPCBridge::sendEvent("scan_progress", eventPayload.dump());
                };

                std::vector<MediaFile> files = LibraryScanner::scanDirectory(folderPath, progressCallback);

                json fileList = json::array();
                for (const auto& file : files) {
                    json f;
                    f["path"] = file.path;
                    f["name"] = file.name;
                    f["ext"] = file.ext;
                    f["sizeBytes"] = file.sizeBytes;
                    f["modifiedTime"] = file.modifiedTime;
                    fileList.push_back(f);
                }

                IPCBridge::sendResponse(request.id, "success", fileList.dump());
            }
            else if (request.action == "start_stream_server") {
                int port = 52321;
                if (payload.contains("port")) {
                    if (payload["port"].is_number()) {
                        port = payload["port"].get<int>();
                    } else if (payload["port"].is_string()) {
                        try {
                            port = std::stoi(payload["port"].get<std::string>());
                        } catch (...) {}
                    }
                }

                std::string ffmpegPath = "";
                if (payload.contains("ffmpegPath") && payload["ffmpegPath"].is_string()) {
                    ffmpegPath = payload["ffmpegPath"].get<std::string>();
                }

                if (!s_httpServer) {
                    s_httpServer = std::make_unique<HTTPServer>(port);
                    if (!ffmpegPath.empty()) {
                        s_httpServer->setFFmpegPath(ffmpegPath);
                    }
                    if (s_httpServer->start()) {
                        json res;
                        res["status"] = "started";
                        res["port"] = s_httpServer->getPort();
                        IPCBridge::sendResponse(request.id, "success", res.dump());
                    } else {
                        s_httpServer.reset();
                        IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Failed to bind HTTP streaming port\"}");
                    }
                } else {
                    json res;
                    res["status"] = "already_running";
                    res["port"] = s_httpServer->getPort();
                    IPCBridge::sendResponse(request.id, "success", res.dump());
                }
            }
            else if (request.action == "stop_stream_server") {
                if (s_httpServer) {
                    s_httpServer->stop();
                    s_httpServer.reset();
                    IPCBridge::sendResponse(request.id, "success", "{\"status\":\"stopped\"}");
                } else {
                    IPCBridge::sendResponse(request.id, "success", "{\"status\":\"not_running\"}");
                }
            }
            else if (request.action == "player_open") {
                if (!payload.contains("filePath") || !payload["filePath"].is_string()) {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Missing filePath parameter\"}");
                    return;
                }
                std::string filePath = payload["filePath"].get<std::string>();
                if (m_decoder->openFile(filePath)) {
                    json res;
                    res["duration"] = m_decoder->getDuration();
                    res["width"] = m_decoder->getWidth();
                    res["height"] = m_decoder->getHeight();
                    res["shmem_key"] = "Local\\panamedia_frame_buffer";
                    IPCBridge::sendResponse(request.id, "success", res.dump());
                } else {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Failed to open file in decoder\"}");
                }
            }
            else if (request.action == "player_play") {
                m_decoder->play();
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"playing\"}");
            }
            else if (request.action == "player_pause") {
                m_decoder->pause();
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"paused\"}");
            }
            else if (request.action == "player_seek") {
                if (!payload.contains("seconds") || !payload["seconds"].is_number()) {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Missing or invalid seconds parameter\"}");
                    return;
                }
                double seconds = payload["seconds"].get<double>();
                m_decoder->seek(seconds);
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"seeking\"}");
            }
            else if (request.action == "player_speed") {
                if (!payload.contains("speed") || !payload["speed"].is_number()) {
                    IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Missing or invalid speed parameter\"}");
                    return;
                }
                double speed = payload["speed"].get<double>();
                m_decoder->setSpeed(speed);
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"speed_updated\"}");
            }
            else if (request.action == "player_close") {
                m_decoder->close();
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"closed\"}");
            }
            else {
                IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Unknown action: " + request.action + "\"}");
            }
        } catch (const std::exception& e) {
            IPCBridge::sendResponse(request.id, "error", std::string("{\"message\":\"JSON exception: ") + e.what() + "\"}");
        }
    }

} // namespace Panamedia
