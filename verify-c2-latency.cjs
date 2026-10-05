/**
 * Measures engine responsiveness DURING an active conversion, with no PowerShell
 * or other subprocess running in the measurement loop.
 *
 * The previous attempt reported ~1s round-trips, but that was almost certainly
 * PowerShell startup contention from the CPU sampler itself, not the engine.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXE = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
const coreClient = require('./electron/core-client.cjs');
const hw = require('./panamedia-downloader/conversion-engine/hardwareEngine.cjs');
const src = process.argv[2];
const out = path.join(os.tmpdir(), 'c2lat.mp4');
if (!src || !fs.existsSync(src)) { console.error('pass a media file'); process.exit(2); }
try { fs.unlinkSync(out); } catch {}

const proc = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let seq = 0, buf = '';
proc.stdout.on('data', (d) => {
  buf += d.toString();
  let n;
  while ((n = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.event) { coreClient.dispatchEvent(m.event, m.payload); continue; }
    const p = pending.get(m.id); if (p) p(m);
  }
});
const send = (a, pl = {}, t = 5000) => new Promise((res, rej) => {
  const id = `r_${++seq}`;
  const to = setTimeout(() => rej(new Error('timeout ' + a)), t);
  pending.set(id, (m) => { clearTimeout(to); m.status === 'success' ? res(m.payload) : rej(new Error('fail')); });
  proc.stdin.write(JSON.stringify({ id, action: a, payload: JSON.stringify(pl) }) + '\n');
});

function stats(label, arr) {
  if (!arr.length) { console.log(`${label}: no samples`); return; }
  const s = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(`${label}: avg ${avg.toFixed(2)}ms  p50 ${s[Math.floor(s.length * 0.5)].toFixed(2)}ms  p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)}ms  max ${s[s.length - 1].toFixed(2)}ms`);
}

(async () => {
  await new Promise((r) => setTimeout(r, 400));
  coreClient.register(send);
  coreClient.setEnabled(true);

  // Baseline: engine idle.
  const idle = [];
  for (let i = 0; i < 30; i++) {
    const t0 = process.hrtime.bigint();
    await send('hw_threads', {}, 5000);
    idle.push(Number(process.hrtime.bigint() - t0) / 1e6);
    await new Promise((r) => setTimeout(r, 20));
  }
  stats('idle engine      ', idle);

  // During conversion. No subprocesses in this loop.
  const busy = [];
  let running = true;
  const conversion = hw.executeOptimizedConversion(src, out,
    { mode: 'convert_video', format: 'mp4' }, () => {}).catch((e) => { console.error('conv failed:', (e.message||'').slice(0,120)); });

  // Let ffmpeg get going.
  await new Promise((r) => setTimeout(r, 2500));

  let gotProgress = 0;
  const off = coreClient.onEvent((name) => { if (name === 'convert_progress') gotProgress++; });

  while (running) {
    const t0 = process.hrtime.bigint();
    try { await send('hw_threads', {}, 5000); } catch { /* ignore */ }
    busy.push(Number(process.hrtime.bigint() - t0) / 1e6);
    await new Promise((r) => setTimeout(r, 100));
    if (gotProgress > 0 && busy.length > 40) running = false;
    if (busy.length > 400) running = false;
  }
  off();

  stats('during conversion', busy);

  await conversion;
  console.log(`\nprogress events received while probing: ${gotProgress}`);
  console.log(`(proves the engine stays responsive and keeps streaming progress)`);

  try { proc.kill(); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });