import type * as THREE from 'three';

export class PerfHud {
  #el: HTMLDivElement | null = null;
  #frames: number[] = [];
  #t0 = 0;
  #renderer: THREE.WebGLRenderer;
  mean = 16.6;
  low1 = 16.6;
  max = 16.6;

  constructor(renderer: THREE.WebGLRenderer) {
    this.#renderer = renderer;
  }

  beginFrame(): void {
    this.#t0 = performance.now();
  }

  endFrame(show: boolean): void {
    const dt = performance.now() - this.#t0;
    this.#frames.push(dt);
    if (this.#frames.length > 120) this.#frames.shift();
    const sorted = [...this.#frames].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    this.mean = sum / sorted.length;
    this.max = sorted[sorted.length - 1]!;
    this.low1 = sorted[Math.max(0, Math.floor(sorted.length * 0.99))]!;

    if (!show) {
      this.#el?.remove();
      this.#el = null;
      return;
    }
    if (!this.#el) {
      this.#el = document.createElement('div');
      this.#el.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:9999;font:11px/1.4 ui-monospace,Menlo,monospace;color:#dff;background:rgba(0,0,0,.55);padding:6px 8px;pointer-events:none';
      document.body.appendChild(this.#el);
    }
    const info = this.#renderer.info;
    this.#el.textContent = `${(1000 / this.mean).toFixed(0)} fps  ${this.mean.toFixed(1)}ms\ntri ${info.render.triangles}  calls ${info.render.calls}`;
  }

  sample(): { mean: number; low1: number; max: number; calls: number; triangles: number } {
    return {
      mean: this.mean,
      low1: this.low1,
      max: this.max,
      calls: this.#renderer.info.render.calls,
      triangles: this.#renderer.info.render.triangles,
    };
  }

  dispose(): void {
    this.#el?.remove();
    this.#el = null;
  }
}
