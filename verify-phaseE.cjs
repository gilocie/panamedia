// Phase E verification: container-native codecs, resolution
// scaling, audio bitrate, soft subtitles, compress.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const p = spawn('src-cpp/build/bin/Release/panamedia-core.exe', [], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '', q = 0;
const pend = new Map();
p.stdout.on('data', d => {
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
p.stderr.on('data', () => {});

const send = (action, payload) => new Promise(res => {
  const id = 'x' + (++q);
  pend.set(id, res);
  p.stdin.write(JSON.stringify({ id, action, payload: JSON.stringify(payload) }) + '\n');
});

const SRC = process.argv[2];
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`); }
};

(async () => {
  await new Promise(r => setTimeout(r, 400));

  const base = { inputPath: 'IN', outputPath: 'OUT', options: {} };

  // 1. Container-native codecs
  for (const [fmt, expect] of [
    ['mp4', ['libx264', 'aac']],
    ['mkv', ['libx264', 'aac']],
    ['mov', ['libx264', 'aac']],
    ['webm', ['libvpx-vp9', 'libopus']],
    ['avi', ['mpeg4', 'libmp3lame']]
  ]) {
    const r = await send('convert_build_args', {
      ...base,
      options: { mode: 'convert_video', format: fmt, useHwAccel: false, audioBitrate: '256k' }
    });
    const has = (flag, val) => {
      const i = r.args.indexOf(flag);
      return i !== -1 && r.args.slice(i + flag.length + 1, i + flag.length + 1 + val.length) === val;
    };
    check(`${fmt} video codec ${expect[0]}`, has('-c:v', expect[0]), r.args);
    check(`${fmt} audio codec ${expect[1]}`, has('-c:a', expect[1]), r.args);
  }

  // 2. faststart only on ISO-BMFF
  for (const [fmt, shouldHave] of [['mp4', true], ['mov', true], ['mkv', false], ['webm', false], ['avi', false]]) {
    const r = await send('convert_build_args', {
      ...base, options: { mode: 'convert_video', format: fmt, useHwAccel: false }
    });
    check(`${fmt} faststart ${shouldHave ? 'present' : 'absent'}`, r.args.includes('+faststart') === shouldHave, r.args);
  }

  // 3. Resolution scaling, never upscales
  for (const [res, target] of [['1080p', 1080], ['720p', 720], ['480p', 480]]) {
    const r = await send('convert_build_args', {
      ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false, bitrate: res }
    });
    check(`${res} -> scale=-2:min(${target},ih)`, r.args.includes(`scale=-2:'min(${target},ih)'`), r.args);
  }

  // 4. Audio bitrate honored (was hardcoded 192k)
  const r4 = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false, audioBitrate: '320k' }
  });
  check('audio bitrate 320k', r4.args.includes('-b:a 320k'), r4.args);
  const r4b = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false }
  });
  check('audio bitrate defaults 192k', r4b.args.includes('-b:a 192k'), r4b.args);

  // 5. Soft subtitles: second input + map + mov_text
  const r5 = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { subtitle: { subPath: 'C:/subs/en.srt', burnIn: false } }
    }
  });
  check('soft sub: second input', r5.args.includes('-i') && r5.args.includes('C:/subs/en.srt'), r5.args);
  check('soft sub: -map 0:v:0', r5.args.includes('-map 0:v:0'), r5.args);
  check('soft sub: -c:s mov_text', r5.args.includes('-c:s mov_text'), r5.args);

  // 5b. mkv soft subs use ass
  const r5b = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mkv', useHwAccel: false,
      tools: { subtitle: { subPath: 'C:/subs/en.srt', burnIn: false } }
    }
  });
  check('mkv soft sub: -c:s ass', r5b.args.includes('-c:s ass'), r5b.args);

  // 5c. burn-in still uses the subtitles filter
  const r5c = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { subtitle: { subPath: 'C:/subs/en.srt', burnIn: true } }
    }
  });
  // Burn-in addresses the subtitle by its staged plain name, never the
  // real path -- see stageFilterInputs in conversion_engine.cpp.
  check('burn-in: staged bare name, no path escaping',
    r5c.args.includes('subtitles=sub.srt') && !r5c.args.includes('subs/en.srt'),
    r5c.args);

  // 6. Compress per format
  const r6a = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'webm', useHwAccel: false, tools: { compress: { targetReduction: 0.5 } } }
  });
  check('webm compress: crf 40', r6a.args.includes('-crf 40'), r6a.args);
  const r6b = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'avi', useHwAccel: false, tools: { compress: { targetReduction: 0.5 } } }
  });
  check('avi compress: q:v 13', r6b.args.includes('-q:v 13'), r6b.args);
  const r6c = await send('convert_build_args', {
    ...base, options: { mode: 'convert_video', format: 'mp4', useHwAccel: false, tools: { compress: { targetReduction: 0.5 } } }
  });
  check('mp4 compress: single crf 29', (r6c.args.match(/-crf/g) || []).length === 1 && r6c.args.includes('-crf 29'), r6c.args);

  // 7. Full composition: trim + scale + tools + soft sub together
  const r7 = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false, bitrate: '720p',
      audioBitrate: '256k', deinterlacing: true,
      tools: {
        cut: { startSec: 10, endSec: 60 },
        crop: { aspectRatio: '16:9', zoom: 1 },
        effect: { brightness: 0.1, contrast: 1.2, saturation: 1, hue: 0 },
        subtitle: { subPath: 'C:/subs/en.srt', burnIn: false }
      }
    }
  });
  check('composed: -ss/-to before -i',
    r7.args.indexOf('-ss') < r7.args.indexOf('-i') && r7.args.indexOf('-to') < r7.args.indexOf('-i'), r7.args);
  check('composed: yadif first in vf', r7.args.includes('-vf yadif,scale=-2:\'min(720,ih)\''), r7.args);
  check('composed: eq after scale', /min\(720,ih\)'.*eq=/.test(r7.args), r7.args);

  console.log(`\n${pass} passed, ${fail} failed`);
  p.kill();
  process.exit(fail === 0 ? 0 : 1);
})();
