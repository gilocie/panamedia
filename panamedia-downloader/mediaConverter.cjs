/**
 * Panamedia Media Converter Engine
 * Handles high-speed audio extraction (MP3, AAC, M4A, WAV) and video conversion
 * using bundled static FFmpeg binaries with progress tracking.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ffmpegPath } = require('./youtube.cjs');

const { executeOptimizedConversion, togglePauseProcess } = require('./conversion-engine/hardwareEngine.cjs');

/**
 * Extracts audio or converts video using the conversion engine.
 *
 * Delegates to hardwareEngine, which routes to the C++ engine when it is
 * available and falls back to a local Node implementation otherwise.
 */
async function convertMediaFile(inputPath, outputPath, options = {}, onProgress = () => {}) {
  return executeOptimizedConversion(inputPath, outputPath, options, onProgress);
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
  convertMediaFile,
  convertAndSendToDrive,
  togglePauseProcess
};
