// Playback decisions for the streaming server, kept out of electron.cjs so they
// can be tested without booting Electron.
//
// The rule this file exists to enforce: never spend CPU re-encoding something
// the browser can already decode. Every choice here was originally wrong in
// the same direction -- too eager to transcode -- and the cost of that was not
// visible until a 2.5 hour VP9 file was measured at full re-encode.

// Video codecs Chromium decodes itself. HEVC is deliberately absent: its
// support in Chromium varies by Windows build and GPU, so transcoding it is
// the safe choice rather than gambling on the user's hardware.
const NATIVE_VIDEO = ['h264', 'avc1', 'vp8', 'vp9', 'av1', 'av01'];
const NATIVE_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];

// Pixel formats a browser will accept in an MP4/WebM stream.
const NATIVE_PIX_FMT = ['yuv420p', 'yuvj420p', 'yuv420p10le', ''];

/**
 * True when ffmpeg only has to remux: every stream already survives the trip
 * to the browser, and nothing about it needs to change.
 *
 * @param {object} src
 * @param {string} src.videoCodec   e.g. 'h264', 'vp9', 'hevc'
 * @param {string} src.audioCodec
 * @param {string} src.pixelFormat
 * @param {number} src.width
 * @param {number} src.height
 * @param {string} src.quality      'original' | '720p' | '1080p'
 * @param {boolean} src.hasSubtitle a sidecar subtitle forces a burn-in
 * @param {boolean} src.audioOnly
 */
function canStreamCopy(src) {
  const {
    videoCodec = '', audioCodec = '', pixelFormat = '',
    width = 0, height = 0, quality = 'original',
    hasSubtitle = false, audioOnly = false
  } = src || {};

  if (audioOnly) return false;
  // A burned-in subtitle changes pixels, so the video cannot be copied.
  if (hasSubtitle) return false;
  if (!NATIVE_VIDEO.includes(String(videoCodec).toLowerCase())) return false;
  if (!NATIVE_PIX_FMT.includes(String(pixelFormat).toLowerCase())) return false;
  // An audio codec the browser cannot play blocks the copy too, even though
  // the video alone would have been fine.
  if (audioCodec && !NATIVE_AUDIO.includes(String(audioCodec).toLowerCase())) return false;

  // A quality request only forces a transcode when it actually changes the
  // picture. Asking for 1080p on a 1080p source does not.
  const wantsScale =
    (quality === '720p' && (width > 1280 || height > 720)) ||
    (quality === '1080p' && (width > 1920 || height > 1080));
  if (wantsScale) return false;

  if (quality === 'original') return true;
  return width <= 1920 && height <= 1080;
}

/**
 * The rate ceiling for a transcode that genuinely has to happen.
 *
 * Without this, libx264 defaults to CRF 23 -- which on an already
 * well-compressed source emits a *larger* file than the one we started from.
 * That is the worst possible outcome: full CPU cost, more data to stream, and a
 * worse result. So the output is sized from the source and capped.
 */
function transcodeVideoBitrate({ width = 0, height = 0, sourceBitrate = 0 } = {}) {
  const pixels = (width || 0) * (height || 0);
  const ladder =
    pixels >= 1920 * 1080 ? 8000 :
    pixels >= 1280 * 720 ? 4500 : 2000;
  const sourceKbps = sourceBitrate > 0 ? Math.round(sourceBitrate / 1000) : 0;
  return Math.max(300, Math.min(sourceKbps > 0 ? sourceKbps : ladder, ladder * 2));
}

