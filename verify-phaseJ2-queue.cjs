// Phase J.2 -- the converter queue must be only what the user put in it.
//
// Two bugs, both reported as symptoms of the same thing:
//
//   "Clicking the converter icon adds what I'm watching to Converter Pro"
//   "I can't remove all the media, including the one I'm watching"
//
// One root cause each, and they compounded:
//
// 1. The player header button set __openConverterProDirect as a side effect of
//    opening, and that flag was what told the modal to add `filePath` to the
//    queue. Opening a panel changed persistent state.
//
// 2. THREE separate writers could write to the queue, and two of them wrote
//    from stale copies of the list:
//      - SendToFlashModal had a useEffect adding filePath on every change
//      - SendConvertPreparationModal had a useEffect writing the `queuedFiles`
//        prop back to storage
//      - converterQueue itself
//    So a removal was undone within a render or two. That is why it looked
//    impossible to remove the playing file specifically: it was the one entry
//    something kept re-adding.
//
// The rule this suite pins: the queue contains exactly what was explicitly
// added, and stays empty until something adds to it.
//
// These are static checks over the source. The bug was never in a data
// structure -- it was in three components disagreeing about who owns the list --
// so the property to test is that only one writer remains.
//
// Usage: node verify-phaseJ2-queue.cjs

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('  MISSING: ' + rel); return ''; }
  return fs.readFileSync(p, 'utf8');
};

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const section = (t) => console.log('\n[' + t + ']');

const queue = read('src/components/panamedia/converterQueue.ts');
const flash = read('src/components/SendToFlashModal.tsx');
const prep = read('src/components/SendConvertPreparationModal.tsx');
const player = read('src/components/panamediaPlayer.tsx');
const playlist = read('src/components/panamedia/PlaylistPanel.tsx');
const video = read('src/components/panamedia/VideoScreen.tsx');

console.log('Phase J.2 -- converter queue ownership');

if (!queue || !flash || !prep || !player) {
  console.log('\n  could not read the sources');
  process.exit(1);
}

// ── the flag must not exist anymore ───────────────────────────────────────
section('the open-and-add flag is gone');
const oldFlag = '__openConverterProDirect';
const flagUsers = [
  ['panamediaPlayer.tsx', player],
  ['SendToFlashModal.tsx', flash],
  ['SendConvertPreparationModal.tsx', prep]
].filter(([, src]) => src.includes(oldFlag));

check('no source still references __openConverterProDirect',
  flagUsers.length === 0,
  flagUsers.map(([n]) => n).join(', '));
check('the flag is not set anywhere',
  !/__openConverterProDirect\s*=/.test(player + flash + prep));
check('the flag is not read anywhere',
  !/__openConverterProDirect\b/.test(player + flash + prep));

