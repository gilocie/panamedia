import React, { useRef } from 'react';
import { 
  Settings, Send, Play,
  Scissors, Crop, MessageSquare, Sparkles, RotateCw, 
  Image as ImageIcon, FlipHorizontal, Minimize2, Zap, Volume2, Split
} from 'lucide-react';
import type { VideoFormatPreset, AudioFormatPreset, MediaToolItem } from './types';

export const MEDIA_TOOLS: MediaToolItem[] = [
  { id: 'cut', label: 'Cut / Trim', sub: 'Trim clip range', icon: <Scissors size={18} />, color: '#38bdf8', desc: 'Set start and end markers to trim unwanted parts or isolate specific scenes.' },
  { id: 'crop', label: 'Crop', sub: '16:9 / Zoom', icon: <Crop size={18} />, color: '#818cf8', desc: 'Crop black bars, change aspect ratio to 16:9, 4:3, or custom frame.' },
  { id: 'subtitle', label: 'Subtitle', sub: 'Embed .srt track', icon: <MessageSquare size={18} />, color: '#c084fc', desc: 'Add or burn external subtitles (.srt, .ass, .vtt) into the video stream.' },
  { id: 'effect', label: 'Effect', sub: 'Filters & color', icon: <Sparkles size={18} />, color: '#ec4899', desc: 'Adjust brightness, contrast, hue, saturation, and apply color grading filters.' },
  { id: 'rotate', label: 'Rotate', sub: '90° / 180° / 270°', icon: <RotateCw size={18} />, color: '#f59e0b', desc: 'Rotate video orientation 90 degrees clockwise, counter-clockwise, or 180 degrees.' },
  { id: 'watermark', label: 'Watermark', sub: 'Custom logo PNG', icon: <ImageIcon size={18} />, color: '#34d399', desc: 'Overlay transparent logo image or custom copyright text on the video.' },
  { id: 'mirror', label: 'Mirror & Flip', sub: 'Horizontal / Vert', icon: <FlipHorizontal size={18} />, color: '#60a5fa', desc: 'Flip video horizontally or vertically for selfie or inverted camera footage.' },
  { id: 'compress', label: 'Compress', sub: 'Reduce file size', icon: <Minimize2 size={18} />, color: '#2dd4bf', desc: 'Intelligently compress media to target file size while preserving high visual fidelity.' },
  { id: 'gif', label: 'Make GIF', sub: 'Animated loop', icon: <Zap size={18} />, color: '#fbbf24', desc: 'Create a lightweight animated GIF loop from any segment of this video.' },
  { id: 'denoise', label: 'Denoise / Vol', sub: 'Audio cleanup', icon: <Volume2 size={18} />, color: '#a78bfa', desc: 'Remove background noise, normalize volume peaks, or boost quiet dialogue.' },
  { id: 'split', label: 'Split File', sub: 'Segment video', icon: <Split size={18} />, color: '#f87171', desc: 'Split long media into multiple equal chunks by duration or file size.' },
];

interface ConverterBottomDockProps {
  formatModalMode: 'video' | 'audio';
  activeVideoPreset: VideoFormatPreset;
  activeAudioPreset: AudioFormatPreset;
  videoQuality: string;
  audioBitrate: string;
  onOpenFormatModal: (mode: 'video' | 'audio') => void;
  onSelectTool: (tool: MediaToolItem) => void;
  onDirectSend?: () => void;
  onRunConvert: () => void;
}

export const ConverterBottomDock: React.FC<ConverterBottomDockProps> = ({
  formatModalMode,
  activeVideoPreset,
  activeAudioPreset,
  videoQuality,
  audioBitrate,
  onOpenFormatModal,
  onSelectTool,
  onRunConvert
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

      {/* Right: Circular Neon RUN Button with Play Icon at the Centre */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onRunConvert}
          style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 0 28px rgba(6, 182, 212, 0.65), 0 6px 18px rgba(0, 0, 0, 0.6)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0
          }}
          title="Start converting all queued media (RUN)"
        >
          <Play size={24} fill="#fff" style={{ marginLeft: '3px' }} />
          <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.8px', marginTop: '2px', lineHeight: 1 }}>
            RUN
          </span>
        </button>
      </div>
    </div>
  );
};
