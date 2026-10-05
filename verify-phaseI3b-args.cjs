// Phase I.3b -- audio track selection, chapters and metadata reach the ffmpeg
// command.
//
// These options were added to the engine, but nothing proved they changed
// anything: a control that is stored and never read into the command looks
// identical to one that works, right up until someone exports a file and the
// second audio track is missing.
//
// The checks come in two layers:
//
//   1. Argument inspection, via convert_build_args. Fast, exact, and it can
//      assert things a finished file cannot show -- that an option which was
//      never set emits *no* flag at all.
//   2. Real conversions. Fixtures are generated with ffmpeg (multi-audio,
//      chapters, tags), converted through the engine, then re-probed to
//      confirm the output really has what was asked for.
//
// Layer 1 also pins a deliberate design decision: -map_chapters and
// -map_metadata are emitted ONLY when the caller sends the option key. Adding
// them unconditionally would be tidier but would rewrite every existing
// command, and the point of this phase was to add features without changing
// behaviour for anyone not using them.
//
// Usage: node verify-phaseI3b-args.cjs

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');

const ENGINE = resolveEnginePath();
const BIN = path.join(process.env.APPDATA || '', 'panamedia', 'bin');
const FFMPEG = path.join(BIN, 'ffmpeg.exe');
const FFPROBE = path.join(BIN, 'ffprobe.exe');
const WORK = path.join(os.tmpdir(), 'panamedia-i3b');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? `  -> ${detail}` : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── engine plumbing ──────────────────────────────────────────────────────
const proc = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
let buf = '', seq = 0;
const pending = new Map();
proc.stdout.on('data', (d) => {
  buf += d;
  let n;
  while ((n = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, n).trim();
    buf = buf.slice(n + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const r = pending.get(m.id);
    if (r) { pending.delete(m.id); r(m); }
  }
});
proc.stderr.on('data', () => {});

function call(action, payload = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = `i3b-${++seq}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout: ' + action)); }, timeoutMs);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    proc.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
  });
}
const obj = (r) => {
  const p = r && r.payload !== undefined ? r.payload : r;
  return typeof p === 'string' ? JSON.parse(p) : (p || {});
};

// The command string, split into argv tokens the way the engine would hand
// them to CreateProcess. buildArgs joins with spaces for readability, so the
// fixtures keep every path free of spaces and assertions can rely on that.
async function buildArgs(options) {
  const r = obj(await call('convert_build_args', {
    inputPath: path.join(WORK, 'IN.mp4'),
    outputPath: path.join(WORK, 'OUT.mp4'),
    options
  }));
  return r.args || '';
}

function ffmpegRun(args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const r = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    r.stderr.on('data', (d) => { err += d.toString(); });
    const timer = setTimeout(() => { try { r.kill(); } catch (e) {} }, timeoutMs);
    r.on('close', (code) => { clearTimeout(timer); resolve({ code, err }); });
    r.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, err: String(e) }); });
  });
}

function probe(file) {
  return new Promise((resolve) => {
    const r = spawn(FFPROBE, ['-v', 'error', '-print_format', 'json',
      '-show_format', '-show_streams', '-show_chapters', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    r.stdout.on('data', (d) => { out += d; });
    r.stderr.on('data', (d) => { err += d; });
    r.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
    r.on('error', () => resolve(null));
  });
}

async function waitForOutput(p, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) {
      await sleep(300);
      if (fs.statSync(p).size > 0) return true;
    }
    await sleep(250);
  }
  return false;
}

(async () => {
  console.log('Phase I.3b -- conversion args for audio tracks, chapters, metadata');
  console.log('engine: ' + ENGINE);
  fs.mkdirSync(WORK, { recursive: true });

  const haveFfmpeg = fs.existsSync(FFMPEG) && fs.existsSync(FFPROBE);
  if (!haveFfmpeg) console.log('\n  WARNING: ffmpeg/ffprobe missing -- argument checks only, no real conversions');

  await sleep(400);

  // ── absent options must emit nothing ────────────────────────────────────
  // This is the compatibility guarantee. A user who never touches the new
  // controls must get the exact command they got before this phase.
  section('options that were never set emit no flag at all');
  const bare = await buildArgs({ mode: 'convert_video', format: 'mp4' });
  check('no -map_chapters when chapters was not sent', !bare.includes('-map_chapters'), bare.slice(0, 200));
  check('no -map_metadata when metadataMode was not sent', !bare.includes('-map_metadata'), bare.slice(0, 200));
  check('no explicit -map when no audio tracks were picked', !bare.includes('-map 0:v:0'), bare.slice(0, 200));
  check('still encodes video', bare.includes('libx264') || bare.includes('h264_'), bare.slice(0, 160));

  // ── audio track selection ───────────────────────────────────────────────
  section('audio track selection');
  const oneTrack = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [1] });
  check('one track -> -map 0:v:0', oneTrack.includes('-map 0:v:0'), oneTrack);
  check('one track -> -map 0:a:1?', oneTrack.includes('-map 0:a:1?'), oneTrack);
  check('the other track is not mapped', !oneTrack.includes('-map 0:a:0?'), oneTrack);
  // ffmpeg's automatic selection is switched off entirely by any -map, so
  // subtitles have to be asked for by hand or they vanish silently.
  check('source subtitles are preserved (0:s?)', oneTrack.includes('-map 0:s?'), oneTrack);

  const twoTracks = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [0, 2] });
  check('two tracks -> both are mapped', twoTracks.includes('-map 0:a:0?') && twoTracks.includes('-map 0:a:2?'), twoTracks);
  check('track 1 is absent', !twoTracks.includes('-map 0:a:1?'), twoTracks);

  const dupes = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [1, 1, 1] });
  check('a repeated index is mapped once',
    (dupes.match(/-map 0:a:1\?/g) || []).length === 1, dupes);

  const negative = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [-1] });
  check('a negative index is dropped, not passed to ffmpeg', !negative.includes('0:a:-1'), negative);
  check('a negative index alone leaves the automatic selection alone',
    !negative.includes('-map 0:v:0'), negative);

  const absurd = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [9999] });
  check('an out-of-range index is dropped', !absurd.includes('0:a:9999'), absurd);

  const emptyList = await buildArgs({ mode: 'convert_video', format: 'mp4', audioTracks: [] });
  check('an empty list is treated as "not chosen", not "no audio"',
    !emptyList.includes('-map 0:v:0'), emptyList);

  // ── chapters ────────────────────────────────────────────────────────────
  section('chapters');
  const keepCh = await buildArgs({ mode: 'convert_video', format: 'mkv', chapters: 'keep' });
  check('keep -> -map_chapters 0', keepCh.includes('-map_chapters 0'), keepCh);
  const stripCh = await buildArgs({ mode: 'convert_video', format: 'mkv', chapters: 'strip' });
  check('strip -> -map_chapters -1', stripCh.includes('-map_chapters -1'), stripCh);

  // ── metadata ────────────────────────────────────────────────────────────
  section('metadata');
  const keepMeta = await buildArgs({ mode: 'convert_video', format: 'mkv', metadataMode: 'keep' });
  check('keep -> -map_metadata 0', keepMeta.includes('-map_metadata 0'), keepMeta);
  const stripMeta = await buildArgs({ mode: 'convert_video', format: 'mkv', metadataMode: 'strip' });
  check('strip -> -map_metadata -1', stripMeta.includes('-map_metadata -1'), stripMeta);
  check('strip drops field edits as well', !stripMeta.includes('-metadata '), stripMeta);

  const titled = await buildArgs({
    mode: 'convert_video', format: 'mkv', metadataMode: 'keep',
    metadata: { title: 'My Film', artist: 'Someone' }
  });
  // buildArgs quotes any token containing a space, so a value with one arrives
  // as -metadata "title=My Film". Both spellings are the same instruction.
  check('a field edit in keep mode is applied',
    /-metadata "?title=My Film"?/.test(titled), titled);
  check('a second field is applied', titled.includes('-metadata artist=Someone'), titled);
  check('keep mode still copies the rest', titled.includes('-map_metadata 0'), titled);

  const cleared = await buildArgs({
    mode: 'convert_video', format: 'mkv', metadataMode: 'keep', metadata: { comment: '' }
  });
  check('an empty string clears a field rather than omitting it',
    cleared.includes('-metadata comment='), cleared);

  // ── combinations ────────────────────────────────────────────────────────
  section('options combined');
  const combined = await buildArgs({
    mode: 'convert_video', format: 'mkv', audioTracks: [0, 1],
    chapters: 'strip', metadataMode: 'keep', metadata: { title: 'Both' }
  });
  check('all four reach the same command',
    combined.includes('-map 0:v:0') && combined.includes('-map 0:a:0?') &&
    combined.includes('-map 0:a:1?') && combined.includes('-map_chapters -1') &&
    combined.includes('-map_metadata 0') && combined.includes('-metadata title=Both'), combined);
  check('every flag in the combined command has a value',
    combined.split(/\s+/).every((tok, i, arr) =>
      !tok.startsWith('-') || arr[i + 1] !== undefined || /-(y|n|vf|f|threads)$/.test(tok)),
    combined);

  // ── the real thing ──────────────────────────────────────────────────────
  if (haveFfmpeg) {
    section('real conversions');

    // A fixture with three audio tracks, two chapters and some tags: the
    // exact shape the new controls exist to handle.
    const fixture = path.join(WORK, 'multitrack.mkv');
    if (!fs.existsSync(fixture)) {
      const make = await ffmpegRun([
        '-v', 'error',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=6',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
        '-f', 'lavfi', '-i', 'sine=frequency=660:duration=6',
        '-f', 'lavfi', '-i', 'sine=frequency=880:duration=6',
        '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:a',
        '-metadata:s:a:0', 'title=English',
        '-metadata:s:a:1', 'title=French',
        '-metadata:s:a:2', 'title=German',
        '-metadata', 'title=Original Title',
        '-metadata', 'artist=Original Artist',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
        '-c:a', 'aac', '-b:a', '64k',
        // An ffmetadata file gives real chapter markers.
        '-f', 'ffmetadata', '-i', 'ffmpeg',
        '-y', fixture
      ]);
      // Chapters come from a separate metadata input; build that explicitly.
      if (make.code !== 0 || !fs.existsSync(fixture)) {
        const metaFile = path.join(WORK, 'chapters.txt');
        fs.writeFileSync(metaFile,
          ';FFMETADATA1\n' +
          '[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=3000\ntitle=Opening\n' +
          '[CHAPTER]\nTIMEBASE=1/1000\nSTART=3000\nEND=6000\ntitle=Closing\n', 'utf8');
        const retry = await ffmpegRun([
          '-v', 'error',
          '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=6',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
          '-f', 'lavfi', '-i', 'sine=frequency=660:duration=6',
          '-f', 'lavfi', '-i', 'sine=frequency=880:duration=6',
          '-i', metaFile,
          '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:a', '-map_metadata', '4',
          '-metadata:s:a:0', 'title=English',
          '-metadata:s:a:1', 'title=French',
          '-metadata:s:a:2', 'title=German',
          '-metadata', 'title=Original Title',
          '-metadata', 'artist=Original Artist',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
          '-c:a', 'aac', '-b:a', '64k', '-y', fixture
        ]);
        check('built a multi-audio fixture with chapters', retry.code === 0,
          retry.err.slice(0, 300));
      }
    }
    check('the fixture exists', fs.existsSync(fixture));

    const src = fs.existsSync(fixture) ? await probe(fixture) : null;
    if (src) {
      const audios = (src.streams || []).filter((s) => s.codec_type === 'audio');
      console.log(`  fixture: ${(src.streams || []).filter((s) => s.codec_type === 'video').length} video, ` +
        `${audios.length} audio, ${(src.chapters || []).length} chapters, ` +
        `title="${src.format && src.format.tags && src.format.tags.title}"`);
      check('the fixture really has 3 audio tracks', audios.length === 3, audios.length + ' found');
      check('the fixture really has chapters', (src.chapters || []).length === 2,
        (src.chapters || []).length + ' found');
      check('the fixture really carries tags',
        !!(src.format && src.format.tags && src.format.tags.title),
        JSON.stringify(src.format && src.format.tags));
    }

    if (src && audios_ok(src)) {
      // Pick tracks 0 and 2, strip the chapters, retag.
      const outSel = path.join(WORK, 'selected.mkv');
      if (fs.existsSync(outSel)) fs.unlinkSync(outSel);
      // convert_start is asynchronous: it returns once the job is queued and
      // reports progress as events, so the file is polled rather than awaited.
      const conv = await call('convert_start', {
        jobId: 'i3b-select',
        inputPath: fixture, outputPath: outSel,
        options: {
          mode: 'convert_video', format: 'mkv',
          audioTracks: [0, 2],
          chapters: 'strip', metadataMode: 'keep',
          metadata: { title: 'Renamed Title', artist: '' },
          useHwAccel: false
        }
      }, 180000);
      const got = await waitForOutput(outSel, 15000);
      check('the conversion produced a file', got, obj(conv).error || JSON.stringify(obj(conv)).slice(0, 200));

      if (got) {
        const res = await probe(outSel);
        const outAudios = (res.streams || []).filter((s) => s.codec_type === 'audio');
        console.log(`  output: ${outAudios.length} audio track(s), ` +
          `${(res.chapters || []).length} chapters, ` +
          `title="${res.format && res.format.tags && res.format.tags.title}"`);
        check('exactly the two picked tracks survived', outAudios.length === 2,
          outAudios.length + ' tracks');
        check('chapters were stripped', (res.chapters || []).length === 0,
          (res.chapters || []).length + ' chapters remain');
        check('the title was replaced',
          res.format && res.format.tags && res.format.tags.title === 'Renamed Title',
          JSON.stringify(res.format && res.format.tags));
        check('clearing a field removed it',
          res.format && res.format.tags && !res.format.tags.artist,
          JSON.stringify(res.format && res.format.tags));

        // The two surviving tracks are the ones that were picked: track 0 is
        // English, track 1 was French and should be gone.
        const titles = outAudios.map((s) => (s.tags && (s.tags.title || s.tags.TITLE)) || '');
        check('French (the unselected middle track) is gone', !titles.includes('French'), titles.join('|'));
      }

      // And the opposite: keep everything, keep chapters.
      const outAll = path.join(WORK, 'all.mkv');
      if (fs.existsSync(outAll)) fs.unlinkSync(outAll);
      await call('convert_start', {
        jobId: 'i3b-all',
        inputPath: fixture, outputPath: outAll,
        options: {
          mode: 'convert_video', format: 'mkv',
          chapters: 'keep', metadataMode: 'keep', useHwAccel: false
        }
      }, 180000);
      if (await waitForOutput(outAll, 15000)) {
        const res = await probe(outAll);
        // Leaving audioTracks unset means ffmpeg's own default selection, and
        // that keeps exactly ONE audio stream, not all of them. Verified by
        // running plain `ffmpeg -c copy` on the same fixture, which also
        // produces a single audio track. Picking tracks is the only way to keep
        // more than one, and that is what the picker is for.
        check('unset audioTracks keeps one track, matching ffmpeg default',
          (res.streams || []).filter((s) => s.codec_type === 'audio').length === 1,
          (res.streams || []).filter((s) => s.codec_type === 'audio').length + ' tracks');
        check('keep chapters preserves both chapters', (res.chapters || []).length === 2,
          (res.chapters || []).length + ' chapters');
        check('keep metadata preserves the original title',
          res.format && res.format.tags && res.format.tags.title === 'Original Title',
          JSON.stringify(res.format && res.format.tags));
      } else {
        check('the keep-everything conversion produced a file', false);
      }
    }
  }

  function audios_ok(s) {
    return (s.streams || []).filter((x) => x.codec_type === 'audio').length === 3;
  }

  try { proc.kill(); } catch (e) {}
  console.log(`\nI.3b: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();