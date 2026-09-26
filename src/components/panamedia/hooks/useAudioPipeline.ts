import { useRef, useEffect } from 'react';
import { EQ_BANDS } from '../types';

interface UseAudioPipelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  volume: number;
  setVolume: (vol: number) => void;
  eqEnabled: boolean;
  eqBands: number[];
}

export function useAudioPipeline({
  videoRef,
  volume,
  setVolume,
  eqEnabled,
  eqBands,
}: UseAudioPipelineProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);

  const initAudio = () => {
    const video = videoRef.current;
    if (!video || audioContextRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      (window as any).__panaAudioContext = ctx; // Expose globally to allow resume behavior on play triggers
      const source = ctx.createMediaElementSource(video);

      const filters = EQ_BANDS.map((band, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = 1;
        filter.gain.value = eqEnabled ? eqBands[i] : 0;
        return filter;
      });

      // Chain source -> filters -> analyser -> gain -> destination
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume / 100;

      // Soft limiter / dynamics compressor to allow clean volume boost up to 300%
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-4, ctx.currentTime);
      compressor.knee.setValueAtTime(8, ctx.currentTime);
      compressor.ratio.setValueAtTime(16, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.20, ctx.currentTime);

      filters[filters.length - 1].connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(ctx.destination);

      audioContextRef.current = ctx;
      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
      eqFiltersRef.current = filters;
    } catch (e) {
      console.error('AudioContext setup failed:', e);
    }
  };

  useEffect(() => {
    if (eqFiltersRef.current.length === EQ_BANDS.length) {
      eqFiltersRef.current.forEach((filter, i) => {
        filter.gain.value = eqEnabled ? eqBands[i] : 0;
      });
    }
  }, [eqBands, eqEnabled]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const adjustVolume = (newVol: number) => {
    initAudio();
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVol / 100;
    }
    if (videoRef.current) {
      // Keep standard HTML5 volume capped at 1.0 (but gain node can go higher for boost!)
      videoRef.current.volume = newVol > 100 ? 1 : newVol / 100;
    }
    setVolume(newVol);
  };

  return {
    audioContextRef,
    analyserRef,
    eqFiltersRef,
    gainNodeRef,
    initAudio,
    adjustVolume,
  };
}