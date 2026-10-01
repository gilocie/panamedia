import React from 'react';
import { 
  Film, Music, Plus, X, 
  CheckSquare, Square, Trash2, ArrowRight
} from 'lucide-react';
import { isVideoFile, type VideoFormatPreset, type AudioFormatPreset } from './types';

interface ConvertQueueListProps {
  localQueue: string[];
  selectedIndices: Set<number>;
  selectedFileIdx: number;
  mediaTypes: Record<string, 'video' | 'audio'>;
  streamingPort?: number;
  activeVideoPreset: VideoFormatPreset;
  activeAudioPreset: AudioFormatPreset;
  videoQuality: string;
  audioBitrate: string;
  onSelectFile: (idx: number) => void;
  onToggleSelectAll: () => void;
  onToggleSelectCard: (idx: number, e: React.MouseEvent) => void;
  onRemoveCard: (idx: number, e: React.MouseEvent) => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onToggleMediaType: (filePath: string) => void;
  onAddFiles?: () => void;
}

export const ConvertQueueList: React.FC<ConvertQueueListProps> = ({
  localQueue,
  selectedIndices,
  selectedFileIdx,
  mediaTypes,
  streamingPort = 52321,
  activeVideoPreset,
  activeAudioPreset,
  videoQuality,
  audioBitrate,
  onSelectFile,
  onToggleSelectAll,
  onToggleSelectCard,
  onRemoveCard,
  onRemoveSelected,
  onClearAll,
  onToggleMediaType,
  onAddFiles
}) => {
  const isAllSelected = localQueue.length > 0 && selectedIndices.size === localQueue.length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Action Row for Convert Tab: Select All, Clear All, Remove Selected */}
      <div style={{
        padding: '6px 16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0, 0, 0, 0.2)',
        fontSize: '11px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onToggleSelectAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '5px',
              background: isAllSelected ? 'rgba(6, 182, 212, 0.18)' : 'rgba(255, 255, 255, 0.04)',
              border: isAllSelected ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: isAllSelected ? '#67e8f9' : 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600
            }}
            title="Checkmark to select or deselect all items"
          >
            {isAllSelected ? <CheckSquare size={13} style={{ color: '#06b6d4' }} /> : <Square size={13} />}
            <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          {selectedIndices.size > 0 && selectedIndices.size < localQueue.length && (
            <button
              type="button"
              onClick={onRemoveSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '5px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fef08a',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600
              }}
              title="Remove selected items from queue"
            >
              <Trash2 size={12} />
              <span>Remove Selected ({selectedIndices.size})</span>
            </button>
          )}

          {localQueue.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '5px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600
              }}
              title="Clear all files from conversion queue"
            >
              <Trash2 size={12} />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {onAddFiles && (
          <button
            type="button"
            onClick={onAddFiles}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '5px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={12} /> Add Files
          </button>
        )}
      </div>

      {/* Media Cards Scrollable Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {localQueue.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '240px',
            color: 'rgba(255, 255, 255, 0.4)',
            gap: '10px'
          }}>
            <Film size={36} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Queue is Empty</div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
              Right-click media in playlist or player to add files here
            </div>
            {onAddFiles && (
              <button
                type="button"
                onClick={onAddFiles}
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  color: '#67e8f9',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Add Media Files
              </button>
            )}
          </div>
        ) : (
          localQueue.map((fPath, idx) => {
            const baseName = fPath.split(/[\\/]/).pop() || fPath;
            const ext = baseName.split('.').pop()?.toUpperCase() || 'FILE';
            const isSelected = selectedFileIdx === idx;
            const isChecked = selectedIndices.has(idx);
            const isCardVideo = (mediaTypes[fPath] || (isVideoFile(fPath) ? 'video' : 'audio')) === 'video';

            return (
              <div
                key={`${fPath}-${idx}`}
                onClick={() => onSelectFile(idx)}
                style={{
                  background: isSelected 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.14) 0%, rgba(6, 182, 212, 0.08) 100%)' 
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected 
                    ? '1.5px solid rgba(99, 102, 241, 0.55)' 
                    : isChecked
                    ? '1.5px solid rgba(6, 182, 212, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Selection Checkbox */}
                  <div
                    onClick={(e) => onToggleSelectCard(idx, e)}
                    style={{
                      cursor: 'pointer',
                      color: isChecked ? '#06b6d4' : 'rgba(255, 255, 255, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px'
                    }}
                    title="Select item"
                  >
                    {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                  </div>

                  {/* Real Video / Audio Thumbnail */}
                  <div style={{
                    width: '64px',
                    height: '42px',
                    borderRadius: '6px',
                    background: '#090a10',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isVideoFile(fPath) ? (
                      <video
                        src={`http://localhost:${streamingPort}/stream?path=${encodeURIComponent(fPath)}#t=1`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        preload="metadata"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #2a2038 0%, #100b18 100%)',
                        border: '1px solid rgba(236, 72, 153, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ec4899'
                      }}>
                        <Music size={14} />
                      </div>
                    )}
                    <span style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '3px',
                      fontSize: '8px',
                      fontWeight: 800,
                      background: 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      padding: '1px 3px',
                      borderRadius: '3px'
                    }}>
                      {ext}
                    </span>
                  </div>

                  {/* Title & Path */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.85)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }} title={baseName}>
                      {baseName}
                    </div>

                    <div style={{
                      fontSize: '10.5px',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: '2px'
                    }}>
                      {fPath}
                    </div>
                  </div>

                  {/* Media Type Switcher: [🎬 Video] or [🎵 Audio] */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMediaType(fPath);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 9px',
                        borderRadius: '6px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: isCardVideo ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid rgba(236, 72, 153, 0.6)',
                        background: isCardVideo ? 'rgba(99, 102, 241, 0.22)' : 'rgba(236, 72, 153, 0.22)',
                        color: isCardVideo ? '#c7d2fe' : '#fbcfe8',
                        transition: 'all 0.15s ease'
                      }}
                      title="Click to toggle Media Type (Video vs Audio)"
                    >
                      {isCardVideo ? <Film size={11} /> : <Music size={11} />}
                      <span>{isCardVideo ? 'Video' : 'Audio'}</span>
                    </button>

                    <ArrowRight size={12} style={{ color: 'rgba(255, 255, 255, 0.3)' }} />

                    {/* Target Format Spec Pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        background: isCardVideo ? 'rgba(99, 102, 241, 0.2)' : 'rgba(236, 72, 153, 0.2)',
                        border: isCardVideo ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(236, 72, 153, 0.45)',
                        color: isCardVideo ? '#c7d2fe' : '#fbcfe8',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {isCardVideo ? activeVideoPreset.codec : `${activeAudioPreset.label} • ${audioBitrate}`}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#cbd5e1',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {isCardVideo ? videoQuality : 'Hi-Fi Audio'}
                      </span>
                    </div>
                  </div>

                  {/* Item Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => onRemoveCard(idx, e)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Remove from queue"
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.color = '#ef4444';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.15)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.color = 'rgba(255, 255, 255, 0.4)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
