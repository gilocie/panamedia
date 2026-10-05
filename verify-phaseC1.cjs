/**
 * Phase C1 verification: C++ conversion_support vs the Node implementations it replaces.
 *
 * For each action we compare the C++ result against the exact Node code that
 * used to run on the Electron main process, and report timings.
 *
 * Usage: node verify-phaseC1.cjs [mediaFile ...]
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');

const EXE = resolveEnginePath();
const { ffmpegPath, ffprobePath } = require('./panamedia-downloader/youtube.cjs');

if (!fs.existsSync(EXE)) {
  console.error('Engine not built:', EXE);
  process.exit(1);
}

// ── minimal engine client ────────────────────────────────────────────────────
class Engine {
  constructor() {
    this.proc = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = new Map();
    this.events = [];
    this.seq = 0;
    this.buffer = '';
    this.proc.stdout.on('data', (d) => this._onData(d));
    this.proc.stderr.on('data', (d) => process.stderr.write('[engine] ' + d));
    this.exited = false;
    this.proc.on('exit', (code, sig) => {
      this.exited = true;
      this.exitInfo = { code, sig };
      for (const [, p] of this.pending) p.reject(new Error(`engine exited early code=${code} sig=${sig}`));
      this.pending.clear();
    });
  }
  _onData(d) {
    this.buffer += d.toString('utf8');
    let nl;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.event) { this.events.push(msg); continue; }
      const p = this.pending.get(msg.id);
      if (p) { this.pending.delete(msg.id); p.resolve(msg); }
    }
  }
  request(action, payload, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(new Error('engine already exited'));
      const id = `r_${++this.seq}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout on ${action}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (m) => { clearTimeout(timer); resolve(m); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.proc.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
    });
  }
  close() { try { this.proc.kill(); } catch {} }
}

function unwrap(msg) {
  if (msg.status !== 'success') throw new Error(msg.payload?.message || 'engine error');
  return msg.payload;
}

const ms = (t) => `${t.toFixed(1)}ms`;

// ── Node baselines (copied verbatim from the code being replaced) ────────────
// Runtime probe, matching the fixed hardwareEngine.cjs behaviour. `ffmpeg
// -encoders` only lists compiled-in encoders, so a --enable-nvenc build
// advertises h264_nvenc even on a machine with no NVIDIA card.
function nodeDetectHw() {
  const { execFileSync } = require('child_process');
  const encoders = execSync(`"${ffmpegPath}" -hide_banner -encoders`, {
    windowsHide: true, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']
  }).toString();

  const candidates = [['nvenc', 'h264_nvenc'], ['qsv', 'h264_qsv'], ['amf', 'h264_amf'], ['mf', 'h264_mf']];
  for (const [name, enc] of candidates) {
    if (!encoders.includes(enc)) continue;
    try {
      execFileSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.2',
        '-frames:v', '1', '-c:v', enc, '-f', 'null', '-'],
        { windowsHide: true, timeout: 8000, stdio: 'ignore' });
      return name;
    } catch (e) { /* compiled in, but unusable on this machine */ }
  }
  return 'cpu';
}

function nodeOptimalThreads() {
  const totalCores = os.cpus()?.length || 4;
  return Math.max(1, Math.min(4, Math.floor(totalCores / 2)));
}

