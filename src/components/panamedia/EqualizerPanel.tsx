import React, { type RefObject } from 'react';
import { EQ_BANDS, EQ_PRESETS } from './types';

interface EqualizerPanelProps {
  eqEnabled: boolean;
  eqBands: number[];
  eqPreset: string;
  eqFiltersRef: RefObject<BiquadFilterNode[]>;
  setEqEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setEqBands: React.Dispatch<React.SetStateAction<number[]>>;
  setEqPreset: React.Dispatch<React.SetStateAction<string>>;
}

export function EqualizerPanel({
  eqEnabled,
  eqBands,
  eqPreset,
  eqFiltersRef,
  setEqEnabled,
  setEqBands,
  setEqPreset,
}: EqualizerPanelProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>5-Band Equalizer</span>
        <button
          onClick={() => {
            const next = !eqEnabled;
            setEqEnabled(next);
            localStorage.setItem('player_eqEnabled', String(next));
            eqFiltersRef.current.forEach((f, i) => {
              f.gain.value = next ? eqBands[i] : 0;
            });
          }}
          style={{
            padding: '3px 10px', fontSize: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: eqEnabled ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
            color: eqEnabled ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 'bold'
          }}
        >
          {eqEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>Preset</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {Object.keys(EQ_PRESETS).map(preset => (
            <button
              key={preset}
              onClick={() => {
                const gains = EQ_PRESETS[preset];
                setEqBands(gains);
                setEqPreset(preset);
                localStorage.setItem('player_eqBands', JSON.stringify(gains));
                if (eqEnabled) {
                  eqFiltersRef.current.forEach((f, i) => { f.gain.value = gains[i]; });
                }
              }}
              style={{
                padding: '3px 8px', fontSize: '9px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                background: eqPreset === preset ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                color: eqPreset === preset ? '#fff' : 'var(--text-muted)',
                fontWeight: eqPreset === preset ? 'bold' : 'normal'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '140px' }}>
        {EQ_BANDS.map((band, i) => (
          <div key={band.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
            <span style={{ fontSize: '9px', color: eqBands[i] > 0 ? 'var(--primary)' : eqBands[i] < 0 ? '#f472b6' : 'var(--text-muted)', fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>
              {eqBands[i] > 0 ? '+' : ''}{eqBands[i]}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={eqBands[i]}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                const next = eqBands.map((b, idx) => idx === i ? val : b);
                setEqBands(next);
                setEqPreset('Custom');
                localStorage.setItem('player_eqBands', JSON.stringify(next));
                if (eqEnabled && eqFiltersRef.current[i]) {
                  eqFiltersRef.current[i].gain.value = val;
                }
              }}
              style={{
                writingMode: 'vertical-lr' as any,
                direction: 'rtl' as any,
                flex: 1,
                width: '28px',
                accentColor: eqBands[i] >= 0 ? 'var(--primary)' : '#f472b6',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.1' }}>
              {band.label}
            </span>
            <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.2)' }}>
              {band.freq >= 1000 ? `${band.freq / 1000}k` : `${band.freq}`}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          const flat = [0, 0, 0, 0, 0];
          setEqBands(flat);
          setEqPreset('Flat');
          localStorage.setItem('player_eqBands', JSON.stringify(flat));
          if (eqEnabled) {
            eqFiltersRef.current.forEach(f => { f.gain.value = 0; });
          }
        }}
        style={{
          width: '100%', padding: '6px', fontSize: '10px', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', cursor: 'pointer'
        }}
      >
        Reset to Flat
      </button>
    </div>
  );
}
