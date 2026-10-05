// Phase G: disk space, long paths, battery awareness, USB eject safety,
// and the filter-input escaping that replaced hand-rolled escaping.
//
//   node verify-phaseG.cjs "<video>"
//
// Every case here is a judgement call the engine has to make without
// running a conversion, so they are all checked through the real
// IPC actions rather than by reading the source.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: node verify-phaseG.cjs "<video>"');
  process.exit(2);
}

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else {
    failed++;
    console.log('  FAIL  ' + name);
    if (detail !== undefined) console.log('        ' + String(detail).slice(0, 320));
  }
}

const ENGINE = resolveEnginePath();
const engine = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
let buf = '', q = 0;
const pend = new Map();
engine.stdout.on('data', (d) => {
  buf += d;
  let n;
  while ((n = buf.indexOf('\n')) !== -1) {
    const l = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
    if (!l) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    const r = pend.get(m.id); if (r) { pend.delete(m.id); r(m.payload); }
  }
});
engine.stderr.on('data', () => {});
const send = (a, p) => new Promise((res) => {
  const id = 'x' + (++q); pend.set(id, res);
  engine.stdin.write(JSON.stringify({ id, action: a, payload: JSON.stringify(p || {}) }) + '\n');
});

const argsOf = (r) => (r && typeof r.args === 'string' ? r.args : (r && Array.isArray(r.args) ? r.args.join(' ') : ''));

