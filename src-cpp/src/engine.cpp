#include "engine.hpp"
#include "media_prober.hpp"
#include "library_scanner.hpp"
#include "conversion_support.hpp"
#include "conversion_engine.hpp"
#include "http_server.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <sstream>

using json = nlohmann::json;

namespace Panamedia {

    static std::unique_ptr<HTTPServer> s_httpServer;

    MediaEngine::MediaEngine() : m_running(false) {
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
            else if (request.action == "library_clear_cache") {
                LibraryScanner::clearCache();
                IPCBridge::sendResponse(request.id, "success", "{\"status\":\"cleared\"}");
            }
            // ── Converter support ───────────────────────────────────────────
            // These replace synchronous Node calls (execSync ffmpeg -encoders,
            // ffprobe spawns, readdirSync, a PowerShell drive query) that used to
            // block the Electron main process.
            else if (request.action == "hw_detect") {
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::detectHardwareAcceleration());
            }
            else if (request.action == "hw_threads") {
                json t;
                t["threads"] = ConversionSupport::getOptimalThreadCount();
                // Phase G: the budget is power-aware, so the UI has to be able
                // to explain a smaller number than it saw a moment ago.
                json p = json::parse(ConversionSupport::getPowerStatus());
                t["onBattery"] = p.value("onBattery", false);
                t["percent"] = p.value("percent", -1);
                IPCBridge::sendResponse(request.id, "success", t.dump());
            }
            // Mains/battery state on its own, so the UI can show a gentle-mode
            // badge without re-asking for the thread budget.
            else if (request.action == "power_status") {
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::getPowerStatus());
            }
            // Free space and writability for an arbitrary path. The UI calls
            // this before offering a destination, so an ejected USB stick is
            // greyed out rather than accepted and failing later.
            else if (request.action == "describe_volume") {
                std::string volPath = payload.contains("path") && payload["path"].is_string()
                    ? payload["path"].get<std::string>() : "";
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::describeVolume(volPath));
            }
            else if (request.action == "probe_duration") {
                if (!payload.contains("filePath") || !payload["filePath"].is_string()) {
                    IPCBridge::sendResponse(request.id, "error",
                        "{\"message\":\"Missing filePath parameter\"}");
                    return;
                }
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::probeDuration(payload["filePath"].get<std::string>()));
            }
            else if (request.action == "probe_media") {
                if (!payload.contains("filePath") || !payload["filePath"].is_string()) {
                    IPCBridge::sendResponse(request.id, "error",
                        "{\"message\":\"Missing filePath parameter\"}");
                    return;
                }
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::probeMedia(payload["filePath"].get<std::string>()));
            }
            else if (request.action == "system_power_action") {
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::systemPowerAction(payload.dump()));
            }
            else if (request.action == "output_files") {
                std::string dir = payload.contains("dirPath") && payload["dirPath"].is_string()
                    ? payload["dirPath"].get<std::string>()
                    : std::string();
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::listOutputFiles(dir));
            }
            else if (request.action == "list_removable_drives") {
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::listRemovableDrives());
            }
            // Resolves the final output path so the engine can write straight to
            // the destination instead of writing beside the source and then
            // moving the file.
            else if (request.action == "plan_output") {
                auto planSrc = payload.contains("filePath") && payload["filePath"].is_string()
                    ? payload["filePath"].get<std::string>() : "";
                std::string planOpts = payload.contains("options") && payload["options"].is_object()
                    ? payload["options"].dump() : "{}";
                IPCBridge::sendResponse(request.id, "success",
                    ConversionSupport::planOutputPath(planSrc, planOpts));
            }
            // ── Conversion control ──────────────────────────────────────────
            // convert_start returns as soon as the job is queued; progress and
            // completion arrive as convert_progress / convert_complete events.
            // This keeps a multi-minute encode from blocking the IPC reader
            // thread, which would otherwise stall every other engine action.
            else if (request.action == "convert_start") {
                auto reqStr = [](const json& p, const char* k) -> std::string {
                    return (p.contains(k) && p[k].is_string()) ? p[k].get<std::string>() : "";
                };
                IPCBridge::sendResponse(request.id, "success",
                    ConversionEngine::start(
                        reqStr(payload, "jobId"),
                        reqStr(payload, "inputPath"),
                        reqStr(payload, "outputPath"),
                        payload.contains("options") && payload["options"].is_object()
                            ? payload["options"].dump() : "{}"));
            }
            else if (request.action == "convert_pause" || request.action == "convert_resume") {
                std::string jobId = payload.contains("jobId") && payload["jobId"].is_string()
                    ? payload["jobId"].get<std::string>() : "";
                std::string result = request.action == "convert_pause"
                    ? ConversionEngine::pause(jobId)
                    : ConversionEngine::resume(jobId);
                // These signal failure with an "error" key rather than by
                // throwing, so mirror that as an error status for the caller.
                json parsed = json::parse(result);
                if (parsed.contains("error")) {
                    IPCBridge::sendResponse(request.id, "error", result);
                } else {
                    IPCBridge::sendResponse(request.id, "success", result);
                }
            }
            else if (request.action == "convert_cancel") {
                std::string jobId = payload.contains("jobId") && payload["jobId"].is_string()
                    ? payload["jobId"].get<std::string>() : "";
                IPCBridge::sendResponse(request.id, "success", ConversionEngine::cancel(jobId));
            }
            else if (request.action == "convert_status") {
                std::string jobId = payload.contains("jobId") && payload["jobId"].is_string()
                    ? payload["jobId"].get<std::string>() : "";
                IPCBridge::sendResponse(request.id, "success", ConversionEngine::status(jobId));
            }
            else if (request.action == "convert_list") {
                IPCBridge::sendResponse(request.id, "success", ConversionEngine::listActive());
            }
            // Exposes the argument builder so the mapping can be diffed against
            // the previous Node implementation without running a conversion.
            else if (request.action == "convert_build_args") {
                auto reqStr2 = [](const json& p, const char* k) -> std::string {
                    return (p.contains(k) && p[k].is_string()) ? p[k].get<std::string>() : "";
                };
                json r;
                r["args"] = ConversionEngine::buildArgs(
                    reqStr2(payload, "inputPath"),
                    reqStr2(payload, "outputPath"),
                    payload.contains("options") && payload["options"].is_object()
                        ? payload["options"].dump() : "{}");
                IPCBridge::sendResponse(request.id, "success", r.dump());
            }
            else if (request.action == "library_sync") {
                // Full library scan + duplicate detection.
                // Electron supplies only the list of roots; all traversal,
                // classification and grouping happens here.
                if (!payload.contains("folders") || !payload["folders"].is_array()) {
                    IPCBridge::sendResponse(request.id, "error",
                        "{\"message\":\"Missing or invalid folders array\"}");
                    return;
                }

                std::vector<std::string> roots;
                for (const auto& r : payload["folders"]) {
                    if (r.is_string()) roots.push_back(r.get<std::string>());
                }

                ScanOptions opts;
                ScanStats stats;

                auto progressCb = [&request](const std::string& dir, size_t count) {
                    json p;
                    p["directory"] = dir;
                    p["foundCount"] = count;
                    IPCBridge::sendEvent("library_sync_progress", p.dump());
                };

                std::vector<MediaFile> files =
                    LibraryScanner::scanRoots(roots, opts, progressCb, &stats);

                json fileArray = json::array();
                for (const auto& f : files) {
                    json o;
                    // Field names intentionally match the renderer's existing contract.
                    o["name"] = f.name;
                    o["path"] = f.path;
                    o["size"] = f.sizeBytes;
                    o["mtime"] = f.modifiedTime;
                    o["category"] = f.category;
                    o["ext"] = f.ext;
                    fileArray.push_back(o);
                }

                json dupArray = json::array();
                if (opts.detectDuplicates) {
                    for (const auto& g : LibraryScanner::findDuplicates(files)) {
                        json gj;
                        gj["name"] = g.name;
                        json lst = json::array();
                        for (const auto& f : g.list) {
                            json o;
                            o["name"] = f.name;
                            o["path"] = f.path;
                            o["size"] = f.sizeBytes;
                            o["mtime"] = f.modifiedTime;
                            o["category"] = f.category;
                            o["ext"] = f.ext;
                            lst.push_back(o);
                        }
                        gj["list"] = lst;
                        dupArray.push_back(gj);
                    }
                }

                json res;
                res["files"] = fileArray;
                res["duplicates"] = dupArray;
                json st2;
                st2["directoriesVisited"] = stats.directoriesVisited;
                st2["filesConsidered"] = stats.filesConsidered;
                st2["elapsedMs"] = stats.elapsedMs;
                st2["hitFileCap"] = stats.hitFileCap;
                st2["hitDepthCap"] = stats.hitDepthCap;
                res["stats"] = st2;
                IPCBridge::sendResponse(request.id, "success", res.dump());
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
            else {
                IPCBridge::sendResponse(request.id, "error", "{\"message\":\"Unknown action: " + request.action + "\"}");
            }
        } catch (const std::exception& e) {
            IPCBridge::sendResponse(request.id, "error", std::string("{\"message\":\"JSON exception: ") + e.what() + "\"}");
        }
    }

} // namespace Panamedia
