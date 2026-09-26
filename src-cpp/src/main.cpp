#include "engine.hpp"
#include <iostream>

int main() {
    // Disable synchronization with C stdio for performance
    std::ios_base::sync_with_stdio(false);
    
    // Instantiate and boot engine orchestrator
    Panamedia::MediaEngine engine;
    engine.run();
    
    return 0;
}
