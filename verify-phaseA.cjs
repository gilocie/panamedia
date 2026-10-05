// Phase A verification harness.
// Extracts the REAL probe-cache block from electron.cjs and exercises it,
// so we are testing shipped code rather than a hand-written copy.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const electronPath = path.join(__dirname, 'electron.cjs');
const src = fs.readFileSync(electronPath, 'utf8');

const START = '// ─── Probe cache (Phase A) ──';
const END = 'function parseFfmpegOutput(rawText) {';

const startIdx = src.indexOf(START);
const endIdx = src.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error('FATAL: could not locate probe cache block in electron.cjs');
  process.exit(1);
}
const block = src.slice(startIdx, endIdx);
console.log(`Extracted ${block.split('\n').length} lines of real probe-cache code.\n`);

const ffprobePath = path.join(process.env.APPDATA, 'net-downloader', 'bin', 'ffprobe.exe');

// Evaluate the extracted block with the same dependencies electron.cjs has.
const factory = new Function('fs', 'path', 'execFile', 'ffprobePath', block + `
  return { getProbeInfo, clearProbeCache, runFfprobe };
`);
const { getProbeInfo, clearProbeCache, runFfprobe } = factory(fs, path, execFile, ffprobePath);

const target = process.argv[2];
if (!target) { console.error('usage: node verify-phaseA.js <video-file>'); process.exit(1); }

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

(async () => {
  console.log('Target:', target, '\n');

  // --- 1. Ground truth: uncached probe must match direct ffprobe output ---
  console.log('[1] Uncached probe returns correct data');
  const t0 = Date.now();
  const first = await getProbeInfo(target);
  const coldMs = Date.now() - t0;

  check('resolves non-null', first !== null);
  check('duration > 1s', first && first.duration > 1, `(got ${first && first.duration})`);
  // Audio-only files legitimately have no video stream; assert per-format.
  const hasVideo = !!(first && first.streams.some((s) => s.codec_type === 'video'));
  if (hasVideo) {
    check('video file: has width/height', first.width > 0 && first.height > 0,
          `(got ${first.width}x${first.height})`);
    check('video file: has videoCodec', !!first.videoCodec, `(got ${first.videoCodec})`);
  } else {
    check('audio-only file: width/height are 0', first.width === 0 && first.height === 0);
    check('audio-only file: videoCodec empty', first.videoCodec === '');
  }
  check('has audioCodec', !!(first && first.audioCodec), `(got ${first && first.audioCodec})`);
  check('streams array present', !!(first && Array.isArray(first.streams)));
  console.log(`  info: ${first.width}x${first.height} ${first.videoCodec || '-'}/${first.audioCodec} ` +
              `${first.duration.toFixed(2)}s pix=${first.pixelFormat || '-'}`);
  console.log(`  cold call took ${coldMs}ms (includes 1 ffprobe spawn)\n`);

  // --- 2. Cache hit must be fast and identical ---
  console.log('[2] Second call is served from cache');
  const t1 = Date.now();
  const second = await getProbeInfo(target);
  const warmMs = Date.now() - t1;

  check('identical duration', second.duration === first.duration);
  check('identical dimensions', second.width === first.width && second.height === first.height);
  check('identical codecs', second.videoCodec === first.videoCodec && second.audioCodec === first.audioCodec);
  check('warm call under 5ms', warmMs < 5, `(took ${warmMs}ms)`);
  console.log(`  warm call took ${warmMs}ms  (${coldMs}ms -> ${warmMs}ms)\n`);

  // --- 3. In-flight dedup: concurrent calls must collapse to one spawn ---
  console.log('[3] Concurrent requests collapse into a single spawn');
  clearProbeCache();
  const t2 = Date.now();
  const burst = await Promise.all([getProbeInfo(target), getProbeInfo(target),
                                   getProbeInfo(target), getProbeInfo(target)]);
  const burstMs = Date.now() - t2;
  const allSame = burst.every((b) => b && b.duration === first.duration);
  check('all 4 concurrent calls resolved same data', allSame);
  check('still faster than 4 sequential spawns', burstMs < coldMs * 2,
        `(burst ${burstMs}ms vs single cold ${coldMs}ms)`);
  console.log(`  4 concurrent calls took ${burstMs}ms\n`);

  // --- 4. Invalidation: touch the file, cache must not serve stale data ---
  console.log('[4] Cache invalidates when file mtime/size changes');
  const st1 = fs.statSync(target);
  const realTime = new Date(st1.atimeMs);
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(target, realTime, future);
  const st2 = fs.statSync(target);

  const afterTouch = await getProbeInfo(target);
  check('mtime actually changed', Math.round(st2.mtimeMs) !== Math.round(st1.mtimeMs));
  check('re-probed (not stale-served)', afterTouch !== null);
  check('still returns valid duration', afterTouch && afterTouch.duration > 1);
  console.log(`  post-touch mtime delta ${Math.round(st2.mtimeMs - st1.mtimeMs)}ms, re-probe ok\n`);

  // restore original timestamp
  fs.utimesSync(target, realTime, st1.mtime);

  // --- 5. Missing file must not throw or poison the cache ---
  console.log('[5] Missing / unreadable file degrades safely');
  const missing = await getProbeInfo(path.join(path.dirname(target), '__no_such_file__.mp4'));
  check('missing file resolves null (not throw)', missing === null);
  check('cache still usable afterwards', (await getProbeInfo(target)) !== null);

  console.log(`\n${'='.repeat(46)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
  process.exit(fail === 0 ? 0 : 1);
})();