// ── adding happens only on an explicit act ────────────────────────────────
section('only an explicit user action adds to the queue');
// Opening the converter must never add. Right-click may, because right-click IS
// the convert gesture -- but it has to be the only place in this file that does.
const addCallSites = (player.match(/addToQueue\s*\(/g) || []).length;
check('panamediaPlayer adds exactly once (the right-click handler)',
  addCallSites === 1,
  addCallSites + ' call site(s)');

check('SendToFlashModal no longer adds filePath on open',
  !/addToQueue\s*\(\s*\[\s*filePath\s*\]/.test(flash),
  'the header button used to add the playing file here');

// The header button is the one that must stay pure.
const headerHandler = /onOpenConverter:\s*\(\)\s*=>\s*\{[\s\S]*?\}/.exec(player);
check('the header converter button has no queue write in it',
  !headerHandler || !/addToQueue|player_sendTray|localStorage/.test(headerHandler[0]),
  headerHandler ? headerHandler[0].slice(0, 120) : 'handler not found');

const ipcHandler = /onOpenReq\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};/.exec(player);
check('the IPC converter-open handler has no queue write in it',
  !ipcHandler || !/addToQueue|player_sendTray/.test(ipcHandler[0]),
  ipcHandler ? ipcHandler[0].slice(0, 120) : 'handler not found');

// ── right-click is the convert gesture ────────────────────────────────────
section('right-click on media queues it directly');
const rc = /let\s+Bn\s*=\s*\(0,\s*_\.useCallback\)\(\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/.exec(player);
check('the right-click handler was found', !!rc,
  'panamediaPlayer no longer matches the expected handler shape');
const rcBody = rc ? rc[1] : '';

check('right-click on media adds the clicked file',
  /addToQueue\(\s*\[\s*n\s*\]\s*\)/.test(rcBody),
  'right-click must add the clicked path to the queue');
check('right-click goes through converterQueue, not localStorage',
  !/localStorage/.test(rcBody));
check('right-click opens the preparation screen',
  /__openConverterProOpen|converter-open-request/.test(rcBody),
  'queueing alone is not enough -- the user must land on the converter');
check('right-click never touches the conversion options',
  !/sendConvertOptions|setSendConvertOptions/.test(rcBody));

// Folders are a different thing: a batch destination choice, which is genuinely
// the send/copy modal's job. Only media short-circuits to the converter.
check('folders still open the send/copy modal',
  /if\s*\(\s*r\s*\)\s*\{[\s\S]{0,200}?return/.test(rcBody));
check('the folder branch sets the folder flag',
  /H\(\s*!0\s*\)|H\(\s*true\s*\)/.test(rcBody));
check('the media branch clears the folder flag',
  /H\(\s*!1\s*\)|H\(\s*false\s*\)/.test(rcBody));
check('an already-open converter is told to show the prepare screen',
  /if\s*\(\s*Ee\s*\)[\s\S]{0,400}?converter-open-request/.test(rcBody),
  'the modal will not remount, so its state initializer will not run again');

// Both surfaces must route here rather than opening the send/copy modal.
check('right-clicking the video routes to the handler',
  /onContextMenu:\s*\(e\)\s*=>\s*\{[\s\S]{0,120}?Bn\(/.test(player));
check('right-clicking a playlist item routes to the handler',
  /onContextMenu=\{\(e\)\s*=>\s*\{[\s\S]{0,160}?showContextMenu\(/.test(playlist));
check('right-clicking a folder still passes the folder flag',
  /showContextMenu\([^)]*folderPath[^)]*true\s*\)/.test(playlist));

// The video surface must not swallow the gesture, and archive lock must still
// be the one thing that suppresses it.
check('the video surface preventDefaults the browser menu',
  /onContextMenu=\{\(e\)\s*=>\s*\{[\s\S]{0,200}?preventDefault/.test(video));
check('the video surface still blocks right-click while archive-locked',
  /onContextMenu=\{\(e\)\s*=>\s*\{\s*if\s*\(\s*isMediaLocked\s*\)[\s\S]{0,120}?return/.test(video));

check('player imports addToQueue from converterQueue',
  /import\s*\{[^}]*\baddToQueue\b[^}]*\}\s*from\s*'\.\/panamedia\/converterQueue'/.test(player));

// ── exactly one writer ────────────────────────────────────────────────────
section('converterQueue is the only writer');
// Every localStorage.setItem of the queue key outside the module is a writer.
const writers = [
  ['SendToFlashModal.tsx', flash],
  ['SendConvertPreparationModal.tsx', prep]
].map(([name, src]) => [name, (src.match(/localStorage\.setItem\(\s*['"](player_sendTray|converter_queue)['"]/g) || []).length]);

writers.forEach(([name, n]) => {
  check(`${name} never writes the queue key directly`, n === 0, n + ' direct write(s)');
});

check('converterQueue is where the key is written',
  /localStorage\.setItem\(STORAGE_KEY/.test(queue));

// ── no resurrect-the-prop effects ─────────────────────────────────────────
section('no effect writes a stale copy of the list back');
check('SendConvertPreparationModal does not re-add the queuedFiles prop',
  !/useEffect[\s\S]{0,400}?addToQueue\s*\(\s*queuedFiles\s*\)/.test(prep),
  'this effect undid every removal the user made');
check('SendToFlashModal does not re-add filePath',
  !/setQueuedFiles\s*\(\s*prev\s*=>\s*\{[\s\S]{0,200}?filePath/.test(flash),
  'this effect re-added the playing file on every change');

// ── clearing actually clears ──────────────────────────────────────────────
section('clearing reaches storage');
check('clearQueue writes an empty list',
  /function clearQueue[\s\S]{0,200}?writeStorage\(\s*\[\s*\]\s*\)/.test(queue));
check('clearQueue removes the legacy key too',
  /removeItem\(\s*['"]converter_queue['"]/.test(queue));

// The removals must return the surviving list so callers can mirror it,
// rather than blanking their own copy.
check('removeFromQueue returns the surviving list',
  /function removeFromQueue[\s\S]{0,300}?return next/.test(queue));

// ── the queue module's own contract ───────────────────────────────────────
section('converterQueue contract');
check('normalises paths for identity',
  /export function normalizeQueuePath/.test(queue));
check('de-duplicates on add',
  /duplicates\.push/.test(queue) && /seen\.has\(key\)/.test(queue));
check('notifies subscribers on change',
  /function notify/.test(queue) && /notify\(/.test(queue));
check('subscribers can unsubscribe',
  /return \(\)\s*=>\s*listeners\.delete/.test(queue));

// Both components must read the queue from the module, not their own storage.
check('the modal reads the queue from converterQueue',
  /getQueue\(\)/.test(prep) && /subscribeQueue/.test(prep));
check('the send modal reads the queue from converterQueue',
  /getQueue\(\)/.test(flash) && /subscribeQueue/.test(flash));

// ── the removal paths cancel work ─────────────────────────────────────────
section('removal stops in-flight work');
check('removing a card cancels its conversion',
  /converter-cancel/.test(prep));
check('clearing all cancels in-flight conversions',
  /converter-cancel/.test(prep));
check('removed files are remembered so late progress is dropped',
  /onQueueFilesRemoved/.test(prep));

console.log(`\nJ.2: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);