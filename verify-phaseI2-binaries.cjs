// Phase I.2: a binary that exists is not a binary that runs.
//
// The app shipped a full-sized ffprobe.exe that died with an access violation
// (0xC0000005) on every invocation. Node's resolveBinary only checked
// fs.existsSync, so it kept handing that file to every metadata caller, which
// then reported no duration, no codec and no dimensions -- and Phase A happily
// cached those nulls. This suite pins the health-checked resolver: a known-good
// binary still resolves, and a deliberately broken one is detected, skipped and
// quarantined rather than returned.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPDATA = process.env.APPDATA;
const BIN_DIR = path.join(APPDATA, 'panamedia', 'bin');
const NET_BIN = path.join(APPDATA, 'net-downloader', 'bin');
const RESOLVER = path.join(__dirname, 'panamedia-downloader', 'youtube.cjs');
const TEST_MODULE = path.join(__dirname, '.yt-resolver-under-test.cjs');

let pass = 0, fail = 0;
const check = (n, ok, d) => {
  if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n); if (d !== undefined) console.log('        ' + String(d).slice(0, 300)); }
};

// ---------------------------------------------------------------------------
// Sandbox that mimics the real APPDATA layout, so resolveBinary's own candidate
// list drives the test rather than a rewritten one.
//   <sandbox>/panamedia/bin/ffprobe.exe         <- broken
//   <sandbox>/net-downloader/bin/ffprobe.exe    <- working
// ---------------------------------------------------------------------------
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'panamedia-bin-'));
const sandboxPanamediaBin = path.join(sandbox, 'panamedia', 'bin');
const sandboxNetBin = path.join(sandbox, 'net-downloader', 'bin');
fs.mkdirSync(sandboxPanamediaBin, { recursive: true });
fs.mkdirSync(sandboxNetBin, { recursive: true });

// Right shape on disk, not runnable code -- what an interrupted download leaves.
fs.writeFileSync(path.join(sandboxPanamediaBin, 'ffprobe.exe'),
  Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64 * 1024, 0x41)]));
fs.copyFileSync(path.join(NET_BIN, 'ffprobe.exe'), path.join(sandboxNetBin, 'ffprobe.exe'));

// Resolve against the sandbox by redirecting APPDATA, which keeps the module
// under test byte-identical to the one that ships.
function resolveInSandbox(extraEnv) {
  const r = spawnSync(process.execPath, ['-e', `
    const y = require(process.env.RESOLVER_PATH);
    const o = y.describeResolvedBinaries();
    console.log(JSON.stringify({ ffprobe: o.ffprobe, ffmpeg: o.ffmpeg, ytdlp: o.ytdlp }));
  `], {
    encoding: 'utf8',
    timeout: 90000,
    cwd: __dirname,
    env: Object.assign({}, process.env, { RESOLVER_PATH: RESOLVER, APPDATA: sandbox }, extraEnv || {})
  });
  return r;
}

console.log('Phase I.2 -- binary health-checked resolution');
console.log('');

// ---------------------------------------------------------------------------
// 1. The real environment: the resolved ffprobe must exist and actually run.
//    This is the assertion that failed in production.
// ---------------------------------------------------------------------------
{
  const real = spawnSync(process.execPath, ['-e', `
    const y = require(process.env.RESOLVER_PATH);
    const o = y.describeResolvedBinaries();
    console.log(JSON.stringify(o));
  `], {
    encoding: 'utf8', timeout: 90000, cwd: __dirname,
    env: Object.assign({}, process.env, { RESOLVER_PATH: RESOLVER })
  });
  check('resolver loads without throwing', real.status === 0, (real.stderr || '').slice(0, 300));

  if (real.status === 0) {
    const info = JSON.parse(String(real.stdout).trim().split('\n').pop());
    check('ffprobe resolves to an existing file', info.ffprobe && fs.existsSync(info.ffprobe), info.ffprobe);
    check('ffprobe resolves inside the app bin dir',
      path.dirname(info.ffprobe).toLowerCase() === BIN_DIR.toLowerCase(), info.ffprobe);
    check('ffmpeg resolves to an existing file', info.ffmpeg && fs.existsSync(info.ffmpeg), info.ffmpeg);

    const run = spawnSync(info.ffprobe, ['-version'], { encoding: 'utf8', timeout: 30000 });
    check('resolved ffprobe actually executes', run.status === 0 && /version/i.test(run.stdout || ''),
      'status=' + run.status + ' signal=' + run.signal + ' err=' + String(run.stderr || '').slice(0, 200));

    // And it produces real metadata, which is the whole point of probing.
    const sample = path.join(process.env.USERPROFILE, 'Videos', 'Screen Recordings',
      'Screen Recording 2025-11-24 205601.mp4');
    if (fs.existsSync(sample)) {
      const pr = spawnSync(info.ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', sample],
        { encoding: 'utf8', timeout: 60000 });
      let meta = null;
      try { meta = JSON.parse(pr.stdout); } catch (e) { /* stays null */ }
      check('resolved ffprobe returns usable metadata',
        !!meta && Array.isArray(meta.streams) && meta.streams.length > 0,
        'status=' + pr.status + ' out=' + String(pr.stdout).slice(0, 160));
      check('metadata reports a non-zero duration',
        !!meta && meta.format && Number(meta.format.duration) > 0,
        meta && meta.format ? meta.format.duration : 'none');
      const vcodec = meta && meta.streams && meta.streams.find(s => s.codec_type === 'video');
      check('metadata identifies the video codec',
        !!vcodec && typeof vcodec.codec_name === 'string' && vcodec.codec_name.length > 0,
        vcodec ? vcodec.codec_name : 'none');
    } else {
      console.log('  SKIP  sample video not present');
    }
  }
}

