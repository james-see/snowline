import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface CanopyVolume {
  minY: number;
  maxY: number;
  radius: number;
  centerX: number;
  centerZ: number;
}

/** Bounds helper from one or more canopy meshes / geos. */
export function canopyVolumeFromGeometries(
  geos: readonly THREE.BufferGeometry[],
  fallback?: CanopyVolume
): CanopyVolume {
  const box = new THREE.Box3();
  let any = false;
  for (const geo of geos) {
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    if (!b || b.isEmpty()) continue;
    if (!any) {
      box.copy(b);
      any = true;
    } else {
      box.union(b);
    }
  }
  if (!any) {
    return (
      fallback ?? {
        minY: 3.5,
        maxY: 8.2,
        radius: 2.6,
        centerX: 0,
        centerZ: 0,
      }
    );
  }
  const hx = (box.max.x - box.min.x) * 0.5;
  const hz = (box.max.z - box.min.z) * 0.5;
  return {
    minY: box.min.y,
    maxY: box.max.y,
    radius: Math.max(0.55, Math.max(hx, hz)),
    centerX: (box.min.x + box.max.x) * 0.5,
    centerZ: (box.min.z + box.max.z) * 0.5,
  };
}

/**
 * Layered soft canopy shells — overlapping tapered cones with vertex noise so
 * silhouettes read as needle mass instead of Minecraft pyramids.
 */
export function buildLayeredCanopyShells(
  volume: CanopyVolume,
  variant: number
): THREE.BufferGeometry {
  const height = Math.max(1.2, volume.maxY - volume.minY);
  const tiers = 6;
  const geos: THREE.BufferGeometry[] = [];
  const seed = variant * 19.7 + 2.3;

  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    // Pine taper — wide lower skirts, tight tip.
    const y = volume.minY + height * (0.08 + t * 0.9);
    const r = volume.radius * (1.08 - t * 0.78) * (0.92 + ((variant + i) % 3) * 0.04);
    const h = height * (0.34 - t * 0.04);
    const seg = i < 2 ? 16 : 14;
    const cone = new THREE.ConeGeometry(r, h, seg, 1, false);
    const yaw = seed * 0.7 + i * 0.55;
    cone.rotateY(yaw);
    cone.translate(
      volume.centerX + Math.sin(yaw) * r * 0.04,
      y,
      volume.centerZ + Math.cos(yaw) * r * 0.04
    );
    displaceCanopyVerts(cone, seed + i * 3.1, 0.085);
    geos.push(cone);
  }

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) {
    return new THREE.ConeGeometry(volume.radius, height, 14);
  }
  ensureUv2(merged);
  return merged;
}

/**
 * Crossed pine-needle foliage cards — one merged geometry per tree for
 * instancing. Alpha-tested materials punch gaps so belts do not read as a wall.
 */
export function buildFoliageCardGeometry(
  volume: CanopyVolume,
  variant: number
): THREE.BufferGeometry {
  const height = Math.max(1.1, volume.maxY - volume.minY);
  const tiers = 8;
  const cardsPerTier = 5;
  const geos: THREE.BufferGeometry[] = [];
  const seed = variant * 13.1 + 0.9;
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  for (let ti = 0; ti < tiers; ti++) {
    const t = ti / (tiers - 1);
    const y = volume.minY + height * (0.06 + t * 0.9);
    const r = volume.radius * (1.15 - t * 0.82);
    const cardH = Math.max(0.55, height * (0.22 - t * 0.04));
    const cardW = Math.max(0.7, r * (1.15 - t * 0.25));
    const phase = seed + ti * 0.37;

    for (let ci = 0; ci < cardsPerTier; ci++) {
      const ang = phase + (ci / cardsPerTier) * Math.PI * 2;
      // Outer ring + slight inward jitter — denser edge needles, open core.
      const dist = r * (0.42 + ((ci + ti) % 3) * 0.08);
      _p.set(
        volume.centerX + Math.cos(ang) * dist,
        y + Math.sin(seed + ci * 1.7) * cardH * 0.06,
        volume.centerZ + Math.sin(ang) * dist
      );
      // Face outward with a little droop — alpine spruce read.
      _e.set(-0.22 - t * 0.12, -ang + Math.PI * 0.5, (ci % 2 === 0 ? 1 : -1) * 0.18);
      _q.setFromEuler(_e);
      _s.set(cardW, cardH, 1);
      _m.compose(_p, _q, _s);

      const plane = new THREE.PlaneGeometry(1, 1, 1, 1);
      plane.applyMatrix4(_m);
      geos.push(plane);

      // Crossed mate — needle volume without a second draw call family.
      _e.z += Math.PI * 0.5;
      _q.setFromEuler(_e);
      _s.set(cardW * 0.92, cardH * 0.95, 1);
      _m.compose(_p, _q, _s);
      const cross = new THREE.PlaneGeometry(1, 1, 1, 1);
      cross.applyMatrix4(_m);
      geos.push(cross);
    }
  }

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) {
    return new THREE.PlaneGeometry(volume.radius * 1.4, height * 0.6);
  }
  ensureUv2(merged);
  merged.computeVertexNormals();
  return merged;
}

