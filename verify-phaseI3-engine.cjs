// Phase I.3a -- new engine capabilities: probe_media and system_power_action.
//
// probe_media backs the multi-audio-track picker and the metadata/chapter tool.
// system_power_action backs post-conversion eject only.
//
// Nothing here ejects anything: the eject path is only ever exercised in dryRun.
// Shutdown/restart/sleep/logoff no longer exist in the engine at all -- they are
// refused before any Win32 call, and this suite asserts that refusal for every
// spelling a caller could try.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');

const ENGINE = resolveEnginePath();
const SAMPLE = path.join(process.env.USERPROFILE, 'Videos', 'Screen Recordings',
  'Screen Recording 2025-11-24 205601.mp4');
const WORK = path.join(process.env.TEMP || process.env.TMP, 'panamedia-i3');

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
    if (r) { pend.delete(m.id); r(m); }
  }
});
engine.stderr.on('data', () => {});
const send = (action, payload) => new Promise((res) => {
  const id = 'i3-' + (++q);
  pend.set(id, res);
  engine.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload || {}) }) + '\n');
});

let pass = 0, fail = 0;
const check = (n, ok, d) => {
  if (ok) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n); if (d !== undefined) console.log('        ' + String(d).slice(0, 300)); }
};
// send() resolves with the whole {id,status,payload} envelope, and the
// bridge hands some payloads over parsed and some as strings.
const obj = (r) => {
  const p = (r && r.payload !== undefined) ? r.payload : r;
  return typeof p === 'string' ? JSON.parse(p) : (p || {});
};

