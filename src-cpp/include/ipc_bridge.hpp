#ifndef IPC_BRIDGE_HPP
#define IPC_BRIDGE_HPP

#include <string>
#include <functional>

namespace Panamedia {

    // Simple structure to represent parsed JSON request
    struct IPCRequest {
        std::string id;
        std::string action;
        std::string payload; // Raw JSON payload string
    };

    class IPCBridge {
    public:
        // Callback signature for handling parsed requests
        using RequestCallback = std::function<void(const IPCRequest&)>;

        IPCBridge(RequestCallback callback);
        
        // Start listening to stdin in a loop
        void startListening();

        // Send a formatted JSON response/event back over stdout
        static void sendResponse(const std::string& id, const std::string& status, const std::string& payloadJson);
        static void sendEvent(const std::string& eventName, const std::string& payloadJson);

    private:
        RequestCallback m_callback;
        void processLine(const std::string& line);
    };

} // namespace Panamedia

#endif // IPC_BRIDGE_HPP
