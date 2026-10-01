import React from 'react';

export interface SendConvertOptions {
  mode: 'original' | 'extract_audio' | 'convert';
  format: string;
  bitrate: string;
  keepOriginal?: boolean;
  targetFolderId?: string;
  exportDestination?: 'sendtray' | 'drive' | 'folder';
  exportDriveLetter?: string;
  exportCustomPath?: string;
  perFileOptions?: Record<string, { mode: 'original' | 'convert' | 'extract_audio'; format: string; bitrate: string }>;
}

export interface SendConvertPreparationModalProps {
  fileName: string;
  targetAction?: 'drive' | 'sendtray' | 'convert';
  isBatch?: boolean;
  batchCount?: number;
  queuedFiles?: string[];
  onAddFiles?: () => void;
  onRemoveFile?: (index: number) => void;
  onClearQueue?: () => void;
  drives?: Array<{ letter: string; label: string }>;
  streamingPort?: number;
  onProceed: (options: SendConvertOptions) => void;
  onDirectSend?: (target: 'drive' | 'sendtray' | string[]) => void;
  onMinimizeChange?: (isMinimized: boolean) => void;
  onBack: () => void;
  onClose: () => void;
}

export interface VideoFormatPreset {
  id: string;
  label: string;
  ext: string;
  codec: string;
  desc: string;
  tag: string;
  iconColor: string;
}

export interface AudioFormatPreset {
  id: string;
  label: string;
  ext: string;
  codec: string;
  desc: string;
  tag: string;
  iconColor: string;
}

export interface MediaToolItem {
  id: string;
  label: string;
  sub: string;
  icon?: React.ReactNode;
  color: string;
  desc: string;
}

export interface ConvertedMediaItem {
  id: string;
  name: string;
  path: string;
  size?: string;
  format: string;
  resolutionOrBitrate: string;
  date: string;
  mediaType: 'video' | 'audio';
}

export function isVideoFile(filePath: string): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'ts', 'mts', 'm2ts'].includes(ext);
}

export function formatSeconds(secs: number): string {
  if (!secs || isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const VIDEO_FORMATS: VideoFormatPreset[] = [
  { id: 'mp4', label: 'MP4', ext: 'mp4', codec: 'H.264 / AAC', desc: 'Universal standard for TVs, Phones, PC & Cars', tag: 'Universal', iconColor: '#38bdf8' },
  { id: 'mkv', label: 'MKV', ext: 'mkv', codec: 'HEVC / H.264', desc: 'High Quality multi-track audio & subtitle container', tag: 'High Quality', iconColor: '#818cf8' },
  { id: 'mov', label: 'MOV', ext: 'mov', codec: 'Apple ProRes / H.264', desc: 'Native Apple QuickTime standard for iPhone & Mac', tag: 'Apple', iconColor: '#c084fc' },
  { id: 'webm', label: 'WebM', ext: 'webm', codec: 'VP9 / Opus', desc: 'Ultra-compressed open web streaming video format', tag: 'Web', iconColor: '#34d399' },
  { id: 'avi', label: 'AVI', ext: 'avi', codec: 'Xvid / MP3', desc: 'Legacy video container for older car headunits & DVD', tag: 'Legacy', iconColor: '#fbbf24' },
];

export const AUDIO_FORMATS: AudioFormatPreset[] = [
  { id: 'mp3', label: 'MP3', ext: 'mp3', codec: 'MPEG-3 Audio', desc: 'Universal audio standard for all players, cars & USB', tag: 'Universal', iconColor: '#ec4899' },
  { id: 'aac', label: 'AAC', ext: 'aac', codec: 'Advanced Audio', desc: 'High fidelity audio stream standard for Apple & Android', tag: 'Hi-Fi', iconColor: '#f472b6' },
  { id: 'm4a', label: 'M4A', ext: 'm4a', codec: 'Apple AAC', desc: 'Native Apple iTunes and Music container with rich dynamics', tag: 'Apple', iconColor: '#a78bfa' },
  { id: 'wav', label: 'WAV', ext: 'wav', codec: '16-bit PCM', desc: 'Uncompressed broadcast studio audio with zero artifacts', tag: 'Lossless', iconColor: '#60a5fa' },
  { id: 'flac', label: 'FLAC', ext: 'flac', codec: 'FLAC Lossless', desc: 'Audiophile-grade lossless compression preserving 100% master quality', tag: 'Studio', iconColor: '#2dd4bf' },
];
