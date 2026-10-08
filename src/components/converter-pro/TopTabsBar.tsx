import React from 'react';
import { Film, Music, Layers } from 'lucide-react';

interface TopTabsBarProps {
  standaloneWindow?: boolean;
  activeMainTab: 'convert' | 'video_output' | 'audio_output';
  onSelectTab: (tab: 'convert' | 'video_output' | 'audio_output') => void;
  queueCount: number;
  videoOutputCount: number;
  audioOutputCount: number;
}

export const TopTabsBar: React.FC<TopTabsBarProps> = ({
  standaloneWindow = false,
  activeMainTab,
  onSelectTab,
  queueCount,
  videoOutputCount,
  audioOutputCount
}) => {
  return (
    <div className={standaloneWindow ? 'converter-pro-transparent-surface' : undefined} style={{
      padding: '10px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(255, 255, 255, 0.02)',
      gap: '12px',
      flexWrap: 'wrap'
    }}>
      {/* 3 Main Top Tabs: Convert Tab, Video Output, Audio Output */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onSelectTab('convert')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border: activeMainTab === 'convert' ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
            background: activeMainTab === 'convert' ? 'rgba(6, 182, 212, 0.22)' : 'rgba(255,255,255,0.03)',
            color: activeMainTab === 'convert' ? '#67e8f9' : 'rgba(255,255,255,0.65)',
            boxShadow: activeMainTab === 'convert' ? '0 0 16px rgba(6, 182, 212, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={13} style={{ color: activeMainTab === 'convert' ? '#06b6d4' : 'currentColor' }} />
          <span>Convert</span>
          <span style={{
            fontSize: '9.5px',
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: '10px',
            background: activeMainTab === 'convert' ? 'rgba(6, 182, 212, 0.35)' : 'rgba(255,255,255,0.08)',
            color: '#fff'
          }}>
            {queueCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('video_output')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border: activeMainTab === 'video_output' ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.08)',
            background: activeMainTab === 'video_output' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.03)',
            color: activeMainTab === 'video_output' ? '#c7d2fe' : 'rgba(255,255,255,0.65)',
            boxShadow: activeMainTab === 'video_output' ? '0 0 16px rgba(99, 102, 241, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Film size={13} style={{ color: activeMainTab === 'video_output' ? '#818cf8' : 'currentColor' }} />
          <span>Video Output</span>
          <span style={{
            fontSize: '9.5px',
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: '10px',
            background: activeMainTab === 'video_output' ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255,255,255,0.08)',
            color: '#fff'
          }}>
            {videoOutputCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('audio_output')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border: activeMainTab === 'audio_output' ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.08)',
            background: activeMainTab === 'audio_output' ? 'rgba(236, 72, 153, 0.25)' : 'rgba(255,255,255,0.03)',
            color: activeMainTab === 'audio_output' ? '#fbcfe8' : 'rgba(255,255,255,0.65)',
            boxShadow: activeMainTab === 'audio_output' ? '0 0 16px rgba(236, 72, 153, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Music size={13} style={{ color: activeMainTab === 'audio_output' ? '#f472b6' : 'currentColor' }} />
          <span>Audio Output</span>
          <span style={{
            fontSize: '9.5px',
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: '10px',
            background: activeMainTab === 'audio_output' ? 'rgba(236, 72, 153, 0.35)' : 'rgba(255,255,255,0.08)',
            color: '#fff'
          }}>
            {audioOutputCount}
          </span>
        </button>
      </div>
    </div>
  );
};
