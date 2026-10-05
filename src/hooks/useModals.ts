import { useState, useCallback } from 'react';

export function useModals() {
  // Add download modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addUrl, setAddUrl] = useState<string>('');
  const [addFilename, setAddFilename] = useState<string>('');
  const [addSaveDir, setAddSaveDir] = useState<string>('');
  const [startImmediately, setStartImmediately] = useState<boolean>(true);
  const [isYoutubeCheck, setIsYoutubeCheck] = useState<boolean>(false);
  const [interceptedHeaders, setInterceptedHeaders] = useState<Record<string, string>>({});

  // Format picker modal
  const [showFormatModal, setShowFormatModal] = useState<boolean>(false);
  const [formatLoading, setFormatLoading] = useState<boolean>(false);
  const [youtubeInfo, setYoutubeInfo] = useState<any>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [formatsSource, setFormatsSource] = useState<'add_modal' | 'browser' | null>(null);

  // YouTube Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState<boolean>(false);
  const [playlistLoading, setPlaylistLoading] = useState<boolean>(false);
  const [playlistInfo, setPlaylistInfo] = useState<any>(null);

  // Delete confirmation modal
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'download' | 'file' | 'bulk-tasks' | 'all-history';
    title: string;
    message: string;
    taskId?: string;
    filePath?: string;
    showDeleteFileOption?: boolean;
    taskIds?: string[];
    onConfirm: (extraData?: any) => void;
  } | null>(null);

  // Clear history modal
  const [showClearHistoryModal, setShowClearHistoryModal] = useState<boolean>(false);

  // File details modal
  const [selectedFileDetails, setSelectedFileDetails] = useState<any | null>(null);
  const [showFileDetailsModal, setShowFileDetailsModal] = useState<boolean>(false);

  // Send to Flash modal
  const [flashDriveTarget, setFlashDriveTarget] = useState<string | null>(null);

  // Add stream site modal
  const [showAddSiteModal, setShowAddSiteModal] = useState<boolean>(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    type: 'file';
    targetPath?: string;
  }>({ x: 0, y: 0, visible: false, type: 'file' });

  // Reset add modal fields
  const resetAddModal = useCallback(() => {
    setAddUrl('');
    setAddFilename('');
    setInterceptedHeaders({});
  }, []);

  return {
    // Add modal
    showAddModal, setShowAddModal,
    addUrl, setAddUrl,
    addFilename, setAddFilename,
    addSaveDir, setAddSaveDir,
    startImmediately, setStartImmediately,
    isYoutubeCheck, setIsYoutubeCheck,
    interceptedHeaders, setInterceptedHeaders,
    resetAddModal,
    // Format modal
    showFormatModal, setShowFormatModal,
    formatLoading, setFormatLoading,
    youtubeInfo, setYoutubeInfo,
    extractError, setExtractError,
    formatsSource, setFormatsSource,
    // Playlist modal
    showPlaylistModal, setShowPlaylistModal,
    playlistLoading, setPlaylistLoading,
    playlistInfo, setPlaylistInfo,
    // Delete confirm
    deleteConfirmTarget, setDeleteConfirmTarget,
    // Clear history
    showClearHistoryModal, setShowClearHistoryModal,
    // File details
    selectedFileDetails, setSelectedFileDetails,
    showFileDetailsModal, setShowFileDetailsModal,
    // Flash drive
    flashDriveTarget, setFlashDriveTarget,
    // Stream site
    showAddSiteModal, setShowAddSiteModal,
    // Context menu
    contextMenu, setContextMenu,
  };
}
