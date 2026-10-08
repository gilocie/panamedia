import { useCallback, useRef } from 'react';
import type { AppTask } from '../types/appTypes';

export function useDownloadFormatting() {
  const downloadsTableRef = useRef<HTMLDivElement>(null);
  const tableWheelCleanupRef = useRef<(() => void) | null>(null);

  const setDownloadsTableRef = useCallback((node: HTMLDivElement | null) => {
    if (tableWheelCleanupRef.current) {
      tableWheelCleanupRef.current();
      tableWheelCleanupRef.current = null;
    }

    (downloadsTableRef as any).current = node;

    if (node) {
      const handleTableWheel = (e: WheelEvent) => {
        const rect = node.getBoundingClientRect();
        const isOverHorizontalScrollbar = (
          e.clientY >= rect.bottom - 24 &&
          e.clientY <= rect.bottom + 6 &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right
        );

        if (isOverHorizontalScrollbar || e.ctrlKey || e.shiftKey) {
          if (node.scrollWidth > node.clientWidth) {
            e.preventDefault();
            let delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
            if (e.deltaMode === 1) delta *= 28;
            else if (e.deltaMode === 2) delta *= node.clientWidth;
            node.scrollLeft += delta;
          }
        }
      };

      node.addEventListener('wheel', handleTableWheel, { passive: false });
      tableWheelCleanupRef.current = () => {
        node.removeEventListener('wheel', handleTableWheel);
      };
    }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatEta = (seconds: number) => {
    if (seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
      h > 0 ? h : null,
      m < 10 ? '0' + m : m,
      s < 10 ? '0' + s : s
    ].filter(x => x !== null).join(':');
  };

  const getPercentage = (task: AppTask) => {
    if (task.isYoutube || (task as any).useYtDlp || task.displayProgress !== undefined) {
      return task.displayProgress !== undefined ? task.displayProgress : 0;
    }
    if (task.totalBytes <= 0) return 0;
    const raw = Math.round((task.downloadedBytes / task.totalBytes) * 100);
    if ((task.status === 'merging' || task.status === 'compressing') && raw >= 100) return 99;
    return raw;
  };

  return {
    downloadsTableRef,
    setDownloadsTableRef,
    formatBytes,
    formatSpeed,
    formatEta,
    getPercentage
  };
}
