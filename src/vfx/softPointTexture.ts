import * as THREE from 'three';

let cached: THREE.Texture | null = null;

/** Soft circular falloff for depth-friendly point sprites. */
export function getSoftPointTexture(): THREE.Texture {
  if (cached) return cached;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Wider soft core so overlapping flakes fuse into plumes (not sparse dots).
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.52)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}