// The arguments for the libx264 half of a real transcode, kept together so the
// rate decision and the flags that consume it cannot drift apart.
function transcodeVideoArgs({ width = 0, height = 0, sourceBitrate = 0 } = {}) {
  const kbps = transcodeVideoBitrate({ width, height, sourceBitrate });
  return [
    '-c:v', 'libx264',
    '-b:v', `${kbps}k`,
    '-maxrate', `${Math.round(kbps * 1.5)}k`,
    '-bufsize', `${kbps * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-g', '30'
  ];
}

const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.oga': 'audio/ogg',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.divx': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mpe': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp',
  '.vob': 'video/mpeg',
  '.rm': 'application/vnd.rn-realmedia',
  '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.asf': 'video/x-ms-asf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/**
 * Parse a single HTTP byte range for a file of a known size.
 *
 * This is the direct-playback path: when the player serves the original bytes
 * with Range support, ffmpeg is never involved and playback costs no CPU at
 * all. Getting it wrong is not cosmetic -- a browser that cannot satisfy its
 * own range request aborts the media element and the player falls back to a
 * full re-encode.
 *
 * Returns one of:
 *   { kind: 'full' }     -- serve the whole file (no Range header, or unparseable)
 *   { kind: 'range', start, end }  -- inclusive byte offsets
 *   { kind: 'unsatisfiable' }      -- 416, the only correct answer
 *
 * @param {string|null} header  the raw Range request header
 * @param {number} fileSize
 */
function parseByteRange(header, fileSize) {
  const whole = { kind: 'full' };

  if (!header || typeof header !== 'string') return whole;
  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match) return whole;

  const spec = match[1].trim();

  // A comma-separated multi-range would need a multipart/byteranges body.
  // Chromium does not send it for media, but ffmpeg's own HTTP client can, and
  // silently answering it with only the first range hands back the wrong
  // bytes. Refusing is safer than lying.
  if (spec.includes(',')) return { kind: 'unsatisfiable' };

  const dash = spec.indexOf('-');
  if (dash === -1) return whole;
  const first = spec.slice(0, dash).trim();
  const last = spec.slice(dash + 1).trim();

  const size = Number(fileSize);
  if (!Number.isFinite(size) || size <= 0) return { kind: 'unsatisfiable' };

  let start;
  let end;

  if (first === '') {
    // Suffix form: bytes=-524288 -- the last N bytes. Chromium uses this to
    // fetch a trailing moov atom, so it must work for files that are not
    // faststart.
    const suffix = parseInt(last, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(first, 10);
    if (!Number.isFinite(start) || start < 0) return { kind: 'unsatisfiable' };
    if (start >= size) {
      // The old code answered this with a 206 whose Content-Range had a
      // negative length, and createReadStream then failed with a 500. A
      // browser seeking to exactly the end of a file hits this legitimately.
      return { kind: 'unsatisfiable' };
    }
    end = last === '' ? size - 1 : parseInt(last, 10);
    if (!Number.isFinite(end)) return { kind: 'unsatisfiable' };
    if (end < start) return { kind: 'unsatisfiable' };
    if (end > size - 1) end = size - 1;
  }

  return { kind: 'range', start, end };
}

/**
 * Content-Type for a served file.
 *
 * There is deliberately no 'video/mp4' fallback. Guessing a container we have
 * not confirmed makes the browser reject files it could otherwise have played:
 * an FLV served as video/mp4 simply fails to load, and the resulting error
 * points nowhere near the real cause. 'application/octet-stream' at least lets
 * the browser sniff, and the player falls back to /transcode if it cannot cope.
 */
function contentTypeForPath(filePath) {
  if (!filePath) return 'application/octet-stream';
  // .net.ts and friends: match the longest suffix, not the last dot.
  const lower = String(filePath).toLowerCase().split('?')[0];
  if (lower.endsWith('.net.ts')) return 'video/mp2t';
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  const ext = lower.slice(dot);
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

module.exports = {
  NATIVE_VIDEO,
  NATIVE_AUDIO,
  NATIVE_PIX_FMT,
  CONTENT_TYPES,
  canStreamCopy,
  transcodeVideoBitrate,
  transcodeVideoArgs,
  contentTypeForPath,
  parseByteRange
};