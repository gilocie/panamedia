// Honest cold-vs-warm Phase B benchmark.
// Cold  = engine cache cleared before each scan (full traversal, as on first sync).
// Warm  = cache intact (repeat sync, the common case when reopening the library).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const src = fs.readFileSync(path.join(__dirname, 'electron.cjs'), 'utf8');
function ex(name) {
  const m = new RegExp('^function ' + name + '\\s*\\(', 'm').exec(src);
  let i = src.indexOf('{', m.index), d = 0, q = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(m.index, j + 1); }
  }
}
const nodeDc = new Map();
globalThis.__dc = nodeDc;   // must exist before the closure captures it
const { scanDirRecursive } = new Function('fs', 'path',
  'const dirCache = globalThis.__dc;\n' + [ex('isMpegTsVideo'), ex('scanDirRecursive')].join('\n') +
  '\nreturn { scanDirRecursive };')(fs, path);

const folder = process.argv[2];
const ITERS = 9;
const WARMUP = 3;
const ROUNDS = 3;

function engine(threads) {
  const exe = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
  const env = { ...process.env };
  if (threads) env.PANAMEDIA_SCAN_THREADS = String(threads);
  const proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], env });
  const waiters = new Map();
  let buf = '';
  proc.on('error', () => {});
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      const w = waiters.get(m.id);
      if (w) { waiters.delete(m.id); w(m); }
    }
  });
  let n = 0;
  const call = (action, payload) => new Promise((res) => {
    const id = 'r' + (++n);
    waiters.set(id, res);
    proc.stdin.write(JSON.stringify({ id, action, payload }) + '\n');
  });
  return { call, kill: () => proc.kill() };
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

(async () => {
  console.log(`target: ${folder}   (${ITERS} iters)\n`);

  // ── Node reference (its own dirCache, matching electron.cjs) ──────────────
  const nodeCold = [];
  for (let i = 0; i < ITERS; i++) {
    nodeDc.clear();                       // force full traversal
    const l = [], s = new Set();
    const t = process.hrtime.bigint();
    if (fs.existsSync(folder)) scanDirRecursive(folder, l, s, 0);
    nodeCold.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  const nodeWarm = [];
  let nfiles = 0;
  for (let i = 0; i < ITERS; i++) {
    const l = [], s = new Set();
    const t = process.hrtime.bigint();
    if (fs.existsSync(folder)) scanDirRecursive(folder, l, s, 0);
    nodeWarm.push(Number(process.hrtime.bigint() - t) / 1e6);
    nfiles = l.length;
  }

  console.log(`Node   cold (dirCache cleared each run) : ${avg(nodeCold).toFixed(1)} ms   [BLOCKS main process]`);
  console.log(`Node   warm (dirCache warm)             : ${avg(nodeWarm).toFixed(1)} ms   [BLOCKS main process]`);

  for (const t of [1, 2, 4, 8, 0]) {
    const label = t === 0 ? 'auto' : String(t);
    const cold = [], warm = [];
    let files = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const e = engine(t || null);
      // Warm up: first syncs after spawn pay binary/defender page-in costs that
      // have nothing to do with the scanner, so they are discarded.
      for (let i = 0; i < WARMUP; i++) await e.call('library_sync', { folders: [folder] });
      for (let i = 0; i < ITERS; i++) {
        await e.call('library_clear_cache', {});
        const r = await e.call('library_sync', { folders: [folder] });
        cold.push(r.payload.stats.elapsedMs);
        files = r.payload.files.length;
      }
      for (let i = 0; i < ITERS; i++) {
        const r = await e.call('library_sync', { folders: [folder] });
        warm.push(r.payload.stats.elapsedMs);
      }
      e.kill();
    }
    // min is robust to scheduler/AV jitter that averages would smear in.
    const c = Math.min(...cold), w = Math.min(...warm);
    const nC = Math.min(...nodeCold), nW = Math.min(...nodeWarm);
    console.log(`C++ t=${label.padEnd(4)} cold : ${c.toFixed(1)} ms  (${(nC / c).toFixed(2)}x)   ` +
                `warm : ${w.toFixed(1)} ms  (${(nW / w).toFixed(2)}x)   files=${files}`);
  }
})();
