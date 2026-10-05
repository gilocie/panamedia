#ifndef CONVERSION_SUPPORT_HPP
#define CONVERSION_SUPPORT_HPP

#include <string>

namespace Panamedia {

    // Compute primitives the converter used to run on the Electron main thread
    // via synchronous Node calls (execSync / ffprobe spawns / readdirSync).
    // Each entry point returns a JSON string so it can cross the IPC boundary
    // without an extra parsing layer.
    class ConversionSupport {
    public:
        // Detects an available hardware encoder (nvenc > qsv > amf > mf > cpu).
        // Runs `ffmpeg -encoders` once and caches the result for the engine's
        // lifetime, so the UI can ask on every render without paying for it.
        // -> {"codec":"nvenc","cached":false}
        static std::string detectHardwareAcceleration();

        // Thread budget for ffmpeg: never starves the OS or the UI.
        // Mirrors getOptimalThreadCount() in hardwareEngine.cjs.
        //
        // Phase G: the budget drops when the machine is running on battery,
        // so a queue started before unplugging does not quietly turn into a
        // fan-spinning, battery-flattening job.
        static int getOptimalThreadCount();

        // Mains power state, read straight from the OS.
        // -> {"onBattery":false,"percent":100,"charging":true,"reason":"AC"}
        static std::string getPowerStatus();

        // Free bytes and writability for the volume holding a path.
        // -> {"freeBytes":N,"totalBytes":N,"writable":true,"volumeLabel":"C:"}
        // A removable drive that has been pulled or is still enumerating
        // reports writable:false rather than disappearing.
        static std::string describeVolume(const std::string& path);

        // Converts an absolute path to the extended-length form (\\?\) once it
        // approaches the legacy MAX_PATH ceiling. ffmpeg and the Win32 file
        // APIs both honour it, so deep library trees convert instead of
        // failing with "file name too long".
        // Short paths are returned untouched, which keeps log lines readable.
        static std::string longPathIfNeeded(const std::string& path);

        // Duration in seconds via ffprobe.
        // -> {"duration":123.456}
        static std::string probeDuration(const std::string& filePath);

        // Full source inspection in one ffprobe pass: streams, chapters and
        // container tags. The multi-audio-track picker and the metadata tool
        // both need this, and probing the same file twice for two halves of
        // one answer is what made the UI feel slow.
        //
        // audioTracks is indexed by order of appearance among audio streams,
        // which is the same numbering ffmpeg's `-map 0:a:N` uses.
        //
        // -> { ok, duration, sizeBytes, formatName,
        //      video: { codec,width,height,fps,duration,bitrate },
        //      audioTracks: [{ index, codec, language, title, channels,
        //                       sampleRate, bitrate }],
        //      chapters: [{ start, end, title }],
        //      tags: { title, artist, album, date, ... } }
        static std::string probeMedia(const std::string& filePath);

        // Post-conversion system actions. Only one is supported: safely eject a
        // removable drive.
        //
        // request: { action: 'eject', driveLetter: 'E', dryRun?: bool }
        // -> { ok, action, detail }
        //
        // Shutdown / restart / sleep / logoff are refused unconditionally. This
        // function used to enable SE_SHUTDOWN_NAME and call
        // InitiateSystemShutdownExW. That put a machine-level, unundoable,
        // unreachable-from-the-UI action behind a plain JSON request whose
        // dryRun guard did not cover it. It is gone and the link against
        // advapi32 went with it, so nothing in this process can enable the
        // shutdown privilege or schedule a power state change.
        static std::string systemPowerAction(const std::string& requestJson);

        // Non-recursive listing of a converter output directory, newest first.
        // Returns raw values only (sizeBytes, mtimeMs); the UI layer is
        // responsible for turning those into "12.3 MB" / locale date strings.
        // -> [{"name":..,"path":..,"ext":..,"sizeBytes":..,"mtimeMs":..}]
        static std::string listOutputFiles(const std::string& dirPath);

        // Removable drives via the Win32 API. Replaces a PowerShell subprocess
        // spawn that cost 1-3 seconds of latency for the same answer.
        //
        // Phase G: each entry also reports `ready`, so the UI can refuse an
        // export to a drive that has been ejected instead of starting a job
        // that is guaranteed to fail halfway through.
        // -> [{"letter":"E:\\","label":"MY USB","ready":true,"freeBytes":N}]
        static std::string listRemovableDrives();

        // Decides where a conversion's output should be written.
        //
        // Previously ffmpeg always wrote next to the source file and the result
        // was relocated afterwards. That meant a file being played and converted
        // at the same time sat in the directory being written to, and the output
        // could collide with the source. Planning the destination up front lets
        // the engine write straight there, so the two become independent.
        //
        // options: { mode, format, destination: 'source'|'sendtray'|'folder'|'drive',
        //            destPath, driveLetter }
        //
        // Phase G: the result also carries the room available at the target
        // and a conservative estimate of what this conversion will need, so a
        // job that cannot finish never starts:
        // -> { outputPath, directory, isSourceDir, collision,
        //      freeBytes, sourceBytes, estimatedBytes, sufficient, writable,
        //      volumeLabel, warning }
        static std::string planOutputPath(const std::string& filePath,
                                          const std::string& optionsJson);
    };

} // namespace Panamedia

#endif // CONVERSION_SUPPORT_HPP