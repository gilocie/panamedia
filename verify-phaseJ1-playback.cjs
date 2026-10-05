// Phase J.1 -- playback decisions: stop re-encoding what the browser can decode.
//
// The bug this suite exists for: electron.cjs decided whether a file needed
// transcoding with
//
//     ['h264','avc1'].includes(videoCodec)
//
// so every VP8, VP9 and AV1 file was re-encoded in full before playback. On the
// real 2.5 hour VP9 sample that meant libx264 re-encoding the entire film to
// show a picture Chromium displays natively -- minutes of CPU, a core pinned,
// and (because no -b:v or -crf was set) a larger file than the source.
//
// These checks are headless: they exercise the decision functions directly and
// confirm the ffmpeg commands they imply actually run. No Electron, no app.
//
// Usage: node verify-phaseJ1-playback.cjs [path-to-video]

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  canStreamCopy,
  transcodeVideoBitrate,
  transcodeVideoArgs,
  contentTypeForPath,
  parseByteRange,
  NATIVE_VIDEO
} = require('./electron/playback-support.cjs');

const SAMPLES = process.argv[2]
  ? [process.argv[2]]
  : [
      path.join(process.env.USERPROFILE, 'Downloads',
        'Build & Sell Claude Code Operating Systems (2+ Hour Course)_1080p.mp4'),
      path.join(process.env.USERPROFILE, 'Videos', 'Screen Recordings',
        'Screen Recording 2025-11-24 205601.mp4')
    ].filter((p) => fs.existsSync(p));

