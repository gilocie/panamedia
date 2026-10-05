/**
 * Demonstrates that electron.cjs's probe cache is fed a *crashing* ffprobe in
 * production, and that verify-phaseA.cjs's green result came from hardcoding a
 * different (working) binary path.
 *
 * Usage: node verify-ffprobe-path.cjs <mediaFile>
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  console.error('Pass an existing media file.');
  process.exit(2);
}

// What the app actually resolves at runtime (package.json name = "panamedia",
// so Electron userData = %APPDATA%\panamedia).
const { ffprobePath } = require('./panamedia-downloader/youtube.cjs');
// What verify-phaseA.cjs hardcodes.
const harnessPath = path.join(process.env.APPDATA, 'net-downloader', 'bin', 'ffprobe.exe');

console.log(`app runtime ffprobePath : ${ffprobePath}`);
console.log(`verify-phaseA.cjs uses : ${harnessPath}`);
console.log('');

function probe(p, label) {
  return new Promise((resolve) => {
    const t = Date.now();
    execFile(p, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_name,codec_type,width,height',
      '-of', 'json', target], { timeout: 8000 }, (err, stdout) => {
      const ms = Date.now() - t;
      if (err) {
        const code = err.code;
        let kind = 'error';
        if (typeof code === 'number' && code < 0) kind = `CRASH (0x${(code >>> 0).toString(16).toUpperCase()})`;
        else if (typeof code === 'number' && code >= 0xC0000000) kind = 'CRASH';
        console.log(`${label}: FAILED ${kind} exit=${code} (${ms}ms)`);
        console.log(`   -> runFfprobe() resolves null; getProbeInfo() caches null.`);
        console.log(`   -> duration/width/height/codecs all unknown to the app.`);
        return resolve(null);
      }
      let info = null;
      try { info = JSON.parse(stdout); } catch {}
      const dur = info?.format?.duration;
      const v = (info?.streams || []).find((s) => s.codec_type === 'video');
      console.log(`${label}: OK (${ms}ms) duration=${dur} video=${v ? v.codec_name + ' ' + v.width + 'x' + v.height : 'none'}`);
      resolve(info);
    });
  });
}

(async () => {
  const a = await probe(ffprobePath, 'APP RUNTIME ');
  const b = await probe(harnessPath, 'HARNESS PATH ');

  console.log('');
  if (!a && b) {
    console.log('CONFIRMED: the app resolves a broken ffprobe; the Phase A harness');
    console.log('           was validating the cache against a working one instead.');
    console.log('           The cache itself is fine -- it is just caching failures.');
  } else if (a && b) {
    console.log('Both binaries work here; the ffprobe path is not currently a problem.');
  } else {
    console.log('Both binaries fail; the ffprobe installation is broken more broadly.');
  }
})();