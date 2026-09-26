/**
 * sendtrayUtils.ts
 * ================
 * Sendtray folder management and assignment utilities.
 * Folders and file assignments are persisted to localStorage under:
 *   - `sendtray_folders`
 *   - `sendtray_assignments`
 */

const STORAGE_KEY = 'sendtray_folders';
const ASSIGNMENTS_KEY = 'sendtray_assignments';

export interface SendtrayFolder {
  id: string;
  name: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** File paths currently assigned to this folder */
  files: string[];
}

// ─── Folders Storage Helpers ──────────────────────────────────────────────────

function loadFolders(): SendtrayFolder[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFolders(folders: SendtrayFolder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  window.dispatchEvent(new CustomEvent('sendtray-folders-updated'));
}

// ─── Assignments Storage Helpers ──────────────────────────────────────────────

function loadAssignments(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAssignments(assignments: Record<string, string>): void {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  window.dispatchEvent(new CustomEvent('sendtray-assignments-updated'));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns all persisted sendtray folders. */
export function getSendtrayFolders(): SendtrayFolder[] {
  return loadFolders();
}

/** Saves sendtray folders directly. */
export function saveSendtrayFolders(folders: SendtrayFolder[]): void {
  saveFolders(folders);
}

/** Returns the mapping of file paths to folder IDs. */
export function getSendtrayAssignments(): Record<string, string> {
  return loadAssignments();
}

/** Saves the mapping of file paths to folder IDs. */
export function saveSendtrayAssignments(assignments: Record<string, string>): void {
  saveAssignments(assignments);
}

/**
 * Creates a new sendtray folder with the given name.
 * @returns The newly created folder.
 */
export function createSendtrayFolder(name: string): SendtrayFolder {
  const folders = loadFolders();
  const folder: SendtrayFolder = {
    id: `stf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: new Date().toISOString(),
    files: [],
  };
  folders.push(folder);
  saveFolders(folders);
  return folder;
}

/**
 * Renames an existing sendtray folder by id.
 */
export function renameSendtrayFolder(folderId: string, newName: string): void {
  const folders = loadFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (folder) {
    folder.name = newName;
    saveFolders(folders);
  }
}

/**
 * Assigns a file path to a sendtray folder.
 * If `folderId` is undefined or null, removes any existing folder assignment.
 */
export function assignFileToSendtrayFolder(filePath: string, folderId?: string): void {
  const folders = loadFolders();
  const assignments = loadAssignments();

  // Remove from existing folder arrays
  for (const f of folders) {
    const idx = f.files.indexOf(filePath);
    if (idx !== -1) {
      f.files.splice(idx, 1);
    }
  }

  if (folderId) {
    const folder = folders.find((f) => f.id === folderId);
    if (folder && !folder.files.includes(filePath)) {
      folder.files.push(filePath);
    }
    assignments[filePath] = folderId;
  } else {
    delete assignments[filePath];
  }

  saveFolders(folders);
  saveAssignments(assignments);
}

/**
 * Removes a file path from whichever folder it belongs to.
 */
export function removeFileFromSendtrayFolders(filePath: string): void {
  const folders = loadFolders();
  const assignments = loadAssignments();
  let changed = false;

  for (const folder of folders) {
    const idx = folder.files.indexOf(filePath);
    if (idx !== -1) {
      folder.files.splice(idx, 1);
      changed = true;
    }
  }

  if (assignments[filePath]) {
    delete assignments[filePath];
    saveAssignments(assignments);
  }

  if (changed) saveFolders(folders);
}

/**
 * Deletes a sendtray folder by id, returning files to the unfiled root tray.
 */
export function deleteSendtrayFolder(folderId: string): void {
  const folders = loadFolders().filter((f) => f.id !== folderId);
  const assignments = loadAssignments();
  let assignmentsChanged = false;

  for (const [file, fId] of Object.entries(assignments)) {
    if (fId === folderId) {
      delete assignments[file];
      assignmentsChanged = true;
    }
  }

  saveFolders(folders);
  if (assignmentsChanged) {
    saveAssignments(assignments);
  }
}
