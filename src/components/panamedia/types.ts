/**
 * types.ts
 * ========
 * Shared types, constants, utilities, and Electron IPC bridge for Panamedia player.
 */

// ─── Electron IPC Bridge ───────────────────────────────────────────────────────

export interface ElectronBridge {
  ipcRenderer: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoke(channel: string, ...args: any[]): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send(channel: string, ...args: any[]): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(channel: string, listener: (...args: any[]) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener(channel: string, listener: (...args: any[]) => void): void;
  };
  webUtils?: {
    getPathForFile(file: File): string;
  };
}

export const electron: ElectronBridge | null =
  typeof window !== 'undefined'
    ? ((window as any).electron || ((window as any).require ? (window as any).require('electron') : null))
    : null;

// ─── Media Extensions ─────────────────────────────────────────────────────────

export const AUDIO_EXTENSIONS: string[] = [
  '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'
];

export const VIDEO_EXTENSIONS: string[] = [
  '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv',
  '.m4v', '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.3gp'
];

// ─── Media Library Types ───────────────────────────────────────────────────────

export interface MediaItem {
  name: string;
  path: string;
  size?: number;
  ext?: string;
  category?: 'videos' | 'audios' | 'files' | 'docx' | string;
  mtime?: number | string;
  duration?: number;
}

// ─── Video Filters ────────────────────────────────────────────────────────────

export interface VideoFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sharpen: number;
  saturate?: number;
  nightMode?: boolean;
}

export const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sharpen: 0,
};

// ─── Equalizer Constants ──────────────────────────────────────────────────────

export interface EqBand {
  label: string;
  freq: number;
  type: BiquadFilterType;
}

export const EQ_BANDS: EqBand[] = [
  { label: '60Hz', freq: 60, type: 'lowshelf' },
  { label: '250Hz', freq: 250, type: 'peaking' },
  { label: '1kHz', freq: 1000, type: 'peaking' },
  { label: '4kHz', freq: 4000, type: 'peaking' },
  { label: '12kHz', freq: 12000, type: 'highshelf' },
];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0],
  'Bass Boost': [5, 4, 2, 0, 0],
  Vocal: [-2, 1, 4, 3, 1],
  'Treble Boost': [0, 0, 1, 4, 5],
  Rock: [4, 2, -1, 2, 4],
  Electronic: [4, 3, 0, 2, 4],
  Custom: [0, 0, 0, 0, 0],
};

// ─── Formatting Utilities ─────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
