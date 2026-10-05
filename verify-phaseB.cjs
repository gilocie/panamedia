// Phase B verification: compares the new C++ library_sync against the existing
// Node scanDirRecursive implementation on the same real folder(s).
// Extracts the REAL Node functions from electron.cjs so we test shipped code.
const fs = require('fs');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');
const os = require('os');
const { spawn } = require('child_process');

const repoRoot = __dirname;
const electronPath = path.join(repoRoot, 'electron.cjs');
const src = fs.readFileSync(electronPath, 'utf8');

// Brace-match a top-level "function name(" out of the source.
function extractFn(name) {
  const re = new RegExp(`^function ${name}\\s*\\(`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error(`could not find function ${name} in electron.cjs`);
  let i = src.indexOf('{', m.index);
  let depth = 0, inStr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

const nodeFns = [
  extractFn('isMpegTsVideo'),
  extractFn('scanDirRecursive'),
  extractFn('normalizeDupName'),
].join('\n\n');

const nodeFactory = new Function('fs', 'path', `
  const dirCache = new Map();
  ${nodeFns}
  return { scanDirRecursive, normalizeDupName };
`);
const { scanDirRecursive, normalizeDupName } = nodeFactory(fs, path);

// ── Run the C++ engine ────────────────────────────────────────────────────
function cppLibrarySync(folders, timeoutMs = 120000) {
  const exe = resolveEnginePath();
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderrBuf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error(`cpp timeout (120s) — stderr: ${stderrBuf.slice(-400)}`));
    }, timeoutMs);
    proc.stderr.on('data', (c) => { stderrBuf += c.toString(); });

    // The engine can die (e.g. __fastfail 0xC0000409). Without this the promise
    // would only ever reject on timeout, masking crashes as "hangs".
    proc.on('exit', (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(
        `cpp engine EXITED early code=${code} sig=${sig}\n` +
        `  stderr: ${stderrBuf.slice(-600) || '(empty)'}`
      ));
    });

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 'libsync') {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            proc.kill();
            if (msg.status === 'success') resolve(msg.payload);
            else reject(new Error('engine error: ' + JSON.stringify(msg.payload)));
            return;
          }
        } catch {}
      }
    });

    proc.on('error', reject);
    proc.stdin.write(JSON.stringify({
      id: 'libsync', action: 'library_sync', payload: { folders }
    }) + '\n');
  });
}

// ── Node reference implementation ─────────────────────────────────────────
function nodeLibrarySync(folders) {
  const fileList = [];
  const scannedPaths = new Set();
  for (const dir of folders) {
    if (fs.existsSync(dir)) scanDirRecursive(dir, fileList, scannedPaths, 0);
  }
  const nameGroups = new Map();
  for (const f of fileList) {
    const k = normalizeDupName(f.name);
    if (!nameGroups.has(k)) nameGroups.set(k, []);
    nameGroups.get(k).push(f);
  }
  const duplicates = [];
  for (const [name, group] of nameGroups) {
    if (group.length > 1) {
      const distinct = new Set(group.map((f) => f.path));
      if (distinct.size > 1) duplicates.push({ name, list: group });
    }
  }
  return { files: fileList, duplicates };
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node verify-phaseB.cjs <folder> [folder...]');
  process.exit(1);
}

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

(async () => {
  console.log('Folders under test:', JSON.stringify(targets), '\n');

  // Warm the OS file cache so we compare traversal logic, not cold disk.
  for (const t of targets) { try { fs.readdirSync(t); } catch {} }

  const t0 = Date.now();
  const cpp = await cppLibrarySync(targets);
  const cppMs = Date.now() - t0;

  const t1 = Date.now();
  const node = nodeLibrarySync(targets);
  const nodeMs = Date.now() - t1;

  console.log(`  C++  : ${cppMs} ms  (engine reported ${cpp.stats.elapsedMs} ms scan time)`);
  console.log(`  Node : ${nodeMs} ms`);
  console.log(`  files: cpp=${cpp.files.length} node=${node.files.length}\n`);

  console.log('[1] File set parity');
  const cppPaths = cpp.files.map((f) => f.path).sort();
  const nodePaths = node.files.map((f) => f.path).sort();
  const onlyCpp = cppPaths.filter((p) => !nodePaths.includes(p));
  const onlyNode = nodePaths.filter((p) => !cppPaths.includes(p));
  check('same file count', cppPaths.length === nodePaths.length,
        `(cpp ${cppPaths.length} vs node ${nodePaths.length})`);
  check('no files only in C++', onlyCpp.length === 0, `(${onlyCpp.length}) ${onlyCpp.slice(0,3)}`);
  check('no files only in Node', onlyNode.length === 0, `(${onlyNode.length}) ${onlyNode.slice(0,3)}`);

  console.log('\n[2] Per-file field parity (size / mtime / category / ext)');
  const nodeByPath = new Map(node.files.map((f) => [f.path, f]));
  let mismatches = [];
  for (const cf of cpp.files) {
    const nf = nodeByPath.get(cf.path);
    if (!nf) continue;
    if (nf.category !== cf.category) mismatches.push(`${cf.path}: cat ${nf.category}!=${cf.category}`);
    else if (nf.ext !== cf.ext) mismatches.push(`${cf.path}: ext ${nf.ext}!=${cf.ext}`);
    else if (Number(nf.size) !== Number(cf.size)) mismatches.push(`${cf.path}: size`);
    // Node exposes sub-millisecond precision; the engine emits integer ms, so
    // allow a 1 ms rounding window rather than demanding bit-exact equality.
    else if (Math.abs(Number(nf.mtime) - Number(cf.mtime)) > 1) {
      mismatches.push(`${cf.path}: mtime ${nf.mtime} vs ${cf.mtime}`);
    }
  }
  check('all matched files identical', mismatches.length === 0,
        `(${mismatches.length}) ${mismatches.slice(0, 5).join(' | ')}`);

  console.log('\n[3] Duplicate detection parity');
  const cppDupKeys = cpp.duplicates.map((d) => d.name).sort();
  const nodeDupKeys = node.duplicates.map((d) => d.name).sort();
  check('same duplicate group count', cppDupKeys.length === nodeDupKeys.length,
        `(cpp ${cppDupKeys.length} vs node ${nodeDupKeys.length})`);
  check('same duplicate names', JSON.stringify(cppDupKeys) === JSON.stringify(nodeDupKeys));

  console.log('\n[4] Renderer contract preserved');
  const required = ['name', 'path', 'size', 'mtime', 'category', 'ext'];
  const shapeOk = cpp.files.every((f) => required.every((k) => k in f));
  check('every file has all 6 renderer fields', shapeOk);
  const dupShapeOk = cpp.duplicates.every((d) => 'name' in d && Array.isArray(d.list));
  check('duplicate groups shaped {name, list}', dupShapeOk);
  const cats = new Set(cpp.files.map((f) => f.category));
  check('categories limited to known set',
        [...cats].every((c) => ['videos', 'audios', 'docx', 'files'].includes(c)),
        `(${[...cats].join(',')})`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log(`SPEEDUP: ${(nodeMs / Math.max(cppMs, 1)).toFixed(2)}x  (${nodeMs}ms -> ${cppMs}ms)`);
  console.log('='.repeat(50));
  process.exit(fail === 0 ? 0 : 1);
})();