(async () => {
  await new Promise((r) => setTimeout(r, 600));
  console.log('Phase I.3a -- probe_media / system_power_action');
  console.log('');

  if (!fs.existsSync(SAMPLE)) {
    console.log('  sample video missing at ' + SAMPLE + ' -- cannot run');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // probe_media
  // -------------------------------------------------------------------------
  const m = obj(await send('probe_media', { filePath: SAMPLE }));
  console.log('  probe_media ->', JSON.stringify({
    ok: m.ok, duration: m.duration, sizeBytes: m.sizeBytes, formatName: m.formatName,
    video: m.video, audioTracks: m.audioTracks, chapters: (m.chapters || []).length
  }).slice(0, 320));
  console.log('');

  check('probe_media succeeds', m.ok === true, JSON.stringify(m).slice(0, 200));
  check('reports a real duration', typeof m.duration === 'number' && m.duration > 0, m.duration);
  check('reports the file size', typeof m.sizeBytes === 'number' && m.sizeBytes > 0, m.sizeBytes);
  check('reports the container', typeof m.formatName === 'string' && m.formatName.length > 0, m.formatName);

  // The video block must describe the picture the converter keeps (-map 0:v:0).
  check('video stream present', m.video && typeof m.video === 'object', JSON.stringify(m.video));
  check('video width/height are real', m.video && m.video.width > 0 && m.video.height > 0,
    m.video ? m.video.width + 'x' + m.video.height : 'none');
  check('video codec identified', m.video && typeof m.video.codec === 'string' && m.video.codec.length > 0,
    m.video ? m.video.codec : 'none');
  check('frame rate is a sane number', m.video && m.video.fps > 0 && m.video.fps < 480,
    m.video ? m.video.fps : 'none');
  check('frame rate is not the 0/0 sentinel', !(m.video && m.video.fps === 0), m.video ? m.video.fps : 'none');

  check('audioTracks is an array', Array.isArray(m.audioTracks), typeof m.audioTracks);
  check('at least one audio track found', Array.isArray(m.audioTracks) && m.audioTracks.length >= 1,
    JSON.stringify(m.audioTracks));
  if (Array.isArray(m.audioTracks) && m.audioTracks.length) {
    const a0 = m.audioTracks[0];
    check('audio track is numbered from zero', a0.index === 0, JSON.stringify(a0));
    check('audio codec identified', typeof a0.codec === 'string' && a0.codec.length > 0, a0.codec);
    check('channel count reported', typeof a0.channels === 'number' && a0.channels > 0, a0.channels);
    check('sample rate reported', a0.sampleRate > 0, a0.sampleRate);
    check('language defaults to "und" rather than an empty string', a0.language === 'und' || a0.language.length > 0,
      JSON.stringify(a0.language));
    check('indices are contiguous, matching -map 0:a:N numbering',
      m.audioTracks.every((t, i) => t.index === i), JSON.stringify(m.audioTracks.map((t) => t.index)));
  }

  check('chapters is an array (empty when the source has none)', Array.isArray(m.chapters), typeof m.chapters);
  check('tags is an object', m.tags && typeof m.tags === 'object' && !Array.isArray(m.tags), JSON.stringify(m.tags));

  // A missing file must degrade, not crash or hang.
  const missing = obj(await send('probe_media', { filePath: path.join(WORK, 'nope.mp4') }));
  check('a missing file reports ok:false instead of throwing', missing.ok === false, JSON.stringify(missing).slice(0, 200));
  check('a missing file still returns the full shape',
    Array.isArray(missing.audioTracks) && Array.isArray(missing.chapters) && !!missing.video === false,
    JSON.stringify(missing).slice(0, 200));

  // Cross-check against ffprobe directly: a mismatch here means the parsing is wrong.
  const ffprobe = path.join(process.env.APPDATA, 'net-downloader', 'bin', 'ffprobe.exe');
  if (fs.existsSync(ffprobe)) {
    const raw = spawnSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', SAMPLE],
      { encoding: 'utf8', timeout: 60000 });
    const doc = JSON.parse(raw.stdout);
    const v = doc.streams.find((s) => s.codec_type === 'video');
    const aCount = doc.streams.filter((s) => s.codec_type === 'audio').length;
    check('duration matches ffprobe', Math.abs(m.duration - parseFloat(doc.format.duration)) < 0.5,
      m.duration + ' vs ' + doc.format.duration);
    check('dimensions match ffprobe', m.video.width === v.width && m.video.height === v.height,
      m.video.width + 'x' + m.video.height + ' vs ' + v.width + 'x' + v.height);
    check('audio track count matches ffprobe', m.audioTracks.length === aCount,
      m.audioTracks.length + ' vs ' + aCount);
    check('frame rate matches ffprobe',
      Math.abs(m.video.fps - parseFloat(v.avg_frame_rate)) < 0.01,
      m.video.fps + ' vs ' + parseFloat(v.avg_frame_rate));
  }

  // -------------------------------------------------------------------------
  // system_power_action -- validation only, nothing destructive
  // -------------------------------------------------------------------------
  const eject = obj(await send('system_power_action', { action: 'eject', driveLetter: 'C', dryRun: true }));
  console.log('');
  console.log('  eject dryRun on C: ->', JSON.stringify(eject).slice(0, 240));
  check('eject resolved the volume behind C:', typeof eject.volumePath === 'string' && /Volume\{/.test(eject.volumePath), eject.volumePath);
  check('eject identifies C: as a fixed drive', eject.driveType === 'fixed', eject.driveType);
  check('removability is reported as false for a fixed drive', eject.removable === false, eject.removable);
  check('a fixed drive is refused with an explanation',
    eject.ok === false && /cannot be ejected/i.test(String(eject.error || '')),
    JSON.stringify(eject).slice(0, 200));
  check('nothing was ejected', eject.detail === undefined, eject.detail);

  const unmapped = obj(await send('system_power_action', { action: 'eject', driveLetter: 'Z', dryRun: true }));
  check('an unmounted letter is reported, not crashed on',
    unmapped.ok === false && /no volume is mounted/i.test(String(unmapped.error || '')),
    JSON.stringify(unmapped).slice(0, 200));

  const badLetter = obj(await send('system_power_action', { action: 'eject', driveLetter: 'C:\\Windows' }));
  check('a path instead of a letter is rejected',
    badLetter.ok === false && /must be a single drive letter/i.test(String(badLetter.error || '')),
    JSON.stringify(badLetter).slice(0, 200));

  const emptyLetter = obj(await send('system_power_action', { action: 'eject', driveLetter: '' }));
  check('an empty letter is rejected',
    emptyLetter.ok === false && /must be a single drive letter/i.test(String(emptyLetter.error || '')),
    JSON.stringify(emptyLetter).slice(0, 200));

  const badAction = obj(await send('system_power_action', { action: 'selfdestruct' }));
  check('an unknown action is rejected',
    badAction.ok === false && /must be/i.test(String(badAction.error || '')),
    JSON.stringify(badAction).slice(0, 200));

  const noAction = obj(await send('system_power_action', {}));
  check('a missing action is rejected', noAction.ok === false, JSON.stringify(noAction).slice(0, 200));

  // A letter the caller wrote loosely must still be normalised, not rejected:
  // the drive list sends "E", the export settings send "E:".
  const looseC = obj(await send('system_power_action', { action: 'eject', driveLetter: 'c', dryRun: true }));
  check('a lowercase letter is normalised', looseC.driveLetter === 'C:' || looseC.volumePath,
    JSON.stringify(looseC).slice(0, 200));

  // Shutdown/restart are hard-disabled and must stay that way. Every spelling
  // a caller might reach for has to come back as a refusal with no side
  // effect -- this is the machine-level hazard, so the test asserts the
  // refusal itself rather than trusting the code read.
  const refused = ['shutdown', 'restart', 'poweroff', 'reboot', 'sleep', 'hibernate', 'suspend', 'logoff', 'lock'];
  for (const a of refused) {
    const r = obj(await send('system_power_action', { action: a, driveLetter: 'C', delaySeconds: 0, forceCloseApps: true }));
    check(`"${a}" is refused outright`,
      r.ok !== true && /power actions are not supported/i.test(String(r.error || '')),
      JSON.stringify(r).slice(0, 200));
  }

  // Case and whitespace must not be a way around it either.
  for (const a of ['SHUTDOWN', 'Shutdown', ' restart ', 'shutDown']) {
    const r = obj(await send('system_power_action', { action: a }));
    check(`"${a}" is refused too`,
      r.ok !== true && typeof r.error === 'string' && r.error.length > 0,
      JSON.stringify(r).slice(0, 200));
  }

  // Nothing in the response may hint that a power action succeeded.
  const shutdownAttempt = obj(await send('system_power_action', { action: 'shutdown' }));
  check('no delay is echoed back for a refused power action',
    shutdownAttempt.delaySeconds === undefined, JSON.stringify(shutdownAttempt).slice(0, 200));
  check('the only supported action advertised is eject',
    Array.isArray(shutdownAttempt.supportedActions) &&
    shutdownAttempt.supportedActions.length === 1 &&
    shutdownAttempt.supportedActions[0] === 'eject',
    JSON.stringify(shutdownAttempt.supportedActions));

  // The engine must still be healthy after all of that.
  const after = obj(await send('hw_threads', {}));
  check('engine is still responsive afterwards', typeof after.threads === 'number' && after.threads > 0,
    JSON.stringify(after).slice(0, 160));
  const list = obj(await send('convert_list', {}));
  check('convert_list still answers', Array.isArray(list), JSON.stringify(list).slice(0, 120));

  engine.kill();
  console.log('');
  console.log('I.3a: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