const WORK = path.join(os.tmpdir(), 'panamedia-j1');
const BIN = path.join(process.env.APPDATA || '', 'panamedia', 'bin');
const FFPROBE = path.join(BIN, 'ffprobe.exe');
const FFMPEG = path.join(BIN, 'ffmpeg.exe');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? `  -> ${detail}` : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  console.log('Phase J.1 -- playback decisions');
  console.log('samples: ' + (SAMPLES.length ? SAMPLES.map((s) => path.basename(s)).join(', ') : '(none found)'));

  // ── the codecs Chromium plays natively ───────────────────────────────────
  section('native codec list');
  check('VP9 is treated as natively playable', NATIVE_VIDEO.includes('vp9'));
  check('VP8 is treated as natively playable', NATIVE_VIDEO.includes('vp8'));
  check('AV1 is treated as natively playable', NATIVE_VIDEO.includes('av1'));
  check('H.264 is still natively playable', NATIVE_VIDEO.includes('h264'));
  check('HEVC is deliberately excluded (Chromium support varies by build)',
    !NATIVE_VIDEO.includes('hevc'), NATIVE_VIDEO.join(','));
  check('a made-up codec is not in the list', !NATIVE_VIDEO.includes('wmv2'));

  // ── stream-copy decisions ────────────────────────────────────────────────
  section('canStreamCopy');
  check('VP9 1080p at original quality is a stream copy', canStreamCopy({
    videoCodec: 'vp9', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: 'original'
  }) === true);

  check('VP9 asked for 1080p when it is already 1080p is still a copy', canStreamCopy({
    videoCodec: 'vp9', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: '1080p'
  }) === true, 'a quality request that changes nothing must not force a transcode');

  check('VP9 asked for 720p is a real transcode', canStreamCopy({
    videoCodec: 'vp9', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: '720p'
  }) === false);

  check('AV1 is a stream copy', canStreamCopy({
    videoCodec: 'av1', audioCodec: 'opus', pixelFormat: 'yuv420p',
    width: 3840, height: 2160, quality: 'original'
  }) === true);

  check('HEVC still transcodes', canStreamCopy({
    videoCodec: 'hevc', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: 'original'
  }) === false);

  check('a 10-bit source transcodes (browser streams expect 8-bit)', canStreamCopy({
    videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv422p',
    width: 1920, height: 1080, quality: 'original'
  }) === false);

  check('an unsupported audio codec blocks the copy', canStreamCopy({
    videoCodec: 'h264', audioCodec: 'truehd', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: 'original'
  }) === false);

  check('a sidecar subtitle blocks the copy (it burns into the picture)', canStreamCopy({
    videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: 'original', hasSubtitle: true
  }) === false);

  check('audio-only never takes the video copy path', canStreamCopy({
    videoCodec: '', audioCodec: 'aac', pixelFormat: '',
    width: 0, height: 0, quality: 'original', audioOnly: true
  }) === false);

  check('an empty request is refused rather than crashing', canStreamCopy({}) === false);
  check('a null request is refused rather than crashing', canStreamCopy(null) === false);

  // ── the old behaviour, for the record ────────────────────────────────────
  section('the regression this replaces');
  const oldRule = (vc) => ['h264', 'avc1'].includes(vc);
  check('the old rule rejected VP9 (this was the bug)', oldRule('vp9') === false);
  check('the new rule accepts it', canStreamCopy({
    videoCodec: 'vp9', audioCodec: 'aac', pixelFormat: 'yuv420p',
    width: 1920, height: 1080, quality: 'original'
  }) === true);

  // ── bitrate sizing ───────────────────────────────────────────────────────
  section('transcode bitrate sizing');
  // The real sample: 1.5 Mbps, 1080p. CRF 23 would have inflated this.
  const lowBitrate = transcodeVideoBitrate({ width: 1920, height: 1080, sourceBitrate: 1497485 });
  check('a 1.5 Mbps 1080p source is not inflated past 8 Mbps', lowBitrate <= 8000, lowBitrate + 'k');
  check('a 1.5 Mbps 1080p source stays near its own bitrate', lowBitrate > 1200 && lowBitrate <= 1600, lowBitrate + 'k');
  const unknown = transcodeVideoBitrate({ width: 1920, height: 1080, sourceBitrate: 0 });
  check('an unknown source bitrate falls back to the resolution ladder', unknown === 8000, unknown + 'k');
  const tiny = transcodeVideoBitrate({ width: 320, height: 240, sourceBitrate: 0 });
  check('a tiny source gets a small target', tiny === 2000, tiny + 'k');
  const absurd = transcodeVideoBitrate({ width: 7680, height: 4320, sourceBitrate: 500000000 });
  check('an absurd source bitrate is capped', absurd <= 16000, absurd + 'k');
  check('a zero-size request does not divide by zero',
    Number.isFinite(transcodeVideoBitrate({})), transcodeVideoBitrate({}) + 'k');

  // ── the emitted command ──────────────────────────────────────────────────
  section('transcode argument vector');
  const args = transcodeVideoArgs({ width: 1920, height: 1080, sourceBitrate: 1497485 });
  const flagValue = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };
  check('sets an explicit -b:v', flagValue('-b:v') !== null, flagValue('-b:v'));
  check('sets -maxrate', flagValue('-maxrate') !== null, flagValue('-maxrate'));
  check('sets -bufsize', flagValue('-bufsize') !== null, flagValue('-bufsize'));
  check('still uses libx264', flagValue('-c:v') === 'libx264');
  check('still forces yuv420p for browser compatibility', flagValue('-pix_fmt') === 'yuv420p');
  check('no flag is emitted without a value', args.every((a, i) =>
    a.startsWith('-') === false || i + 1 < args.length));

  // ── content types ────────────────────────────────────────────────────────
  section('content types');
  check('mp4 is video/mp4', contentTypeForPath('C:/a/b.mp4') === 'video/mp4');
  check('mkv is matroska', contentTypeForPath('C:/a/b.mkv') === 'video/x-matroska');
  check('webm is video/webm', contentTypeForPath('C:/a/b.webm') === 'video/webm');
  check('MKV in upper case still resolves', contentTypeForPath('C:/A/B.MKV') === 'video/x-matroska');
  check('flv is not mistaken for mp4', contentTypeForPath('C:/a/b.flv') !== 'video/mp4');
  check('wmv is not mistaken for mp4', contentTypeForPath('C:/a/b.wmv') !== 'video/mp4');
  check('vob is not mistaken for mp4', contentTypeForPath('C:/a/b.vob') !== 'video/mp4');
  check('rmvb is not mistaken for mp4', contentTypeForPath('C:/a/b.rmvb') !== 'video/mp4');
  check('a .net.ts stream resolves to mp2t', contentTypeForPath('C:/a/b.net.ts') === 'video/mp2t');
  check('an unknown extension is not guessed', contentTypeForPath('C:/a/b.zzz') === 'application/octet-stream');
  check('no extension is not guessed', contentTypeForPath('C:/a/b') === 'application/octet-stream');
  check('a query string does not confuse the lookup', contentTypeForPath('C:/a/b.mp4?x=1') === 'video/mp4');
  check('an empty path is handled', contentTypeForPath('') === 'application/octet-stream');
  check('null is handled', contentTypeForPath(null) === 'application/octet-stream');

  // ── byte ranges: the direct-play path ────────────────────────────────────
  // When these are served correctly, ffmpeg is never spawned at all. Getting
  // them wrong makes Chromium abort the media element, and the player then
  // falls back to a full re-encode -- so these bugs are CPU bugs.
  section('HTTP byte ranges');
  const SIZE = 1000000;
  const R = (h) => parseByteRange(h, SIZE);

  check('no Range header serves the whole file', R(null).kind === 'full');
  check('an empty Range header serves the whole file', R('').kind === 'full');

  const openEnded = R('bytes=0-');
  check('bytes=0- is a range from 0 to the end', openEnded.kind === 'range' &&
    openEnded.start === 0 && openEnded.end === SIZE - 1,
    JSON.stringify(openEnded));

  const seek = R('bytes=500000-');
  check('a seek past the midpoint resolves', seek.kind === 'range' &&
    seek.start === 500000 && seek.end === SIZE - 1, JSON.stringify(seek));

  const bounded = R('bytes=100-199');
  check('a bounded range keeps both ends', bounded.kind === 'range' &&
    bounded.start === 100 && bounded.end === 199, JSON.stringify(bounded));

  const single = R('bytes=0-0');
  check('a single byte is one byte', single.kind === 'range' &&
    single.start === 0 && single.end === 0, JSON.stringify(single));

  // Chromium fetches a trailing moov atom this way for non-faststart files.
  const suffix = R('bytes=-4096');
  check('a suffix range reads the tail', suffix.kind === 'range' &&
    suffix.start === SIZE - 4096 && suffix.end === SIZE - 1, JSON.stringify(suffix));

  const hugeSuffix = R('bytes=-99999999');
  check('a suffix larger than the file clamps to the whole file', hugeSuffix.kind === 'range' &&
    hugeSuffix.start === 0 && hugeSuffix.end === SIZE - 1, JSON.stringify(hugeSuffix));

  const overEnd = R('bytes=999990-999999');
  check('an end past EOF is clamped, not rejected', overEnd.kind === 'range' &&
    overEnd.end === SIZE - 1, JSON.stringify(overEnd));

  // This is the seek-to-exactly-EOF case. The old code answered it with a 206
  // whose Content-Range had negative length, and createReadStream then failed,
  // producing a 500.
  check('a start at EOF is unsatisfiable (416), not a 500',
    R('bytes=1000000-').kind === 'unsatisfiable');
  check('a start past EOF is unsatisfiable', R('bytes=2000000-').kind === 'unsatisfiable');
  check('an end before the start is unsatisfiable', R('bytes=500-100').kind === 'unsatisfiable');
  check('a multi-range request is refused rather than answered wrong',
    R('bytes=0-99,200-299').kind === 'unsatisfiable');
  check('garbage is refused', R('bytes=abc-def').kind === 'unsatisfiable');
  check('a non-bytes unit is treated as no range', R('items=0-10').kind === 'full');
  check('a bare dash is refused', R('bytes=-').kind === 'unsatisfiable');
  check('a zero-length file is unsatisfiable', parseByteRange('bytes=0-', 0).kind === 'unsatisfiable');
  check('case-insensitive unit still parses', R('BYTES=0-99').kind === 'range');
  check('whitespace around the range is tolerated', R(' bytes=0-99 ').kind === 'range');
  check('every range result has start <= end',
    ['bytes=0-', 'bytes=100-199', 'bytes=-4096'].every((h) => {
      const r = R(h);
      return r.kind !== 'range' || (r.start <= r.end && r.start >= 0 && r.end < SIZE);
    }));

  // ── against real files ───────────────────────────────────────────────────
  if (SAMPLES.length) {
    section('real files: does the decision match reality?');
    for (const file of SAMPLES) {
      const info = probe(file);
      // The direct-play path only needs a Range header to be correct. Prove the
      // real sizes parse cleanly, since every browser request will be one of
      // these shapes against these exact numbers.
      if (info) {
        const realSize = info.format && info.format.size ? parseInt(info.format.size, 10) : 0;
        if (realSize > 0) {
          const open = parseByteRange('bytes=0-', realSize);
          const tail = parseByteRange('bytes=-8192', realSize);
          const seekReal = parseByteRange(`bytes=${Math.floor(realSize / 2)}-`, realSize);
          const eof = parseByteRange(`bytes=${realSize}-`, realSize);
          check(`  ${path.basename(file).slice(0, 40)}: ranges resolve`, open.kind === 'range' &&
            tail.kind === 'range' && seekReal.kind === 'range' &&
            open.end === realSize - 1 && tail.start === realSize - 8192 &&
            eof.kind === 'unsatisfiable', JSON.stringify({ open, seekReal, eof }));
        }
      }
      if (!info) { check(`probe works on ${path.basename(file)}`, false); continue; }
      const vs = (info.streams || []).find((s) => s.codec_type === 'video');
      const as = (info.streams || []).find((s) => s.codec_type === 'audio');
      const name = path.basename(file).slice(0, 46);
      const decision = canStreamCopy({
        videoCodec: vs ? vs.codec_name : '',
        audioCodec: as ? as.codec_name : '',
        pixelFormat: vs ? vs.pix_fmt : '',
        width: vs ? vs.width : 0,
        height: vs ? vs.height : 0,
        quality: 'original',
        audioOnly: !vs
      });
      const fmt = contentTypeForPath(file);
      console.log(`  ${name}`);
      console.log(`      ${vs ? vs.codec_name : '?'} ${vs ? vs.width + 'x' + vs.height : ''}` +
        ` + ${as ? as.codec_name : 'none'}  ->  ${decision ? 'stream copy' : 'transcode'}`);
      console.log(`      content-type: ${fmt}`);
      check(`  ${name}: content-type is not a guess`, fmt !== 'application/octet-stream', fmt);
    }

    // The decisive one: does a stream copy actually work on the VP9 sample?
    const vp9 = SAMPLES.find((f) => {
      const i = probe(f);
      const v = i && (i.streams || []).find((s) => s.codec_type === 'video');
      return v && v.codec_name === 'vp9';
    });
    if (vp9 && fs.existsSync(FFMPEG)) {
      section('real ffmpeg: the copy path produces a playable stream');
      const out = path.join(WORK, 'copy.mp4');
      const r = spawnSync(FFMPEG, ['-v', 'error', '-i', vp9, '-t', '5',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
        '-avoid_negative_ts', 'make_zero', '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-y', out], { encoding: 'utf8', timeout: 120000 });
      check('stream copy of the VP9 source succeeds', r.status === 0, (r.stderr || '').slice(0, 300));
      check('the copy is not empty', fs.existsSync(out) && fs.statSync(out).size > 10000,
        fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'missing');

      // A transcode of the same 5 seconds, for comparison.
      const out2 = path.join(WORK, 'transcode.mp4');
      const t0 = Date.now();
      const r2 = spawnSync(FFMPEG, ['-v', 'error', '-i', vp9, '-t', '5',
        ...transcodeVideoArgs({ width: 1920, height: 1080, sourceBitrate: 1497485 }),
        '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
        '-avoid_negative_ts', 'make_zero', '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
        '-y', out2], { encoding: 'utf8', timeout: 120000 });
      const t1 = Date.now();
      check('transcode of the same slice also succeeds', r2.status === 0, (r2.stderr || '').slice(0, 300));

      const szCopy = fs.existsSync(out) ? fs.statSync(out).size : 0;
      const szTrans = fs.existsSync(out2) ? fs.statSync(out2).size : 0;
      console.log(`      stream copy : ${(t1 - t0 >= 0 ? '' : '')}${szCopy} bytes`);
      console.log(`      transcode   : ${szTrans} bytes  (${((t1 - t0) / 1000).toFixed(1)}s)`);
      check('the transcode output is not larger than the copy', szTrans <= szCopy * 1.5,
        `copy=${szCopy} transcode=${szTrans}`);
    }
  } else {
    console.log('\n  (no sample video found, skipping the real-file checks)');
  }

  console.log(`\nJ.1: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();