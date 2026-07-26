/**
 * Lightweight Web Audio synth bank — original procedural sounds only.
 * Wind scales with speed; board scrape voices change by surface kind.
 */

import { surfaceAudio } from './surfaces.ts';

type WindVoice = {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

type BoardVoice = {
  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  tone: OscillatorNode;
  toneFilter: BiquadFilterNode;
  mix: GainNode;
  noiseGain: GainNode;
  toneGain: GainNode;
  lowpass: BiquadFilterNode;
};

const REF_SPEED = 25;

export class AudioEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #sfx: GainNode | null = null;
  #music: GainNode | null = null;
  #wind: WindVoice | null = null;
  #board: BoardVoice | null = null;
  #started = false;
  #noiseCache: AudioBuffer | null = null;

  async resume(): Promise<void> {
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#sfx = this.#ctx.createGain();
      this.#music = this.#ctx.createGain();
      this.#sfx.connect(this.#master);
      this.#music.connect(this.#master);
      this.#master.connect(this.#ctx.destination);
      this.#master.gain.value = 0.85;
      this.#sfx.gain.value = 1;
      this.#music.gain.value = 0.4;
    }
    if (this.#ctx.state !== 'running') await this.#ctx.resume();
    if (!this.#started) {
      this.#startWind();
      this.#startBoard();
      this.#startMusicBed();
      this.#started = true;
    }
  }

  setVolumes(master: number, sfx: number, music: number): void {
    if (this.#master) this.#master.gain.value = master;
    if (this.#sfx) this.#sfx.gain.value = sfx;
    if (this.#music) this.#music.gain.value = music;
  }

  setWind(speed: number, airborne: boolean, surface = 'packed'): void {
    if (!this.#wind || !this.#ctx) return;
    const t = this.#ctx.currentTime;
    const profile = surfaceAudio(surface);
    const speedNorm = Math.min(1.4, speed / REF_SPEED);
    const air = airborne ? 1.35 : 1;
    const bias = airborne ? 0 : profile.windBias;
    const target = (0.018 + speedNorm * 0.32 + bias) * air;
    this.#wind.gain.gain.setTargetAtTime(Math.max(0.01, target), t, 0.09);
    const cutoff = 320 + speed * (airborne ? 28 : 16) + (airborne ? 180 : 0);
    this.#wind.filter.frequency.setTargetAtTime(cutoff, t, 0.12);
    this.#wind.filter.Q.setTargetAtTime(airborne ? 0.55 : 0.85, t, 0.15);
  }

  setBoard(surface: string, speed: number, grounded: boolean, grind = false): void {
    if (!this.#board || !this.#ctx) return;
    const t = this.#ctx.currentTime;
    const profile = surfaceAudio(grind ? 'rail' : surface);

    if (!grounded || speed < 1.5) {
      this.#board.mix.gain.setTargetAtTime(0, t, 0.06);
      return;
    }

    const speedNorm = Math.min(1.5, speed / REF_SPEED);
    const grindBoost = grind ? 1.45 : 1;
    const mix = Math.min(0.55, speedNorm * 0.42 * grindBoost);
    this.#board.mix.gain.setTargetAtTime(mix, t, 0.05);

    this.#board.noiseFilter.frequency.setTargetAtTime(profile.noiseFreq + speed * 6, t, 0.08);
    this.#board.noiseFilter.Q.setTargetAtTime(profile.noiseQ, t, 0.1);
    this.#board.noiseGain.gain.setTargetAtTime(profile.noiseGain * grindBoost, t, 0.08);

    if (profile.toneFreq > 0) {
      const toneHz = profile.toneFreq + speed * (grind ? 4.5 : 2.1);
      this.#board.tone.frequency.setTargetAtTime(toneHz, t, 0.05);
      this.#board.tone.type = profile.toneType;
      this.#board.toneGain.gain.setTargetAtTime(profile.toneGain * grindBoost, t, 0.06);
      this.#board.toneFilter.frequency.setTargetAtTime(toneHz * 2.4, t, 0.08);
    } else {
      this.#board.toneGain.gain.setTargetAtTime(0, t, 0.05);
    }

    this.#board.lowpass.frequency.setTargetAtTime(profile.lowpass + speed * 12, t, 0.1);
  }

  oneshot(id: string, volume = 1): void {
    if (!this.#ctx || !this.#sfx) return;
    const t = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const g = this.#ctx.createGain();
    osc.connect(g);
    g.connect(this.#sfx);

    switch (id) {
      case 'land_perfect':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(560, t);
        osc.frequency.exponentialRampToValueAtTime(240, t + 0.16);
        g.gain.setValueAtTime(0.18 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
        this.#thump(180, 0.12 * volume, 0.1);
        break;
      case 'land_good':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.14);
        g.gain.setValueAtTime(0.15 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.2);
        this.#thump(140, 0.1 * volume, 0.09);
        break;
      case 'land_sketchy':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.22);
        g.gain.setValueAtTime(0.16 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.3);
        this.#noiseBurst(0.18, 0.14 * volume, 900);
        break;
      case 'land_bail':
      case 'crash':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.28);
        g.gain.setValueAtTime(0.28 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.42);
        this.#noiseBurst(0.32, 0.28 * volume, 600);
        this.#thump(55, 0.22 * volume, 0.2);
        break;
      case 'boost':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(720, t + 0.3);
        g.gain.setValueAtTime(0.14 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.start(t);
        osc.stop(t + 0.34);
        this.#noiseBurst(0.12, 0.08 * volume, 1800);
        break;
      case 'ui':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        g.gain.setValueAtTime(0.07 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.1);
        break;
      case 'checkpoint': {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.setValueAtTime(660, t + 0.07);
        osc.frequency.setValueAtTime(880, t + 0.14);
        g.gain.setValueAtTime(0.11 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.3);
        break;
      }
      case 'grind_start':
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(280, t + 0.1);
        g.gain.setValueAtTime(0.08 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.14);
        this.#noiseBurst(0.08, 0.1 * volume, 2400);
        break;
      case 'jump':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(360, t + 0.1);
        g.gain.setValueAtTime(0.06 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.14);
        break;
      default:
        osc.type = 'sine';
        osc.frequency.value = 300;
        g.gain.setValueAtTime(0.05 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.14);
    }
  }

  #thump(freq: number, volume: number, duration: number): void {
    if (!this.#ctx || !this.#sfx) return;
    const t = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const g = this.#ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(this.#sfx);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  #noiseBurst(duration: number, volume: number, cutoff = 1200): void {
    if (!this.#ctx || !this.#sfx) return;
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(duration);
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    const g = this.#ctx.createGain();
    g.gain.value = volume;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.#sfx);
    src.start();
  }

  #noiseBuffer(seconds: number): AudioBuffer {
    if (!this.#ctx) throw new Error('AudioContext missing');
    // Shared loop buffer for continuous voices; short bursts get a unique envelope.
    if (seconds >= 1.5) {
      if (!this.#noiseCache) {
        const len = Math.floor(this.#ctx.sampleRate * 2);
        const buffer = this.#ctx.createBuffer(1, len, this.#ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          // Mild pink-ish roll-off for less harsh wind/scrape.
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        }
        this.#noiseCache = buffer;
      }
      return this.#noiseCache;
    }
    const len = Math.floor(this.#ctx.sampleRate * seconds);
    const buffer = this.#ctx.createBuffer(1, len, this.#ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return buffer;
  }

  #startWind(): void {
    if (!this.#ctx || !this.#sfx) return;
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(2);
    src.loop = true;
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    const gain = this.#ctx.createGain();
    gain.gain.value = 0.04;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.#sfx);
    src.start();
    this.#wind = { src, filter, gain };
  }

  #startBoard(): void {
    if (!this.#ctx || !this.#sfx) return;
    const noise = this.#ctx.createBufferSource();
    noise.buffer = this.#noiseBuffer(2);
    noise.loop = true;
    const noiseFilter = this.#ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 0.85;
    const noiseGain = this.#ctx.createGain();
    noiseGain.gain.value = 0.14;

    const tone = this.#ctx.createOscillator();
    tone.type = 'sawtooth';
    tone.frequency.value = 95;
    const toneFilter = this.#ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 400;
    const toneGain = this.#ctx.createGain();
    toneGain.gain.value = 0.03;

    const lowpass = this.#ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    const mix = this.#ctx.createGain();
    mix.gain.value = 0;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(lowpass);
    tone.connect(toneFilter);
    toneFilter.connect(toneGain);
    toneGain.connect(lowpass);
    lowpass.connect(mix);
    mix.connect(this.#sfx);

    noise.start();
    tone.start();
    this.#board = { noise, noiseFilter, tone, toneFilter, mix, noiseGain, toneGain, lowpass };
  }

  #startMusicBed(): void {
    if (!this.#ctx || !this.#music) return;
    // Sparse original drone — not a licensed track.
    const notes = [196, 247, 294, 330];
    notes.forEach((freq, i) => {
      const osc = this.#ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.#ctx!.createGain();
      g.gain.value = 0.025;
      const lfo = this.#ctx!.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.018;
      const lfoGain = this.#ctx!.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      const filter = this.#ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.#music!);
      osc.start();
      lfo.start();
    });
  }

  dispose(): void {
    void this.#ctx?.close();
    this.#ctx = null;
    this.#wind = null;
    this.#board = null;
    this.#started = false;
    this.#noiseCache = null;
  }
}
