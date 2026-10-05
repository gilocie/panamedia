#ifndef ENGINE_HPP
#define ENGINE_HPP

#include "ipc_bridge.hpp"

#include <memory>
#include <atomic>

namespace Panamedia {

    class MediaEngine {
    public:
        MediaEngine();
        ~MediaEngine();

        // Boot and start the main execution loop
        void run();

    private:
        // Core event loop handler for requests from Electron
        void handleRequest(const IPCRequest& request);

        std::unique_ptr<IPCBridge> m_ipcBridge;
        std::atomic<bool> m_running;
    };

} // namespace Panamedia

#endif // ENGINE_HPP