(async function main() {
  await new Promise(r => setTimeout(r, 500));
  console.log('Phase G -- capacity, paths, power, drives');
  console.log('');

  const tmp = path.join(os.tmpdir(), 'verify-phaseG');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  // ---------- G3 battery ----------
  const power = await send('power_status', {});
  check('power_status reports a known reason',
    power && ['AC', 'battery', 'unknown', 'unavailable'].includes(power.reason),
    JSON.stringify(power));
  check('power_status boolean fields are booleans',
    power && typeof power.onBattery === 'boolean' && typeof power.charging === 'boolean',
    JSON.stringify(power));
  check('power_status percent is -1 or a real percentage',
    power && (power.percent === -1 || (power.percent >= 0 && power.percent <= 100)),
    JSON.stringify(power));

  const hw = await send('hw_threads', {});
  check('hw_threads exposes the power state alongside the budget',
    hw && typeof hw.threads === 'number' && hw.threads >= 1 && typeof hw.onBattery === 'boolean',
    JSON.stringify(hw));
  check('thread budget is within the designed ceiling',
    hw && hw.threads >= 1 && hw.threads <= 4, JSON.stringify(hw));
  // On battery the engine caps at 2; on mains at most 4. Either is valid, but
  // battery must never exceed 2.
  check('thread budget respects the battery cap',
    hw && (!hw.onBattery || hw.threads <= 2), JSON.stringify(hw));

  // ---------- G2 long paths ----------
  // A path past the 260 character ceiling, built for real on disk.
  let deepDir = path.join(tmp, 'deep');
  const seg = 'segment_0123456789abcdef0123456789abcdef';
  for (let i = 0; i < 6 && deepDir.length < 250; i++) deepDir = path.join(deepDir, seg);
  fs.mkdirSync(deepDir, { recursive: true });
  const deepFile = path.join(deepDir, 'deep video.mp4');
  fs.copyFileSync(SRC, deepFile);
  const deepLen = deepFile.length;
  check('built a test path past the 260 character ceiling', deepLen > 260, deepLen + ' chars');

  const deepArgs = argsOf(await send('convert_build_args', {
    inputPath: deepFile,
    outputPath: path.join(deepDir, 'out.mp4'),
    options: { mode: 'convert_video', format: 'mp4', useHwAccel: false },
  }));
  check('long input path is handed to ffmpeg in extended form',
    deepArgs.includes('\\\\?\\' + deepFile.slice(0, 2)) || deepArgs.includes('\\\\?\\'),
    deepArgs.slice(0, 200));
  check('long output path is handed to ffmpeg in extended form',
    /\\\\\?\\[A-Za-z]:\\[^"]*out\.mp4/.test(deepArgs), deepArgs.slice(0, 240));

  // A short path must be left completely alone -- no noise in the logs.
  const shortArgs = argsOf(await send('convert_build_args', {
    inputPath: 'C:/media/clip.mp4',
    outputPath: 'C:/media/out.mp4',
    options: { mode: 'convert_video', format: 'mp4', useHwAccel: false },
  }));
  check('short paths are passed through untouched',
    shortArgs.includes('-i C:/media/clip.mp4') && shortArgs.includes('C:/media/out.mp4') &&
    !shortArgs.includes('\\\\?\\'),
    shortArgs.slice(0, 200));

  // ---------- G5 escaping ----------
  const hostile = path.join(tmp, "my subs, it's [v2] caf\u00e9 \u4e2d\u6587");
  fs.mkdirSync(hostile, { recursive: true });
  const srt = path.join(hostile, "caf\u00e9, test; x=y!z#.srt");
  fs.writeFileSync(srt, '1\r\n00:00:00,300 --> 00:00:02,000\r\nx\r\n', 'utf8');

  const burnArgs = argsOf(await send('convert_build_args', {
    inputPath: SRC, outputPath: 'C:/out/b.mp4',
    options: { mode: 'convert_video', format: 'mp4', useHwAccel: false,
               tools: { subtitle: { subPath: srt, burnIn: true } } },
  }));
  check('burn-in uses a bare staged name', burnArgs.includes('subtitles=sub.srt'), burnArgs.slice(0, 300));
  check('burn-in leaks no part of the real subtitle path',
    !burnArgs.includes('sub.srt -') && !burnArgs.includes('subs') && !burnArgs.includes('x=y!z'),
    burnArgs.slice(0, 300));

  // The staged name must keep the extension: ffmpeg picks the demuxer from it.
  for (const [ext, expect] of [['.srt', 'subtitles=sub.srt'], ['.ass', 'subtitles=sub.ass']]) {
    const p = srt.replace(/\.srt$/, ext);
    fs.writeFileSync(p, '1\r\n00:00:00,300 --> 00:00:02,000\r\nx\r\n', 'utf8');
    const a = argsOf(await send('convert_build_args', {
      inputPath: SRC, outputPath: 'C:/out/b.mp4',
      options: { mode: 'convert_video', format: 'mp4', useHwAccel: false,
                 tools: { subtitle: { subPath: p, burnIn: true } } },
    }));
    check('staged name keeps the ' + ext + ' extension', a.includes(expect), a.slice(0, 300));
  }

  // Soft mux takes the path as an ordinary argv value, so it must survive
  // verbatim -- no staging, no escaping.
  const softArgs = argsOf(await send('convert_build_args', {
    inputPath: SRC, outputPath: 'C:/out/s.mp4',
    options: { mode: 'convert_video', format: 'mp4', useHwAccel: false,
               tools: { subtitle: { subPath: srt, burnIn: false } } },
  }));
  check('soft mux passes the subtitle path unescaped as a second input',
    softArgs.includes(srt) && softArgs.includes('-c:s mov_text'),
    softArgs.slice(0, 320));

  // ---------- G1 disk space ----------
  const srcBytes = fs.statSync(SRC).size;
  const planSame = await send('plan_output', {
    filePath: SRC,
    options: { mode: 'convert_video', format: 'mp4', destination: 'folder', destPath: tmp },
  });
  check('plan_output reports the source size', planSame && planSame.sourceBytes === srcBytes,
    planSame && planSame.sourceBytes + ' vs ' + srcBytes);
  check('plan_output reports free space on the target volume',
    planSame && planSame.freeBytes > 0, planSame && String(planSame.freeBytes));
  check('plan_output reports writability', planSame && planSame.writable === true,
    JSON.stringify(planSame).slice(0, 200));
  check('plan_output estimates the output at least as large as the source',
    planSame && planSame.estimatedBytes >= srcBytes,
    planSame && planSame.estimatedBytes + ' vs source ' + srcBytes);
  check('plan_output reports a sufficient flag and no warning on a healthy disk',
    planSame && planSame.sufficient === true && !planSame.warning,
    planSame && planSame.warning);

  // A compress target has to lower the estimate below the input size.
  const planCompress = await send('plan_output', {
    filePath: SRC,
    options: {
      mode: 'convert_video', format: 'mp4', destination: 'folder', destPath: tmp,
      tools: { compress: { targetReduction: 50 } },
    },
  });
  check('compress target lowers the space estimate',
    planCompress && planCompress.estimatedBytes < srcBytes,
    planCompress && planCompress.estimatedBytes + ' vs ' + srcBytes);

  // Audio extraction needs far less room than video.
  const planAudio = await send('plan_output', {
    filePath: SRC,
    options: { mode: 'extract_audio', format: 'mp3', destination: 'folder', destPath: tmp },
  });
  check('audio extraction lowers the space estimate',
    planAudio && planAudio.estimatedBytes < srcBytes,
    planAudio && planAudio.estimatedBytes + ' vs ' + srcBytes);

  // ---------- G4 drive readiness ----------
  const vol = await send('describe_volume', { path: tmp });
  check('describe_volume reports a writable volume with free space',
    vol && vol.writable === true && vol.freeBytes > 0, JSON.stringify(vol));

  // A drive letter that does not exist must be reported, not guessed at.
  const missing = await send('describe_volume', { path: 'Z:\\nothing-here' });
  check('describe_volume refuses an absent drive',
    missing && missing.writable === false, JSON.stringify(missing));
  check('describe_volume explains why an absent drive is unusable',
    missing && typeof missing.reason === 'string' && missing.reason.length > 0,
    JSON.stringify(missing));

  const drives = await send('list_removable_drives', {});
  check('list_removable_drives returns an array', Array.isArray(drives), JSON.stringify(drives).slice(0, 160));
  check('every removable drive reports readiness and free space',
    Array.isArray(drives) && drives.every(
      (d) => typeof d.ready === 'boolean' && typeof d.freeBytes === 'number' && d.letter && d.label),
    JSON.stringify(drives).slice(0, 240));

  // A refused destination: convert_start must not accept a job there.
  const badStart = await send('convert_start', {
    jobId: 'g-badvol', inputPath: SRC, outputPath: 'Z:\\refused\\out.mp4',
    options: { mode: 'convert_video', format: 'mp4' },
  });
  check('convert_start refuses an unwritable destination up front',
    badStart && typeof badStart.error === 'string' && /not available|not writ/i.test(badStart.error),
    JSON.stringify(badStart));

  // ---------- compress units (found while estimating) ----------
  const crfFor = async (reduction) => {
    const a = argsOf(await send('convert_build_args', {
      inputPath: SRC, outputPath: 'C:/o.mp4',
      options: { mode: 'convert_video', format: 'mp4', useHwAccel: false,
                 tools: { compress: { targetReduction: reduction } } },
    }));
    const m = a.match(/-crf\s+(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };
  const c20 = await crfFor(20), c50 = await crfFor(50), c80 = await crfFor(80);
  check('compress slider produces distinct quality settings',
    c20 !== null && c50 !== null && c80 !== null && c20 < c50 && c50 < c80,
    `20%->crf ${c20}, 50%->crf ${c50}, 80%->crf ${c80}`);
  check('a 20% reduction matches the equivalent fraction',
    c20 === await crfFor(0.2), `${c20} vs ${await crfFor(0.2)}`);

  engine.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('');
  console.log('Phase G: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
