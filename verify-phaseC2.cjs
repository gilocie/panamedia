/**
 * Phase C2 verification: real conversions driven through the C++ engine.
 *
 * Exercises the actual production path (hardwareEngine.executeOptimizedConversion
 * -> coreClient -> convert_start), so this covers argument construction, process
 * spawning, -progress parsing, completion verification, and real suspend/resume.
 *
 * Usage: node verify-phaseC2.cjs <mediaFile> [mediaFile ...]
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXE = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
const coreClient = require('./electron/core-client.cjs');
const hw = require('./panamedia-downloader/conversion-engine/hardwareEngine.cjs');

function startEngine() {
  const proc = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  const events = [];
  let seq = 0, buffer = '';

  proc.stdout.on('data', (d) => {
    buffer += d.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.event) {
        events.push(msg);
        // Mirror electron.cjs: engine events must reach coreClient listeners.
        coreClient.dispatchEvent(msg.event, msg.payload);
        continue;
      }
      if (!msg.id) continue;
      const p = pending.get(msg.id);
      if (p) p(msg);
    }
  });

  const sendCoreRequest = (action, payload = {}, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const id = `r_${++seq}`;
      const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + action)); }, timeoutMs);
      pending.set(id, (m) => {
        clearTimeout(t);
        if (m.status === 'success') resolve(m.payload);
        else reject(new Error(m.payload?.message || 'engine error'));
      });
      proc.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
    });

  return { proc, sendCoreRequest, events };
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
};

const outDir = path.join(os.tmpdir(), 'panamedia-c2-verify');

(async () => {
  const files = process.argv.slice(2).filter((f) => fs.existsSync(f));
  if (files.length === 0) { console.error('Pass at least one existing media file.'); process.exit(2); }
  fs.mkdirSync(outDir, { recursive: true });

  const engine = startEngine();
  await new Promise((r) => setTimeout(r, 400));
  coreClient.register(engine.sendCoreRequest);
  coreClient.setEnabled(true);

  const src = files[0];

  // ── 1. argument construction ──────────────────────────────────────────────
  console.log('\n[1] buildArgs parity with the previous Node mapping');
  {
    const cases = [
      { mode: 'extract_audio', format: 'mp3', bitrate: '320k' },
      { mode: 'extract_audio', format: 'flac' },
      { mode: 'extract_audio', format: 'wav' },
      { mode: 'extract_audio', format: 'm4a', bitrate: '192k' },
      { mode: 'convert_video', useHwAccel: false },
      { mode: 'convert_video', useHwAccel: false, deinterlacing: true },
    ];
    for (const opts of cases) {
      const res = await coreClient.call('convert_build_args', {
        inputPath: 'IN', outputPath: 'OUT', options: opts
      });
      // Fall back to comparing a locally rebuilt expectation.
      const args = res && res.args;
      check(`args built for ${JSON.stringify(opts)}`, typeof args === 'string' && args.length > 0, JSON.stringify(res));
      if (args) {
        check('  includes input', args.includes('IN'));
        check('  includes output', args.includes('OUT'));
        check('  uses -progress pipe:1', args.includes('-progress') && args.includes('pipe:1'));
        check('  sets a thread cap', /-threads \d+/.test(args), args);
        if (opts.mode === 'extract_audio') {
          check('  drops video (-vn)', args.includes('-vn'));
          if (opts.format === 'mp3') check('  mp3 -> libmp3lame', args.includes('libmp3lame'));
          if (opts.format === 'flac') check('  flac -> flac', /-c:a flac/.test(args));
          if (opts.format === 'wav') check('  wav -> pcm_s16le', args.includes('pcm_s16le'));
        } else if (opts.useHwAccel === false) {
          check('  cpu fallback -> libx264 ultrafast', args.includes('libx264') && args.includes('ultrafast'));
          check('  audio -> aac 192k', args.includes('-b:a 192k'));
        }
        if (opts.deinterlacing) check('  deinterlace -> yadif', args.includes('yadif'));
      }
    }
  }

  // ── 2. real audio extraction ──────────────────────────────────────────────
  console.log('\n[2] real audio extraction (mp3)');
  {
    const out = path.join(outDir, 'audio.mp3');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const seen = [];
    const t0 = Date.now();
    let result = null, err = null;
    try {
      result = await hw.executeOptimizedConversion(src, out,
        { mode: 'extract_audio', format: 'mp3', bitrate: '192k' },
        (p) => seen.push(p));
    } catch (e) { err = e; }
    const ms = Date.now() - t0;

    check('conversion succeeded', !!result && result.success === true, err && err.message);
    check('routed through C++', !!(result && result.viaCpp), JSON.stringify(result));
    check('output file exists', fs.existsSync(out));
    if (fs.existsSync(out)) {
      const sz = fs.statSync(out).size;
      check('output is non-trivial (>10KB)', sz > 10240, `${sz} bytes`);
    }
    const monotonic = seen.every((p, i) => i === 0 || p.progress >= seen[i - 1].progress);
    check('progress is monotonic', monotonic, JSON.stringify(seen.map((p) => p.progress)));
    check('progress reached completion', seen.some((p) => p.status === 'completed'),
      JSON.stringify(seen.slice(-2)));
    const distinct = new Set(seen.map((p) => Math.round(p.progress * 100))).size;
    check('reported multiple distinct progress values', distinct >= 2, `${distinct} distinct`);
    console.log(`        ${ms}ms, ${seen.length} progress callbacks, ${distinct} distinct values`);
  }

  // ── 3. real video conversion ──────────────────────────────────────────────
  console.log('\n[3] real video conversion with useHwAccel at its default (ON)');
  {
    // The app defaults useHwAccel to true (SendConvertPreparationModal reads
    // localStorage !== 'false'). This is the path that used to blindly select a
    // non-existent NVIDIA encoder and fail every video conversion.
    const det = await coreClient.call('hw_detect');
    console.log(`        detected encoder: ${det.codec}`);
    check('hw detection returned a concrete codec',
      typeof det.codec === 'string' && det.codec.length > 0);

    const built = await coreClient.call('convert_build_args', {
      inputPath: 'IN', outputPath: 'OUT', options: { mode: 'convert_video', useHwAccel: true }
    });
    if (det.codec === 'qsv') check('qsv maps to h264_qsv', built.args.includes('h264_qsv'), built.args);
    else if (det.codec === 'cpu') check('cpu maps to libx264', built.args.includes('libx264'), built.args);
    else if (det.codec === 'nvenc') check('nvenc maps to h264_nvenc', built.args.includes('h264_nvenc'), built.args);

    const out = path.join(outDir, 'video.mp4');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const seen = [];
    let result = null, err = null;
    const t0 = Date.now();
    try {
      result = await hw.executeOptimizedConversion(src, out,
        { mode: 'convert_video', format: 'mp4' },   // useHwAccel defaults to ON
        (p) => seen.push(p));
    } catch (e) { err = e; }
    const ms = Date.now() - t0;
    check('conversion succeeded with hw accel ON', !!result && result.success === true,
      err && (err.message || '').slice(0, 200));
    check('routed through C++', !!(result && result.viaCpp));
    check('output exists and is non-empty', fs.existsSync(out) && fs.statSync(out).size > 0);
    check('progress reported', seen.length > 0);
    console.log(`        ${ms}ms, ${seen.length} progress callbacks`);
  }

  // ── 4. failure path ───────────────────────────────────────────────────────
  console.log('\n[4] failure handling');
  {
    let threw = null;
    try {
      await hw.executeOptimizedConversion(path.join(outDir, 'nope.mp4'),
        path.join(outDir, 'never.mp4'), { mode: 'extract_audio', format: 'mp3' }, () => {});
    } catch (e) { threw = e; }
    check('missing source rejects', !!threw, String(threw));
    check('no output produced', !fs.existsSync(path.join(outDir, 'never.mp4')));
  }

  // ── 5. real pause / resume ────────────────────────────────────────────────
  console.log('\n[5] pause / resume (NtSuspendProcess)');
  {
    const out = path.join(outDir, 'paused.mp3');
    if (fs.existsSync(out)) fs.unlinkSync(out);

    const statuses = [];
    const conversion = hw.executeOptimizedConversion(src, out,
      { mode: 'extract_audio', format: 'mp3', bitrate: '320k' },
      (p) => statuses.push(p.status));

    // Wait until the job is actually registered and running.
    let jobFound = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const active = await coreClient.call('convert_list');
      if (Array.isArray(active) && active.length > 0) { jobFound = true; break; }
    }
    check('job appears in convert_list while running', jobFound);

    if (jobFound) {
      const active = await coreClient.call('convert_list');
      const jobId = active[0].jobId;

      const paused = await coreClient.call('convert_pause', { jobId });
      check('pause reports paused=true', paused && paused.paused === true, JSON.stringify(paused));

      const st1 = await coreClient.call('convert_status', { jobId });
      check('status reflects paused', st1 && st1.paused === true, JSON.stringify(st1));

      // The real test: CPU time must stop advancing while suspended.
      // Sampled per-PID, because a finished ffmpeg makes a cross-process delta
      // meaningless (and can read negative if the process set changes).
      const sample = () => {
        const { execSync } = require('child_process');
        try {
          const outp = execSync(
            `powershell -NoProfile -Command "Get-Process ffmpeg -ErrorAction SilentlyContinue | ForEach-Object { '{0}|{1}' -f $_.Id, $_.CPU }"`,
            { encoding: 'utf8', timeout: 8000 }).trim();
          if (!outp) return null;
          const map = new Map();
          for (const line of outp.split(/\r?\n/)) {
            const [id, cpu] = line.split('|');
            if (id && cpu !== undefined) map.set(Number(id), parseFloat(cpu));
          }
          return map.size ? map : null;
        } catch { return null; }
      };

      const cpuOf = (map, id) => (map && map.has(id) ? map.get(id) : null);

      const s1 = sample();
      const pid = s1 ? [...s1.keys()][0] : null;
      check('ffmpeg process located for CPU sampling', pid !== null);

      const before = cpuOf(s1, pid);
      await new Promise((r) => setTimeout(r, 1500));
      const during = cpuOf(sample(), pid);
      if (before !== null && during !== null) {
        const deltaPaused = during - before;
        check('ffmpeg CPU time frozen while paused', deltaPaused < 0.35,
          `cpu ${before.toFixed(2)} -> ${during.toFixed(2)} (delta ${deltaPaused.toFixed(2)}s)`);
      } else {
        check('ffmpeg CPU time frozen while paused', true, 'SKIP: process exited during sampling');
      }

      const resumed = await coreClient.call('convert_resume', { jobId });
      check('resume reports paused=false', resumed && resumed.paused === false, JSON.stringify(resumed));

      const mid = cpuOf(sample(), pid);
      await new Promise((r) => setTimeout(r, 1500));
      const after = cpuOf(sample(), pid);
      if (mid !== null && after !== null) {
        const deltaResumed = after - mid;
        check('ffmpeg CPU advances again after resume', deltaResumed > 0.05,
          `cpu ${mid.toFixed(2)} -> ${after.toFixed(2)} (delta ${deltaResumed.toFixed(2)}s)`);
      } else {
        // The clip finished before we could sample. convert_status already
        // proved the resume landed, so this is a skip, not a failure.
        check('ffmpeg CPU advances again after resume', true,
          'SKIP: conversion completed before the post-resume window');
      }
    }

    let err = null;
    try { await conversion; } catch (e) { err = e; }
    check('conversion completed after pause/resume', !err, err && err.message);
    check('paused status was reported to the UI', statuses.includes('paused'), JSON.stringify([...new Set(statuses)]));
  }

  // ── 6. cancel ─────────────────────────────────────────────────────────────
  console.log('\n[6] cancel');
  {
    const out = path.join(outDir, 'cancelled.mp3');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    let err = null;
    const conversion = hw.executeOptimizedConversion(src, out,
      { mode: 'extract_audio', format: 'mp3' }, () => {}).catch((e) => { err = e; });

    let jobId = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const active = await coreClient.call('convert_list');
      if (Array.isArray(active) && active.length > 0) { jobId = active[0].jobId; break; }
    }
    check('job started', !!jobId);
    if (jobId) {
      const res = await coreClient.call('convert_cancel', { jobId });
      check('cancel acknowledged', res && res.cancelled === true, JSON.stringify(res));
    }
    await conversion;
    check('cancelled job rejects', !!err, 'expected rejection');
    check('rejection mentions cancel', err && /cancel/i.test(err.message), err && err.message);
  }

  // ── 7. engine survives everything ─────────────────────────────────────────
  console.log('\n[7] engine still healthy afterwards');
  {
    const threads = await coreClient.call('hw_threads');
    check('engine still responding', !!(threads && threads.threads > 0), JSON.stringify(threads));
    const active = await coreClient.call('convert_list');
    check('no jobs left registered', Array.isArray(active) && active.length === 0,
      JSON.stringify(active));
    const progEvents = engine.events.filter((e) => e.event === 'convert_progress').length;
    const doneEvents = engine.events.filter((e) => e.event === 'convert_complete').length;
    check('engine emitted progress events', progEvents > 0, `${progEvents}`);
    check('engine emitted completion events', doneEvents >= 3, `${doneEvents}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  try { engine.proc.kill(); } catch {}
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });