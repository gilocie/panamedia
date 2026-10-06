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
  const r5d = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { subtitle: { subPath: 'C:/subs/en.srt', burnIn: true, encoding: 'ISO-8859-1' } }
    }
  });
  check('burn-in subtitle encoding reaches subtitles filter',
    r5d.args.includes('subtitles=sub.srt:charenc=ISO-8859-1'), r5d.args);
  const r5e = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { subtitle: { subPath: 'C:/subs/en.srt', burnIn: false, encoding: 'Windows-1252' } }
    }
  });
  check('soft subtitle encoding is set before external input',
    r5e.args.indexOf('-sub_charenc') < r5e.args.indexOf('C:/subs/en.srt') &&
      r5e.args.includes('-sub_charenc Windows-1252'), r5e.args);

  // 5d. Crop ratios must crop the frame rather than stretch it.
  const crop = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { crop: { aspectRatio: '16:9', zoom: 150 } }
    }
  });
  check('crop uses a centered aspect-ratio crop with normalized zoom',
    crop.args.includes("crop=w='min(iw,ih*1.77778)/1.5'") &&
      crop.args.includes("x='(iw-ow)/2':y='(ih-oh)/2'") &&
      !crop.args.includes('scale=ih*'), crop.args);

  // 5e. The UI uses percentage offsets; zero is the neutral effect setting.
  const neutralEffects = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { effect: { brightness: 0, contrast: 0, saturation: 0, hue: 0 } }
    }
  });
  check('neutral effects keep default image values',
    neutralEffects.args.includes('eq=brightness=0:contrast=1:saturation=1:hue=0'),
    neutralEffects.args);
  const adjustedEffects = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { effect: { brightness: 50, contrast: 50, saturation: -50, hue: 30 } }
    }
  });
  check('effect percentages map to FFmpeg filter units',
    adjustedEffects.args.includes('eq=brightness=0.5:contrast=1.5:saturation=0.5:hue=30'),
    adjustedEffects.args);

  // 5f. Image watermarks need a two-input graph, not a linear -vf chain.
  const imageWatermark = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { watermark: {
        type: 'image', imagePath: 'C:/logos/logo.png', opacity: 80, position: 'top-right'
      } }
    }
  });
  check('image watermark creates a mapped overlay filter graph',
    imageWatermark.args.includes('movie=logo.png') &&
      imageWatermark.args.includes('colorchannelmixer=aa=0.800000') &&
      imageWatermark.args.includes('overlay=main_w-overlay_w-10:10[vout]') &&
      imageWatermark.args.includes('-map [vout]'), imageWatermark.args);
  const textWatermark = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'mp4', useHwAccel: false,
      tools: { watermark: {
        type: 'text', text: 'Panamedia', opacity: 80, position: 'top-right'
      } }
    }
  });
  check('text watermark uses separate x/y coordinates and fractional opacity',
    textWatermark.args.includes('fontcolor=white@0.800000:fontsize=36:x=main_w-text_w-10:y=10'),
    textWatermark.args);
  const gifWatermark = await send('convert_build_args', {
    ...base, options: {
      mode: 'convert_video', format: 'gif', useHwAccel: false,
      tools: {
        gif: { fps: 5, width: 240 },
        watermark: { type: 'image', imagePath: 'C:/logos/logo.png', opacity: 80, position: 'top-left' }
      }
    }
  });
  check('GIF and image watermark compose in one mapped filter graph',
    gifWatermark.args.includes('movie=logo.png') &&
      gifWatermark.args.includes('palettegen') &&
      gifWatermark.args.includes('overlay=10:10[gifmarked]') &&
      gifWatermark.args.includes('-map [gifout]'), gifWatermark.args);

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
        effect: { brightness: 10, contrast: 20, saturation: 0, hue: 0 },
        subtitle: { subPath: 'C:/subs/en.srt', burnIn: false }
      }
    }
  });
  check('composed: -ss/-to before -i',
    r7.args.indexOf('-ss') < r7.args.indexOf('-i') && r7.args.indexOf('-to') < r7.args.indexOf('-i'), r7.args);
  check('composed: yadif first in vf', r7.args.includes('-vf yadif,scale=-2:\'min(720,ih)\''), r7.args);
  check('composed: eq after scale', /min\(720,ih\)'.*eq=/.test(r7.args), r7.args);
  check('composed: effect values use UI percentages',
    r7.args.includes('eq=brightness=0.1:contrast=1.2:saturation=1:hue=0'), r7.args);

  // Invalid tool/format combinations must fail before FFmpeg starts instead
  // of producing a successful file with the requested edit silently omitted.
  for (const [name, options, message] of [
    ['audio-crop', { mode: 'extract_audio', format: 'mp3', tools: { crop: { aspectRatio: '16:9', zoom: 100 } } }, 'crop tool applies to video'],
    ['soft-sub-webm', { mode: 'convert_video', format: 'webm', tools: { subtitle: { subPath: 'missing.srt', burnIn: false } } }, 'Soft subtitle tracks require MP4, MOV, or MKV'],
    ['gif-mp4', { mode: 'convert_video', format: 'mp4', tools: { gif: { fps: 15, width: 480 } } }, 'GIF creation requires GIF']
  ]) {
    const jobId = `validate-${name}`;
    const start = await send('convert_start', {
      jobId,
      inputPath: __filename,
      outputPath: path.join(os.tmpdir(), `${jobId}.out`),
      options
    });
    let status = {};
    for (let tries = 0; tries < 40; tries++) {
      status = await send('convert_status', { jobId });
      if (status.status === 'failed' || status.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    check(`${name}: unsupported combination fails explicitly`,
      start.started && status.status === 'failed' &&
        String(status.error || '').includes(message),
      JSON.stringify(status));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  p.kill();
  process.exit(fail === 0 ? 0 : 1);
})();
