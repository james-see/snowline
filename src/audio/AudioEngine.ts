/** Lightweight Web Audio synth bank — original procedural sounds only. */

export class AudioEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #sfx: GainNode | null = null;
  #music: GainNode | null = null;
  #wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  #board: OscillatorNode | null = null;
  #boardGain: GainNode | null = null;
  #started = false;

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

  setWind(speed: number, airborne: boolean): void {
    if (!this.#wind) return;
    const t = this.#ctx!.currentTime;
    const target = 0.02 + Math.min(0.35, speed * 0.006) * (airborne ? 1.25 : 1);
    this.#wind.gain.gain.setTargetAtTime(target, t, 0.08);
    this.#wind.filter.frequency.setTargetAtTime(400 + speed * 18, t, 0.1);
  }

  setBoard(surface: string, speed: number, grounded: boolean): void {
    if (!this.#board || !this.#boardGain || !this.#ctx) return;
    const t = this.#ctx.currentTime;
    if (!grounded || speed < 2) {
      this.#boardGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const base =
      surface === 'ice' ? 180 : surface === 'powder' ? 70 : surface === 'rail' ? 320 : 110;
    this.#board.frequency.setTargetAtTime(base + speed * 2.2, t, 0.05);
    this.#boardGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.003), t, 0.05);
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
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
        g.gain.setValueAtTime(0.2 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
        break;
      case 'land_bail':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, t);
        g.gain.setValueAtTime(0.25 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.36);
        this.#noiseBurst(0.2, 0.3);
        break;
      case 'boost':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(640, t + 0.28);
        g.gain.setValueAtTime(0.15 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.32);
        break;
      case 'ui':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        g.gain.setValueAtTime(0.08 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.1);
        break;
      case 'checkpoint':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.setValueAtTime(660, t + 0.08);
        g.gain.setValueAtTime(0.12 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
        break;
      default:
        osc.type = 'sine';
        osc.frequency.value = 300;
        g.gain.setValueAtTime(0.06 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.14);
    }
  }

  #noiseBurst(duration: number, volume: number): void {
    if (!this.#ctx || !this.#sfx) return;
    const bufferSize = this.#ctx.sampleRate * duration;
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.#ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.#ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.#sfx);
    src.start();
  }

  #startWind(): void {
    if (!this.#ctx || !this.#sfx) return;
    const bufferSize = this.#ctx.sampleRate * 2;
    const buffer = this.#ctx.createBuffer(1, bufferSize, this.#ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.#ctx.createBufferSource();
    src.buffer = buffer;
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
    const osc = this.#ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const gain = this.#ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.#sfx);
    osc.start();
    this.#board = osc;
    this.#boardGain = gain;
  }

  #startMusicBed(): void {
    if (!this.#ctx || !this.#music) return;
    const notes = [196, 247, 294, 330];
    notes.forEach((freq, i) => {
      const osc = this.#ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.#ctx!.createGain();
      g.gain.value = 0.03;
      const lfo = this.#ctx!.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.02;
      const lfoGain = this.#ctx!.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(this.#music!);
      osc.start();
      lfo.start();
    });
  }

  dispose(): void {
    void this.#ctx?.close();
    this.#ctx = null;
  }
}