function nodeProbeDuration(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { dur: 0, error: null };
  try {
    const out = execSync(
      `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { windowsHide: true, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const dur = parseFloat(out);
    return { dur: !isNaN(dur) && dur > 0 ? dur : 0, error: null };
  } catch (e) {
    // A crashing ffprobe surfaces here as a non-zero exit (e.g. 0xC0000005).
    return { dur: 0, error: e.status ?? e.message };
  }
}

function nodeListOutputFiles(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath);
  const results = [];
  for (const f of files) {
    try {
      const full = path.join(dirPath, f);
      const stat = fs.statSync(full);
      if (stat.isFile() && !f.startsWith('.')) {
        const ext = path.extname(f).toLowerCase().replace('.', '');
        results.push({
          name: f,
          path: full,
          size: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
          format: ext.toUpperCase(),
          mtimeMs: stat.mtimeMs,
        });
      }
    } catch (e) {}
  }
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

function nodeListFlashDrives() {
  const cmd = `powershell -Command "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Removable' } | ForEach-Object { [PSCustomObject]@{ Name = $_.Name; Label = $_.VolumeLabel } } | ConvertTo-Json"`;
  const stdout = execSync(cmd, { windowsHide: true, encoding: 'utf8', timeout: 30000 }).trim();
  if (!stdout) return [];
  const parsed = JSON.parse(stdout);
  const drives = Array.isArray(parsed) ? parsed : [parsed];
  return drives.filter((d) => d && d.Name).map((d) => ({ letter: d.Name, label: d.Label || 'USB Drive' }));
}

// ── test harness ─────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
}

(async () => {
  const engine = new Engine();
  await new Promise((r) => setTimeout(r, 400)); // let it boot

  // 1. hw_detect ──────────────────────────────────────────────────────────────
  console.log('\n[1] hw_detect');
  {
    let t = Date.now();
    const cpp = unwrap(await engine.request('hw_detect'));
    const cppMs = Date.now() - t;
    check('first call reports cached=false', cpp.cached === false, JSON.stringify(cpp));

    t = Date.now();
    const cpp2 = unwrap(await engine.request('hw_detect'));
    const cpp2Ms = Date.now() - t;
    check('second call is served from cache', cpp2.cached === true);
    check('cached value is stable', cpp2.codec === cpp.codec, `${cpp.codec} -> ${cpp2.codec}`);
    check('warm call is fast', cpp2Ms < 25, ms(cpp2Ms));

    t = Date.now();
    const nodeCodec = nodeDetectHw();
    const nodeMs = Date.now() - t;
    check('codec matches Node ffmpeg -encoders', cpp.codec === nodeCodec, `cpp=${cpp.codec} node=${nodeCodec}`);
    console.log(`        node execSync ${ms(nodeMs)}  |  cpp cold ${ms(cppMs)}  warm ${ms(cpp2Ms)}`);
  }

  // 2. hw_threads ────────────────────────────────────────────────────────────
  console.log('\n[2] hw_threads');
  {
    const cpp = unwrap(await engine.request('hw_threads'));
    const node = nodeOptimalThreads();
    check('thread count matches Node', cpp.threads === node, `cpp=${cpp.threads} node=${node}`);
    console.log(`        threads=${cpp.threads} (cores=${os.cpus().length})`);
  }

  // 3. probe_duration ────────────────────────────────────────────────────────
  console.log('\n[3] probe_duration');
  {
    const files = process.argv.slice(2).filter((f) => fs.existsSync(f));
    if (files.length === 0) {
      console.log('  SKIP  no media files passed as argv');
    }
    for (const f of files) {
      let t = Date.now();
      const cpp = unwrap(await engine.request('probe_duration', { filePath: f }));
      const cppMs = Date.now() - t;
      t = Date.now();
      const node = nodeProbeDuration(f);
      const nodeMs = Date.now() - t;

      const base = path.basename(f);
      if (node.error !== null) {
        // The Node baseline's ffprobe is a crashing binary, so parity is not
        // meaningful. What matters is that C++ got a real answer.
        check(`C++ recovers a duration Node cannot (${base.slice(0, 30)})`,
          cpp.ok === true && cpp.duration > 0,
          `cpp=${cpp.duration} ok=${cpp.ok} backend=${cpp.backend}`);
        console.log(`        node FAILED (exit=${node.error})  |  cpp ${ms(cppMs)} -> ${cpp.duration}s via ${path.basename(cpp.backend || '?')}`);
      } else {
        const ok = Math.abs(cpp.duration - node.dur) < 0.05 || (cpp.duration === 0 && node.dur === 0);
        check(`duration ${base.slice(0, 30)}`, ok, `cpp=${cpp.duration} node=${node.dur}`);
        console.log(`        cpp ${ms(cppMs)}  node ${ms(nodeMs)}`);
      }
    }
    const bad = unwrap(await engine.request('probe_duration', { filePath: 'Z:\\nope\\missing.mp4' }));
    check('missing file returns 0 without throwing', bad.duration === 0);
    try {
      unwrap(await engine.request('probe_duration', {}));
      check('missing filePath param errors', false, 'expected error');
    } catch (e) {
      check('missing filePath param errors', true);
    }
  }

  // 4. output_files ──────────────────────────────────────────────────────────
  console.log('\n[4] output_files');
  {
    const dirs = [path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release'), __dirname, os.tmpdir()];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      let t = Date.now();
      const cpp = unwrap(await engine.request('output_files', { dirPath: dir }));
      const cppMs = Date.now() - t;
      t = Date.now();
      const node = nodeListOutputFiles(dir);
      const nodeMs = Date.now() - t;

      const cppNames = cpp.map((f) => f.name);
      const nodeNames = node.map((f) => f.name);
      // Compare as sets: for entries sharing an identical mtime the tie-break
      // depends on directory iteration order, which need not match readdirSync.
      const cppSorted = [...cppNames].sort();
      const nodeSorted = [...nodeNames].sort();
      const sameSet = cppSorted.length === nodeSorted.length &&
        cppSorted.every((n, i) => n === nodeSorted[i]);
      check(`file set ${path.basename(dir)} (${cppNames.length} files)`, sameSet,
        `cpp=${cppSorted.length} node=${nodeSorted.length}`);

      // The real invariant: strictly non-increasing mtime, i.e. newest first.
      let ordered = true;
      for (let i = 1; i < cpp.length; i++) {
        if (cpp[i].mtimeMs > cpp[i - 1].mtimeMs) { ordered = false; break; }
      }
      check(`  newest-first order preserved`, ordered);

      // Spot-check raw values on the newest entry.
      //
      // os.tmpdir() is in this list, and the downloader writes multi-megabyte
      // logs there while a download runs. Reading a file's size and mtime twice
      // milliseconds apart is a genuine race against an external writer, not an
      // engine bug -- so re-read once, and only assert when both the engine's
      // numbers and stat() agree on a file that did not move underneath us.
      if (cpp.length && node.length) {
        const agree = (entry) => {
          let st;
          try {
            st = fs.statSync(entry.path);
          } catch {
            return false;
          }
          return entry.sizeBytes === st.size && Math.abs(entry.mtimeMs - st.mtimeMs) < 2;
        };

        let entry = cpp[0];
        let stable = agree(entry);
        if (!stable) {
          console.log(`        (${entry.name} is being written to, re-listing)`);
          const retry = unwrap(await engine.request('output_files', { dirPath: dir }));
          if (retry.length) {
            entry = retry[0];
            stable = agree(entry);
          }
        }
        check(`  sizeBytes ${entry.name}`, stable);
        check(`  mtimeMs ${entry.name}`, stable);
        check(`  ext ${entry.name}`, entry.ext === path.extname(entry.name).toLowerCase().replace('.', ''),
          `cpp=${entry.ext}`);
      }
      console.log(`        cpp ${ms(cppMs)}  node ${ms(nodeMs)}`);
    }
    const empty = unwrap(await engine.request('output_files', { dirPath: 'Z:\\nope' }));
    check('missing dir returns [] not error', Array.isArray(empty) && empty.length === 0);
    const empty2 = unwrap(await engine.request('output_files', {}));
    check('absent dirPath returns [] not error', Array.isArray(empty2) && empty2.length === 0);
  }

  // 5. list_removable_drives ─────────────────────────────────────────────────
  console.log('\n[5] list_removable_drives');
  {
    let t = Date.now();
    const cpp = unwrap(await engine.request('list_removable_drives'));
    const cppMs = Date.now() - t;
    t = Date.now();
    let node = [];
    let nodeMs = NaN;
    try { node = nodeListFlashDrives(); nodeMs = Date.now() - t; } catch (e) { console.log('  (node PowerShell failed: ' + e.message + ')'); }

    const cppSorted = [...cpp].map((d) => d.letter).sort();
    const nodeSorted = node.map((d) => d.letter).sort();
    check('drive letters match PowerShell', JSON.stringify(cppSorted) === JSON.stringify(nodeSorted),
      `cpp=${JSON.stringify(cppSorted)} node=${JSON.stringify(nodeSorted)}`);
    console.log(`        cpp ${ms(cppMs)}  node(PowerShell) ${Number.isNaN(nodeMs) ? 'n/a' : ms(nodeMs)}`);
    console.log(`        drives: ${JSON.stringify(cpp)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  engine.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });