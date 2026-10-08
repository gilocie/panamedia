#if defined(_MSC_VER) && !defined(_HAS_CXX17)
#define _HAS_CXX17 1
#endif
#if defined(_MSC_VER) && (!defined(_MSVC_LANG) || _MSVC_LANG < 201703L)
#undef _MSVC_LANG
#define _MSVC_LANG 201703L
#endif

#include "../include/http_server.hpp"
#include "../include/playback_support.hpp"
#include <iostream>
#include <string>
#include <sstream>
#include <fstream>
#include <vector>
#include <filesystem>
#include <algorithm>
#include <chrono>
#include <regex>
#include <unordered_map>
#include <mutex>
#include <cstdlib>

#ifndef NOMINMAX
#define NOMINMAX
#endif

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
typedef int SOCKET;
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#define closesocket close
#endif

namespace Panamedia {

    // Helper to decode URL-encoded string
    static std::string urlDecode(const std::string& src) {
        std::string ret;
        char ch;
        int i, ii;
        for (i = 0; i < src.length(); i++) {
            if (src[i] == '%') {
                if (sscanf(src.substr(i + 1, 2).c_str(), "%x", &ii) == 1) {
                    ch = static_cast<char>(ii);
                    ret += ch;
                    i += 2;
                }
            } else if (src[i] == '+') {
                ret += ' ';
            } else {
                ret += src[i];
            }
        }
        return ret;
    }

    // Unicode path resolution for Windows
    static inline std::filesystem::path toPath(const std::string& utf8Str) {
#ifdef _WIN32
        return std::filesystem::u8path(utf8Str);
#else
        return std::filesystem::path(utf8Str);
#endif
    }

#ifdef _WIN32
    static inline std::wstring utf8ToWide(const std::string& utf8Str) {
        if (utf8Str.empty()) return std::wstring();
        int sizeNeeded = MultiByteToWideChar(CP_UTF8, 0, utf8Str.data(), static_cast<int>(utf8Str.size()), NULL, 0);
        std::wstring wstr(sizeNeeded, 0);
        MultiByteToWideChar(CP_UTF8, 0, utf8Str.data(), static_cast<int>(utf8Str.size()), &wstr[0], sizeNeeded);
        return wstr;
    }
#endif

    // Helper to map file extensions to MIME type
    static std::string getMimeType(const std::string& filePath) {
        std::string ext = "";
        size_t dotPos = filePath.find_last_of('.');
        if (dotPos != std::string::npos) {
            ext = filePath.substr(dotPos);
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        }

        if (ext == ".mp3") return "audio/mpeg";
        if (ext == ".m4a") return "audio/mp4";
        if (ext == ".wav") return "audio/wav";
        if (ext == ".flac") return "audio/flac";
        if (ext == ".ogg") return "audio/ogg";
        if (ext == ".aac") return "audio/aac";
        if (ext == ".opus") return "audio/opus";
        if (ext == ".wma") return "audio/x-ms-wma";
        if (ext == ".weba") return "audio/webm";
        
        if (ext == ".mp4") return "video/mp4";
        if (ext == ".webm") return "video/webm";
        if (ext == ".mkv") return "video/x-matroska";
        if (ext == ".avi") return "video/x-msvideo";
        if (ext == ".mov") return "video/quicktime";
        if (ext == ".mpeg" || ext == ".mpg") return "video/mpeg";
        if (ext == ".ts") return "video/mp2t";

        if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
        if (ext == ".png") return "image/png";
        if (ext == ".gif") return "image/gif";
        if (ext == ".webp") return "image/webp";

        return "application/octet-stream";
    }

    // Send helper with robust socket backpressure support
    static bool sendAll(SOCKET socket, const char* data, int length) {
        int totalSent = 0;
        while (totalSent < length) {
            int sent = send(socket, data + totalSent, length - totalSent, 0);
            if (sent <= 0) {
                // Client disconnected or socket error
                return false;
            }
            totalSent += sent;
        }
        return true;
    }

    HTTPServer::HTTPServer(int port) 
        : m_port(port), 
          m_running(false), 
          m_bound(false),
          m_listenerSocket(INVALID_SOCKET),
          m_activeConnections(0) {
#ifdef _WIN32
        WSADATA wsaData;
        WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif
    }

    HTTPServer::~HTTPServer() {
        stop();
#ifdef _WIN32
        WSACleanup();
#endif
    }

