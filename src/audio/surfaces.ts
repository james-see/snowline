import type { SurfaceKind } from '@/types/gameplay.ts';

/** Procedural scrape voice tunables keyed by surface. */
export interface SurfaceAudioProfile {
  /** Noise bandpass centre, Hz. */
  noiseFreq: number;
  /** Noise bandpass Q. */
  noiseQ: number;
  /** Noise gain at reference speed (~25 m/s). */
  noiseGain: number;
  /** Tonal scrape base frequency, Hz (0 = silent tone). */
  toneFreq: number;
  /** Tone gain at reference speed. */
  toneGain: number;
  /** Oscillator waveform for the tonal layer. */
  toneType: OscillatorType;
  /** Lowpass on the combined scrape, Hz. */
  lowpass: number;
  /** Extra wind mix while grounded on this surface. */
  windBias: number;
}

export const SURFACE_AUDIO: Record<SurfaceKind, SurfaceAudioProfile> = {
  powder: {
    noiseFreq: 220,
    noiseQ: 0.55,
    noiseGain: 0.11,
    toneFreq: 55,
    toneGain: 0.02,
    toneType: 'triangle',
    lowpass: 480,
    windBias: 0.08,
  },
  packed: {
    noiseFreq: 420,
    noiseQ: 0.85,
    noiseGain: 0.14,
    toneFreq: 95,
    toneGain: 0.035,
    toneType: 'sawtooth',
    lowpass: 900,
    windBias: 0,
  },
  ice: {
    noiseFreq: 1400,
    noiseQ: 1.4,
    noiseGain: 0.1,
    toneFreq: 210,
    toneGain: 0.045,
    toneType: 'triangle',
    lowpass: 2800,
    windBias: 0.12,
  },
  rail: {
    noiseFreq: 2200,
    noiseQ: 2.2,
    noiseGain: 0.09,
    toneFreq: 380,
    toneGain: 0.07,
    toneType: 'square',
    lowpass: 4200,
    windBias: -0.04,
  },
  wood: {
    noiseFreq: 680,
    noiseQ: 1.1,
    noiseGain: 0.12,
    toneFreq: 140,
    toneGain: 0.05,
    toneType: 'triangle',
    lowpass: 1600,
    windBias: -0.02,
  },
  rock: {
    noiseFreq: 900,
    noiseQ: 0.7,
    noiseGain: 0.16,
    toneFreq: 70,
    toneGain: 0.04,
    toneType: 'sawtooth',
    lowpass: 2200,
    windBias: 0.05,
  },
};

export function surfaceAudio(kind: string): SurfaceAudioProfile {
  return SURFACE_AUDIO[kind as SurfaceKind] ?? SURFACE_AUDIO.packed;
}
