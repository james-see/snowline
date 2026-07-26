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
  // Dense core + soft falloff so edge spray reads in stills against pale snow.
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.48, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.needsUpdate = true;
  return cached;
}
