import React, { useState } from 'react';
import { Check, Layers, RefreshCw, Scissors, Split } from 'lucide-react';
import { formatSeconds } from '../types';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProTimeline,
  ProToolShell,
  ProTrack
} from './ProToolShell';

interface SplitToolProps {
  fileName: string;
  duration?: number;
  onApply: (splitSettings: { segmentSec: number }) => void;
  onClose: () => void;
}

const ACCENT = '#f87171';

/* Reference: no dedicated mockup — Split follows the same
   cut_trim_studio language: ledger on the left, parameter dock on the right. */
const TIERS = [
  { label: '10s', value: 10, blurb: 'Social clips' },
  { label: '30s', value: 30, blurb: 'Short inserts' },
  { label: '1m', value: 60, blurb: 'Default' },
  { label: '5m', value: 300, blurb: 'Long-form' },
  { label: '10m', value: 600, blurb: 'Chapters' }
];

export const SplitTool: React.FC<SplitToolProps> = ({
  fileName,
  duration,
  onApply,
  onClose
}) => {
  const [segmentSec, setSegmentSec] = useState<number>(60);

  const dur = duration && duration > 0 ? duration : 0;
  const count = dur > 0 ? Math.max(1, Math.ceil(dur / segmentSec)) : 0;

  // Ledger rows: show at most 8 so the panel cannot grow unbounded.
  const rows = Array.from({ length: Math.min(count, 8) }, (_, i) => i + 1);
  const shown = Math.min(rows.length, 8);

  return (
    <ProToolShell
      title="Split & Segment File"
      subtitle={fileName}
      icon={<Split size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> SPLIT ON
          </span>
          <span className="pw-badge pw-badge--flat">
            {count > 0 ? `${count} SEGMENT${count === 1 ? '' : 'S'}` : 'DURATION UNKNOWN'}
          </span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={() => setSegmentSec(60)}>
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">
            {dur > 0 ? `${count} × ~${formatSeconds(segmentSec)}` : `Segments of ${formatSeconds(segmentSec)}`}
          </span>
          <span className="pw-data" style={{ color: ACCENT }}>numbered name001, name002, …</span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ segmentSec });
        onClose();
      }}
    >
      {/* ── Segment ledger ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Layers size={16} />
            <span>Segment Ledger</span>
          </div>
          <span className="pw-badge">{count > 0 ? `${count} output file${count === 1 ? '' : 's'}` : 'Awaiting duration'}</span>
        </div>

        {count > 0 ? (
          <div className="pro-col" style={{ gap: 5 }}>
            {rows.map(i => {
              const from = (i - 1) * segmentSec;
              const to = Math.min(dur, i * segmentSec);
              const fromPct = (from / dur) * 100;
              const toPct = (to / dur) * 100;
              return (
                <div
                  key={i}
                  className="pro-row"
                  style={{ gap: 10, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--pw-line)', background: 'var(--pw-high)' }}
                >
                  <span
                    className="pw-data"
                    style={{ color: ACCENT, width: 62, flexShrink: 0 }}
                  >
                    SEG {String(i).padStart(2, '0')}
                  </span>
                  <span className="pw-data" style={{ flex: 1, minWidth: 0, color: 'var(--pw-text-dim)' }}>
                    {formatSeconds(from)} → {formatSeconds(to)}
                  </span>
                  <span style={{ width: 96, flexShrink: 0 }}>
                    <ProTrack from={fromPct} to={toPct} slim />
                  </span>
                </div>
              );
            })}
            {count > shown && (
              <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>
                + {count - shown} more segment{count - shown === 1 ? '' : 's'} written during conversion
              </span>
            )}
          </div>
        ) : (
          <div className="pro-note">
            The source duration is not known yet. Set a segment length and the exact segment count is
            resolved when the conversion runs.
          </div>
        )}
      </section>

      {/* ── Overlap diagram ── */}
      <ProPanel
        title="Segment Boundary Map"
        icon={<Scissors size={15} />}
        action={<span className="pw-badge pw-badge--flat">{formatSeconds(segmentSec)} EACH</span>}
      >
        <ProTrack from={0} to={100} head={0} hot />
        <div className="pw-scale">
          <span>00:00</span>
          <span>{dur > 0 ? formatSeconds(dur / 2) : '—'}</span>
          <span>{dur > 0 ? formatSeconds(dur) : '—'}</span>
        </div>
      </ProPanel>


      <ProInspector>
    {/* ── Inspector ── */}
    <ProPanel
      title="Segment Length"
      icon={<Split size={15} />}
      action={<span className="pw-badge">{formatSeconds(segmentSec)}</span>}
    >
      <ProSlider
        label="Segment length"
        readout={<span className="pw-data" style={{ color: ACCENT }}>{formatSeconds(segmentSec)}</span>}
        value={segmentSec}
        min={10}
        max={600}
        step={5}
        onChange={setSegmentSec}
        scale={['10s', '5 min', '10 min']}
      />
      <div className="pw-tile-grid">
        {TIERS.map(t => (
          <button
            key={t.value}
            type="button"
            className="pw-tile"
            aria-pressed={segmentSec === t.value}
            onClick={() => setSegmentSec(t.value)}
          >
            {t.label}
            <span className="pw-data" style={{ fontSize: 9 }}>{t.blurb}</span>
          </button>
        ))}
      </div>
    </ProPanel>

    <div className="pro-stat-row pro-stat-row--3">
      <ProStat label="Segment length" value={formatSeconds(segmentSec)} icon={<Split size={15} />} />
      <ProStat label="Segment count" value={count > 0 ? String(count) : '—'} icon={<Layers size={15} />} tone="alt" />
      <ProStat label="Source length" value={dur > 0 ? formatSeconds(dur) : '—'} icon={<Scissors size={15} />} tone="hot" />
    </div>

    <div className="pro-note">
      Produces numbered segments (<strong>name001, name002, …</strong>) of the chosen length. Each plays
      independently and the engine lists them all under the matching Output tab.
    </div>
    
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Scissors size={15} />
              <span>Segment Boundary Map</span>
            </div>
            <div className="pro-row" style={{ gap: 8 }}>
              <span className="pw-badge pw-badge--flat">{formatSeconds(segmentSec)} PER SEGMENT</span>
              <span className="pw-badge">{count > 0 ? `${count} OUTPUT${count === 1 ? '' : 'S'}` : 'DURATION UNKNOWN'}</span>
            </div>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                {count > 0 ? (
                  Array.from({ length: Math.min(count, 24) }, (_, i) => {
                    const from = (i * segmentSec / dur) * 100;
                    const to = (Math.min(dur, (i + 1) * segmentSec) / dur) * 100;
                    return (
                      <span
                        key={i}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${from}%`,
                          width: `${Math.max(0, to - from)}%`,
                          background: `color-mix(in srgb, var(--tool-accent) ${18 + (i % 3) * 8}%, transparent)`,
                          boxShadow: 'inset -1px 0 0 var(--tool-accent)',
                          pointerEvents: 'none'
                        }}
                        title={`Segment ${String(i + 1).padStart(2, '0')}`}
                      />
                    );
                  })
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>
                      Segment map appears once the source duration is known
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">A1</span>
              <div className="pro-tracklane__body pro-tracklane__body--audio">
                <svg className="pro-wave" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M 0,20 Q 5,8 10,20 Q 15,33 20,20 Q 25,4 30,20 Q 35,37 40,20 Q 45,11 50,20 Q 55,30 60,20 Q 65,6 70,20 Q 75,35 80,20 Q 85,13 90,20 Q 95,27 100,20 Q 105,2 110,20 Q 115,39 120,20 Q 125,10 130,20 Q 135,31 140,20 Q 145,5 150,20 Q 155,36 160,20 Q 165,12 170,20 Q 175,29 180,20 Q 185,3 190,20 Q 195,38 200,20 Q 205,9 210,20 Q 215,32 220,20 Q 225,14 230,20 Q 235,27 240,20 Q 245,1 250,20 Q 255,39 260,20 Q 265,8 270,20 Q 275,33 280,20 Q 285,12 290,20 Q 295,28 300,20 Q 305,4 310,20 Q 315,37 320,20 Q 325,10 330,20 Q 335,31 340,20 Q 345,6 350,20 Q 355,35 360,20 Q 365,13 370,20 Q 375,27 380,20 Q 385,2 390,20 Q 395,38 400,20 Q 405,9 410,20 Q 415,32 420,20 Q 425,15 430,20 Q 435,25 440,20 Q 445,3 450,20 Q 455,39 460,20 Q 465,11 470,20 Q 475,30 480,20 Q 485,7 490,20 Q 495,34 500,20 Q 505,12 510,20 Q 515,28 520,20 Q 525,1 530,20 Q 535,38 540,20 Q 545,9 550,20 Q 555,33 560,20 Q 565,14 570,20 Q 575,26 580,20 Q 585,4 590,20 Q 595,37 600,20 Q 605,10 610,20 Q 615,31 620,20 Q 625,6 630,20 Q 635,35 640,20 Q 645,13 650,20 Q 655,27 660,20 Q 665,2 670,20 Q 675,39 680,20 Q 685,9 690,20 Q 695,32 700,20 Q 705,15 710,20 Q 715,25 720,20 Q 725,5 730,20 Q 735,36 740,20 Q 745,11 750,20 Q 755,29 760,20 Q 765,3 770,20 Q 775,38 780,20 Q 785,8 790,20 Q 795,33 800,20 Q 805,14 810,20 Q 815,26 820,20 Q 825,1 830,20 Q 835,39 840,20 Q 845,10 850,20 Q 855,31 860,20 Q 865,7 870,20 Q 875,35 880,20 Q 885,12 890,20 Q 895,28 900,20 Q 905,4 910,20 Q 915,37 920,20 Q 925,9 930,20 Q 935,33 940,20 Q 945,13 950,20 Q 955,27 960,20 Q 965,2 970,20 Q 975,38 980,20 Q 985,8 990,20 Q 995,32 1000,20 L 1000,40 L 0,40 Z"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>SEGMENT {formatSeconds(segmentSec)}</span>
            <span>·</span>
            <span>{count > 0 ? `${count} FILES` : 'COUNT PENDING'}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> name001, name002, …
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
