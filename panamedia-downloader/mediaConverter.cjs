/**
 * Panamedia Media Converter Engine
 * Handles high-speed audio extraction (MP3, AAC, M4A, WAV) and video conversion
 * using bundled static FFmpeg binaries with progress tracking.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ffmpegPath, ffprobePath } = require('./youtube.cjs');

/**
 * Probes media duration in seconds via ffprobe.
 */
function probeDuration(filePath) {
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

/**
 * Parses time string HH:MM:SS.ms into seconds.
 */
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

const { executeOptimizedConversion, togglePauseProcess } = require('./conversion-engine/hardwareEngine.cjs');

/**
 * Extracts audio or converts video using Hardware-accelerated / resource-optimized engine.
 */
async function convertMediaFile(inputPath, outputPath, options = {}, onProgress = () => {}) {
  return executeOptimizedConversion(inputPath, outputPath, options, onProgress);
}

async function convertMediaFileLegacy(inputPath, outputPath, options = {}, onProgress = () => {}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Source file does not exist: ${inputPath}`);
  }

  const duration = await probeDuration(inputPath);
  const mode = options.mode || 'extract_audio';
  const format = (options.format || 'mp3').toLowerCase();
  const bitrate = options.bitrate || '192k';

  // Ensure target directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const args = ['-y', '-i', inputPath];

  if (mode === 'extract_audio') {
    args.push('-vn'); // Drop video stream
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate, '-q:a', '2');
    } else if (format === 'aac') {
      args.push('-c:a', 'aac', '-b:a', bitrate);
    } else if (format === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', bitrate);
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    }
  } else if (mode === 'convert_video') {
    if (format === '3gp') {
      // 3GP Profile for small mobile and feature phones (320px width, MPEG-4 + AAC)
      args.push(
        '-c:v', 'mpeg4',
        '-vtag', 'mp4v',
        '-vf', 'scale=320:-2',
        '-r', '20',
        '-b:v', '384k',
        '-c:a', 'aac',
        '-ac', '1',
        '-ar', '22050',
        '-b:a', '64k'
      );
    } else if (format === 'avi') {
      // AVI Profile (XVID + MP3) for car stereos and standalone DVD players
      args.push(
        '-c:v', 'mpeg4',
        '-vtag', 'XVID',
        '-qscale:v', '4',
        '-c:a', 'libmp3lame',
        '-b:a', '128k'
      );
    } else if (format === 'mkv') {
      // High Quality MKV Matroska
      args.push(
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', bitrate || '192k'
      );
    } else {
      // Universal MP4 profile (H.264 Baseline/Main + AAC) for 100% compatibility with TVs, phones, PC
      args.push(
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', bitrate || '192k',
        '-movflags', '+faststart'
      );
    }
  }

  args.push(outputPath);

  return new Promise((resolve, reject) => {
    onProgress({ progress: 0.05, status: 'converting' });

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let lastStderr = '';

    proc.stderr.on('data', (d) => {
      const str = d.toString();
      lastStderr += str;
      if (lastStderr.length > 2000) lastStderr = lastStderr.slice(-2000);

      // Parse FFmpeg time progress: time=00:01:23.45
      const timeMatch = str.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
      if (timeMatch && duration > 0) {
        const currentTime = parseTimeString(timeMatch[1]);
        const pct = Math.min(0.98, Math.max(0.05, currentTime / duration));
        onProgress({ progress: pct, status: 'converting' });
      }
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        onProgress({ progress: 1.0, status: 'completed' });
        resolve({ success: true, outputPath });
      } else {
        const err = `Conversion exited with code ${code}. ${lastStderr.slice(-300)}`;
        onProgress({ progress: 0, status: 'failed', error: err });
        reject(new Error(err));
      }
    });

    proc.on('error', (err) => {
      onProgress({ progress: 0, status: 'failed', error: err.message });
      reject(err);
    });
  });
}

/**
 * Prepares and sends a file to a destination drive (e.g. USB flash drive or local disk).
 * Automatically converts or extracts audio according to user preference while leaving the source file untouched.
 */
async function convertAndSendToDrive(filePath, driveLetter, options = {}, onProgress = () => {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Source file does not exist');
  }

  const mode = options.mode || 'original';
  const format = (options.format || (mode === 'extract_audio' ? 'mp3' : 'mp4')).toLowerCase();
  const bitrate = options.bitrate || '192k';

  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let targetFilename;
  if (mode === 'extract_audio') {
    targetFilename = `${baseName}.${format}`;
  } else if (mode === 'convert_video') {
    targetFilename = `${baseName}_converted.${format}`;
  } else {
    targetFilename = path.basename(filePath);
  }

  const destPath = path.join(driveLetter, targetFilename);

  if (mode === 'original') {
    // Fast stream copy directly to drive
    return copyDirectToDrive(filePath, destPath, onProgress);
  }

  // Convert or extract directly to target drive
  return convertMediaFile(filePath, destPath, { mode, format, bitrate }, onProgress);
}

/**
 * Standard stream copy with live progress
 */
function copyDirectToDrive(src, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(src);
    const totalBytes = stat.size;
    let copiedBytes = 0;

    const readStream = fs.createReadStream(src);
    const writeStream = fs.createWriteStream(dest);

    readStream.on('data', (chunk) => {
      copiedBytes += chunk.length;
      const progress = totalBytes > 0 ? (copiedBytes / totalBytes) : 0;
      onProgress({ progress, status: 'copying' });
    });

    writeStream.on('finish', () => {
      onProgress({ progress: 1.0, status: 'completed' });
      resolve({ success: true, destPath: dest });
    });

    const handleError = (err) => {
      try { readStream.destroy(); } catch (e) {}
      try { writeStream.destroy(); } catch (e) {}
      onProgress({ progress: 0, status: 'failed', error: err.message });
      reject(err);
    };

    readStream.on('error', handleError);
    writeStream.on('error', handleError);
    readStream.pipe(writeStream);
  });
}

module.exports = {
  probeDuration,
  convertMediaFile,
  convertAndSendToDrive,
  togglePauseProcess
};
