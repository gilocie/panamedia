// Phase I.1: the stub decoder is gone. Verify the engine still works and
// that the fabricated player_* actions are now rejected rather than
// answering with invented 1920x1080 values.
const { spawn } = require('child_process');
const path = require('path');
const ENGINE = path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe');
const engine = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
let buf = '', q = 0; const pend = new Map();
engine.stdout.on('data', (d) => {
  buf += d; let n;
  while ((n = buf.indexOf('\n')) !== -1) {
    const l = buf.slice(0, n).trim(); buf = buf.slice(n + 1);
    if (!l) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    const r = pend.get(m.id); if (r) { pend.delete(m.id); r(m); }
  }
});
engine.stderr.on('data', () => {});
const send = (a, p) => new Promise((res) => {
  const id = 'x' + (++q); pend.set(id, res);
  engine.stdin.write(JSON.stringify({ id, action: a, payload: JSON.stringify(p || {}) }) + '\n');
});

(async () => {
  await new Promise(r => setTimeout(r, 500));
  let pass = 0, fail = 0;
  const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); if (d !== undefined) console.log('        ' + String(d).slice(0, 200)); } };

  console.log('Phase I.1 -- stub decoder removal');
  console.log('');

  // The bridge hands some payloads over already parsed and some as strings,
  // so normalise before asserting.
  const asObj = (p) => (typeof p === 'string' ? JSON.parse(p) : (p || {}));

  const list = await send('convert_list', {});
  check('engine answers convert_list after the removal', !!list && list.status === 'success' && Array.isArray(list.payload), JSON.stringify(list).slice(0, 120));

  // Every fabricated action must now be an explicit unknown-action error.
  for (const [action, payload] of [
    ['player_open', { filePath: 'C:/x.mp4' }],
    ['player_play', {}],
    ['player_pause', {}],
    ['player_seek', { seconds: 5 }],
    ['player_speed', { speed: 2 }],
    ['player_close', {}],
  ]) {
    const r = await send(action, payload);
    // Before the removal this answered "success" with width 1920 and
    // duration 0 for any path. An explicit error is the point of the check.
    const rejected = r && r.status === 'error' &&
      /Unknown action/i.test(String((r.payload && r.payload.message) || r.payload || ''));
    check(action + ' is rejected as unknown', rejected, JSON.stringify(r).slice(0, 160));
  }

  // Real actions must be unaffected.
  const hw = await send('hw_threads', {});
  check('hw_threads still works', hw && hw.status === 'success' && typeof asObj(hw.payload).threads === 'number',
    JSON.stringify(hw).slice(0, 160));
  const plan = await send('plan_output', { filePath: 'C:/x.mp4', options: { mode: 'convert_video', format: 'mp4' } });
  check('plan_output still works', plan && plan.status === 'success' && !!asObj(plan.payload).outputPath,
    JSON.stringify(plan).slice(0, 160));

  engine.kill();
  console.log('');
  console.log('I.1: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
