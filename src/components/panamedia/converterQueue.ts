/**
 * Single source of truth for the converter queue.
 *
 * Previously three components each kept their own copy of the same list:
 *   - panamediaPlayer `sendTrayItems`  (persisted to `player_sendTray`)
 *   - SendToFlashModal `queuedFiles`   (seeded from `converter_queue` + filePath)
 *   - SendConvertPreparationModal `localQueue` (seeded from `converter_queue` + fileName)
 *
 * Because none was authoritative, clearing the queue immediately refilled it:
 * the empty-list branch fell through to `filePath` (the media still playing),
 * and the child then re-persisted it. Files could not be removed while
 * something was playing.
 *
 * This module owns the list. Every entry point goes through add/remove/clear,
 * entries are de-duplicated by normalised path, and subscribers are notified so
 * no component needs a private copy.
 *
 * ── Why this is not the sendtray ────────────────────────────────────────
 * It used to persist to `player_sendTray`, the sendtray's own key, which made
 * two different lists into one. The sendtray is a holding pen for files about
 * to be written to a drive; this is work waiting to be re-encoded. Sharing the
 * key meant the converter displayed whatever happened to be in the sendtray,
 * and worse, a conversion whose destination was the sendtray put its own
 * finished output straight back into the queue it had just come out of -- so
 * the output reappeared as work still to do.
 *
 * `player_sendTray` stays the sendtray's, untouched here. Only explicit user
 * actions add to this list.
 */
const STORAGE_KEY = 'converter_queue';

/** Canonical form used for identity comparisons: slashes unified, case-folded. */
export function normalizeQueuePath(p: string): string {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
}

function readStorage(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === 'string' && p);
  } catch (e) {}
  return [];
}

function writeStorage(items: string[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {}
}

type Listener = (items: string[]) => void;
const listeners = new Set<Listener>();
let storageListenerAttached = false;

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  notify(readStorage());
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  if (!storageListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && storageListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageChange);
      storageListenerAttached = false;
    }
  };
}

function notify(items: string[]): void {
  for (const fn of listeners) {
    try { fn(items); } catch (e) {}
  }
}

/**
 * Adds files, skipping any already present.
 * Returns the new list plus which entries were actually added, so callers can
 * tell the user when something was a duplicate instead of silently ignoring it.
 */
export function addToQueue(files: string[]): { items: string[]; added: string[]; duplicates: string[] } {
  const current = readStorage();
  const seen = new Set(current.map(normalizeQueuePath));
  const added: string[] = [];
  const duplicates: string[] = [];

  for (const f of files) {
    if (!f) continue;
    const key = normalizeQueuePath(f);
    if (seen.has(key)) { duplicates.push(f); continue; }
    seen.add(key);
    current.push(f);
    added.push(f);
  }

  if (added.length > 0) {
    writeStorage(current);
    notify(current);
  }
  return { items: current, added, duplicates };
}

export function removeFromQueue(targets: string[]): string[] {
  const kill = new Set(targets.map(normalizeQueuePath));
  const next = readStorage().filter((f) => !kill.has(normalizeQueuePath(f)));
  writeStorage(next);
  notify(next);
  return next;
}

export function clearQueue(): string[] {
  writeStorage([]);
  notify([]);
  return [];
}

export function getQueue(): string[] {
  return readStorage();
}

export function isInQueue(file: string): boolean {
  const key = normalizeQueuePath(file);
  return readStorage().some((f) => normalizeQueuePath(f) === key);
}

/**
 * Stable per-entry job id.
 *
 * The file path cannot be used as an identity: converting the same path twice
 * (or having it queued twice) produced two jobs sharing one id, so the engine
 * retired the first and it became impossible to pause. Ids are minted per queue
 * entry instead.
 */
let jobSeq = 0;
export function makeJobId(file: string): string {
  jobSeq += 1;
  return `job_${Date.now().toString(36)}_${jobSeq.toString(36)}_${normalizeQueuePath(file).slice(-24)}`;
}

/**
 * Caps how many conversions run at once.
 *
 * Running everything in parallel starves the machine; running strictly one at a
 * time wastes the hardware. The window scales with core count and leaves headroom
 * so the UI stays responsive.
 */
export function conversionConcurrency(): number {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const raw = Number((globalThis as any)?.PANAMEDIA_CONVERT_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  // Each ffmpeg is already thread-capped inside the engine, so a small number of
  // concurrent jobs keeps every core usable without oversubscribing.
  if (cores <= 2) return 1;
  if (cores <= 4) return 2;
  return 3;
}

/** Runs tasks with a bounded number in flight, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });

  await Promise.all(runners);
  return results;
}