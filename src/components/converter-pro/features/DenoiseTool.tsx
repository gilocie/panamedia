import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import { Check, Gauge, Mic, Music4, RefreshCw, Sparkles, Volume2, Waves } from 'lucide-react';
import { MediaToolPreview } from './MediaToolPreview';
import {
  ProInspector,
  ProPanel,
  ProStat,
  ProSwitch,
  ProTimeline,
  ProToolShell,
  ProTrack
} from './ProToolShell';

interface DenoiseToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (denoiseSettings: { videoDenoise: boolean; audioDenoise: boolean; loudness: boolean }) => void;
  onClose: () => void;
}

const ACCENT = '#a78bfa';

type CleanupKey = 'videoDenoise' | 'audioDenoise' | 'loudness';

/* Reference: convertor_pro_features_ui/audio_denoise_volume_studio/code.html
   Left = acoustic scopes (spectrum + level meters) + source frame.
   Right = cleanup pipeline cards with the matching ffmpeg filters. */
const CLEANUPS: Array<{
  key: CleanupKey;
  title: string;
  sub: string;
  filter: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'videoDenoise',
    title: 'Video denoise',
    sub: 'hqdn3d — softens film grain and blocky compression noise',
    filter: 'hqdn3d',
    icon: <Sparkles size={16} />
  },
  {
    key: 'audioDenoise',
    title: 'Audio denoise',
    sub: 'afftdn — FFT filter that removes steady background hiss',
    filter: 'afftdn',
    icon: <Waves size={16} />
  },
  {
    key: 'loudness',
    title: 'Normalize volume',
    sub: 'loudnorm — brings dialogue to broadcast loudness (EBU R128)',
    filter: 'loudnorm',
    icon: <Volume2 size={16} />
  }
];

