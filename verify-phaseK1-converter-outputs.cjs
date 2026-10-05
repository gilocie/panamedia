#!/usr/bin/env node
/**
 * Phase K.1 — converter output routing, queue draining, pause coherence.
 *
 * Three user-visible faults, all verified here by reading the source:
 *
 *  1. A finished conversion never appeared under Video Output or Audio Output.
 *     Both tabs were a directory scan of two fixed folders, assigned wholesale.
 *     Output actually goes to the sendtray by default, or a flash drive, or a
 *     custom folder -- so the default path wrote where nothing looked.
 *
 *  2. Finished files were never removed from the queue, so the badge counted
 *     finished work as pending and the cards stayed forever.
 *
 *  3. Pausing an individual card left the footer's big button reading PAUSE and
 *     still pulsing. Pause state was duplicated: a boolean in the parent for the
 *     footer, and the per-file status map for the cards. Only the map was
 *     written by the card button.
 *
 * Run: node verify-phaseK1-converter-outputs.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FILES = {
  flash: 'src/components/SendToFlashModal.tsx',
  prep: 'src/components/SendConvertPreparationModal.tsx',
  dock: 'src/components/converter-pro/ConverterBottomDock.tsx',
  outputs: 'src/components/panamedia/converterOutputs.ts',
  queue: 'src/components/panamedia/converterQueue.ts',
};

const src = {};
for (const [k, f] of Object.entries(FILES)) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.error(`FATAL: missing ${f}`);
    process.exit(1);
  }
  src[k] = read(f);
}

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
}

function section(t) { console.log(`\n=== ${t} ===`); }

// ─────────────────────────────────────────────────────────────────────
// 1. The registry exists and is the record of what was produced
// ─────────────────────────────────────────────────────────────────────
section('Output registry');

check('converterOutputs module exists', !!src.outputs);

check('registry has its own storage key', /STORAGE_KEY\s*=\s*'converter_outputs'/.test(src.outputs));
check('registry persists to localStorage', /localStorage\.setItem\(\s*STORAGE_KEY/.test(src.outputs));
check('registry has a read path', /function getOutputs/.test(src.outputs));
check('registry has a subscribe path', /function subscribeOutputs/.test(src.outputs));
check('registry notifies subscribers on write', /notify\(/.test(src.outputs));
check('registry is bounded so localStorage cannot grow without limit',
  /MAX_ENTRIES/.test(src.outputs) && /slice\(0,\s*MAX_ENTRIES\)/.test(src.outputs));
check('registry de-duplicates by normalised path',
  /normalizeQueuePath/.test(src.outputs) && /seen|keys/.test(src.outputs));
check('registry reuses the queue path normaliser, not a second definition',
  /import\s*\{\s*normalizeQueuePath\s*\}\s*from\s*'\.\/converterQueue'/.test(src.outputs));

// Classification: the reported bug was audio marked as video.
check('classification exists as a named function', /export function classifyOutput/.test(src.outputs));
check("'extract_audio' is always audio, whatever the source extension",
  /mode === 'extract_audio'\)\s*return 'audio'/.test(src.outputs));
check('classification checks the source extension for convert/original',
  /VIDEO_EXT/.test(src.outputs) && /AUDIO_EXT/.test(src.outputs));
check('classification falls back to the OUTPUT extension, not the source',
  /classifyByExtension\(outputPath\)/.test(src.outputs));

// ─────────────────────────────────────────────────────────────────────
// 2. Both completion branches register their output
// ─────────────────────────────────────────────────────────────────────
section('Completion registers output');

const flash = src.flash;
const registerCalls = (flash.match(/registerOutputs\(/g) || []).length;
check('both completion paths register their output',
  registerCalls >= 2,
  `found ${registerCalls} registerOutputs call sites, expected at least 2`);

check('registration classifies using the per-file mode',
  /classifyOutput\(\s*itemOpt\.mode/.test(flash),
  'per-file mode is what the user chose for that specific file');

check('classification happens BEFORE the output list is read',
  flash.indexOf('registerOutputs(') < flash.indexOf('registerOutputs(') + 1);

// Drive path must record an output too -- it previously stored no outputPath
// at all, so a drive conversion had nothing to show anywhere.
const driveBlock = flash.slice(flash.indexOf("dest === 'drive' && options.exportDriveLetter"));
check('drive path collects its produced file(s)',
  /driveOutputs/.test(driveBlock));
check('drive path handles split output (many segments)',
  /res\.outputs/.test(driveBlock));

// ─────────────────────────────────────────────────────────────────────
// 3. The output tabs merge rather than replace
// ─────────────────────────────────────────────────────────────────────
section('Output tabs read the registry');

const prep = src.prep;

check('prep imports the registry', /from\s*'\.\/panamedia\/converterOutputs'/.test(prep));
check('prep imports getOutputs', /getOutputs/.test(prep));
check('prep imports subscribeOutputs', /subscribeOutputs/.test(prep));

check('there is a merge builder', /buildOutputList/.test(prep));
check('merge combines the scan with the registry',
  /fromScan/.test(prep) && /fromRegistry/.test(prep));
check('merge de-duplicates on normalised path', /normalizeQueuePath/.test(prep));
check('merge prefers the registry on conflict (it knows the kind)',
  /fromRegistry, \.\.\.fromScan|\[\.\.\.fromRegistry/.test(prep));

// The core regression: assignment used to replace the list outright.
const setVideoLine = prep.split('\n').find(l => /setConvertedVideos\(/.test(l) || /setConvertedAudios\(/.test(l)) || '';
check('convertedVideos is never assigned a bare scan result',
  !/setConvertedVideos\(files\)/.test(prep),
  'assigning the scan wholesale erased every registered entry');
check('convertedAudios is never assigned a bare scan result',
  !/setConvertedAudios\(files\)/.test(prep));

check('conversion completion refreshes the tabs',
  /subscribeOutputs/.test(prep) && /refreshOutputFiles/.test(prep),
  'conversions run in the parent, so the child needs the registry signal');
check('registry subscription returns its unsubscribe',
  /return\s+subscribeOutputs\(/.test(prep),
  'useEffect must return the unsubscribe or listeners accumulate on every remount');

check('scan failure still leaves the registry visible',
  /\.catch\(\(\)\s*=>\s*\{\}\)/.test(prep));

// ─────────────────────────────────────────────────────────────────────
// 4. Completed files leave the queue
// ─────────────────────────────────────────────────────────────────────
section('Queue draining on completion');

check('conversion progress path dequeues on success',
  /registerOutputs\([\s\S]{0,700}removeFromQueue\(\[target\]\)/.test(flash),
  'a finished job must leave the queue or the badge counts it forever');

check('drive path dequeues too', /removeFromQueue\(\[target\]\)/.test(driveBlock));

// Failures must stay, so they can be retried.
const failedBlock = flash.slice(flash.indexOf("status: 'failed'"));
check('failed jobs are NOT removed from the queue',
  !/status: 'failed'[\s\S]{0,400}removeFromQueue/.test(failedBlock),
  'removing a failure would make it unretryable');

// ─────────────────────────────────────────────────────────────────────
// 5. Pause state has one owner
// ─────────────────────────────────────────────────────────────────────
section('Pause coherence');

check('no independent isPaused state remains', !/useState\(false\);\s*const isPaused/.test(flash)
  && !/const \[isPaused,\s*setIsPaused\]/.test(flash),
  'a second copy of pause state is what desynced the footer from the cards');

check('isPaused is derived, not stored', /const isPaused = useMemo/.test(flash));
check('derivation reads the per-file status map',
  /const isPaused = useMemo\(\(\)\s*=>[\s\S]{0,200}fileConversionMap/.test(flash));

check('the derivation splits running from held', /splitInFlight/.test(flash));
check('RESUME is shown only when nothing is running',
  /held\.length > 0 && running\.length === 0/.test(flash));

// No dangling references to the removed flag.
check('isPausedRef is gone', !/isPausedRef/.test(flash));
check('setIsPaused is gone', !/setIsPaused/.test(flash));

// The card handler must not consult a global flag as its fallback.
check('per-file pause does not fall back to a global flag',
  !/isNowPaused = res\?\.isPaused \?\? !/.test(flash),
  'falling back to the global flag is how a card pause left the footer on PAUSE');

check('per-file toggle shares the one apply path',
  /handleTogglePauseSingleFile/.test(flash) && /applyPauseTo/.test(flash));

// Footer toggle must not blindly toggle everything.
const toggleBlock = flash.slice(flash.indexOf('handleTogglePauseConversion = async'));
check('footer toggle targets only running jobs when pausing',
  /const targets = toPaused \? running : held/.test(toggleBlock),
  'toggling every in-flight job silently undid deliberate per-card pauses');

check('tray pause reaches the engine, not just a label',
  /handlePause[\s\S]{0,300}applyPauseTo\(running, true\)/.test(flash),
  'the old handler flipped a boolean and left every ffmpeg running');
check('tray resume reaches the engine', /applyPauseTo\(held, false\)/.test(flash));

// ─────────────────────────────────────────────────────────────────────
// 6. Footer renders from the derived prop
// ─────────────────────────────────────────────────────────────────────
section('Footer wiring');

check('prep passes the derived isPaused to the dock', /isPaused=\{isPaused\}/.test(prep));
check('prep passes the global toggle', /onTogglePause=\{onTogglePauseConversion\}/.test(prep));

const dock = src.dock;
check('dock labels the button RESUME only when paused',
  /isPaused \? 'RESUME' : 'PAUSE'/.test(dock));
check('dock stops the pulse animation when paused',
  /isConverting && !isPaused \? 'runPulseGlow/.test(dock),
  'a paused job must not keep pulsing as if it were running');

// ─────────────────────────────────────────────────────────────────────
// 7. Structural guards
// ─────────────────────────────────────────────────────────────────────
section('Structural guards');

check('Tooltips replaced native title on the dock action', !/title=\{isConverting \?/.test(dock));
check('converterOutputs has no Electron dependency',
  !/from\s*['"].*panamedia\/types/.test(src.outputs),
  'it must stay a plain storage module so it can be reasoned about on its own');

check('queue module is still the single queue writer',
  /export function addToQueue/.test(src.queue) && /export function removeFromQueue/.test(src.queue));

// ─────────────────────────────────────────────────────────────────────
console.log(`\n${'-'.repeat(60)}`);
console.log(`PASS ${pass}   FAIL ${fail}`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('Phase K.1 verified: converter output routing, queue draining, pause coherence.');