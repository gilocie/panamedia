/**
 * Measures real resource usage during a C++-driven conversion, so the claims
 * about CPU and RAM are based on numbers rather than intent.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXE = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
const coreClient = require('./electron/core-client.cjs');
const hw = require('./panamedia-downloader/conversion-engine/hardwareEngine.cjs');
const src = process.argv[2];
const out = path.join(os.tmpdir(), 'c2resource.mp4');

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
    const p = pending.get(m.id);
    if (p) p(m);
  }
});
const send = (action, payload = {}, timeoutMs = 5000) => new Promise((res, rej) => {
  const id = `r_${++seq}`;
  const t = setTimeout(() => rej(new Error('timeout ' + action)), timeoutMs);
  pending.set(id, (m) => { clearTimeout(t); m.status === 'success' ? res(m.payload) : rej(new Error('fail')); });
  proc.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
});

function sampleFfmpeg() {
  try {
    const outp = execSync(
      `powershell -NoProfile -Command "Get-Process ffmpeg -ErrorAction SilentlyContinue | ForEach-Object { '{0}|{1}|{2}' -f $_.WorkingSet64, $_.Threads.Count, $_.PriorityClass }"`,
      { encoding: 'utf8', timeout: 10000 }).trim();
    if (!outp) return null;
    const [ws, th, pri] = outp.split('|');
    return {
      ramMB: +(ws / 1048576).toFixed(1),
      threads: +th,
      priority: pri,
      cpuSec: 0,
    };
  } catch { return null; }
}

(async () => {
  await new Promise((r) => setTimeout(r, 400));
  coreClient.register(send);
  coreClient.setEnabled(true);

  const det = await coreClient.call('hw_detect');
  const threads = await coreClient.call('hw_threads');
  console.log(`cores available : ${os.cpus().length}`);
  console.log(`encoder chosen  : ${det.codec}`);
  console.log(`-threads passed : ${threads.threads}  (cap = cores/2, max 4)`);

  const peaks = [];
  let engineRam = null;
  const sampler = setInterval(() => {
    const s = sampleFfmpeg();
    if (s) peaks.push(s);
  }, 250);

  const t0 = Date.now();
  await hw.executeOptimizedConversion(src, out, { mode: 'convert_video', format: 'mp4' }, () => {});
  const ms = Date.now() - t0;
  clearInterval(sampler);

  if (peaks.length === 0) {
    console.log('\nCould not sample ffmpeg (it finished too fast).');
  } else {
    const maxRam = Math.max(...peaks.map((p) => p.ramMB));
    const maxThreads = Math.max(...peaks.map((p) => p.threads));
    const prios = [...new Set(peaks.map((p) => p.priority))];
    const srcSize = fs.statSync(src).size;
    const outSize = fs.existsSync(out) ? fs.statSync(out).size : 0;
    console.log(`\nsamples          : ${peaks.length}`);
    console.log(`ffmpeg peak RAM  : ${maxRam} MB`);
    console.log(`ffmpeg max threads: ${maxThreads}`);
    console.log(`ffmpeg priority  : ${prios.join(', ')}`);
    console.log(`input size       : ${(srcSize / 1048576).toFixed(1)} MB`);
    console.log(`output size      : ${(outSize / 1048576).toFixed(1)} MB`);
  }
  console.log(`wall time        : ${ms} ms`);

  try { proc.kill(); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });