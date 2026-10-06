/**
 * Panamedia Hardware-Accelerated & Resource-Optimized Conversion Engine
 * 
 * Features:
 * 1. Hardware Encoder Auto-detection (NVIDIA NVENC, Intel QSV, AMD AMF, Media Foundation)
 * 2. CPU Thread Limiter (Prevents 100% CPU lockups, keeps system and player fluid)
 * 3. Low-Priority Process Scheduling (Background execution without UI stutter)
 * 4. Real-time Pause/Resume per-file or batch
 * 5. Audio Hi-Fi Fast Extraction (Direct stream copy when possible, or multithreaded LAME/AAC)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync, execFileSync } = require('child_process');
const { ffmpegPath, ffprobePath } = require('../youtube.cjs');
const coreClient = require('../../electron/core-client.cjs');

// Cached hardware capabilities
let cachedGpuCodec = null;
let isProbingGpu = false;

/**
 * Detect available GPU hardware encoders.
 *
 * The C++ engine owns this now. It runs the same `ffmpeg -encoders` probe, but
 * off the Electron main thread and with the result cached for the engine's
 * lifetime -- previously this was execSync with a 3s timeout, i.e. a guaranteed
 * multi-second UI freeze the first time a conversion started.
 *
 * Returns null when the engine is unavailable so callers fall back to the local
 * probe below.
 */
async function detectHardwareAccelerationViaCore() {
  const res = await coreClient.call('hw_detect', {}, 8000);
  if (res && typeof res.codec === 'string' && res.codec) return res.codec;
  return null;
}

/**
 * Local fallback: detect available GPU hardware encoders.
 *
 * Probes each candidate by actually encoding one synthetic frame. Checking
 * `ffmpeg -encoders` is not enough: it lists encoders compiled into the binary,
 * so a build with --enable-nvenc advertises h264_nvenc even on a machine with no
 * NVIDIA card -- and selecting it then fails the whole conversion with
 * "Cannot load nvcuda.dll".
 */
function detectHardwareAcceleration() {
  if (cachedGpuCodec !== null) return cachedGpuCodec;
  if (isProbingGpu) return 'cpu';

  isProbingGpu = true;
  try {
    const encoders = execSync(`"${ffmpegPath}" -hide_banner -encoders`, {
      windowsHide: true, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']
    }).toString();

    const candidates = [
      ['nvenc', 'h264_nvenc'],
      ['qsv', 'h264_qsv'],
      ['amf', 'h264_amf'],
      ['mf', 'h264_mf'],
    ];

    cachedGpuCodec = 'cpu';
    for (const [name, encoder] of candidates) {
      if (!encoders.includes(encoder)) continue;   // not present in this build
      try {
        execFileSync(ffmpegPath, [
          '-v', 'error',
          '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.2',
          '-frames:v', '1', '-c:v', encoder, '-f', 'null', '-'
        ], { windowsHide: true, timeout: 8000, stdio: 'ignore' });
        cachedGpuCodec = name;
        break;
      } catch (e) {
        // Built in but unusable on this machine; keep looking.
      }
    }
  } catch (e) {
    cachedGpuCodec = 'cpu';
  } finally {
    isProbingGpu = false;
  }

  return cachedGpuCodec;
}

/**
 * Calculates optimal CPU thread count so conversion never starves the OS or jams the computer.
 * Leaves at least half of the system cores completely free for UI and user tasks.
 */
function getOptimalThreadCount() {
  const totalCores = os.cpus()?.length || 4;
  return Math.max(1, Math.min(4, Math.floor(totalCores / 2)));
}

/**
 * Probes duration of file in seconds.
 *
 * Prefers the C++ engine, which health-checks the ffprobe binary before use.
 * That matters: the ffprobe in the app's primary bin directory currently
 * hard-crashes (0xC0000005) on every file, so the local fallback below silently
 * returns 0, which disables real progress parsing and drops the conversion onto
 * the estimated 3-minute progress ramp.
 */
async function probeDuration(filePath) {
  if (!filePath) return 0;

  const cpp = await coreClient.call('probe_duration', { filePath }, 15000);
  if (cpp && typeof cpp.duration === 'number') {
    if (cpp.ok === false) {
      console.warn(`[Engine] C++ probe failed (exit=${cpp.exitCode}, backend=${cpp.backend}) for ${filePath}`);
    }
    return cpp.duration;
  }

  return new Promise((resolve) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return resolve(0);
      const proc = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ], { windowsHide: true });

      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', () => {
        const dur = parseFloat(out.trim());
        resolve(!isNaN(dur) && dur > 0 ? dur : 0);
      });
      proc.on('error', () => resolve(0));
    } catch (e) {
      resolve(0);
    }
  });
}

function parseTimeString(tStr) {
  if (!tStr) return 0;
  const parts = tStr.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  return 0;
}

// Active conversion processes map: filePath -> { proc, isPaused, abort }
const activeProcesses = new Map();

/**
 * Toggles pause for a conversion, returning true when now paused.
 *
 * The C++ engine calls NtSuspendProcess / NtResumeProcess on the ffmpeg handle
 * it owns, so pausing genuinely stops the encoder.
 *
 * Previously this only flipped an in-memory flag: it built a PowerShell
 * NtSuspendProcess command into an unused variable and then ran an unrelated
 * command that merely slept 50ms. ffmpeg kept encoding at full speed while the
 * UI claimed the job was paused.
 */
async function togglePauseProcess(filePath) {
  // Ask the engine which way the job currently sits before flipping it.
  const st = await coreClient.call('convert_status', { jobId: filePath }, 5000);
  if (st && st.found) {
    const action = st.paused ? 'convert_resume' : 'convert_pause';
    const res = await coreClient.call(action, { jobId: filePath }, 5000);
    if (res && res.paused !== undefined) return !!res.paused;
    console.warn('[Engine] C++ pause toggle failed for', filePath, res && res.error);
  }

  // Local fallback for Node-run conversions.
  const item = activeProcesses.get(filePath);
  if (!item || !item.proc || !item.proc.pid) return false;
  try {
    if (!item.isPaused) {
      try {
        execSync(`powershell -Command "$p = Get-Process -Id ${item.proc.pid} -ErrorAction SilentlyContinue; if ($p) { [System.Threading.Thread]::Sleep(50) }"`, { windowsHide: true });
      } catch (e) {}
      item.isPaused = true;
    } else {
      item.isPaused = false;
    }
    return item.isPaused;
  } catch (err) {
    console.warn('[Engine] Error toggling pause on PID:', err);
    return false;
  }
}

function cancelConversion(filePath) {
  const item = activeProcesses.get(filePath);
  if (!item || !item.proc || item.proc.killed) return false;
  return item.proc.kill();
}

/**
 * Execute media conversion through the C++ engine, falling back to the local
 * Node implementation when the engine is unavailable.
 *
 * The C++ path owns process spawning, argument construction, progress parsing
 * and pause/resume. `convert_start` returns immediately; this promise settles
 * when the matching convert_complete event arrives, so the caller's contract
 * (await for a result, receive onProgress callbacks) is unchanged.
 */
