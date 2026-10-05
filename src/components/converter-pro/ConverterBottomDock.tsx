import React, { useRef } from 'react';
import { 
  Settings, Play, Pause,
  Scissors, Crop, MessageSquare, Sparkles, RotateCw, 
  Image as ImageIcon, FlipHorizontal, Minimize2, Zap, Volume2, Split
} from 'lucide-react';
import type { VideoFormatPreset, AudioFormatPreset, MediaToolItem } from './types';

export const MEDIA_TOOLS: MediaToolItem[] = [
  { id: 'cut', label: 'Cut / Trim', sub: 'Trim clip range', icon: <Scissors size={18} />, color: '#38bdf8', desc: 'Set start and end markers to trim unwanted parts or isolate specific scenes.' },
  { id: 'crop', label: 'Crop', sub: '16:9 / Zoom', icon: <Crop size={18} />, color: '#818cf8', desc: 'Reframe the picture to 16:9, 4:3, 1:1 or 9:16, with a zoom control to crop into the shot.' },
  { id: 'subtitle', label: 'Subtitle', sub: 'Embed .srt track', icon: <MessageSquare size={18} />, color: '#c084fc', desc: 'Add or burn external subtitles (.srt, .ass, .vtt) into the video stream.' },
  { id: 'effect', label: 'Effect', sub: 'Filters & color', icon: <Sparkles size={18} />, color: '#ec4899', desc: 'Adjust brightness, contrast, hue, saturation, and apply color grading filters.' },
  { id: 'rotate', label: 'Rotate', sub: '90° / 180° / 270°', icon: <RotateCw size={18} />, color: '#f59e0b', desc: 'Rotate by 90, 180 or 270 degrees, and flip horizontally or vertically.' },
  { id: 'watermark', label: 'Watermark', sub: 'Custom logo PNG', icon: <ImageIcon size={18} />, color: '#34d399', desc: 'Overlay transparent logo image or custom copyright text on the video.' },
  { id: 'mirror', label: 'Mirror & Flip', sub: 'Horizontal / Vert', icon: <FlipHorizontal size={18} />, color: '#60a5fa', desc: 'Flip video horizontally or vertically for selfie or inverted camera footage.' },
  { id: 'compress', label: 'Compress', sub: 'Reduce file size', icon: <Minimize2 size={18} />, color: '#2dd4bf', desc: 'Shrink the file by a chosen percentage. Encoding is constant-quality, so the reduction lands on the quantiser rather than a guessed bitrate.' },
  { id: 'gif', label: 'Make GIF', sub: 'Animated loop', icon: <Zap size={18} />, color: '#fbbf24', desc: 'Create a lightweight animated GIF loop from any segment of this video.' },
  { id: 'denoise', label: 'Denoise / Vol', sub: 'Audio cleanup', icon: <Volume2 size={18} />, color: '#a78bfa', desc: 'Remove steady background hiss, soften video grain, and normalise loudness to broadcast level.' },
  { id: 'split', label: 'Split File', sub: 'Segment video', icon: <Split size={18} />, color: '#f87171', desc: 'Split a long clip into numbered segments of a chosen length, each independently playable.' },
];

interface ConverterBottomDockProps {
  formatModalMode: 'video' | 'audio';
  activeVideoPreset: VideoFormatPreset;
  activeAudioPreset: AudioFormatPreset;
  videoQuality: string;
  audioBitrate: string;
  isConverting?: boolean;
  isPaused?: boolean;
  onOpenFormatModal: (mode: 'video' | 'audio') => void;
  onSelectTool: (tool: MediaToolItem) => void;
  onRunConvert: () => void;
  onTogglePause?: () => void;
}

