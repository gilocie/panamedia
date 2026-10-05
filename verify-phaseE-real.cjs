// Phase E real-conversion verification: converts a real file into
// every format and probes the output so the container/codec pairing
// is proven, not just the generated command line.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node verify-phaseE-real.cjs <source-video>');
  process.exit(1);
}

// The bundled ffprobe under %APPDATA%\panamedia\bin is corrupt on
// this machine; the net-downloader copy is healthy. Use it for
// verification only -- the engine's BinaryResolver does the same
// skip at runtime.
const ffprobe = path.join(process.env.APPDATA || '', 'net-downloader', 'bin', 'ffprobe.exe');
if (!fs.existsSync(ffprobe)) {
  console.error('no working ffprobe at ' + ffprobe);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panamedia-e-'));

// A tiny subtitle file for the soft-mux test.
const srt = path.join(tmp, 'en.srt');
fs.writeFileSync(srt, [
  '1', '00:00:01,000 --> 00:00:04,000', 'Phase E soft subtitle test', '',
  '2', '00:00:05,000 --> 00:00:08,000', 'Second subtitle line', ''
].join('\r\n'));

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

function probeFile(file) {
  return new Promise(res => {
    const pr = spawn(ffprobe, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,height',
      '-of', 'json', file
    ]);
    let out = '';
    pr.stdout.on('data', d => { out += d; });
    pr.on('close', () => {
      try { res(JSON.parse(out)); } catch (e) { res({ streams: [] }); }
    });
  });
}

const terminal = ['completed', 'failed', 'cancelled'];

async function convertAndProbe(name, options, expect) {
  const out = path.join(tmp, `${name}.${options.format}`);
  const t0 = Date.now();
  await send('convert_start', { jobId: name, inputPath: SRC, outputPath: out, options });
  let st = null, tries = 0;
  for (;;) {
    st = await send('convert_status', { jobId: name });
    if (st && st.status && terminal.includes(st.status)) break;
    if (++tries > 800) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!st || st.status !== 'completed') {
    console.log(`  FAIL  ${name}: status=${st ? st.status : '?'}${st && st.error ? ' -- ' + st.error.slice(0, 120) : ''}`);
    return false;
  }
  const info = await probeFile(out);
  const v = (info.streams || []).find(s => s.codec_type === 'video');
  const a = (info.streams || []).find(s => s.codec_type === 'audio');
  const s = (info.streams || []).find(s => s.codec_type === 'subtitle');
  let ok = true;
  const notes = [];
  if (expect.video && (!v || v.codec_name !== expect.video)) { ok = false; notes.push(`video=${v ? v.codec_name : 'none'} != ${expect.video}`); }
  if (expect.audio && (!a || a.codec_name !== expect.audio)) { ok = false; notes.push(`audio=${a ? a.codec_name : 'none'} != ${expect.audio}`); }
  if (expect.subtitle !== undefined) {
    if (expect.subtitle && !s) { ok = false; notes.push('no subtitle stream'); }
    if (!expect.subtitle && s) { ok = false; notes.push('unexpected subtitle stream'); }
  }
  if (expect.maxHeight && (!v || v.height > expect.maxHeight)) {
    ok = false; notes.push(`height=${v ? v.height : '?'} > ${expect.maxHeight}`);
  }
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(6)} ${(v ? v.codec_name : '-')}/${(a ? a.codec_name : '-')}` +
    (s ? '/sub' : '') + (v ? ` ${v.height}p` : '') + ` ${(size / 1024 | 0)}KB ${secs}s` + (notes.length ? ' -- ' + notes.join(', ') : ''));
  return ok;
}

(async () => {
  await new Promise(r => setTimeout(r, 400));
  let pass = 0, fail = 0;
  const run = async (name, options, expect) => {
    const ok = await convertAndProbe(name, options, expect);
    if (ok) pass++; else fail++;
  };

  const cut = { cut: { startSec: 30, endSec: 40 } };

  // Container-native codec pairings -- the core Phase E fix.
  await run('mp4', { mode: 'convert_video', format: 'mp4', useHwAccel: false, tools: cut }, { video: 'h264', audio: 'aac' });
  await run('mkv', { mode: 'convert_video', format: 'mkv', useHwAccel: false, tools: cut }, { video: 'h264', audio: 'aac' });
  await run('mov', { mode: 'convert_video', format: 'mov', useHwAccel: false, tools: cut }, { video: 'h264', audio: 'aac' });
  await run('webm', { mode: 'convert_video', format: 'webm', useHwAccel: false, tools: cut }, { video: 'vp9', audio: 'opus' });
  await run('avi', { mode: 'convert_video', format: 'avi', useHwAccel: false, tools: cut }, { video: 'mpeg4', audio: 'mp3' });

  // Resolution target: 720p selection must not exceed 720 lines.
  await run('scaled', { mode: 'convert_video', format: 'mp4', useHwAccel: false, bitrate: '720p', tools: cut }, { video: 'h264', audio: 'aac', maxHeight: 720 });

  // Soft subtitle muxing into mp4.
  await run('softsub', {
    mode: 'convert_video', format: 'mp4', useHwAccel: false, tools: { ...cut, subtitle: { subPath: srt, burnIn: false } }
  }, { video: 'h264', audio: 'aac', subtitle: true });

  // Audio bitrate flows through (spot-check via arg build is enough;
  // here just confirm a conversion with an explicit audio bitrate works).
  await run('audio', { mode: 'convert_video', format: 'mp4', useHwAccel: false, audioBitrate: '320k', tools: cut }, { video: 'h264', audio: 'aac' });

  engine.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
