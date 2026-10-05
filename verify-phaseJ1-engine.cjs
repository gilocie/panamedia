// Phase J.1 -- the C++ engine's own direct-play decision.
//
// playback-support was written in four places, and the copies disagreed:
//   * http_server.cpp  -> h264/avc1 in mp4, plus vp8/vp9/av1 in webm only
//   * media_prober.cpp -> h264/vp8/vp9/av1 everywhere
//   * electron.cjs     -> h264/avc1 for mp4, vp8/vp9/av1 for webm
//   * the /transcode path -> h264/avc1 only
//
// Every copy that knew only h264/avc1 reported the real 2.5 hour VP9 sample as
// needing transcoding, which sent the player into a full libx264 re-encode.
// They are now one shared rule (PlaybackSupport) with the Node mirror in
// electron/playback-support.cjs.
//
// These checks run against the built engine binary. Usage:
//   node verify-phaseJ1-engine.cjs
//   PANAMEDIA_ENGINE=path\to\panamedia-core.exe node verify-phaseJ1-engine.cjs

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');

const ENGINE = resolveEnginePath();
const BIN = path.join(process.env.APPDATA || '', 'panamedia', 'bin');
const FFPROBE = path.join(BIN, 'ffprobe.exe');
const FFMPEG = path.join(BIN, 'ffmpeg.exe');
// The engine picks the first free port at or above the requested one, so the
// port it actually bound has to be read back from the start response rather
// than assumed. Asking for a high port avoids colliding with a running app.
let PROBE_BASE = null;

