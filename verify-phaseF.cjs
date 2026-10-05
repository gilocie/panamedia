// Phase F verification: the last fake settings become real.
// highQuality tier, GIF palette encoding, denoise filters,
// segment splitting.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const p = spawn('src-cpp/build/bin/Release/panamedia-core.exe', [], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '', q = 0;
const pend = new Map();
p.stdout.on('data', d => {
  buf += d;
  let n;
  while ((n = buf.indexOf('\n')) !== -1) {
    const l = buf.slice(0, n).trim();
    buf = buf.slice(n + 1);
    if (!l) continue;
    let m;
    try { m = JSON.parse(l); } catch { continue; }
    const r = pend.get(m.id);
    if (r) { pend.delete(m.id); r(m.payload); }
  }
});
p.stderr.on('data', () => {});

const send = (action, payload) => new Promise(res => {
  const id = 'x' + (++q);
  pend.set(id, res);
  p.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
});

const SRC = process.argv[2];
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`); }
};

(async () => {
  await new Promise(r => setTimeout(r, 400));
  const base = { inputPath: 'IN', outputPath: 'OUT', options: {} };

  // 1. High Quality tier changes the encoder knobs.
  const hq = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false, highQuality: true }
  });
  check('HQ: preset medium', hq.args.includes('-preset medium'), hq.args);
  check('HQ: crf 22', hq.args.includes('-crf 22'), hq.args);
  const lq = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false }
  });
  check('default: preset ultrafast', lq.args.includes('-preset ultrafast'), lq.args);
  check('default: crf 24', lq.args.includes('-crf 24'), lq.args);

  const hqW = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'webm', useHwAccel: false, highQuality: true }
  });
  check('HQ webm: crf 30', hqW.args.includes('-crf 30'), hqW.args);
  const hqA = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'avi', useHwAccel: false, highQuality: true }
  });
  check('HQ avi: q:v 2', hqA.args.includes('-q:v 2'), hqA.args);

  // 2. GIF: palette chain, loop, no audio.
  const gif = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { gif: { fps: 15, width: 480 } }
    }
  });
  check('gif: filter_complex', gif.args.includes('-filter_complex'), gif.args);
  check('gif: palettegen/paletteuse',
    gif.args.includes('palettegen[p]') && gif.args.includes('paletteuse'), gif.args);
  check('gif: fps+scale in chain', gif.args.includes('fps=15,scale=480:-1:flags=lanczos'), gif.args);
  check('gif: -loop 0', gif.args.includes('-loop 0'), gif.args);
  check('gif: -an', gif.args.includes('-an'), gif.args);
  check('gif: no h264 codec', !gif.args.includes('libx264'), gif.args);

  // 3. Denoise: video filter + audio filters.
  const dn = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { denoise: { videoDenoise: true, audioDenoise: true, loudness: true } }
    }
  });
  check('denoise: hqdn3d in -vf', dn.args.includes('hqdn3d'), dn.args);
  check('denoise: -af afftdn,loudnorm', dn.args.includes('-af afftdn,loudnorm'), dn.args);
  const dnNone = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { denoise: { videoDenoise: false, audioDenoise: false, loudness: false } }
    }
  });
  check('denoise off: no -af', !dnNone.args.includes('-af'), dnNone.args);
  check('denoise off: no hqdn3d', !dnNone.args.includes('hqdn3d'), dnNone.args);

  // 4. Split: segment muxing with a numbered pattern.
  const sp = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { split: { segmentSec: 90 } }
    }
  });
  check('split: -f segment', sp.args.includes('-f segment'), sp.args);
  check('split: -segment_time 90', sp.args.includes('-segment_time 90'), sp.args);
  check('split: -reset_timestamps 1', sp.args.includes('-reset_timestamps 1'), sp.args);
  check('split: %03d pattern', sp.args.includes('OUT%03d') || sp.args.includes('OUT%03d.mp4'), sp.args);

  console.log(`\n${pass} passed, ${fail} failed`);
  p.kill();
  process.exit(fail === 0 ? 0 : 1);
})();
