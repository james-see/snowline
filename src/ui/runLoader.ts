/** Mode → run loading overlay helpers (DOM painted by UiModule). */

let displayed = 0;

export function resetRunProgress(): void {
  displayed = 0;
  setRunProgress(0);
}

/** Monotonic determinate fill — never jumps backwards. */
export function setRunProgress(fraction: number, status?: string): void {
  const next = Math.min(1, Math.max(displayed, fraction));
  displayed = next;
  const pct = Math.round(next * 100);
  const fill = document.getElementById('run-bar-fill');
  if (fill) fill.style.width = `${pct}%`;
  const label = document.getElementById('run-loader-pct');
  if (label) label.textContent = `${pct}%`;
  const track = document.getElementById('run-bar-track');
  track?.setAttribute('aria-valuenow', String(pct));
  if (status !== undefined) {
    const el = document.getElementById('run-loader-status');
    if (el) el.textContent = status;
  }
}

export function yieldPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