// ---------------------------------------------------------------------------
// 2. A broken file must be rejected, not returned.
// ---------------------------------------------------------------------------
{
  const r = resolveInSandbox();
  check('resolver runs against the sandbox', r.status === 0, (r.stderr || '').slice(0, 300));

  if (r.status === 0) {
    const got = JSON.parse(String(r.stdout).trim().split('\n').pop()).ffprobe;
    check('broken ffprobe in the primary bin dir is not returned',
      got && got.toLowerCase() === path.join(sandboxNetBin, 'ffprobe.exe').toLowerCase(),
      'resolved to ' + got);
    check('the working copy it fell back to really runs', (() => {
      if (!got || !fs.existsSync(got)) return false;
      const v = spawnSync(got, ['-version'], { encoding: 'utf8', timeout: 30000 });
      return v.status === 0 && /version/i.test(v.stdout || '');
    })(), 'resolved to ' + got);
  }

  const quarantined = fs.readdirSync(sandboxPanamediaBin).filter(f => /^ffprobe\.exe\.corrupt-/.test(f));
  check('broken binary is quarantined so it cannot win the next launch',
    quarantined.length > 0, fs.readdirSync(sandboxPanamediaBin).join(', '));
  check('the working copy was left untouched', fs.existsSync(path.join(sandboxNetBin, 'ffprobe.exe')));
}

// ---------------------------------------------------------------------------
// 3. The verdict is cached by size+mtime, so healthy binaries are not
//    re-spawned on every launch, but replacing a file does re-probe it.
// ---------------------------------------------------------------------------
{
  const cachePath = path.join(BIN_DIR, 'binary-health.json');
  check('health cache was written', fs.existsSync(cachePath), cachePath);

  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const keys = Object.keys(cache);
    check('cache keys carry size and mtime so a new file re-probes',
      keys.length > 0 && /\|\d+\|\d+$/.test(keys[0]), keys[0]);

    const fp = keys.find(k => /[\\/]ffprobe\.exe\|/i.test(k));
    check('the app ffprobe is recorded healthy', !!fp && cache[fp] === true,
      fp ? fp + ' -> ' + cache[fp] : 'no ffprobe entry');

    const fm = keys.find(k => /[\\/]ffmpeg\.exe\|/i.test(k));
    check('the app ffmpeg is recorded healthy', !!fm && cache[fm] === true,
      fm ? fm + ' -> ' + cache[fm] : 'no ffmpeg entry');

    // Warm start: the spawnSync probes must not run again.
    const t0 = Date.now();
    spawnSync(process.execPath, ['-e', `require(process.env.RESOLVER_PATH)`], {
      encoding: 'utf8', timeout: 90000, cwd: __dirname,
      env: Object.assign({}, process.env, { RESOLVER_PATH: RESOLVER })
    });
    const warm = Date.now() - t0;
    check('warm start skips the version probe', warm < 3000, 'second load took ' + warm + 'ms');

    // A cached "healthy" verdict must not outlive the file it described.
    const cache2 = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const stale = cache2[fp];
    cache2[fp] = false;
    fs.writeFileSync(cachePath, JSON.stringify(cache2));
    const after = spawnSync(process.execPath, ['-e', `
      const y = require(process.env.RESOLVER_PATH);
      console.log(JSON.stringify({ ffprobe: y.describeResolvedBinaries().ffprobe }));
    `], {
      encoding: 'utf8', timeout: 90000, cwd: __dirname,
      env: Object.assign({}, process.env, { RESOLVER_PATH: RESOLVER })
    });
    // Marking the primary copy bad must push the next launch off it entirely.
    check('a cached failure verdict is honoured on the next launch',
      after.status === 0 &&
      path.dirname(JSON.parse(String(after.stdout).trim().split('\n').pop()).ffprobe).toLowerCase() === NET_BIN.toLowerCase(),
      String(after.stdout).trim());
    check('the bad primary copy was quarantined, not left to be found',
      !fs.existsSync(path.join(BIN_DIR, 'ffprobe.exe')) ||
      fs.readdirSync(BIN_DIR).some(f => /^ffprobe\.exe\.corrupt-/.test(f)),
      fs.readdirSync(BIN_DIR).filter(f => /ffprobe/i.test(f)).join(', '));
    cache2[fp] = stale;
    fs.writeFileSync(cachePath, JSON.stringify(cache2));
  }
}

try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { /* best effort */ }
try { fs.rmSync(TEST_MODULE, { force: true }); } catch (e) { /* best effort */ }

console.log('');
console.log('I.2: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);