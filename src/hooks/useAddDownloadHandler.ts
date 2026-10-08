import { isExtractorUrl } from '../utils/urlUtils';
import type { AppSettings } from '../types/appTypes';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

interface UseAddDownloadHandlerParams {
  addUrl: string;
  addFilename: string;
  addSaveDir: string;
  startImmediately: boolean;
  isYoutubeCheck: boolean;
  interceptedHeaders: Record<string, string>;
  appSettings: AppSettings;
  setShowAddModal: (show: boolean) => void;
  setAddUrl: (url: string) => void;
  setAddFilename: (name: string) => void;
  setInterceptedHeaders: (headers: Record<string, string>) => void;
  setActiveTab: (tab: any) => void;
  setFormatsSource: (src: 'add_modal' | 'browser' | null) => void;
  fetchFormats: (url: string) => void;
  handleDownloadPlaylist: (url: string) => void;
  setAddSaveDir: (dir: string) => void;
  setAppSettings: (settings: AppSettings) => void;
  setShowPlaylistModal: (show: boolean) => void;
  setPlaylistInfo: (info: any) => void;
}

export function useAddDownloadHandler({
  addUrl,
  addFilename,
  addSaveDir,
  startImmediately,
  isYoutubeCheck,
  interceptedHeaders,
  appSettings,
  setShowAddModal,
  setAddUrl,
  setAddFilename,
  setInterceptedHeaders,
  setActiveTab,
  setFormatsSource,
  fetchFormats,
  handleDownloadPlaylist,
  setAddSaveDir,
  setAppSettings,
  setShowPlaylistModal,
  setPlaylistInfo,
}: UseAddDownloadHandlerParams) {
  const handleAddDownload = async () => {
    if (!electron || !addUrl) return;
    const isExtractor = isYoutubeCheck || isExtractorUrl(addUrl);

    if (isExtractor && (addUrl.includes('playlist?list=') || addUrl.includes('&list='))) {
      setShowAddModal(false);
      handleDownloadPlaylist(addUrl);
      return;
    }

    if (isExtractor) {
      setShowAddModal(false);
      setFormatsSource('add_modal');
      fetchFormats(addUrl);
      return;
    }

    const directMediaExts = ['.m3u8', '.mp4', '.m4v', '.webm', '.mkv', '.mov', '.mp3', '.m4a', '.wav', '.flac'];
    const cleanUrlLower = addUrl.split('?')[0].toLowerCase();
    if (directMediaExts.some(ext => cleanUrlLower.endsWith(ext))) {
      setShowAddModal(false);
      setFormatsSource('add_modal');
      fetchFormats(addUrl);
      return;
    }

    setShowAddModal(false);
    await electron.ipcRenderer.invoke('add-download', {
      url: addUrl,
      filename: addFilename,
      saveDir: addSaveDir || appSettings.downloadDir,
      startImmediately,
      isYoutube: isExtractor,
      headers: interceptedHeaders
    });

    setAddUrl('');
    setAddFilename('');
    setInterceptedHeaders({});
    setActiveTab('downloads');
  };

  const handleBrowseDir = async () => {
    if (!electron) return;
    const dir = await electron.ipcRenderer.invoke('select-directory');
    if (dir) setAddSaveDir(dir);
  };

  const handleSettingsBrowseDir = async () => {
    if (!electron) return;
    const dir = await electron.ipcRenderer.invoke('select-directory');
    if (dir) {
      const nextSettings = { ...appSettings, downloadDir: dir };
      setAppSettings(nextSettings);
      await electron.ipcRenderer.invoke('save-settings', nextSettings);
    }
  };

  const handleConfirmPlaylist = async (items: { url: string; title: string; duration?: number }[], _options?: { compress: boolean }) => {
    if (!electron) return;
    setShowPlaylistModal(false);
    for (const item of items) {
      const sanitizedTitle = item.title.replace(/[\\/:*?"<>|]/g, '_');
      await electron.ipcRenderer.invoke('add-download', {
        url: item.url,
        filename: `${sanitizedTitle}_720p.mp4`,
        saveDir: appSettings.downloadDir,
        startImmediately: false,
        isYoutube: true,
        duration: item.duration || 0
      });
    }
    setPlaylistInfo(null);
    setActiveTab('downloads');
  };

  return {
    handleAddDownload,
    handleBrowseDir,
    handleSettingsBrowseDir,
    handleConfirmPlaylist,
  };
}
