import React from 'react';
import { Cpu } from 'lucide-react';

interface ExportSettingsPanelProps {
  useHwAccel: boolean;
  setUseHwAccel: (val: boolean) => void;
  useHqEngine: boolean;
  setUseHqEngine: (val: boolean) => void;
  deinterlacing: boolean;
  setDeinterlacing: (val: boolean) => void;
  autoCopy: boolean;
  setAutoCopy: (val: boolean) => void;
  mergeFiles: boolean;
  setMergeFiles: (val: boolean) => void;
  exportDestination?: 'sendtray' | 'drive' | 'folder';
  setExportDestination?: (val: 'sendtray' | 'drive' | 'folder') => void;
  selectedDriveLetter?: string;
  setSelectedDriveLetter?: (val: string) => void;
  customExportFolder?: string;
  setCustomExportFolder?: (val: string) => void;
  selectedFolderId?: string;
  setSelectedFolderId?: (val: string | undefined) => void;
  drives?: Array<{ letter: string; label: string }>;
}

export const ExportSettingsPanel: React.FC<ExportSettingsPanelProps> = ({
  useHwAccel,
  setUseHwAccel,
  useHqEngine,
  setUseHqEngine,
  deinterlacing,
  setDeinterlacing,
  autoCopy,
  setAutoCopy,
  mergeFiles,
  setMergeFiles
}) => {
  return (
    <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
      {/* 1. Hardware Acceleration Engine */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '12px 14px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} style={{ color: '#06b6d4' }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Hardware Acceleration
            </span>
          </div>
          <span style={{
            fontSize: '9px',
            fontWeight: 800,
            background: useHwAccel ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            color: useHwAccel ? '#67e8f9' : 'rgba(255, 255, 255, 0.4)',
            padding: '1px 6px',
            borderRadius: '4px'
          }}>
            {useHwAccel ? 'CUDA / QSV / VCE ACTIVE' : 'CPU ONLY'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={useHwAccel}
              onChange={e => setUseHwAccel(e.target.checked)}
              style={{ accentColor: '#06b6d4', width: '13px', height: '13px' }}
            />
            <span>Enable GPU Hardware Encoder (Up to 47x faster)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={useHqEngine}
              onChange={e => setUseHqEngine(e.target.checked)}
              style={{ accentColor: '#06b6d4', width: '13px', height: '13px' }}
            />
            <span>Use High Quality Engine (Crystal visual clarity)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={deinterlacing}
              onChange={e => setDeinterlacing(e.target.checked)}
              style={{ accentColor: '#06b6d4', width: '13px', height: '13px' }}
            />
            <span>Deinterlacing (Smooth out interlaced TV lines)</span>
          </label>
        </div>
      </div>

      {/* 2. Stream Copy & Merge Options */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={autoCopy}
            onChange={e => setAutoCopy(e.target.checked)}
            style={{ accentColor: '#06b6d4', width: '13px', height: '13px' }}
          />
          <span>Auto Copy Stream (Fast direct remux)</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={mergeFiles}
            onChange={e => setMergeFiles(e.target.checked)}
            style={{ accentColor: '#06b6d4', width: '13px', height: '13px' }}
          />
          <span>Merge All Queued Files into One Single Media</span>
        </label>
      </div>
    </div>
  );
};
