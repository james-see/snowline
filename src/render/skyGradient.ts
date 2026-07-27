import * as THREE from 'three';

/**
 * Vertical sky ramp for scene.background — zenith → warm horizon haze.
 * Avoids flat solid sky fill (critic B11 / flat_ambient mood).
 */
export function makeSkyGradientTexture(
  zenith: THREE.ColorRepresentation,
  horizon: THREE.ColorRepresentation,
  size = 256
): THREE.DataTexture {
  const z = new THREE.Color(zenith);
  const h = new THREE.Color(horizon);
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    // v=0 bottom (horizon), v=1 top (zenith) — Three backgrounds sample with flipY.
    const t = i / (size - 1);
    const e = t * t; // bias toward horizon band
    const r = z.r * e + h.r * (1 - e);
    const g = z.g * e + h.g * (1 - e);
    const b = z.b * e + h.b * (1 - e);
    const o = i * 4;
    data[o] = Math.round(r * 255);
    data[o + 1] = Math.round(g * 255);
    data[o + 2] = Math.round(b * 255);
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 1, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
