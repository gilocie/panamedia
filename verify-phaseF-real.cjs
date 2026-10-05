// Phase F real-conversion test: GIF output, segment
// splitting, and denoise filters on a real file.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node verify-phaseF-real.cjs <source-video>');
  process.exit(1);
}

const ffprobe = path.join(process.env.APPDATA || '', 'net-downloader', 'bin', 'ffprobe.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panamedia-f-'));

const engine = spawn('src-cpp/build/bin/Release/panamedia-core.exe', [], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '', q = 0;
const pend = new Map();
engine.stdout.on('data', d => {
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
engine.stderr.on('data', () => {});

const send = (action, payload) => new Promise(res => {
  const id = 'x' + (++q);
  pend.set(id, res);
  engine.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
});

const terminal = ['completed', 'failed', 'cancelled'];

async function run(name, options, outputPath) {
  const t0 = Date.now();
  await send('convert_start', { jobId: name, inputPath: SRC, outputPath, options });
  let st = null, tries = 0;
  for (;;) {
    st = await send('convert_status', { jobId: name });
    if (st && st.status && terminal.includes(st.status)) break;
    if (++tries > 800) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  return { st, secs };
}

function probe(file) {
  return new Promise(res => {
    const pr = spawn(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', file]);
    let out = '';
    pr.stdout.on('data', d => { out += d; });
    pr.on('close', () => { try { res(JSON.parse(out)); } catch (e) { res({ streams: [] }); } });
  });
}

(async () => {
  await new Promise(r => setTimeout(r, 400));
  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`); }
  };
  const cut = { cut: { startSec: 20, endSec: 32 } };

  // GIF: a valid animated GIF file comes out.
  const gifOut = path.join(tmp, 'clip.gif');
  let r = await run('gif', {
    mode: 'convert_video', format: 'gif', useHwAccel: false,
    tools: { ...cut, gif: { fps: 12, width: 320 } }
  }, gifOut);
  check('gif: completed', r.st && r.st.status === 'completed', r.st && r.st.error);
  if (fs.existsSync(gifOut)) {
    const info = await probe(gifOut);
    const v = (info.streams || []).find(s => s.codec_type === 'video');
    check('gif: output is a video/gif stream', !!v, JSON.stringify(info));
    check('gif: no audio stream', !(info.streams || []).some(s => s.codec_type === 'audio'));
    check('gif: file size sane', fs.statSync(gifOut).size > 1000, fs.statSync(gifOut).size + ' bytes');
  } else {
    check('gif: output exists', false);
  }

  // Split: numbered segments, each independently playable.
  const splitOut = path.join(tmp, 'split.mp4');
  r = await run('split', {
    mode: 'convert_video', format: 'mp4', useHwAccel: false,
    tools: { ...cut, split: { segmentSec: 4 } }
  }, splitOut);
  check('split: completed', r.st && r.st.status === 'completed', r.st && r.st.error);
  const pattern = splitOut.replace(/\.mp4$/, '%03d.mp4');
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const m = base.match(/^(.*)%03d(.*)$/);
  const segments = m ? fs.readdirSync(dir)
    .filter(n => n.startsWith(m[1]) && n.endsWith(m[2]))
    .map(n => path.join(dir, n))
    .sort() : [];
  check('split: segments produced', segments.length >= 2, segments.length + ' segments: ' + segments.join(', '));
  if (segments.length > 0) {
    const first = await probe(segments[0]);
    const v = (first.streams || []).find(s => s.codec_type === 'video');
    check('split: first segment playable', !!v, JSON.stringify(first));
  }

  // Denoise: conversion with all three cleanups enabled.
  const dnOut = path.join(tmp, 'clean.mp4');
  r = await run('denoise', {
    mode: 'convert_video', format: 'mp4', useHwAccel: false,
    tools: { ...cut, denoise: { videoDenoise: true, audioDenoise: true, loudness: true } }
  }, dnOut);
  check('denoise: completed', r.st && r.st.status === 'completed', r.st && r.st.error);
  if (fs.existsSync(dnOut)) {
    const info = await probe(dnOut);
    const v = (info.streams || []).find(s => s.codec_type === 'video');
    const a = (info.streams || []).find(s => s.codec_type === 'audio');
    check('denoise: h264/aac out', v && v.codec_name === 'h264' && a && a.codec_name === 'aac');
  }

  engine.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