    bool HTTPServer::start() {
        m_running = true;
        m_bound = false;
        m_serverThread = std::thread(&HTTPServer::runServer, this);
        
        // Wait up to 1.5 seconds for socket bind
        for (int i = 0; i < 30; ++i) {
            if (m_bound.load()) return true;
            if (!m_running.load()) return false;
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
        return m_bound.load();
    }

    void HTTPServer::stop() {
        if (m_running) {
            m_running = false;
            
            // Close the listener socket immediately to unblock accept()
            unsigned long long expected = m_listenerSocket.load();
            if (expected != INVALID_SOCKET) {
                closesocket(static_cast<SOCKET>(expected));
                m_listenerSocket.store(INVALID_SOCKET);
            }
            
            m_connCV.notify_all();
        }
        if (m_serverThread.joinable()) {
            m_serverThread.join();
        }
    }

    void HTTPServer::runServer() {
        SOCKET listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (listener == INVALID_SOCKET) {
            m_running = false;
            return;
        }

        m_listenerSocket.store(static_cast<unsigned long long>(listener));

        // On Windows, use SO_EXCLUSIVEADDRUSE to avoid binding to dead/zombie sockets
        int opt = 1;
#ifdef _WIN32
        setsockopt(listener, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*)&opt, sizeof(opt));
#else
        setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

        sockaddr_in addr;
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = inet_addr("127.0.0.1"); // localhost only

        bool bound = false;
        int targetPort = m_port;
        for (int p = targetPort; p <= targetPort + 20; ++p) {
            addr.sin_port = htons(p);
            if (bind(listener, (sockaddr*)&addr, sizeof(addr)) != SOCKET_ERROR) {
                m_port = p;
                bound = true;
                break;
            }
        }

        if (!bound) {
            std::cerr << "[HTTPServer] Failed to bind to any port in range " << targetPort << "-" << (targetPort + 20) << ", error: " << WSAGetLastError() << std::endl;
            closesocket(listener);
            m_listenerSocket.store(INVALID_SOCKET);
            m_running = false;
            return;
        }

        if (listen(listener, SOMAXCONN) == SOCKET_ERROR) {
            std::cerr << "[HTTPServer] Failed to listen on port " << m_port << ", error: " << WSAGetLastError() << std::endl;
            closesocket(listener);
            m_listenerSocket.store(INVALID_SOCKET);
            m_running = false;
            return;
        }

        m_bound = true;
        std::cerr << "[HTTPServer] Listening on 127.0.0.1:" << m_port << std::endl;

        while (m_running) {
            // Guard limit on active connection threads
            while (m_activeConnections >= MAX_CONCURRENT_CLIENTS && m_running) {
                std::unique_lock<std::mutex> lock(m_connMutex);
                m_connCV.wait_for(lock, std::chrono::milliseconds(200));
            }
            
            if (!m_running) break;

            sockaddr_in clientAddr;
            socklen_t clientLen = sizeof(clientAddr);
            SOCKET client = accept(listener, (sockaddr*)&clientAddr, &clientLen);
            
            if (client == INVALID_SOCKET) {
                continue;
            }

            std::cerr << "[HTTPServer] Accepted client socket: " << client << std::endl;

            m_activeConnections++;
            std::thread handler(&HTTPServer::handleClient, this, static_cast<unsigned long long>(client));
            handler.detach();
        }

        closesocket(listener);
        m_listenerSocket.store(INVALID_SOCKET);
    }

    struct ClientGuard {
        SOCKET s;
        std::atomic<int>& count;
        std::condition_variable& cv;
        ClientGuard(SOCKET sock, std::atomic<int>& c, std::condition_variable& v) : s(sock), count(c), cv(v) {}
        ~ClientGuard() {
            if (s != INVALID_SOCKET) {
#ifdef _WIN32
                shutdown(s, SD_SEND);
                closesocket(s);
#else
                shutdown(s, SHUT_WR);
                close(s);
#endif
            }
            count--;
            cv.notify_one();
        }
    };

