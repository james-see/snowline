/** Boot-phase progress windows — assets own the long wait. */
export const BOOT_PHASES = {
  physics: [0.02, 0.08],
  pipeline: [0.08, 0.12],
  assets: [0.12, 0.82],
  modules: [0.82, 0.94],
  shaders: [0.94, 1],
} as const;

export type BootPhase = keyof typeof BOOT_PHASES;

let displayed = 0;

export function resetBootProgress(): void {
  displayed = 0;
}

export function setStatus(text: string): void {
  const el = document.getElementById('loader-status');
  if (el) el.textContent = text;
}

/** Monotonic determinate fill — never jumps backwards. */
export function setProgress(fraction: number): void {
  const next = Math.min(1, Math.max(displayed, fraction));
  displayed = next;
  const pct = Math.round(next * 100);
  const fill = document.getElementById('bar-fill');
  if (fill) fill.style.width = `${pct}%`;
  const label = document.getElementById('loader-pct');
  if (label) label.textContent = `${pct}%`;
  const track = document.getElementById('bar-track');
  track?.setAttribute('aria-valuenow', String(pct));
}

export function mapPhase(phase: BootPhase, t: number): number {
  const [a, b] = BOOT_PHASES[phase];
  const u = Math.min(1, Math.max(0, t));
  return a + (b - a) * u;
}

export function setPhaseProgress(phase: BootPhase, t: number): void {
  setProgress(mapPhase(phase, t));
}

export function hideLoader(immediate = false): void {
  const loader = document.getElementById('loader');
  if (!loader) return;
  if (immediate) {
    loader.remove();
    return;
  }
  loader.classList.add('hidden');
  window.setTimeout(() => loader.remove(), 550);
}