export const DenoiseTool: React.FC<DenoiseToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [videoDenoise, setVideoDenoise] = useState<boolean>(false);
  const [audioDenoise, setAudioDenoise] = useState<boolean>(false);
  const [loudness, setLoudness] = useState<boolean>(false);

  const state: Record<CleanupKey, boolean> = { videoDenoise, audioDenoise, loudness };
  const setter: Record<CleanupKey, (v: boolean) => void> = {
    videoDenoise: setVideoDenoise,
    audioDenoise: setAudioDenoise,
    loudness: setLoudness
  };

  const activeCount = Object.values(state).filter(Boolean).length;
  const display = fileName.split(/[\\/]/).pop() || fileName;

  // Illustrative scope shapes — the engine reports no metering back to the UI,
  // so these read as level indication rather than live analysis.
  const spectrum = Array.from({ length: 28 }, (_, i) => {
    const wave = Math.sin(i * 0.55) * 0.5 + 0.5;
    const falloff = 1 - i / 34;
    return Math.round(18 + wave * falloff * 74);
  });

  return (
    <ProToolShell
      title="Audio Denoise & Volume Studio"
      subtitle={fileName}
      icon={<Music4 size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> {activeCount} STAGE{activeCount === 1 ? '' : 'S'} ARMED
          </span>
          <span className="pw-badge pw-badge--flat">EBU R128</span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button
            type="button"
            className="pw-btn"
            onClick={() => {
              setVideoDenoise(false);
              setAudioDenoise(false);
              setLoudness(false);
            }}
          >
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">{activeCount} cleanup stage{activeCount === 1 ? '' : 's'} enabled</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {audioDenoise ? 'afftdn ' : ''}{loudness ? 'loudnorm ' : ''}{videoDenoise ? 'hqdn3d' : ''}
            {activeCount === 0 ? 'pass-through' : ''}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ videoDenoise, audioDenoise, loudness });
        onClose();
      }}
    >
      {/* ── Acoustic scopes ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Waves size={16} />
            <span>Audio Analyzer & Acoustic Scopes</span>
          </div>
          <span className="pw-badge pw-badge--flat">{display}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            height: 116,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--pw-line)',
            background: 'var(--pw-lowest)'
          }}
        >
          {spectrum.map((h, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: `${h}%`,
                borderRadius: 3,
                opacity: audioDenoise ? 0.45 : 1,
                background: `linear-gradient(180deg, var(--tool-accent), color-mix(in srgb, var(--tool-accent) 25%, transparent))`
              }}
            />
          ))}
        </div>

        <div className="pro-grid-2">
          {[
            { label: 'Left channel', on: audioDenoise, pct: 72, icon: <Mic size={14} /> },
            { label: 'Right channel', on: audioDenoise, pct: 66, icon: <Music4 size={14} /> }
          ].map(ch => (
            <div key={ch.label} className="pro-telemetry">
              <div style={{ gap: 7 }}>
                {ch.icon}
                <span>{ch.label}</span>
              </div>
              <div style={{ gap: 8 }}>
                <span className="pw-meter" style={{ width: 90 }}>
                  <span className="pw-meter__fill pw-meter__fill--2" style={{ width: `${loudness ? 84 : ch.pct}%`, opacity: ch.on ? 0.6 : 1 }} />
                </span>
                <em>{loudness ? '-16.0' : ch.on ? '-24.1' : '-14.2'} LUFS</em>
              </div>
            </div>
          ))}
        </div>

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>{loudness ? '-16.0' : '-14.2'}</span>
            <small>LUFS INTEGRATED</small>
          </div>
          <ProTrack from={0} to={loudness ? 84 : 72} head={loudness ? 84 : 72} slim />
          <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>-23 LUFS TARGET</span>
        </div>
      </section>

      {/* ── Source frame ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Sparkles size={16} />
            <span>Source Frame</span>
          </div>
          <span className="pw-badge pw-badge--flat">{videoDenoise ? 'GRAIN REDUCED' : 'RAW'}</span>
        </div>
        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={videoDenoise ? 'hqdn3d preview (approximate)' : 'Source frame'}
          imageStyle={videoDenoise ? { filter: 'contrast(1.06) saturate(1.03)' } : undefined}
          style={{ minHeight: 160, maxHeight: 200 }}
        />
      </section>

      {/* ── Grain readout ── */}
      <ProPanel
        title="Source Noise Profile"
        icon={<Gauge size={15} />}
        action={<span className="pw-badge">{videoDenoise ? 'SMOOTHED' : 'RAW'}</span>}
      >
        <div className="pro-stat-row pro-stat-row--3">
          <ProStat label="Video grain" value={videoDenoise ? 'Reduced' : 'Untouched'} icon={<Sparkles size={16} />} />
          <ProStat label="Hiss floor" value={audioDenoise ? 'Suppressed' : 'Untouched'} icon={<Waves size={16} />} tone="alt" />
          <ProStat label="Loudness" value={loudness ? 'EBU R128' : 'Untouched'} icon={<Volume2 size={16} />} tone="hot" />
        </div>
        <div className="pro-note">
          Each cleanup runs only when enabled, so an untouched file is not re-processed. These scope
          shapes are indicative — the engine does not stream metering back to this panel.
        </div>
      </ProPanel>


      <ProInspector>
    {/* ── Inspector: cleanup pipeline ── */}
    {CLEANUPS.map(item => {
      const on = state[item.key];
      return (
        <ProPanel key={item.key} title={item.title} icon={item.icon} action={<span className="pw-badge pw-badge--flat">{item.filter}</span>}>
          <div className="pw-check" data-on={on} style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={on}
              onChange={e => setter[item.key](e.target.checked)}
              aria-label={item.title}
            />
            <span className="pro-stack-tight">
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pw-text)' }}>{item.title}</span>
              <span style={{ fontSize: 10.5, color: 'var(--pw-text-faint)', lineHeight: 1.45 }}>{item.sub}</span>
            </span>
            <ProSwitch on={on} onChange={next => setter[item.key](next)} label={item.title} />
          </div>
        </ProPanel>
      );
    })}
    
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Waves size={15} />
              <span>Cleanup Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">FILTERS APPLY ACROSS EVERY FRAME</span>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                                <Filmstrip
                  fileName={fileName}
                  streamingPort={streamingPort}
                  duration={duration}
                  frames={12}
                  cellStyle={{ filter: videoDenoise ? 'contrast(1.06) saturate(1.03)' : undefined }}
                />
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">A1</span>
              <div className="pro-tracklane__body pro-tracklane__body--audio">
                <svg className="pro-wave" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    fill="currentColor"
                    opacity={audioDenoise ? 0.55 : 1}
                    d="M 0,20 Q 5,8 10,20 Q 15,33 20,20 Q 25,4 30,20 Q 35,37 40,20 Q 45,11 50,20 Q 55,30 60,20 Q 65,6 70,20 Q 75,35 80,20 Q 85,13 90,20 Q 95,27 100,20 Q 105,2 110,20 Q 115,39 120,20 Q 125,10 130,20 Q 135,31 140,20 Q 145,5 150,20 Q 155,36 160,20 Q 165,12 170,20 Q 175,29 180,20 Q 185,3 190,20 Q 195,38 200,20 Q 205,9 210,20 Q 215,32 220,20 Q 225,14 230,20 Q 235,27 240,20 Q 245,1 250,20 Q 255,39 260,20 Q 265,8 270,20 Q 275,33 280,20 Q 285,12 290,20 Q 295,28 300,20 Q 305,4 310,20 Q 315,37 320,20 Q 325,10 330,20 Q 335,31 340,20 Q 345,6 350,20 Q 355,35 360,20 Q 365,13 370,20 Q 375,27 380,20 Q 385,2 390,20 Q 395,38 400,20 Q 405,9 410,20 Q 415,32 420,20 Q 425,15 430,20 Q 435,25 440,20 Q 445,3 450,20 Q 455,39 460,20 Q 465,11 470,20 Q 475,30 480,20 Q 485,7 490,20 Q 495,34 500,20 Q 505,12 510,20 Q 515,28 520,20 Q 525,1 530,20 Q 535,38 540,20 Q 545,9 550,20 Q 555,33 560,20 Q 565,14 570,20 Q 575,26 580,20 Q 585,4 590,20 Q 595,37 600,20 Q 605,10 610,20 Q 615,31 620,20 Q 625,6 630,20 Q 635,35 640,20 Q 645,13 650,20 Q 655,27 660,20 Q 665,2 670,20 Q 675,39 680,20 Q 685,9 690,20 Q 695,32 700,20 Q 705,15 710,20 Q 715,25 720,20 Q 725,5 730,20 Q 735,36 740,20 Q 745,11 750,20 Q 755,29 760,20 Q 765,3 770,20 Q 775,38 780,20 Q 785,8 790,20 Q 795,33 800,20 Q 805,14 810,20 Q 815,26 820,20 Q 825,1 830,20 Q 835,39 840,20 Q 845,10 850,20 Q 855,31 860,20 Q 865,7 870,20 Q 875,35 880,20 Q 885,12 890,20 Q 895,28 900,20 Q 905,4 910,20 Q 915,37 920,20 Q 925,9 930,20 Q 935,33 940,20 Q 945,13 950,20 Q 955,27 960,20 Q 965,2 970,20 Q 975,38 980,20 Q 985,8 990,20 Q 995,32 1000,20 L 1000,40 L 0,40 Z"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>{videoDenoise ? 'HQDN3D' : 'GRAIN RAW'}</span>
            <span>·</span>
            <span>{audioDenoise ? 'AFFTDN' : 'HISS RAW'}</span>
            <span>·</span>
            <span>{loudness ? 'LOUDNORM EBU R128' : 'LOUDNESS RAW'}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> {activeCount} STAGE{activeCount === 1 ? '' : 'S'} ARMED
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
