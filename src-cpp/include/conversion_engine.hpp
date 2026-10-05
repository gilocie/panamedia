#ifndef CONVERSION_ENGINE_HPP
#define CONVERSION_ENGINE_HPP

#include <string>

namespace Panamedia {

    // Owns ffmpeg process lifecycle for the converter: argument construction,
    // spawning, progress reporting, and real suspend/resume.
    //
    // Jobs run on their own threads and never block the IPC reader thread, so a
    // multi-minute conversion cannot stall library scans, probes or the HTTP
    // server. Progress is pushed as `convert_progress` / `convert_complete`
    // events; the control actions return immediately.
    class ConversionEngine {
    public:
        // Starts a job and returns immediately with {jobId, started, ...}.
        // Use jobId (or inputPath as the key) for pause/resume/cancel/status.
        static std::string start(const std::string& jobId,
                                 const std::string& inputPath,
                                 const std::string& outputPath,
                                 const std::string& optionsJson);

        // Suspends / resumes the ffmpeg process via NtSuspendProcess and
        // NtResumeProcess. Unlike the previous PowerShell-based attempt, these
        // genuinely stop the encoder instead of just flipping a UI flag.
        static std::string pause(const std::string& jobId);
        static std::string resume(const std::string& jobId);

        static std::string cancel(const std::string& jobId);
        static std::string status(const std::string& jobId);
        static std::string listActive();

        // Terminates every running job. Used on shutdown so no orphaned ffmpeg
        // processes survive the app.
        static void cancelAll();

        // Builds the ffmpeg argument list for a job. Exposed for verification.
        static std::string buildArgs(const std::string& inputPath,
                                     const std::string& outputPath,
                                     const std::string& optionsJson);
    };

} // namespace Panamedia

#endif // CONVERSION_ENGINE_HPP