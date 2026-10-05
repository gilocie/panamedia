/**
 * Registry of finished conversions.
 *
 * The "Converted Video" / "Extracted Audio" tabs used to be a plain directory
 * scan of two fixed folders (Documents\Panamedia\Video Output and Audio
 * Output), re-fetched on mount, on tab change and on folder change. That was
 * the only place output was ever read from, and it is almost never where the
 * output actually went:
 *
 *   - The destination defaults to `sendtray`, so the finished file lands in the
 *     sendtray and neither tab ever sees it.
 *   - Choosing a flash drive or a custom folder writes there instead.
 *
 * On top of that the scan *replaced* the list state outright, so anything
 * recorded elsewhere was erased on the next refresh, and no completion event
 * ever triggered a refresh -- the conversions run in SendToFlashModal, which is
 * this component's parent, so the child had no way to learn one had finished.
 *
 * This module is the record of what was produced, wherever it was written. It
 * is keyed by normalised path so a file found by the folder scan and a file
 * registered on completion collapse into one entry rather than appearing twice.
 */

import { normalizeQueuePath } from './converterQueue';

const STORAGE_KEY = 'converter_outputs';
/** Enough history to be useful without growing localStorage without bound. */
const MAX_ENTRIES = 200;

export type OutputKind = 'video' | 'audio';

export interface ConvertedOutput {
  /** Absolute path of the finished file. Doubles as its identity. */
  path: string;
  name: string;
  kind: OutputKind;
  /** Uppercase extension, as shown on the card. */
  format: string;
  /** Human-readable size, e.g. "12.4 MB". */
  size?: string;
  /** Resolution for video, bitrate for audio. */
  detail?: string;
  /** Localised date string, matching the folder scan's format. */
  date: string;
}

function readStorage(): ConvertedOutput[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is ConvertedOutput =>
        !!o && typeof o.path === 'string' && !!o.path && (o.kind === 'video' || o.kind === 'audio')
    );
  } catch (e) {}
  return [];
}

function writeStorage(items: ConvertedOutput[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
  } catch (e) {}
}

type Listener = (items: ConvertedOutput[]) => void;
const listeners = new Set<Listener>();

export function subscribeOutputs(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(items: ConvertedOutput[]): void {
  for (const fn of listeners) {
    try { fn(items); } catch (e) {}
  }
}

export function getOutputs(kind?: OutputKind): ConvertedOutput[] {
  const all = readStorage();
  return kind ? all.filter((o) => o.kind === kind) : all;
}

function basename(p: string): string {
  return (p || '').split(/[\\/]/).pop() || p;
}

function extensionOf(p: string): string {
  const base = basename(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toUpperCase() : '';
}

/**
 * Records one finished file.
 *
 * Kind comes from the mode that was actually used for that source, not from the
 * source's extension. Extracting audio from a .mp4 produces an audio file, and
 * that is precisely the case the video tab used to swallow.
 */
export function registerOutput(
  path: string,
  kind: OutputKind,
  extra?: { size?: string; detail?: string; date?: string; format?: string }
): ConvertedOutput {
  if (!path) {
    // Nothing sensible to record. Callers should still dequeue the source; this
    // is deliberately not an error.
    return { path: '', name: '', kind, format: '', date: '' };
  }

  const entry: ConvertedOutput = {
    path,
    name: basename(path),
    kind,
    format: extra?.format || extensionOf(path),
    size: extra?.size,
    detail: extra?.detail,
    date: extra?.date || new Date().toLocaleString(),
  };

  const key = normalizeQueuePath(path);
  const next = [entry, ...readStorage().filter((o) => normalizeQueuePath(o.path) !== key)];
  writeStorage(next);
  notify(next);
  return entry;
}

/** Records several finished files at once, newest first. */
export function registerOutputs(
  paths: string[],
  kind: OutputKind,
  extra?: { size?: string; detail?: string }
): void {
  if (!paths.length) return;
  const entries = paths
    .filter(Boolean)
    .map((path) => ({
      path,
      name: basename(path),
      kind,
      format: extensionOf(path),
      size: extra?.size,
      detail: extra?.detail,
      date: new Date().toLocaleString(),
    }));
  if (!entries.length) return;

  const keys = new Set(entries.map((e) => normalizeQueuePath(e.path)));
  const next = [...entries, ...readStorage().filter((o) => !keys.has(normalizeQueuePath(o.path)))];
  writeStorage(next);
  notify(next);
}

/**
 * Drops registry entries whose file no longer exists on disk, so the list does
 * not keep offering actions on files that were deleted or moved behind it.
 */
export function pruneMissingOutputs(isPresent: (path: string) => boolean): ConvertedOutput[] {
  const all = readStorage();
  const next = all.filter((o) => {
    try { return isPresent(o.path); } catch (e) { return true; }
  });
  if (next.length !== all.length) {
    writeStorage(next);
    notify(next);
  }
  return next;
}

export function clearOutputs(): void {
  writeStorage([]);
  notify([]);
}

/**
 * Decides whether a finished file belongs under Video or Audio.
 *
 * `mode` is what the user chose for that source. 'extract_audio' always yields
 * audio; 'original' and 'convert' keep the source's own nature; an unknown mode
 * falls back to the extension, then to the extension of the output itself.
 */
export function classifyOutput(
  mode: string | undefined,
  sourcePath: string,
  outputPath: string
): OutputKind {
  if (mode === 'extract_audio') return 'audio';
  if (mode === 'convert' || mode === 'original') {
    const VIDEO_EXT = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'ts', 'mts', 'm2ts'];
    const AUDIO_EXT = ['mp3', 'aac', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'wma', 'aiff', 'ac3', 'dts'];
    const src = (sourcePath || '').split('.').pop()?.toLowerCase() ?? '';
    if (AUDIO_EXT.includes(src)) return 'audio';
    if (VIDEO_EXT.includes(src)) return 'video';
    return classifyByExtension(outputPath);
  }
  return classifyByExtension(outputPath);
}

function classifyByExtension(p: string): OutputKind {
  const ext = (p || '').split('.').pop()?.toLowerCase() ?? '';
  const AUDIO_EXT = ['mp3', 'aac', 'm4a', 'flac', 'wav', 'ogg', 'opus', 'wma', 'aiff', 'ac3', 'dts'];
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return 'video';
}