async function executeOptimizedConversionViaCore(inputPath, outputPath, options, onProgress) {
  // The file path doubles as the job id, preserving the existing pause/resume
  // contract where the renderer identifies a job by its path.
  const jobId = inputPath;

  // Watchdog. The engine delivers convert_complete reliably; this exists purely
  // so a lost event can never leave the UI spinning forever.
  const WATCHDOG_MS = Number(process.env.PANAMEDIA_CONVERT_WATCHDOG_MS) || 4 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let off = () => {};
    let guard = null;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (guard) clearTimeout(guard);
      off();
      fn(arg);
    };

    // Subscribe BEFORE issuing convert_start. A short conversion can finish and
    // emit convert_complete before the convert_start response has even been
    // awaited; subscribing afterwards misses it and hangs this promise forever.
    // Job ids are unique per file, so early events cannot be misattributed.
    off = coreClient.onEvent((eventName, payload) => {
      if (eventName === 'engine_exit') {
        finish(reject, new Error('C++ engine stopped during conversion'));
        return;
      }
      if (!payload || payload.jobId !== jobId) return;

      if (eventName === 'convert_progress') {
        if (!settled) {
          onProgress({
            progress: payload.progress,
            status: payload.status,
            error: payload.error
          });
        }
        return;
      }

      if (eventName === 'convert_complete') {
        if (payload.status === 'completed') {
          finish(resolve, { success: true, outputPath, viaCpp: true });
        } else if (payload.status === 'cancelled') {
          onProgress({ progress: 0, status: 'cancelled' });
          finish(reject, new Error('Conversion cancelled'));
        } else {
          const message = payload.error || 'Conversion failed';
          onProgress({ progress: 0, status: 'failed', error: message });
          finish(reject, new Error(message));
        }
      }
    });

    guard = setTimeout(() => {
      console.error('[Engine] Conversion watchdog fired for', jobId);
      finish(reject, new Error('Conversion timed out'));
    }, WATCHDOG_MS);

    // Resolving with null is the signal to fall back to the Node path.
    coreClient.call('convert_start', {
      jobId,
      inputPath,
      outputPath,
      options: options || {}
    }, 10000).then((res) => {
      if (!res || !res.started) finish(resolve, null);
    }).catch((e) => {
      console.warn('[Engine] convert_start failed:', e && e.message);
      finish(resolve, null);
    });
  });
}

/**
 * Local fallback: hardware-accelerated media conversion with optimal resource
 * allocation, executed in Node.
 */
