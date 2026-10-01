import React from 'react';
import { Film, Music, X, Check } from 'lucide-react';
import { VIDEO_FORMATS, AUDIO_FORMATS } from './types';

interface FormatSettingsModalProps {
  isOpen: boolean;
  formatModalMode: 'video' | 'audio';
  setFormatModalMode: (mode: 'video' | 'audio') => void;
  selectedVideoFmt: string;
  setSelectedVideoFmt: (fmt: string) => void;
  videoQuality: string;
  setVideoQuality: (res: string) => void;
  selectedAudioFmt: string;
  setSelectedAudioFmt: (fmt: string) => void;
  audioBitrate: string;
  setAudioBitrate: (bitrate: string) => void;
  onClose: () => void;
}

export const FormatSettingsModal: React.FC<FormatSettingsModalProps> = ({
  isOpen,
  formatModalMode,
  setFormatModalMode,
  selectedVideoFmt,
  setSelectedVideoFmt,
  videoQuality,
  setVideoQuality,
  selectedAudioFmt,
  setSelectedAudioFmt,
  audioBitrate,
  setAudioBitrate,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '680px',
          maxWidth: '94%',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: formatModalMode === 'video' ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(236, 72, 153, 0.45)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(99, 102, 241, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'panamediaMenuPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: formatModalMode === 'video' ? 'linear-gradient(135deg, #6366f1, #06b6d4)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              {formatModalMode === 'video' ? <Film size={18} /> : <Music size={18} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                {formatModalMode === 'video' ? 'Video Format Settings' : 'Audio Format Settings'}
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {formatModalMode === 'video' 
                  ? 'Configure target container, video codec & export resolution' 
                  : 'Configure audio extraction container, bitrate & dynamics'}
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs inside Settings Dialog */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              gap: '4px',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <button
                type="button"
                onClick={() => setFormatModalMode('video')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  background: formatModalMode === 'video' ? 'rgba(99, 102, 241, 0.4)' : 'transparent',
                  color: formatModalMode === 'video' ? '#fff' : 'rgba(255, 255, 255, 0.55)',
                  cursor: 'pointer'
                }}
              >
                Video Formats
              </button>
              <button
                type="button"
                onClick={() => setFormatModalMode('audio')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  background: formatModalMode === 'audio' ? 'rgba(236, 72, 153, 0.4)' : 'transparent',
                  color: formatModalMode === 'audio' ? '#fff' : 'rgba(255, 255, 255, 0.55)',
                  cursor: 'pointer'
                }}
              >
                Audio Formats
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {formatModalMode === 'video' ? (
            <>
              {/* Format Grid */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                  Target Video Format
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  {VIDEO_FORMATS.map(fmt => {
                    const isSelected = selectedVideoFmt === fmt.id;
                    return (
                      <div
                        key={fmt.id}
                        onClick={() => setSelectedVideoFmt(fmt.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: isSelected ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(6, 182, 212, 0.2) 100%)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.07)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxShadow: isSelected ? '0 0 20px rgba(99, 102, 241, 0.25)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                            {fmt.label}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: fmt.iconColor,
                            background: `${fmt.iconColor}20`,
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {fmt.tag}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                          {fmt.codec}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                          {fmt.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resolution Selector */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                  Output Resolution
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'Original', title: 'Original', sub: 'Match Source' },
                    { id: '1080p', title: '1080p', sub: '1920x1080 FHD' },
                    { id: '720p', title: '720p', sub: '1280x720 HD' },
                    { id: '480p', title: '480p', sub: '854x480 SD' },
                  ].map(res => {
                    const isSelected = videoQuality === res.id;
                    return (
                      <div
                        key={res.id}
                        onClick={() => setVideoQuality(res.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.07)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#c7d2fe' : '#fff' }}>
                          {res.title}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {res.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Audio Format Grid */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                  Target Audio Format
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  {AUDIO_FORMATS.map(fmt => {
                    const isSelected = selectedAudioFmt === fmt.id;
                    return (
                      <div
                        key={fmt.id}
                        onClick={() => setSelectedAudioFmt(fmt.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: isSelected ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.3) 0%, rgba(168, 85, 247, 0.2) 100%)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1.5px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.07)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxShadow: isSelected ? '0 0 20px rgba(236, 72, 153, 0.25)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                            {fmt.label}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: fmt.iconColor,
                            background: `${fmt.iconColor}20`,
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {fmt.tag}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                          {fmt.codec}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                          {fmt.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bitrate Selector */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                  Audio Bitrate Quality
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: '320k', title: '320 kbps', sub: 'Audiophile Max' },
                    { id: '256k', title: '256 kbps', sub: 'High Fidelity' },
                    { id: '192k', title: '192 kbps', sub: 'Standard Quality' },
                    { id: '128k', title: '128 kbps', sub: 'Compact Size' },
                  ].map(br => {
                    const isSelected = audioBitrate === br.id;
                    return (
                      <div
                        key={br.id}
                        onClick={() => setAudioBitrate(br.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: isSelected ? 'rgba(236, 72, 153, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1.5px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.07)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#fbcfe8' : '#fff' }}>
                          {br.title}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {br.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer of Modal */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Target: <strong style={{ color: '#fff' }}>
              {formatModalMode === 'video' ? `${selectedVideoFmt.toUpperCase()} (${videoQuality})` : `${selectedAudioFmt.toUpperCase()} (${audioBitrate})`}
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: formatModalMode === 'video' ? 'linear-gradient(135deg, #6366f1, #06b6d4)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: formatModalMode === 'video' ? '0 4px 15px rgba(99, 102, 241, 0.35)' : '0 4px 15px rgba(236, 72, 153, 0.35)'
            }}
          >
            <Check size={14} /> Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};