export const ConverterBottomDock: React.FC<ConverterBottomDockProps> = ({
  formatModalMode,
  activeVideoPreset,
  activeAudioPreset,
  videoQuality,
  audioBitrate,
  isConverting = false,
  isPaused = false,
  onOpenFormatModal,
  onSelectTool,
  onRunConvert,
  onTogglePause
}) => {
  const toolsScrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div style={{
      height: '110px',
      background: 'rgba(10, 11, 18, 0.95)',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexShrink: 0
    }}>
      {/* Left: Quick Target Format Trigger */}
      <div
        onClick={() => onOpenFormatModal(formatModalMode)}
        style={{
          width: '180px',
          height: '74px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(6, 182, 212, 0.12) 100%)',
          border: '1.5px solid rgba(99, 102, 241, 0.45)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
        title="Click to change target format settings"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Target Format
          </span>
          <Settings size={13} style={{ color: '#818cf8' }} />
        </div>

        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '0.3px' }}>
            {formatModalMode === 'video' ? activeVideoPreset.label : activeAudioPreset.label}
          </div>
          <div style={{ fontSize: '10.5px', color: '#cbd5e1', fontWeight: 600 }}>
            {formatModalMode === 'video' ? `${activeVideoPreset.codec} • ${videoQuality}` : `${activeAudioPreset.codec} • ${audioBitrate}`}
          </div>
        </div>
      </div>

      {/* Center: Tools Strip (Horizontally Scrollable with Mouse Wheel) */}
      <div
        ref={toolsScrollRef}
        onWheel={(e) => {
          if (toolsScrollRef.current) {
            toolsScrollRef.current.scrollLeft += e.deltaY;
          }
        }}
        style={{
          flex: 1,
          height: '74px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          padding: '0 4px'
        }}
      >
        {MEDIA_TOOLS.map(tool => (
          <div
            key={tool.id}
            onClick={() => onSelectTool(tool)}
            style={{
              minWidth: '82px',
              height: '70px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            title={`${tool.label}: ${tool.desc}`}
          >
            <div style={{ color: tool.color }}>
              {tool.icon}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>
              {tool.label}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              {tool.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Right: Circular Neon RUN Button with Play/Pause Icon and Glowing Pulse Animation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <style>{`
          @keyframes runPulseGlow {
            0% {
              box-shadow: 0 0 25px rgba(6, 182, 212, 0.7), 0 0 45px rgba(59, 130, 246, 0.4);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 40px rgba(6, 182, 212, 0.95), 0 0 70px rgba(236, 72, 153, 0.7), 0 0 90px rgba(99, 102, 241, 0.5);
              transform: scale(1.04);
            }
            100% {
              box-shadow: 0 0 25px rgba(6, 182, 212, 0.7), 0 0 45px rgba(59, 130, 246, 0.4);
              transform: scale(1);
            }
          }
        `}</style>
        <button
          type="button"
          onClick={isConverting ? (onTogglePause || onRunConvert) : onRunConvert}
          style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            background: isConverting
              ? (isPaused 
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                  : 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)')
              : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)',
            border: isConverting
              ? (isPaused ? '2px solid rgba(251, 191, 36, 0.8)' : '2px solid rgba(255, 255, 255, 0.85)')
              : '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: isConverting
              ? (isPaused
                  ? '0 0 25px rgba(245, 158, 11, 0.6), 0 4px 14px rgba(0, 0, 0, 0.5)'
                  : '0 0 35px rgba(6, 182, 212, 0.85), 0 0 65px rgba(236, 72, 153, 0.6), 0 6px 18px rgba(0, 0, 0, 0.6)')
              : '0 0 28px rgba(6, 182, 212, 0.65), 0 6px 18px rgba(0, 0, 0, 0.6)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0,
            animation: isConverting && !isPaused ? 'runPulseGlow 1.8s infinite ease-in-out' : 'none'
          }}
          title={isConverting ? (isPaused ? "Resume conversion" : "Pause conversion") : "Start converting all queued media (RUN)"}
        >
          {isConverting && !isPaused ? (
            <Pause size={24} fill="#fff" />
          ) : (
            <Play size={24} fill="#fff" style={{ marginLeft: '3px' }} />
          )}
          <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.8px', marginTop: '2px', lineHeight: 1 }}>
            {isConverting ? (isPaused ? 'RESUME' : 'PAUSE') : 'RUN'}
          </span>
        </button>
      </div>
    </div>
  );
};