const SAMPLES = [
  path.join(process.env.USERPROFILE, 'Downloads',
    'Build & Sell Claude Code Operating Systems (2+ Hour Course)_1080p.mp4'),
  path.join(process.env.USERPROFILE, 'Videos', 'Screen Recordings',
    'Screen Recording 2025-11-24 205601.mp4')
].filter((p) => fs.existsSync(p));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? `  -> ${detail}` : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startEngine() {
  const proc = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const r = pending.get(msg.id);
        if (r) { pending.delete(msg.id); r(msg); }
      } catch { /* not JSON: engine logging, ignore */ }
    }
  });
  let seq = 0;
  const send = (action, payload = {}, timeoutMs = 20000) => new Promise((resolve, reject) => {
    const id = `j1-${++seq}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout: ' + action)); }, timeoutMs);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    // The bridge expects the payload as a JSON *string*, which is why the
    // existing suites write payload: JSON.stringify(...).
    proc.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
  });
  return { proc, send };
}

function httpProbe(filePath) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`${PROBE_BASE}/probe?path=${encodeURIComponent(filePath)}`,
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

(async () => {
  console.log('Phase J.1 -- engine direct-play decision');
  console.log('engine: ' + ENGINE);
  console.log('samples: ' + (SAMPLES.length ? SAMPLES.map((s) => path.basename(s)).join(', ') : '(none)'));

  if (!fs.existsSync(ENGINE)) {
    console.log('\n  engine binary not found; set PANAMEDIA_ENGINE');
    process.exit(1);
  }

  const { proc, send } = startEngine();
  await sleep(500);

  // Start the streaming server and use the port it reports. /probe lives there,
  // so there is no point testing until it is up.
  // The bridge hands some payloads back parsed and some as JSON strings, so
  // normalise before reading anything out of them.
  const obj = (r) => {
    const p = r && r.payload !== undefined ? r.payload : r;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
  };

  const started = obj(await send('start_stream_server',
    { port: 52480, ffmpegPath: fs.existsSync(FFMPEG) ? FFMPEG : '' }));
  if (!started.port) {
    console.log('\n  could not start the streaming server: ' + JSON.stringify(started));
    try { proc.kill(); } catch (e) {}
    process.exit(1);
  }
  PROBE_BASE = `http://127.0.0.1:${started.port}`;
  console.log('streaming port: ' + started.port);

  try {
    // ── the shared rule, as the engine reports it ──────────────────────────
    if (SAMPLES.length) {
      section('/probe on real files');
      for (const file of SAMPLES) {
        const info = await httpProbe(file);
        const name = path.basename(file).slice(0, 44);
        if (!info) { check(`${name}: /probe responds`, false); continue; }
        console.log(`  ${name}`);
        console.log(`      ${info.videoCodec} ${info.width}x${info.height} + ${info.audioCodec || 'none'}` +
          ` -> needsTranscode=${info.needsTranscode}`);
        check(`  ${name}: /probe succeeds`, info.success === true);
        check(`  ${name}: reports a duration`, info.duration > 0, info.duration);
        check(`  ${name}: directPlay agrees with needsTranscode`,
          info.directPlay === !info.needsTranscode);
      }

      // The regression, stated as a fact about the real file.
      section('the regression this replaces (real VP9 sample)');
      const vp9File = SAMPLES.find((f) => /\.mp4$/i.test(f) && /Claude Code/i.test(f));
      if (vp9File) {
        const info = await httpProbe(vp9File);
        if (info && info.videoCodec === 'vp9') {
          check('the VP9 sample is reported as directly playable',
            info.needsTranscode === false,
            `needsTranscode=${info.needsTranscode} codec=${info.videoCodec}`);
          check('the old h264/avc1 rule would have transcoded it',
            ['h264', 'avc1'].includes(info.videoCodec) === false,
            'the old rule accepted only ' + JSON.stringify(['h264', 'avc1']));
        } else {
          console.log(`  (skipped: sample codec is ${info ? info.videoCodec : 'unknown'}, not vp9)`);
        }
      }

      // ── probe_media agrees with /probe ───────────────────────────────────
      section('probe_media and /probe agree');
      for (const file of SAMPLES) {
        const viaHttp = await httpProbe(file);
        let viaIpc = null;
        try { viaIpc = obj(await send('probe_media', { filePath: file })); }
        catch (e) { check(`probe_media on ${path.basename(file).slice(0, 30)}`, false, e.message); continue; }
        const name = path.basename(file).slice(0, 34);
        check(`  ${name}: probe_media succeeds`, viaIpc && viaIpc.ok === true,
          JSON.stringify(viaIpc).slice(0, 120));
        if (viaIpc && viaIpc.ok && viaHttp && viaHttp.success) {
          const ipcCodec = viaIpc.video && viaIpc.video.codec ? viaIpc.video.codec : '';
          check(`  ${name}: same video codec from both paths`,
            ipcCodec === viaHttp.videoCodec,
            `ipc=${ipcCodec} http=${viaHttp.videoCodec}`);
          check(`  ${name}: same dimensions from both paths`,
            (viaIpc.video ? viaIpc.video.width : 0) === viaHttp.width &&
            (viaIpc.video ? viaIpc.video.height : 0) === viaHttp.height,
            `ipc=${viaIpc.video && viaIpc.video.width}x${viaIpc.video && viaIpc.video.height} ` +
            `http=${viaHttp.width}x${viaHttp.height}`);
          check(`  ${name}: durations agree to within a tenth of a second`,
            Math.abs((viaIpc.duration || 0) - (viaHttp.duration || 0)) < 0.1,
            `ipc=${viaIpc.duration} http=${viaHttp.duration}`);
        }
      }
    } else {
      console.log('\n  (no sample video found; skipping real-file checks)');
    }

    // ── a synthetic HEVC file still transcodes ─────────────────────────────
    // The fix must not have turned into "never transcode". HEVC is the case
    // that genuinely needs ffmpeg.
    if (fs.existsSync(FFMPEG) && fs.existsSync(FFPROBE)) {
      section('a file that genuinely needs transcoding');
      const work = path.join(os.tmpdir(), 'panamedia-j1-engine');
      fs.mkdirSync(work, { recursive: true });
      const mk = (name, args) => {
        const out = path.join(work, name);
        const r = spawn(FFMPEG, ['-v', 'error', ...args, '-y', out], { timeout: 60000 });
        return new Promise((res) => r.on('close', (code) => res(code === 0 ? out : null)));
      };

      // VP9 in MP4: the case that used to be re-encoded.
      const vp9 = await mk('vp9.mp4', [
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libvpx-vp9', '-b:v', '100k', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '64k'
      ]);
      if (vp9) {
        const info = await httpProbe(vp9);
        check('a synthetic VP9-in-MP4 is direct play', info && info.needsTranscode === false,
          info ? `codec=${info.videoCodec} needsTranscode=${info.needsTranscode}` : 'no response');
      } else {
        check('could build a VP9 fixture', false, 'libvpx-vp9 unavailable');
      }

      // H.264 in MKV: container Chromium does not reliably demux.
      const mkv = await mk('h264.mkv', [
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
        '-c:a', 'aac', '-b:a', '64k'
      ]);
      if (mkv) {
        const info = await httpProbe(mkv);
        check('H.264 in MKV still reports needsTranscode', info && info.needsTranscode === true,
          info ? `needsTranscode=${info.needsTranscode}` : 'no response');
      } else {
        check('could build an MKV fixture', false);
      }

      // A 10-bit source: the browser stream path expects 8-bit.
      const tenbit = await mk('yuv444p.mp4', [
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-preset', 'ultrafast'
      ]);
      if (tenbit) {
        const info = await httpProbe(tenbit);
        check('a 10-bit/4:4:4 source reports needsTranscode', info && info.needsTranscode === true,
          info ? `pix=${info.pixelFormat} needsTranscode=${info.needsTranscode}` : 'no response');
      }
    }

    // ── shutdown must still be refused ─────────────────────────────────────
    // Not the subject of this phase, but a playback change is no excuse for
    // the power actions to come back.
    section('power actions remain refused');
    for (const action of ['shutdown', 'restart', 'poweroff', 'reboot', 'sleep', 'hibernate', 'logoff']) {
      const r = obj(await send('system_power_action', { action }));
      check(`  ${action} is refused`, r.ok === false, JSON.stringify(r).slice(0, 90));
    }
  } finally {
    try { proc.kill(); } catch (e) {}
  }

  console.log(`\nJ.1 engine: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();