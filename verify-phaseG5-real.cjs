// Phase G5: real burn-in conversion from a subtitle path that no
// hand-written ffmpeg escape can survive -- spaces, comma, apostrophe,
// brackets, semicolon, equals, exclamation, hash, accented Latin, CJK
// and an astral-plane emoji. Drives the engine end to end, then checks
// the per-job staging folder was removed.
//
//   node verify-phaseG5-real.cjs "<video>"
//
// Engine-only by nature: the Node fallback cannot stage filter inputs,
// so if the engine will not start this reports SKIP, not a pass.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node verify-phaseG5-real.cjs "<video>"');
  process.exit(2);
}

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else {
    failed++;
    console.log('  FAIL  ' + name);
    if (detail !== undefined) console.log('        ' + String(detail).slice(0, 300));
  }
}

const ENGINE = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
const engine = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
let buf = '', q = 0;
const pend = new Map();
engine.stdout.on('data', (d) => {
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

const send = (action, payload) => new Promise((res) => {
  const id = 'x' + (++q);
  pend.set(id, res);
  engine.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload || {}) }) + '\n');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runToEnd(jobId, tries) {
  for (let i = 0; i < tries; i++) {
    await sleep(250);
    const r = await send('convert_status', { jobId });
    if (!r || !r.status) continue;
    if (r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled') return r;
  }
  return { status: 'timeout', error: '' };
}

function stagePathFor(jobId) {
  const safe = jobId.replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(process.env.LOCALAPPDATA || '', 'Panamedia', 'conv', safe);
}

(async function main() {
  console.log('Phase G5 -- real burn-in from a hostile subtitle path');
  console.log('');

  if (!fs.existsSync(ENGINE)) {
    console.log('SKIP  engine binary not built at ' + ENGINE);
    process.exit(0);
  }

  const base = path.join(os.tmpdir(), 'verify-g5-real');
  fs.rmSync(base, { recursive: true, force: true });

  const hostileDir = path.join(base, "my subs, it's [v2] caf\u00e9 \u4e2d\u6587 \ud83c\udfac");
  fs.mkdirSync(hostileDir, { recursive: true });
  const srt = path.join(hostileDir, "caf\u00e9, test; x=y!z#.srt");
  fs.writeFileSync(srt, '1\r\n00:00:00,300 --> 00:00:03,500\r\nG5 escaping probe \u00e9\u4e2d\u6587\r\n', 'utf8');

  console.log('hostile subtitle:');
  console.log('  ' + srt);
  console.log('  ' + srt.length + ' chars / ' + Buffer.byteLength(srt) + ' bytes UTF-8');
  console.log('');

  // Confirm the engine is alive before trusting any verdict.
  const alive = await send('convert_list', {});
  if (!alive) {
    console.log('SKIP  engine did not answer convert_list');
    engine.kill();
    process.exit(0);
  }

  // 1. the happy path
  const outDir = path.join(hostileDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, 'burned.mp4');
  const jobId = 'g5-' + Date.now();

  const opts = {
    mode: 'convert_video', format: 'mp4', useHwAccel: false,
    tools: { subtitle: { subPath: srt, burnIn: true } },
  };
  const start = await send('convert_start', { jobId, inputPath: SRC, outputPath: output, options: opts });
  check('convert_start accepted', !!start, JSON.stringify(start).slice(0, 200));

  const job = await runToEnd(jobId, 400);
  if (job.status !== 'completed') {
    console.log('  ---- engine diagnostics (full) ----');
    console.log((job.diagnostics || job.error || '(none)').split('\n').map(l => '  | ' + l).join('\n'));
    console.log('  ---- end ----');
  }
  check('burn-in job completed', job.status === 'completed', job.status + ' / ' + (job.error || ''));
  check('output exists and is non-empty',
    fs.existsSync(output) && fs.statSync(output).size > 0,
    fs.existsSync(output) ? fs.statSync(output).size + ' bytes' : 'missing');
  check('staging folder removed after ffmpeg exited',
    !fs.existsSync(stagePathFor(jobId)),
    stagePathFor(jobId) + (fs.existsSync(stagePathFor(jobId)) ? ' still present' : ''));

  // 2. the argument really carries no path
  const built = await send('convert_build_args', { inputPath: SRC, outputPath: output, options: opts });
  const argText = built && built.args ? (Array.isArray(built.args) ? built.args.join(' ') : String(built.args)) : '';
  check('arg list carries a bare staged name and no subtitle path',
    argText.includes('subtitles=sub.srt') && !argText.includes('subs/en.srt') && !argText.includes('test.srt'),
    argText.slice(0, 240));

  // 3. a missing subtitle must fail loudly, not silently drop the burn-in
  const badDir = path.join(hostileDir, 'missing');
  fs.mkdirSync(badDir, { recursive: true });
  const badId = 'g5missing-' + Date.now();
  await send('convert_start', {
    jobId: badId, inputPath: SRC, outputPath: path.join(badDir, 'x.mp4'),
    options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { subtitle: { subPath: path.join(badDir, 'nope.srt'), burnIn: true } },
    },
  });
  const bad = await runToEnd(badId, 200);
  check('missing subtitle fails the job with a clear message',
    bad.status === 'failed' && /subtitle/i.test(bad.error || ''),
    bad.status + ' / "' + (bad.error || '') + '"');
  check('missing subtitle left no staging folder behind',
    !fs.existsSync(stagePathFor(badId)));

  engine.kill();
  fs.rmSync(base, { recursive: true, force: true });

  console.log('');
  console.log('G5 real: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