    void HTTPServer::handleClient(unsigned long long clientSocket) {
        SOCKET client = static_cast<SOCKET>(clientSocket);
        ClientGuard guard(client, m_activeConnections, m_connCV);

        try {
            std::vector<char> buffer(4096);
            int bytesReceived = recv(client, buffer.data(), buffer.size() - 1, 0);
            if (bytesReceived > 0) {
                buffer[bytesReceived] = '\0';
                std::string request(buffer.data());
                
                std::stringstream ss(request);
                std::string method, url, protocol;
                ss >> method >> url >> protocol;

                if (method == "GET" || method == "HEAD") {
                    size_t fileParamPos = url.find("file=");
                    if (fileParamPos == std::string::npos) {
                        fileParamPos = url.find("path=");
                    }
                    if (fileParamPos != std::string::npos) {
                        std::string fileParam = url.substr(fileParamPos + 5);
                        size_t ampPos = fileParam.find('&');
                        if (ampPos != std::string::npos) {
                            fileParam = fileParam.substr(0, ampPos);
                        }
                        std::string decodedPath = urlDecode(fileParam);

                        if (url.find("/transcode") != std::string::npos) {
                            double startSec = 0.0;
                            std::string quality = "original";
                            size_t startParamPos = url.find("start=");
                            if (startParamPos != std::string::npos) {
                                std::string startParam = url.substr(startParamPos + 6);
                                size_t startAmpPos = startParam.find('&');
                                if (startAmpPos != std::string::npos) {
                                    startParam = startParam.substr(0, startAmpPos);
                                }
                                try {
                                    startSec = std::stod(startParam);
                                } catch (...) {}
                            }
                            size_t qualityParamPos = url.find("quality=");
                            if (qualityParamPos != std::string::npos) {
                                quality = url.substr(qualityParamPos + 8);
                                size_t qualityAmpPos = quality.find('&');
                                if (qualityAmpPos != std::string::npos) {
                                    quality = quality.substr(0, qualityAmpPos);
                                }
                                quality = urlDecode(quality);
                            }
                            handleTranscode(client, decodedPath, startSec, quality);
                        } else if (url.find("/probe") != std::string::npos) {
                            handleProbe(client, decodedPath);
                        } else if (url.find("/thumbnail") != std::string::npos) {
                            handleThumbnail(client, decodedPath);
                        } else if (url.find("/waveform") != std::string::npos) {
                            auto queryInt = [&url](const std::string& key, int fallback) {
                                const auto pos = url.find(key + "=");
                                if (pos == std::string::npos) return fallback;
                                const auto begin = pos + key.size() + 1;
                                const auto end = url.find('&', begin);
                                try { return std::stoi(url.substr(begin, end == std::string::npos ? end : end - begin)); }
                                catch (...) { return fallback; }
                            };
                            handleWaveform(client, decodedPath, queryInt("width", 4096), queryInt("height", 128));
                        } else if (url.find("/preview") != std::string::npos) {
                            double timeSec = 0.0;
                            size_t timePos = url.find("time=");
                            if (timePos != std::string::npos) {
                                std::string tStr = url.substr(timePos + 5);
                                size_t amp = tStr.find('&');
                                if (amp != std::string::npos) tStr = tStr.substr(0, amp);
                                try { timeSec = std::stod(tStr); } catch (...) {}
                            }
                            handleTimelinePreview(client, decodedPath, timeSec);
                        } else {
                            std::filesystem::path pathObj = toPath(decodedPath);
                            std::error_code ec;
                            bool fileExists = std::filesystem::exists(pathObj, ec);
                            if (!ec && fileExists) {
                                uint64_t fileSize = std::filesystem::file_size(pathObj, ec);
                                if (ec) fileSize = 0;
                                uint64_t start = 0;
                                uint64_t end = fileSize > 0 ? (fileSize - 1) : 0;
                                bool isRange = false;

                                // Parse range headers (RFC 7233 standard range and suffix range support)
                                size_t rangePos = request.find("Range: bytes=");
                                if (rangePos != std::string::npos) {
                                    size_t rangeStart = rangePos + 13;
                                    size_t dashPos = request.find('-', rangeStart);
                                    if (dashPos != std::string::npos) {
                                        std::string startStr = request.substr(rangeStart, dashPos - rangeStart);
                                        size_t endPos = request.find('\r', dashPos);
                                        std::string endStr = (endPos != std::string::npos) 
                                            ? request.substr(dashPos + 1, endPos - dashPos - 1) 
                                            : request.substr(dashPos + 1);

                                        // Trim whitespace
                                        while (!startStr.empty() && (startStr.front() == ' ' || startStr.front() == '\t')) startStr.erase(startStr.begin());
                                        while (!startStr.empty() && (startStr.back() == ' ' || startStr.back() == '\t')) startStr.pop_back();
                                        while (!endStr.empty() && (endStr.front() == ' ' || endStr.front() == '\t')) endStr.erase(endStr.begin());
                                        while (!endStr.empty() && (endStr.back() == ' ' || endStr.back() == '\t')) endStr.pop_back();

                                        if (startStr.empty() && !endStr.empty()) {
                                            // Suffix range: bytes=-524288 (e.g. read moov atom at end of file)
                                            try {
                                                uint64_t suffix = std::stoull(endStr);
                                                start = (fileSize > suffix) ? (fileSize - suffix) : 0;
                                                end = fileSize > 0 ? (fileSize - 1) : 0;
                                                isRange = true;
                                            } catch (...) {}
                                        } else if (!startStr.empty()) {
                                            try {
                                                start = std::stoull(startStr);
                                                if (!endStr.empty()) {
                                                    uint64_t parsedEnd = std::stoull(endStr);
                                                    end = (parsedEnd < fileSize) ? parsedEnd : (fileSize - 1);
                                                } else {
                                                    end = fileSize > 0 ? (fileSize - 1) : 0;
                                                }
                                                if (start <= end && start < fileSize) {
                                                    isRange = true;
                                                } else {
                                                    start = 0;
                                                    end = fileSize > 0 ? (fileSize - 1) : 0;
                                                }
                                            } catch (...) {}
                                        }
                                    }
                                }

                                std::ifstream file(pathObj, std::ios::binary);
                                if (file.is_open()) {
                                    std::stringstream headers;
                                    uint64_t contentLength = (end >= start) ? (end - start + 1) : 0;
                                    std::string mime = getMimeType(decodedPath);

                                    if (isRange) {
                                        headers << "HTTP/1.1 206 Partial Content\r\n"
                                                << "Content-Range: bytes " << start << "-" << end << "/" << fileSize << "\r\n";
                                    } else {
                                        headers << "HTTP/1.1 200 OK\r\n";
                                    }

                                    headers << "Accept-Ranges: bytes\r\n"
                                            << "Content-Type: " << mime << "\r\n"
                                            << "Content-Length: " << contentLength << "\r\n"
                                            << "Access-Control-Allow-Origin: *\r\n"
                                            << "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n"
                                            << "Access-Control-Allow-Headers: Content-Type, Range\r\n"
                                            << "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n"
                                            << "Connection: close\r\n\r\n";

                                    std::string headerStr = headers.str();
                                    sendAll(client, headerStr.c_str(), headerStr.length());

                                    if (method == "GET") {
                                        file.seekg(start);
                                        std::vector<char> fileBuffer(65536);
                                        uint64_t totalSent = 0;
                                        while (totalSent < contentLength && m_running) {
                                            uint64_t toRead = std::min(static_cast<uint64_t>(fileBuffer.size()), contentLength - totalSent);
                                            file.read(fileBuffer.data(), toRead);
                                            std::streamsize readBytes = file.gcount();
                                            if (readBytes <= 0) break;

                                            if (!sendAll(client, fileBuffer.data(), readBytes)) {
                                                break; // socket closed or backpressure failure
                                            }
                                            totalSent += readBytes;
                                        }
                                    }
                                    file.close();
                                }
                            } else {
                                std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                                sendAll(client, response.c_str(), response.length());
                            }
                        }
                    } else {
                        std::string response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        sendAll(client, response.c_str(), response.length());
                    }
                } else if (method == "OPTIONS") {
                    std::string response = "HTTP/1.1 204 No Content\r\n"
                                           "Access-Control-Allow-Origin: *\r\n"
                                           "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n"
                                           "Access-Control-Allow-Headers: Content-Type, Range\r\n"
                                           "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n"
                                           "Connection: close\r\n\r\n";
                    sendAll(client, response.c_str(), response.length());
                } else {
                    std::string response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    sendAll(client, response.c_str(), response.length());
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "[HTTPServer] Client handler exception: " << e.what() << std::endl;
        } catch (...) {
            std::cerr << "[HTTPServer] Unknown exception in client handler" << std::endl;
        }
    }

    std::string HTTPServer::escapeSubtitlePath(const std::string& path) {
        std::string escaped = "";
        for (char c : path) {
            if (c == '\\') {
                escaped += "/";
            } else if (c == ':') {
                escaped += "\\:";
            } else if (c == '\'') {
                escaped += "\\'";
            } else if (c == '"') {
                escaped += "\\\"";
            } else {
                escaped += c;
            }
        }
        return escaped;
    }

    std::string HTTPServer::escapeArg(const std::string& arg) {
        return "\"" + arg + "\"";
    }

    bool HTTPServer::hasExternalSubtitles(const std::string& filePath, std::string& subPath) {
        std::filesystem::path p = toPath(filePath);
        std::vector<std::string> exts = { ".srt", ".ass", ".vtt" };
        for (const auto& ext : exts) {
            auto sp = p;
            sp.replace_extension(ext);
            if (std::filesystem::exists(sp)) {
#ifdef _WIN32
                int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, sp.c_str(), -1, NULL, 0, NULL, NULL);
                std::string u8(sizeNeeded > 1 ? sizeNeeded - 1 : 0, 0);
                if (sizeNeeded > 1) {
                    WideCharToMultiByte(CP_UTF8, 0, sp.c_str(), -1, &u8[0], sizeNeeded, NULL, NULL);
                }
                subPath = u8;
#else
                subPath = sp.string();
#endif
                return true;
            }
        }
        return false;
    }

    bool HTTPServer::hasInternalSubtitles(const std::string& filePath) {
        SafeProbeResult res = probeWithFFmpeg(filePath);
        return res.hasSubtitles;
    }

    bool HTTPServer::getVideoResolution(const std::string& filePath, int& width, int& height) {
        SafeProbeResult res = probeWithFFmpeg(filePath);
        if (res.width > 0 && res.height > 0) {
            width = res.width;
            height = res.height;
            return true;
        }
        return false;
    }

    HTTPServer::SafeProbeResult HTTPServer::probeWithFFmpeg(const std::string& filePath) {
        static std::mutex s_probeMutex;
        static std::unordered_map<std::string, SafeProbeResult> s_probeCache;

        {
            std::lock_guard<std::mutex> lock(s_probeMutex);
            auto it = s_probeCache.find(filePath);
            if (it != s_probeCache.end()) {
                return it->second;
            }
        }

        SafeProbeResult result;
        std::string ffmpegExe = findFFmpegExecutable();
        std::stringstream cmd;
        cmd << escapeArg(ffmpegExe) << " -hide_banner -i " << escapeArg(filePath);

#ifdef _WIN32
        HANDLE hRead, hWrite;
        SECURITY_ATTRIBUTES sa;
        sa.nLength = sizeof(SECURITY_ATTRIBUTES);
        sa.bInheritHandle = TRUE;
        sa.lpSecurityDescriptor = NULL;

        HANDLE hNullIn = CreateFileA("NUL", GENERIC_READ, FILE_SHARE_READ, &sa, OPEN_EXISTING, 0, NULL);
        HANDLE hNullOut = CreateFileA("NUL", GENERIC_WRITE, FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, NULL);

        if (CreatePipe(&hRead, &hWrite, &sa, 0)) {
            SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

            STARTUPINFOW si;
            PROCESS_INFORMATION pi;
            ZeroMemory(&si, sizeof(si));
            si.cb = sizeof(si);
            si.hStdInput = (hNullIn != INVALID_HANDLE_VALUE) ? hNullIn : NULL;
            si.hStdOutput = (hNullOut != INVALID_HANDLE_VALUE) ? hNullOut : NULL;
            si.hStdError = hWrite;
            si.dwFlags |= STARTF_USESTDHANDLES;
            ZeroMemory(&pi, sizeof(pi));

            std::wstring wcmd = utf8ToWide(cmd.str());
            if (CreateProcessW(NULL, &wcmd[0], NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
                CloseHandle(hWrite);

                std::string output;
                std::vector<char> buf(4096);
                DWORD bytesRead = 0;
                while (ReadFile(hRead, buf.data(), static_cast<DWORD>(buf.size() - 1), &bytesRead, NULL) && bytesRead > 0) {
                    buf[bytesRead] = '\0';
                    output.append(buf.data(), bytesRead);
                }

                WaitForSingleObject(pi.hProcess, 3000);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);

                std::regex durRegex(R"(Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?))");
                std::smatch match;
                if (std::regex_search(output, match, durRegex)) {
                    int h = std::stoi(match[1]);
                    int m = std::stoi(match[2]);
                    double s = std::stod(match[3]);
                    result.duration = h * 3600.0 + m * 60.0 + s;
                }

                std::regex vRegex(R"(Video:\s*([a-zA-Z0-9_-]+))");
                if (std::regex_search(output, match, vRegex)) {
                    result.videoCodec = match[1];
                    std::transform(result.videoCodec.begin(), result.videoCodec.end(), result.videoCodec.begin(), ::tolower);
                }

                std::regex aRegex(R"(Audio:\s*([a-zA-Z0-9_-]+))");
                if (std::regex_search(output, match, aRegex)) {
                    result.audioCodec = match[1];
                    std::transform(result.audioCodec.begin(), result.audioCodec.end(), result.audioCodec.begin(), ::tolower);
                    result.hasAudio = true;
                }

                std::regex pixRegex(R"(,\s*([a-zA-Z0-9_]+)(?:\([a-zA-Z0-9_, ]+\))?,\s*(\d{2,5})x(\d{2,5}))");
                if (std::regex_search(output, match, pixRegex)) {
                    result.pixelFormat = match[1];
                    std::transform(result.pixelFormat.begin(), result.pixelFormat.end(), result.pixelFormat.begin(), ::tolower);
                    result.width = std::stoi(match[2]);
                    result.height = std::stoi(match[3]);
                } else {
                    std::regex dimRegex(R"((\d{2,5})x(\d{2,5}))");
                    if (std::regex_search(output, match, dimRegex)) {
                        result.width = std::stoi(match[1]);
                        result.height = std::stoi(match[2]);
                    }
                    if (output.find("yuv420p") != std::string::npos) result.pixelFormat = "yuv420p";
                    else if (output.find("yuvj420p") != std::string::npos) result.pixelFormat = "yuvj420p";
                }

                result.success = (!result.videoCodec.empty() || !result.audioCodec.empty() || result.duration > 0);
            } else {
                CloseHandle(hWrite);
            }
            CloseHandle(hRead);
        }
        if (hNullIn != INVALID_HANDLE_VALUE) CloseHandle(hNullIn);
        if (hNullOut != INVALID_HANDLE_VALUE) CloseHandle(hNullOut);
#endif

        if (result.duration <= 1.0) {
            std::filesystem::path p = toPath(filePath);
            std::error_code ec;
            auto sz = std::filesystem::file_size(p, ec);
            if (!ec && sz > 0) {
                result.duration = static_cast<double>(sz * 8) / 1100000.0;
            }
        }

        if (result.success) {
            std::lock_guard<std::mutex> lock(s_probeMutex);
            s_probeCache[filePath] = result;
        }

        return result;
    }

    void HTTPServer::handleProbe(unsigned long long clientSocket, const std::string& decodedPath) {
        std::cerr << "[HTTPServer] handleProbe for: " << decodedPath << std::endl;
        SOCKET client = static_cast<SOCKET>(clientSocket);
        std::filesystem::path pathObj = toPath(decodedPath);
        std::error_code ec;
        if (!std::filesystem::exists(pathObj, ec) || ec) {
            std::string response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"success\":false,\"error\":\"File not found\"}";
            sendAll(client, response.c_str(), response.length());
            return;
        }

        std::string ext = "";
        size_t dotPos = decodedPath.find_last_of('.');
        if (dotPos != std::string::npos) {
            ext = decodedPath.substr(dotPos);
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        }

        bool isAudio = (ext == ".mp3" || ext == ".m4a" || ext == ".wav" || ext == ".flac" || ext == ".ogg" || ext == ".aac" || ext == ".opus" || ext == ".wma" || ext == ".weba");
        if (isAudio) {
            std::stringstream json;
            json << "{"
                 << "\"success\":true,"
                 << "\"duration\":0,"
                 << "\"videoCodec\":\"\","
                 << "\"audioCodec\":\"" << (ext.size() > 1 ? ext.substr(1) : "") << "\","
                 << "\"pixelFormat\":\"\","
                 << "\"width\":0,"
                 << "\"height\":0,"
                 << "\"directPlay\":true,"
                 << "\"needsTranscode\":false"
                 << "}";
            std::string body = json.str();
            std::stringstream headers;
            headers << "HTTP/1.1 200 OK\r\n"
                    << "Content-Type: application/json\r\n"
                    << "Content-Length: " << body.length() << "\r\n"
                    << "Access-Control-Allow-Origin: *\r\n"
                    << "Connection: close\r\n\r\n";
            std::string response = headers.str() + body;
            sendAll(client, response.c_str(), response.length());
            return;
        }

        SafeProbeResult probe = probeWithFFmpeg(decodedPath);

        // Shared rule, so /probe and the transcode path cannot disagree about
        // what the browser can play. This used to accept only h264/avc1 in MP4,
        // which reported a VP9-in-MP4 file as needing transcoding and sent the
        // player into a full libx264 re-encode of the whole thing.
        PlaybackSupport::MediaInfo info;
        info.videoCodec = probe.videoCodec;
        info.audioCodec = probe.audioCodec;
        info.pixelFormat = probe.pixelFormat;
        info.width = probe.width;
        info.height = probe.height;
        bool needsTranscode = PlaybackSupport::needsTranscode(decodedPath, info);

        // Audio is already covered by PlaybackSupport::needsTranscode above,
        // so it is not re-checked here.

        std::stringstream json;
        json << "{"
             << "\"success\":" << (probe.success ? "true" : "false") << ","
             << "\"duration\":" << probe.duration << ","
             << "\"videoCodec\":\"" << probe.videoCodec << "\","
             << "\"audioCodec\":\"" << probe.audioCodec << "\","
             << "\"pixelFormat\":\"" << probe.pixelFormat << "\","
             << "\"width\":" << probe.width << ","
             << "\"height\":" << probe.height << ","
             << "\"directPlay\":" << (needsTranscode ? "false" : "true") << ","
             << "\"needsTranscode\":" << (needsTranscode ? "true" : "false")
             << "}";

        std::string body = json.str();
        std::stringstream headers;
        headers << "HTTP/1.1 200 OK\r\n"
                << "Content-Type: application/json\r\n"
                << "Content-Length: " << body.length() << "\r\n"
                << "Access-Control-Allow-Origin: *\r\n"
                << "Connection: close\r\n\r\n";
        
        std::string response = headers.str() + body;
        sendAll(client, response.c_str(), response.length());
    }

    std::string HTTPServer::findFFmpegExecutable() {
        if (!m_ffmpegPath.empty() && std::filesystem::exists(m_ffmpegPath)) {
            return m_ffmpegPath;
        }
#ifdef _WIN32
        const char* appData = std::getenv("APPDATA");
        if (appData) {
            std::filesystem::path p(appData);
            auto p_pana = p / "panamedia" / "bin" / "ffmpeg.exe";
            if (std::filesystem::exists(p_pana)) return p_pana.string();
            auto p_elec = p / "Electron" / "bin" / "ffmpeg.exe";
            if (std::filesystem::exists(p_elec)) return p_elec.string();
            auto p_net = p / "net-downloader" / "bin" / "ffmpeg.exe";
            if (std::filesystem::exists(p_net)) return p_net.string();
        }
        std::vector<std::string> localPaths = {
            "bin/ffmpeg.exe",
            "../bin/ffmpeg.exe",
            "../../bin/ffmpeg.exe",
            "panamedia-downloader/bin/ffmpeg.exe"
        };
        for (const auto& lp : localPaths) {
            if (std::filesystem::exists(lp)) return std::filesystem::absolute(lp).string();
        }
        return "ffmpeg.exe";
#else
        return "ffmpeg";
#endif
    }

    std::string HTTPServer::findThumbnailCacheDir() {
        const char* appData = std::getenv("APPDATA");
        std::filesystem::path dir;
        if (appData) {
            dir = std::filesystem::path(appData) / "panamedia" / "thumbnails";
        } else {
            dir = std::filesystem::current_path() / "thumbnails";
        }
        std::error_code ec;
        if (!std::filesystem::exists(dir)) {
            std::filesystem::create_directories(dir, ec);
        }
        return dir.string();
    }

    void HTTPServer::handleThumbnail(unsigned long long clientSocket, const std::string& decodedPath) {
        SOCKET client = static_cast<SOCKET>(clientSocket);
        if (!std::filesystem::exists(decodedPath)) {
            std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            sendAll(client, response.c_str(), response.length());
            return;
        }

        std::hash<std::string> hasher;
        std::string hashStr = std::to_string(hasher(decodedPath));
        std::string thumbDir = findThumbnailCacheDir();
        std::string thumbPath = (std::filesystem::path(thumbDir) / (hashStr + ".jpg")).string();

        if (std::filesystem::exists(thumbPath) && std::filesystem::file_size(thumbPath) > 0) {
            std::ifstream file(thumbPath, std::ios::binary);
            if (file.is_open()) {
                uint64_t size = std::filesystem::file_size(thumbPath);
                std::stringstream headers;
                headers << "HTTP/1.1 200 OK\r\n"
                        << "Content-Type: image/jpeg\r\n"
                        << "Content-Length: " << size << "\r\n"
                        << "Access-Control-Allow-Origin: *\r\n"
                        << "Connection: close\r\n\r\n";
                std::string hStr = headers.str();
                sendAll(client, hStr.c_str(), hStr.length());

                std::vector<char> buf(32768);
                while (file.read(buf.data(), buf.size()) || file.gcount() > 0) {
                    if (!sendAll(client, buf.data(), static_cast<int>(file.gcount()))) break;
                }
                return;
            }
        }

        std::string ffmpegExe = findFFmpegExecutable();
        std::string ext = "";
        size_t dotPos = decodedPath.find_last_of('.');
        if (dotPos != std::string::npos) {
            ext = decodedPath.substr(dotPos);
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        }
        bool isAudio = (ext == ".mp3" || ext == ".m4a" || ext == ".flac" || ext == ".wav" || ext == ".ogg" || ext == ".aac");

        std::stringstream cmd;
        cmd << escapeArg(ffmpegExe) << " -y -ss 00:00:01 -i " << escapeArg(decodedPath);
        if (isAudio) {
            cmd << " -an -vcodec copy ";
        } else {
            cmd << " -vframes 1 -q:v 3 -vf \"scale='min(480,iw)':-2\" ";
        }
        cmd << escapeArg(thumbPath);

#ifdef _WIN32
        std::wstring wcmd = utf8ToWide(cmd.str());
        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        si.dwFlags |= STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        ZeroMemory(&pi, sizeof(pi));

        if (CreateProcessW(NULL, &wcmd[0], NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 3000);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
#endif

        std::filesystem::path thumbObj = toPath(thumbPath);
        if (std::filesystem::exists(thumbObj) && std::filesystem::file_size(thumbObj) > 0) {
            std::ifstream file(thumbObj, std::ios::binary);
            if (file.is_open()) {
                uint64_t size = std::filesystem::file_size(thumbObj);
                std::stringstream headers;
                headers << "HTTP/1.1 200 OK\r\n"
                        << "Content-Type: image/jpeg\r\n"
                        << "Content-Length: " << size << "\r\n"
                        << "Access-Control-Allow-Origin: *\r\n"
                        << "Connection: close\r\n\r\n";
                std::string hStr = headers.str();
                sendAll(client, hStr.c_str(), hStr.length());

                std::vector<char> buf(32768);
                while (file.read(buf.data(), buf.size()) || file.gcount() > 0) {
                    if (!sendAll(client, buf.data(), static_cast<int>(file.gcount()))) break;
                }
                return;
            }
        }

        std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        sendAll(client, response.c_str(), response.length());
    }

    void HTTPServer::handleWaveform(unsigned long long clientSocket, const std::string& decodedPath, int width, int height) {
        SOCKET client = static_cast<SOCKET>(clientSocket);
        const auto source = toPath(decodedPath);
        std::error_code ec;
        if (!std::filesystem::is_regular_file(source, ec) || ec) {
            const std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            sendAll(client, response.c_str(), static_cast<int>(response.size()));
            return;
        }
        width = std::clamp(width, 256, 8192);
        height = std::clamp(height, 32, 512);

        const auto modified = std::filesystem::last_write_time(source, ec).time_since_epoch().count();
        const std::string cacheKey = decodedPath + std::to_string(modified) + "_" + std::to_string(width) + "x" + std::to_string(height);
        const std::string cacheName = std::to_string(std::hash<std::string>{}(cacheKey)) + ".png";
        const auto cachePath = toPath(findThumbnailCacheDir()) / "waveforms" / cacheName;
        std::filesystem::create_directories(cachePath.parent_path(), ec);

        if (!std::filesystem::exists(cachePath, ec) || ec || std::filesystem::file_size(cachePath, ec) == 0 || ec) {
            std::error_code removeError;
            std::filesystem::remove(cachePath, removeError);
            const std::string filter = "[0:a:0]aformat=channel_layouts=mono,showwavespic=s=" + std::to_string(width) + "x" + std::to_string(height) + ":colors=0x38bdf8,format=rgba,colorkey=0x000000:0.05:0.0[out]";
            std::stringstream cmd;
            cmd << escapeArg(findFFmpegExecutable()) << " -y -hide_banner -loglevel error -i " << escapeArg(decodedPath)
                << " -filter_complex " << escapeArg(filter) << " -map " << escapeArg("[out]")
                << " -frames:v 1 -threads 1 " << escapeArg(cachePath.u8string());

#ifdef _WIN32
            std::wstring wcmd = utf8ToWide(cmd.str());
            STARTUPINFOW si{};
            PROCESS_INFORMATION pi{};
            si.cb = sizeof(si);
            si.dwFlags |= STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;
            if (CreateProcessW(nullptr, wcmd.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
                const DWORD waitResult = WaitForSingleObject(pi.hProcess, 120000);
                if (waitResult == WAIT_TIMEOUT) {
                    TerminateProcess(pi.hProcess, 1);
                    WaitForSingleObject(pi.hProcess, INFINITE);
                }
                DWORD exitCode = 1;
                GetExitCodeProcess(pi.hProcess, &exitCode);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                if (exitCode != 0) std::filesystem::remove(cachePath, removeError);
            }
#else
            const int exitCode = std::system(cmd.str().c_str());
            if (exitCode != 0) std::filesystem::remove(cachePath, removeError);
#endif
        }

        if (!std::filesystem::exists(cachePath, ec) || ec || std::filesystem::file_size(cachePath, ec) == 0 || ec) {
            const std::string response = "HTTP/1.1 422 Unprocessable Content\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
            sendAll(client, response.c_str(), static_cast<int>(response.size()));
            return;
        }
        const auto size = std::filesystem::file_size(cachePath, ec);
        std::ifstream image(cachePath, std::ios::binary);
        if (!image) return;
        std::stringstream headers;
        headers << "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " << size
                << "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: public, max-age=31536000, immutable\r\nConnection: close\r\n\r\n";
        const auto header = headers.str();
        if (!sendAll(client, header.c_str(), static_cast<int>(header.size()))) return;
        std::vector<char> buffer(32768);
        while (image.read(buffer.data(), static_cast<std::streamsize>(buffer.size())) || image.gcount() > 0) {
            if (!sendAll(client, buffer.data(), static_cast<int>(image.gcount()))) break;
        }
    }

    void HTTPServer::handleTimelinePreview(unsigned long long clientSocket, const std::string& decodedPath, double timeSec) {
        SOCKET client = static_cast<SOCKET>(clientSocket);
        std::filesystem::path pathObj = toPath(decodedPath);
        if (!std::filesystem::exists(pathObj)) {
            std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            sendAll(client, response.c_str(), response.length());
            return;
        }

        std::string ext = "";
        size_t dotPos = decodedPath.find_last_of('.');
        if (dotPos != std::string::npos) {
            ext = decodedPath.substr(dotPos);
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        }
        if (ext == ".mp3" || ext == ".m4a" || ext == ".flac" || ext == ".wav" || ext == ".ogg" || ext == ".aac" || ext == ".opus" || ext == ".wma") {
            handleThumbnail(clientSocket, decodedPath);
            return;
        }

        std::string ffmpegExe = findFFmpegExecutable();
        std::stringstream cmd;
        cmd << escapeArg(ffmpegExe)
            << " -ss " << timeSec
            << " -i " << escapeArg(decodedPath)
            << " -vframes 1 -vf \"scale=240:-2\" -q:v 3 -f image2 pipe:1";

#ifdef _WIN32
        HANDLE hRead, hWrite;
        SECURITY_ATTRIBUTES sa;
        sa.nLength = sizeof(SECURITY_ATTRIBUTES);
        sa.bInheritHandle = TRUE;
        sa.lpSecurityDescriptor = NULL;

        HANDLE hNull = CreateFileA("NUL", GENERIC_WRITE, FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, NULL);

        if (CreatePipe(&hRead, &hWrite, &sa, 0)) {
            SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

            STARTUPINFOW si;
            PROCESS_INFORMATION pi;
            ZeroMemory(&si, sizeof(si));
            si.cb = sizeof(si);
            si.hStdOutput = hWrite;
            si.hStdError = (hNull != INVALID_HANDLE_VALUE) ? hNull : NULL;
            si.dwFlags |= STARTF_USESTDHANDLES;
            ZeroMemory(&pi, sizeof(pi));

            std::wstring wcmd = utf8ToWide(cmd.str());

            if (CreateProcessW(NULL, &wcmd[0], NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
                CloseHandle(hWrite);

                std::vector<char> imgData;
                std::vector<char> readBuf(32768);
                DWORD bytesRead = 0;
                while (ReadFile(hRead, readBuf.data(), readBuf.size(), &bytesRead, NULL) && bytesRead > 0 && m_running) {
                    imgData.insert(imgData.end(), readBuf.data(), readBuf.data() + bytesRead);
                }

                TerminateProcess(pi.hProcess, 0);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);

                if (!imgData.empty()) {
                    std::stringstream headers;
                    headers << "HTTP/1.1 200 OK\r\n"
                            << "Content-Type: image/jpeg\r\n"
                            << "Content-Length: " << imgData.size() << "\r\n"
                            << "Access-Control-Allow-Origin: *\r\n"
                            << "Cache-Control: public, max-age=3600\r\n"
                            << "Connection: close\r\n\r\n";
                    std::string headerStr = headers.str();
                    sendAll(client, headerStr.c_str(), headerStr.length());
                    sendAll(client, imgData.data(), imgData.size());
                } else {
                    std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    sendAll(client, response.c_str(), response.length());
                }
            } else {
                CloseHandle(hWrite);
                std::string response = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                sendAll(client, response.c_str(), response.length());
            }
            CloseHandle(hRead);
        }
        if (hNull != INVALID_HANDLE_VALUE) {
            CloseHandle(hNull);
        }
#else
        std::string response = "HTTP/1.1 501 Not Implemented\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        sendAll(client, response.c_str(), response.length());
#endif
    }

    void HTTPServer::handleTranscode(unsigned long long clientSocket, const std::string& decodedPath, double startSec, const std::string& quality) {
        SOCKET client = static_cast<SOCKET>(clientSocket);
        
        std::filesystem::path pathObj = toPath(decodedPath);
        if (!std::filesystem::exists(pathObj)) {
            std::string response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            sendAll(client, response.c_str(), response.length());
            return;
        }

#ifdef _WIN32
        std::string ffmpegExe = findFFmpegExecutable();

        // Probe codec and stream details safely
        SafeProbeResult probe = probeWithFFmpeg(decodedPath);
        std::string videoCodec = probe.videoCodec;
        std::string audioCodec = probe.audioCodec;
        std::string pixelFormat = probe.pixelFormat;
        bool hasAudio = probe.hasAudio;
        int width = probe.width;
        int height = probe.height;

        // Build command line
        std::stringstream cmd;
        cmd << escapeArg(ffmpegExe);
        
        bool isAudioOnly = videoCodec.empty();
        bool is10or12Bit = (pixelFormat.find("10") != std::string::npos || pixelFormat.find("12") != std::string::npos);

        // Smart Remuxing determination:
        // If video is H.264, HEVC, VP9, or AV1 and quality is original,
        // we copy the video stream directly (-c:v copy). 0% CPU, instant startup!
        bool isH264 = (videoCodec == "h264" || videoCodec == "avc1");
        bool isDirectCopyableVideo = isH264;
        bool isCompatiblePixFmt = (pixelFormat == "yuv420p" || pixelFormat == "yuvj420p" || pixelFormat.empty());
        bool isAAC = (audioCodec == "aac");

        std::string subPath;
        bool hasExternalSubs = hasExternalSubtitles(decodedPath, subPath);

        bool canDirectCopyVideo = !isAudioOnly && isDirectCopyableVideo && isCompatiblePixFmt && (quality == "original" || quality.empty()) && !hasExternalSubs;

        if (startSec > 0.0) {
            cmd << " -ss " << startSec;
        }

        if (!canDirectCopyVideo && !isAudioOnly) {
            cmd << " -hwaccel auto";
        }

        cmd << " -nostdin -analyzeduration 3000000 -probesize 2000000 -fflags +genpts+discardcorrupt+igndts";
        cmd << " -i " << escapeArg(decodedPath);

        if (isAudioOnly) {
            cmd << " -vn";
        } else if (canDirectCopyVideo) {
            // SMART REMUX: Copy video stream without re-encoding!
            cmd << " -c:v copy";
        } else {
            // Video filters (downscaling & external subtitles)
            std::vector<std::string> filters;
            if (quality == "720p") {
                if (width > 1280 || height > 720) {
                    filters.push_back("scale='min(1280,iw)':-2");
                }
            } else if (quality == "1080p") {
                if (width > 1920 || height > 1080) {
                    filters.push_back("scale='min(1920,iw)':-2");
                }
            }

            if (hasExternalSubs) {
                filters.push_back("subtitles='" + escapeSubtitlePath(subPath) + "'");
            }

            if (!filters.empty()) {
                std::string filterArg = "";
                for (size_t i = 0; i < filters.size(); ++i) {
                    if (i > 0) filterArg += ",";
                    filterArg += filters[i];
                }
                cmd << " -vf " << escapeArg(filterArg);
            }

            cmd << " -err_detect ignore_err -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -g 30";
        }

        if (hasAudio) {
            if (isAAC && canDirectCopyVideo) {
                // Both video and audio copied losslessly (apply aac_adtstoasc for ADTS MPEG-TS / AAC streams)
                cmd << " -c:a copy -bsf:a aac_adtstoasc";
            } else {
                // Transcode audio to universal 2-channel stereo AAC (handles AC-3 5.1, DTS, TrueHD, Vorbis, etc.)
                cmd << " -c:a aac -b:a 192k -ac 2";
            }
        } else {
            cmd << " -an";
        }
        cmd << " -avoid_negative_ts make_zero -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset pipe:1";

        std::string cmdStr = cmd.str();

        // Pipes
        HANDLE hRead, hWrite;
        SECURITY_ATTRIBUTES sa;
        sa.nLength = sizeof(SECURITY_ATTRIBUTES);
        sa.bInheritHandle = TRUE;
        sa.lpSecurityDescriptor = NULL;

        HANDLE hNull = CreateFileA("NUL", GENERIC_WRITE, FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, NULL);
        HANDLE hNullIn = CreateFileA("NUL", GENERIC_READ, FILE_SHARE_READ, &sa, OPEN_EXISTING, 0, NULL);

        if (CreatePipe(&hRead, &hWrite, &sa, 0)) {
            SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

            STARTUPINFOW si;
            PROCESS_INFORMATION pi;
            ZeroMemory(&si, sizeof(si));
            si.cb = sizeof(si);
            si.hStdInput = (hNullIn != INVALID_HANDLE_VALUE) ? hNullIn : NULL;
            si.hStdOutput = hWrite;
            si.hStdError = (hNull != INVALID_HANDLE_VALUE) ? hNull : NULL;
            si.dwFlags |= STARTF_USESTDHANDLES;

            ZeroMemory(&pi, sizeof(pi));

            std::wstring wcmd = utf8ToWide(cmdStr);

            if (CreateProcessW(NULL, &wcmd[0], NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
                CloseHandle(hWrite);

                std::stringstream headers;
                headers << "HTTP/1.1 200 OK\r\n"
                        << "Content-Type: video/mp4\r\n"
                        << "Access-Control-Allow-Origin: *\r\n"
                        << "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n"
                        << "Access-Control-Allow-Headers: Content-Type, Range\r\n"
                        << "Connection: close\r\n\r\n";
                std::string headerStr = headers.str();
                sendAll(client, headerStr.c_str(), headerStr.length());

                std::vector<char> readBuf(65536);
                DWORD bytesRead = 0;
                while (ReadFile(hRead, readBuf.data(), readBuf.size(), &bytesRead, NULL) && bytesRead > 0 && m_running) {
                    if (!sendAll(client, readBuf.data(), bytesRead)) {
                        break;
                    }
                }

                TerminateProcess(pi.hProcess, 0);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
            } else {
                CloseHandle(hWrite);
                std::string response = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                sendAll(client, response.c_str(), response.length());
            }
            CloseHandle(hRead);
        }
        if (hNull != INVALID_HANDLE_VALUE) {
            CloseHandle(hNull);
        }
        if (hNullIn != INVALID_HANDLE_VALUE) {
            CloseHandle(hNullIn);
        }
#else
        std::string response = "HTTP/1.1 501 Not Implemented\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        sendAll(client, response.c_str(), response.length());
#endif
    }

} // namespace Panamedia