/** Procedural needle-card albedo+alpha (RGBA). Shared across all canopy card mats. */
let needleCardTex: THREE.CanvasTexture | null = null;
let needleAlphaTex: THREE.CanvasTexture | null = null;

export function getNeedleCardTextures(): {
  map: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
} {
  if (needleCardTex && needleAlphaTex) {
    return { map: needleCardTex, alphaMap: needleAlphaTex };
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Soft oval canopy blob so cards feather at edges.
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.55,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(36, 78, 42, 0.95)');
  grad.addColorStop(0.55, 'rgba(22, 58, 32, 0.85)');
  grad.addColorStop(1, 'rgba(10, 28, 16, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Needle strokes — dense alpine spruce (seeded for critic determinism).
  let rng = 7919;
  const rnd = (): number => {
    rng = (rng * 16807) % 2147483647;
    return (rng & 0xffff) / 0xffff;
  };
  for (let i = 0; i < 220; i++) {
    const cx = size * (0.15 + rnd() * 0.7);
    const cy = size * (0.12 + rnd() * 0.76);
    const len = size * (0.04 + rnd() * 0.1);
    const ang = -Math.PI * 0.5 + (rnd() - 0.5) * 0.9;
    const shade = 28 + Math.floor(rnd() * 50);
    const g = 55 + Math.floor(rnd() * 55);
    ctx.strokeStyle = `rgba(${shade - 8}, ${g}, ${shade}, ${0.45 + rnd() * 0.45})`;
    ctx.lineWidth = 0.7 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Twig accents
  ctx.strokeStyle = 'rgba(62, 42, 24, 0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 14; i++) {
    const x0 = size * (0.25 + rnd() * 0.5);
    const y0 = size * (0.2 + rnd() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      x0 + (rnd() - 0.5) * 18,
      y0 + 10 + rnd() * 16,
      x0 + (rnd() - 0.5) * 12,
      y0 + 22 + rnd() * 18
    );
    ctx.stroke();
  }

  needleCardTex = new THREE.CanvasTexture(canvas);
  needleCardTex.wrapS = needleCardTex.wrapT = THREE.ClampToEdgeWrapping;
  needleCardTex.colorSpace = THREE.SRGBColorSpace;
  needleCardTex.needsUpdate = true;

  // Alpha from luminance of the colour canvas.
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = size;
  alphaCanvas.height = size;
  const actx = alphaCanvas.getContext('2d')!;
  actx.drawImage(canvas, 0, 0);
  const img = actx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = d[i + 1] = d[i + 2] = a;
    d[i + 3] = 255;
  }
  actx.putImageData(img, 0, 0);
  needleAlphaTex = new THREE.CanvasTexture(alphaCanvas);
  needleAlphaTex.wrapS = needleAlphaTex.wrapT = THREE.ClampToEdgeWrapping;
  needleAlphaTex.needsUpdate = true;

  return { map: needleCardTex, alphaMap: needleAlphaTex };
}

export function disposeNeedleCardTextures(): void {
  needleCardTex?.dispose();
  needleAlphaTex?.dispose();
  needleCardTex = null;
  needleAlphaTex = null;
}

function displaceCanopyVerts(geo: THREE.BufferGeometry, seed: number, amount: number): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 2.2 + seed) * amount +
      Math.cos(z * 1.9 - seed * 1.1) * amount * 0.85 +
      Math.sin((x + y) * 1.4 + seed * 0.5) * amount * 0.55;
    const lift = Math.max(0, y) * amount * 0.15;
    pos.setXYZ(i, x * (1 + n * 0.45), y + n * 0.3 + lift, z * (1 + n * 0.45));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  ensureUv2(geo);
}

function ensureUv2(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute('uv2')) return;
  const uv = geo.getAttribute('uv');
  if (uv) geo.setAttribute('uv2', uv.clone());
}