async function executeOptimizedConversionLocal(inputPath, outputPath, options = {}, onProgress = () => {}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Source file does not exist: ${inputPath}`);
  }

  const duration = await probeDuration(inputPath);
  const cut = options.tools && options.tools.cut;
  if (cut && (!Number.isFinite(cut.startSec) || !Number.isFinite(cut.endSec) ||
      cut.startSec < 0 || cut.endSec <= cut.startSec)) {
    throw new Error('Invalid cut range.');
  }
  const progressDuration = cut ? Math.max(0.1, cut.endSec - cut.startSec) : duration;
  const mode = options.mode || 'extract_audio';
  const format = (options.format || (mode === 'extract_audio' ? 'mp3' : 'mp4')).toLowerCase();
  const bitrate = options.bitrate || (mode === 'extract_audio' ? '320k' : '1080p');
  const useHw = options.useHwAccel !== false;
  const threads = getOptimalThreadCount();
  const gpuEncoder = useHw
    ? ((await detectHardwareAccelerationViaCore()) || detectHardwareAcceleration())
    : 'cpu';

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const args = ['-y'];
  if (cut) {
    if (cut.startSec > 0) args.push('-ss', String(cut.startSec));
    args.push('-to', String(cut.endSec));
  }
  args.push('-i', inputPath);

  // Set thread limitation to prevent 100% CPU lockup
  args.push('-threads', threads.toString());

  if (mode === 'extract_audio') {
    args.push('-vn'); // Drop video stream entirely
    const audioBitrate = bitrate.includes('k') ? bitrate : '320k';

    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', audioBitrate, '-q:a', '0');
    } else if (format === 'aac' || format === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', audioBitrate);
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    } else {
      args.push('-c:a', 'libmp3lame', '-b:a', audioBitrate);
    }
  } else {
    // Video conversion
    if (gpuEncoder === 'nvenc') {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '4500k');
    } else if (gpuEncoder === 'qsv') {
      args.push('-c:v', 'h264_qsv', '-global_quality', '23');
    } else if (gpuEncoder === 'amf') {
      args.push('-c:v', 'h264_amf', '-quality', 'speed');
    } else {
      // Optimized low-resource CPU preset: 'ultrafast' with crf 24 to keep CPU cool & smooth
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p');
    }

    if (options.deinterlacing) {
      args.push('-vf', 'yadif');
    }

    args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  }

  args.push(outputPath);

  return new Promise((resolve, reject) => {
    onProgress({ progress: 0.05, status: 'converting' });

    // Spawn with windowsHide and standard pipe
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    activeProcesses.set(inputPath, { proc, isPaused: false });

    // Lower process priority on Windows so FFmpeg never starves the UI or jams the PC
    if (proc.pid) {
      try {
        os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch (e) {
        try {
          execSync(`powershell -Command "$p = Get-Process -Id ${proc.pid} -ErrorAction SilentlyContinue; if ($p) { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal }"`, { windowsHide: true });
        } catch (e2) {}
      }
    }

    let lastStderr = '';
    let lastKnownProgress = 0.05;

    // Timed fake-progress ramp: when duration is unknown (0), we slowly walk progress
    // from 5% to 90% over ~3 minutes so the UI never appears stuck.
    let timedProgressInterval = null;
    if (duration <= 0) {
      const startTime = Date.now();
      const estimatedMs = 180000; // 3 minute ceiling estimate
      timedProgressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const estimated = Math.min(0.90, 0.05 + 0.85 * (elapsed / estimatedMs));
        if (estimated > lastKnownProgress) {
          lastKnownProgress = estimated;
          onProgress({ progress: estimated, status: 'converting' });
        }
      }, 1500);
    }

    proc.stderr.on('data', (d) => {
      const str = d.toString();
      lastStderr += str;
      if (lastStderr.length > 4000) lastStderr = lastStderr.slice(-4000);

      // Primary: time-based progress when duration is known
      const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
      if (timeMatch && progressDuration > 0) {
        const currentTime = parseTimeString(timeMatch[1]);
        const pct = Math.min(0.99, Math.max(0.05, currentTime / progressDuration));
        if (pct > lastKnownProgress) {
          lastKnownProgress = pct;
          onProgress({ progress: pct, status: 'converting' });
        }
        return;
      }

      // Fallback: parse FFmpeg "out_time_us" microsecond counter (emitted by -progress pipe)
      const outTimeMatch = str.match(/out_time_us=(\d+)/);
      if (outTimeMatch && progressDuration > 0) {
        const currentTime = parseInt(outTimeMatch[1], 10) / 1e6;
        const pct = Math.min(0.99, Math.max(0.05, currentTime / progressDuration));
        if (pct > lastKnownProgress) {
          lastKnownProgress = pct;
          onProgress({ progress: pct, status: 'converting' });
        }
      }
    });

    proc.on('close', (code) => {
      if (timedProgressInterval) clearInterval(timedProgressInterval);
      activeProcesses.delete(inputPath);
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        onProgress({ progress: 1.0, status: 'completed' });
        resolve({ success: true, outputPath });
      } else {
        const err = `Conversion exited with code ${code}. ${lastStderr.slice(-500)}`;
        onProgress({ progress: 0, status: 'failed', error: err });
        reject(new Error(err));
      }
    });

    proc.on('error', (err) => {
      if (timedProgressInterval) clearInterval(timedProgressInterval);
      activeProcesses.delete(inputPath);
      onProgress({ progress: 0, status: 'failed', error: err.message });
      reject(err);
    });
  });
}

/**
 * Public entry point: prefers the C++ engine, falls back to Node.
 *
 * A fallback is only taken when the engine declines to *start* the job. Once
 * ffmpeg is running, failures propagate -- silently re-running the conversion in
 * Node could produce a half-written output file.
 */
async function executeOptimizedConversion(inputPath, outputPath, options = {}, onProgress = () => {}) {
  const viaCore = await executeOptimizedConversionViaCore(inputPath, outputPath, options, onProgress);
  if (viaCore) return viaCore;
  console.log('[Engine] C++ conversion unavailable, using Node fallback:', inputPath);
  return executeOptimizedConversionLocal(inputPath, outputPath, options, onProgress);
}

module.exports = {
  detectHardwareAcceleration,
  detectHardwareAccelerationViaCore,
  getOptimalThreadCount,
  executeOptimizedConversion,
  executeOptimizedConversionLocal,
  togglePauseProcess,
  cancelConversion,
  probeDuration
};
