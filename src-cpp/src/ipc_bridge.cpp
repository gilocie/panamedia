#include "ipc_bridge.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <mutex>

using json = nlohmann::json;

namespace Panamedia {

    static std::mutex s_stdoutMutex;

    IPCBridge::IPCBridge(RequestCallback callback) : m_callback(callback) {}

    void IPCBridge::startListening() {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.empty()) continue;
            processLine(line);
        }
    }

    void IPCBridge::processLine(const std::string& line) {
        try {
            json j = json::parse(line);
            IPCRequest req;
            
            if (j.contains("id") && j["id"].is_string()) {
                req.id = j["id"].get<std::string>();
            }
            if (j.contains("action") && j["action"].is_string()) {
                req.action = j["action"].get<std::string>();
            }
            if (j.contains("payload")) {
                if (j["payload"].is_string()) {
                    req.payload = j["payload"].get<std::string>();
                } else {
                    req.payload = j["payload"].dump();
                }
            }

            if (!req.action.empty() && m_callback) {
                m_callback(req);
            }
        } catch (const std::exception& e) {
            std::cerr << "[IPCBridge] Parse error: " << e.what() << " on line: " << line << std::endl;
        }
    }

    void IPCBridge::sendResponse(const std::string& id, const std::string& status, const std::string& payloadJson) {
        std::lock_guard<std::mutex> lock(s_stdoutMutex);
        json response;
        response["id"] = id;
        response["status"] = status;
        
        try {
            // Attempt to parse the payload as JSON to prevent double stringification
            response["payload"] = json::parse(payloadJson);
        } catch (...) {
            // Fallback to raw string value if not parseable JSON
            response["payload"] = payloadJson;
        }
        
        std::cout << response.dump() << std::endl;
    }

    void IPCBridge::sendEvent(const std::string& eventName, const std::string& payloadJson) {
        std::lock_guard<std::mutex> lock(s_stdoutMutex);
        json response;
        response["event"] = eventName;
        
        try {
            response["payload"] = json::parse(payloadJson);
        } catch (...) {
            response["payload"] = payloadJson;
        }
        
        std::cout << response.dump() << std::endl;
    }

} // namespace Panamedia
