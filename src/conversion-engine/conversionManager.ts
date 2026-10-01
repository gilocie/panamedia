/**
 * Panamedia Converter Pro - Frontend Conversion Manager & Engine Controller
 * 
 * Manages in-place conversion state, per-file progress tracking,
 * single-file conversion dispatch, pause/resume orchestration,
 * and background persistence without modal interruptions.
 */

export interface FileConversionStatus {
  filePath: string;
  status: 'idle' | 'converting' | 'paused' | 'completed' | 'failed';
  progress: number; // 0 to 1
  outputPath?: string;
  error?: string;
  startTime?: number;
}

export interface BatchConversionState {
  isConverting: boolean;
  isPaused: boolean;
  totalFiles: number;
  completedFiles: number;
  currentFileIndex: number;
  overallProgress: number;
  fileStatuses: Record<string, FileConversionStatus>;
}

export const initialBatchState: BatchConversionState = {
  isConverting: false,
  isPaused: false,
  totalFiles: 0,
  completedFiles: 0,
  currentFileIndex: 0,
  overallProgress: 0,
  fileStatuses: {}
};
