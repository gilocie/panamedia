/**
 * SendConvertPreparationModal.tsx
 * ================================
 * Two-panel companion modal for preparing and converting media
 * before sending to Flash Drive or Sendtray.
 */

import React, { useState } from 'react';
import { 
  ChevronLeft, X, Film, Music, Tv, Sliders, Sparkles, 
  Folder, Plus, Check, CheckCircle2, ShieldCheck, ArrowRight,
  Disc3
} from 'lucide-react';
import { 
  getSendtrayFolders, 
  createSendtrayFolder, 
  type SendtrayFolder 
} from './panamedia/sendtrayUtils';

export interface SendConvertOptions {
  mode: 'original' | 'extract_audio' | 'convert';
  format: string;
  bitrate: string;
  keepOriginal?: boolean;
  targetFolderId?: string;
}

export function isVideoFile(filePath: string): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'ts', 'mts', 'm2ts'].includes(ext);
}

interface SendConvertPreparationModalProps {
  fileName: string;
  targetAction: 'drive' | 'sendtray';
  isBatch?: boolean;
  batchCount?: number;
  onProceed: (options: SendConvertOptions) => void;
  onBack: () => void;
  onClose: () => void;
}

type ConvertMode = SendConvertOptions['mode'];

export function SendConvertPreparationModal({
  fileName,
  targetAction,
  isBatch = false,
  batchCount = 1,
  onProceed,
  onBack,
  onClose,
}: SendConvertPreparationModalProps) {
  const [mode, setMode] = useState<ConvertMode>('extract_audio');
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState('192k');
  const [videoFormat, setVideoFormat] = useState('mp4');
  const [videoQuality, setVideoQuality] = useState('1080p');
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [folders, setFolders] = useState<SendtrayFolder[]>(() => getSendtrayFolders());
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  const baseFileName = fileName.replace(/\.[^/.]+$/, '');
  const destinationLabel = targetAction === 'drive' ? 'Flash Drive' : 'Send Tray';

  const handleProceed = () => {
    onProceed({
      mode,
      format: mode === 'extract_audio' ? format : mode === 'convert' ? videoFormat : 'original',
      bitrate: mode === 'extract_audio' ? bitrate : videoQuality,
      keepOriginal: true,
      targetFolderId: selectedFolderId
    });
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = createSendtrayFolder(newFolderName.trim());
    const updated = getSendtrayFolders();
    setFolders(updated);
    setSelectedFolderId(created.id);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setShowFolderDropdown(false);
  };

  const getAudioFormatDesc = (fmt: string) => {
    switch (fmt) {
      case 'mp3': return '• MP3: Universal support for cars, TVs, phones & USB';
      case 'aac': return '• AAC: High fidelity audio standard for Apple & mobile devices';
      case 'm4a': return '• M4A: Apple-native MPEG-4 AAC audio container';
      case 'wav': return '• WAV: Uncompressed studio-grade lossless audio';
      default: return `• ${fmt.toUpperCase()}: Audio track format`;
    }
  };

  const getBitrateDesc = (br: string) => {
    switch (br) {
      case '128k': return '• 128 kbps: Compact size, good for speech & voice';
      case '192k': return '• 192 kbps: Recommended balance of fidelity and space';
      case '256k': return '• 256 kbps: High fidelity audio for quality headphones';
      case '320k': return '• 320 kbps: Maximum MP3 bitrate for audiophile listening';
      default: return `• ${br}: Bitrate encoding rate`;
    }
  };

  const getVideoFormatDesc = (fmt: string) => {
    switch (fmt) {
      case 'mp4': return '• MP4: Universal H.264/AAC video compatible with TVs and USB';
      case 'mkv': return '• MKV: High quality container preserving multi-audio tracks';
      case 'webm': return '• WEBM: Open web standard with efficient VP9 video compression';
      case 'avi': return '• AVI: Legacy video container compatible with older car headunits';
      default: return `• ${fmt.toUpperCase()}: Video output format`;
    }
  };

  const getVideoQualityDesc = (q: string) => {
    switch (q) {
      case '480p': return '• 480p: Standard definition, ultra-compact file size';
      case '720p': return '• 720p: High Definition (HD), fast playback on all screens';
      case '1080p': return '• 1080p: Full HD crisp detail for smart TVs & PC screens';
      case 'Original': return '• Original: Preserve exact source resolution and aspect ratio';
      default: return `• ${q}: Resolution preset`;
    }
  };

  const selectedFolderName = selectedFolderId
    ? folders.find(f => f.id === selectedFolderId)?.name || 'Custom Folder'
    : 'Main Tray (No Folder)';

  return (
    <div 
      className="send-convert-container" 
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: '16px',
        maxWidth: '96vw',
        maxHeight: '90vh'
      }}
    >
      {/* ─── LEFT PANEL: Preparation Mode Selection ─── */}
      <div 
        className="glass-panel send-convert-left-panel"
        style={{
          width: '390px',
          background: 'linear-gradient(145deg, #181824 0%, #0e0e16 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Back"
            >
              <ChevronLeft size={16} />
            </button>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                Send &amp; Convert
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '1px' }}>
                Choose preparation mode
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Media Filename Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(30, 41, 59, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '12px',
          padding: '8px 12px',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <Disc3 size={15} style={{ color: '#818cf8', flexShrink: 0 }} />
            <span style={{
              fontSize: '11.5px',
              color: '#e2e8f0',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {isBatch ? `${batchCount} files selected` : fileName}
            </span>
          </div>
          <span style={{
            fontSize: '10.5px',
            fontWeight: 700,
            background: 'rgba(99, 102, 241, 0.2)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            color: '#a5b4fc',
            padding: '2px 8px',
            borderRadius: '6px',
            flexShrink: 0
          }}>
            {destinationLabel}
          </span>
        </div>

        {/* 3 Preparation Mode Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* 1. Original Video */}
          <div
            onClick={() => setMode('original')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '12px',
              background: mode === 'original' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: mode === 'original' ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.07)',
              boxShadow: mode === 'original' ? '0 0 16px rgba(59, 130, 246, 0.22)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0
              }}>
                <Film size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Original Video</span>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.18)',
                    color: '#34d399',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Fastest
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
                  Send video exactly as it is without re-encoding
                </div>
              </div>
            </div>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: mode === 'original' ? 'none' : '2px solid rgba(255, 255, 255, 0.25)',
              background: mode === 'original' ? '#3b82f6' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {mode === 'original' && <Check size={12} color="#fff" strokeWidth={3} />}
            </div>
          </div>

          {/* 2. Extract Audio */}
          <div
            onClick={() => setMode('extract_audio')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '12px',
              background: mode === 'extract_audio' ? 'rgba(236, 72, 153, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: mode === 'extract_audio' ? '1px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.07)',
              boxShadow: mode === 'extract_audio' ? '0 0 16px rgba(236, 72, 153, 0.25)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(236, 72, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ec4899',
                flexShrink: 0
              }}>
                <Music size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Extract Audio</span>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    background: 'rgba(236, 72, 153, 0.2)',
                    color: '#f472b6',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Save Space • {format.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
                  Soundtrack only - Ideal for car, phone &amp; MP3 players
                </div>
              </div>
            </div>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: mode === 'extract_audio' ? 'none' : '2px solid rgba(255, 255, 255, 0.25)',
              background: mode === 'extract_audio' ? '#ec4899' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {mode === 'extract_audio' && <Check size={12} color="#fff" strokeWidth={3} />}
            </div>
          </div>

          {/* 3. Convert Video */}
          <div
            onClick={() => setMode('convert')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '12px',
              background: mode === 'convert' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: mode === 'convert' ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.07)',
              boxShadow: mode === 'convert' ? '0 0 16px rgba(168, 85, 247, 0.25)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc',
                flexShrink: 0
              }}>
                <Tv size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Convert Video</span>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    background: 'rgba(168, 85, 247, 0.2)',
                    color: '#c084fc',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    TV &amp; Older Players
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
                  Universal H.264/AAC for Smart TVs and older cars
                </div>
              </div>
            </div>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: mode === 'convert' ? 'none' : '2px solid rgba(255, 255, 255, 0.25)',
              background: mode === 'convert' ? '#a855f7' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {mode === 'convert' && <Check size={12} color="#fff" strokeWidth={3} />}
            </div>
          </div>
        </div>

        {/* Green Safe Preservation Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '10px',
          padding: '8px 12px'
        }}>
          <ShieldCheck size={15} style={{ color: '#10b981', flexShrink: 0 }} />
          <span style={{ fontSize: '11.5px', color: '#34d399', fontWeight: 500 }}>
            Original file is 100% preserved and untouched.
          </span>
        </div>

        {/* Left Panel Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: '6px'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              &lt; Back
            </button>
          </div>
          <span style={{ fontSize: '11.5px', color: 'rgba(192, 132, 252, 0.8)', fontWeight: 500 }}>
            Configure on right &gt;
          </span>
        </div>
      </div>

      {/* ─── RIGHT PANEL: Configuration Details ─── */}
      <div 
        className="glass-panel send-convert-right-panel"
        style={{
          width: '350px',
          background: 'linear-gradient(145deg, #181824 0%, #0e0e16 100%)',
          border: mode === 'extract_audio'
            ? '1px solid rgba(236, 72, 153, 0.3)'
            : mode === 'convert'
            ? '1px solid rgba(168, 85, 247, 0.3)'
            : '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '18px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: mode === 'extract_audio'
                ? 'rgba(236, 72, 153, 0.15)'
                : mode === 'convert'
                ? 'rgba(168, 85, 247, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: mode === 'extract_audio' ? '#ec4899' : mode === 'convert' ? '#c084fc' : '#60a5fa',
              flexShrink: 0
            }}>
              {mode === 'extract_audio' ? <Music size={18} /> : mode === 'convert' ? <Tv size={18} /> : <Film size={18} />}
            </div>
            <div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#fff' }}>
                {mode === 'extract_audio' ? 'Audio Extraction' : mode === 'convert' ? 'Video Conversion' : 'Direct Transfer'}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '1px' }}>
                {mode === 'extract_audio' ? 'Custom soundtrack format' : mode === 'convert' ? 'Universal video format' : 'Loss-free stream copy'}
              </div>
            </div>
          </div>
          <button
            type="button"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(236, 72, 153, 0.12)',
              border: '1px solid rgba(236, 72, 153, 0.25)',
              color: '#f472b6',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'default'
            }}
          >
            Settings
          </button>
        </div>

        {/* Section 1: AUDIO / VIDEO FORMAT */}
        {mode === 'extract_audio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f472b6', fontWeight: 700, letterSpacing: '0.4px' }}>
              <Sliders size={13} /> AUDIO FORMAT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {['mp3', 'aac', 'm4a', 'wav'].map((fmt) => {
                const isSelected = format === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    style={{
                      padding: '8px 0',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      background: isSelected ? 'linear-gradient(135deg, #db2777, #be185d)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 10px rgba(236, 72, 153, 0.35)' : 'none'
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.4', marginTop: '2px' }}>
              {getAudioFormatDesc(format)}
            </div>
          </div>
        )}

        {mode === 'convert' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#c084fc', fontWeight: 700, letterSpacing: '0.4px' }}>
              <Sliders size={13} /> VIDEO FORMAT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {['mp4', 'mkv', 'webm', 'avi'].map((fmt) => {
                const isSelected = videoFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setVideoFormat(fmt)}
                    style={{
                      padding: '8px 0',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      background: isSelected ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 10px rgba(168, 85, 247, 0.35)' : 'none'
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.4', marginTop: '2px' }}>
              {getVideoFormatDesc(videoFormat)}
            </div>
          </div>
        )}

        {/* Section 2: BITRATE QUALITY / RESOLUTION */}
        {mode === 'extract_audio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f472b6', fontWeight: 700, letterSpacing: '0.4px' }}>
              <Sparkles size={13} /> BITRATE QUALITY
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[
                { key: '128k', label: '128 kbps' },
                { key: '192k', label: '192 kbps' },
                { key: '256k', label: '256 kbps' },
                { key: '320k', label: '320 kbps' }
              ].map((item) => {
                const isSelected = bitrate === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setBitrate(item.key)}
                    style={{
                      padding: '8px 0',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isSelected ? 'linear-gradient(135deg, #db2777, #be185d)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 10px rgba(236, 72, 153, 0.35)' : 'none'
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.4', marginTop: '2px' }}>
              {getBitrateDesc(bitrate)}
            </div>
          </div>
        )}

        {mode === 'convert' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#c084fc', fontWeight: 700, letterSpacing: '0.4px' }}>
              <Sparkles size={13} /> RESOLUTION QUALITY
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {['480p', '720p', '1080p', 'Original'].map((res) => {
                const isSelected = videoQuality === res;
                return (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setVideoQuality(res)}
                    style={{
                      padding: '8px 0',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isSelected ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {res}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.4', marginTop: '2px' }}>
              {getVideoQualityDesc(videoQuality)}
            </div>
          </div>
        )}

        {mode === 'original' && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '10px',
            padding: '12px',
            fontSize: '11.5px',
            color: '#93c5fd',
            lineHeight: '1.5'
          }}>
            • Direct stream copy bypasses re-encoding entirely.<br />
            • Instantaneous file preparation with zero loss in visual or audio quality.
          </div>
        )}

        {/* Section 3: SENDTRAY FOLDER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.4px' }}>
              <Folder size={13} /> {targetAction === 'drive' ? 'TARGET DESTINATION' : 'SENDTRAY FOLDER'}
            </div>
            {targetAction === 'sendtray' && (
              <button
                type="button"
                onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fbbf24',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Plus size={12} /> New Folder
              </button>
            )}
          </div>

          {isCreatingFolder ? (
            <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  background: 'rgba(0, 0, 0, 0.4)',
                  color: '#fff',
                  fontSize: '11.5px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#f59e0b',
                  border: 'none',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(false)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={14} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fef08a' }}>
                    {selectedFolderName}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                  ▼
                </span>
              </div>

              {showFolderDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  marginTop: '4px',
                  background: '#13141f',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
                }}>
                  <div
                    onClick={() => {
                      setSelectedFolderId(undefined);
                      setShowFolderDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: '11.5px',
                      color: !selectedFolderId ? '#f59e0b' : '#fff',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: !selectedFolderId ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                    }}
                  >
                    Main Tray (No Folder)
                  </div>
                  {folders.map(f => (
                    <div
                      key={f.id}
                      onClick={() => {
                        setSelectedFolderId(f.id);
                        setShowFolderDropdown(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '11.5px',
                        color: selectedFolderId === f.id ? '#f59e0b' : '#fff',
                        cursor: 'pointer',
                        background: selectedFolderId === f.id ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                      }}
                    >
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: OUTPUT FILE PREVIEW */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '10px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.4px' }}>
            OUTPUT FILE PREVIEW
          </div>
          <div style={{
            fontSize: '11.5px',
            color: '#fff',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {mode === 'extract_audio'
              ? `${baseFileName}.${format}`
              : mode === 'convert'
              ? `${baseFileName}.${videoFormat}`
              : fileName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
            <CheckCircle2 size={12} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '10.5px', color: '#34d399', fontWeight: 500 }}>
              {mode === 'extract_audio'
                ? 'Takes ~85% less storage space'
                : mode === 'convert'
                ? 'Universal hardware playback'
                : 'Zero compression loss'}
            </span>
          </div>
        </div>

        {/* Big Action Button */}
        <button
          type="button"
          onClick={handleProceed}
          style={{
            marginTop: 'auto',
            padding: '11px 16px',
            borderRadius: '10px',
            border: 'none',
            background: mode === 'extract_audio'
              ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
              : mode === 'convert'
              ? 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)'
              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: mode === 'extract_audio'
              ? '0 4px 18px rgba(236, 72, 153, 0.4)'
              : mode === 'convert'
              ? '0 4px 18px rgba(168, 85, 247, 0.4)'
              : '0 4px 18px rgba(59, 130, 246, 0.4)',
            transition: 'all 0.18s ease'
          }}
        >
          <span>
            {mode === 'extract_audio'
              ? targetAction === 'drive' ? 'Extract & Send to Drive' : 'Extract & Add to Tray'
              : mode === 'convert'
              ? targetAction === 'drive' ? 'Convert & Send to Drive' : 'Convert & Add to Tray'
              : targetAction === 'drive' ? 'Send to Drive' : 'Add to Tray'}
          </span>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
