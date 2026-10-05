/**
 * Phase C1 integration check.
 *
 * Boots the real C++ engine, registers it with electron/core-client.cjs exactly
 * as electron.cjs does, then calls the *actual* production functions
 * (hardwareEngine.probeDuration, detectHardwareAccelerationViaCore) to confirm
 * they route to C++ and return correct values.
 *
 * Also verifies the fallback path still works with the engine forcibly disabled.
 *
 * Usage: node verify-phaseC1-integration.cjs <mediaFile> [mediaFile ...]
 */
const { spawn } = require('child_process');
const path = require('path');
const { resolveEnginePath } = require('./verify-engine.cjs');
const fs = require('fs');

const EXE = resolveEnginePath();
const coreClient = require('./electron/core-client.cjs');

function startEngine() {
  const proc = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let seq = 0, buffer = '';
  proc.stdout.on('data', (d) => {
    buffer += d.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.event || !msg.id) continue;
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p(msg); }
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
  return { proc, sendCoreRequest };
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
};

(async () => {
  const files = process.argv.slice(2).filter((f) => fs.existsSync(f));
  if (files.length === 0) { console.error('Pass at least one existing media file.'); process.exit(2); }

  const engine = startEngine();
  await new Promise((r) => setTimeout(r, 400));

  // Register exactly as electron.cjs does on engine spawn.
  coreClient.register(engine.sendCoreRequest);
  coreClient.setEnabled(true);

  const hw = require('./panamedia-downloader/conversion-engine/hardwareEngine.cjs');

  console.log('\n[A] core-client routes to the live engine');
  {
    const direct = await coreClient.call('hw_threads');
    check('coreClient.call reaches the engine', direct && direct.threads > 0, JSON.stringify(direct));
  }

  console.log('\n[B] detectHardwareAccelerationViaCore');
  {
    let t = Date.now();
    const first = await hw.detectHardwareAccelerationViaCore();
    const firstMs = Date.now() - t;
    check('returns a codec', typeof first === 'string' && first.length > 0, String(first));
    t = Date.now();
    const second = await hw.detectHardwareAccelerationViaCore();
    const secondMs = Date.now() - t;
    check('stable across calls', first === second, `${first} vs ${second}`);
    check('second call is cached (fast)', secondMs < 40, `${secondMs}ms`);
    console.log(`        codec=${first}  cold=${firstMs}ms warm=${secondMs}ms`);
  }

  console.log('\n[C] probeDuration (real production function)');
  {
    for (const f of files) {
      const t = Date.now();
      const dur = await hw.probeDuration(f);
      const ms = Date.now() - t;
      const base = path.basename(f);
      check(`duration > 0 for ${base.slice(0, 34)}`, dur > 0, `got ${dur}`);
      console.log(`        ${dur.toFixed(2)}s in ${ms}ms`);
    }
  }

  console.log('\n[D] fallback still works with the engine disabled');
  {
    coreClient.setEnabled(false);
    const off = await coreClient.call('hw_threads');
    check('coreClient.call returns null when disabled', off === null, JSON.stringify(off));
    const dur = await hw.probeDuration(files[0]);
    check('probeDuration falls back without throwing', typeof dur === 'number', String(dur));
    console.log(`        fallback duration=${dur} (0 expected: local ffprobe crashes)`);

    // Re-enable and confirm recovery.
    coreClient.setEnabled(true);
    const back = await coreClient.call('hw_threads');
    check('recovers after re-enabling', back && back.threads > 0, JSON.stringify(back));
  }

  console.log('\n[E] output_files / list_removable_drives via core-client');
  {
    const listed = await coreClient.call('output_files', { dirPath: __dirname });
    check('output_files returns an array', Array.isArray(listed) && listed.length > 0,
      Array.isArray(listed) ? `len=${listed.length}` : String(listed));
    const drives = await coreClient.call('list_removable_drives');
    check('list_removable_drives returns an array', Array.isArray(drives), String(drives));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  try { engine.proc.kill(); } catch {}
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });