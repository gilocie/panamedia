export interface AppTask {
  id: string;
  url: string;
  filename: string;
  saveDir: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'queued' | 'preparing' | 'downloading' | 'paused' | 'merging' | 'compressing' | 'completed' | 'failed';
  connections: number;
  headers: Record<string, string>;
  addedAt: number;
  isYoutube: boolean;
  error?: string;
  thumbnail?: string;

  // Custom display fields for YouTube downloads
  duration?: number;
  displayProgress?: number;
  displaySpeed?: string;
  displayEta?: string;
  displaySize?: string;

  // Array of segment trackers
  segments?: Array<{
    index: number;
    start: number;
    end: number;
    downloaded: number;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
  }>;
}

export interface AppSettings {
  connections: number;
  downloadDir: string;
  autoCompress: boolean;
  compressionCRF: number;
  maxConcurrent: number;
  syncedFolders: string[];
}
