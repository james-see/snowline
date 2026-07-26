import * as THREE from 'three';
import type { CheckpointDef } from '@/types/course.ts';

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _out = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _scratch = new THREE.Vector3();

/**
 * Centripetal Catmull-Rom spline through world-space control points.
 * Parameter t ∈ [0, 1] spans the full run length.
 */
export class SplinePath {
  readonly points: readonly THREE.Vector3[];
  readonly segmentLengths: readonly number[];
  readonly totalLength: number;

  constructor(controlPoints: ReadonlyArray<[number, number, number]>) {
    if (controlPoints.length < 2) {
      throw new Error('SplinePath requires at least two control points');
    }
    this.points = controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));

    const segLens: number[] = [];
    let total = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const len = this.points[i].distanceTo(this.points[i + 1]);
      segLens.push(len);
      total += len;
    }
    this.segmentLengths = segLens;
    this.totalLength = total;
  }

  /** Position at normalised t along the full path. */
  sample(t: number, out = _out): THREE.Vector3 {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const { segment, localT } = this.#mapT(clamped);
    return this.#catmullPoint(segment, localT, out);
  }

  /** Unit tangent at t, pointing downhill along the path. */
  tangent(t: number, out = _tan): THREE.Vector3 {
    const eps = 1 / 512;
    const t0 = Math.max(0, t - eps);
    const t1 = Math.min(1, t + eps);
    this.sample(t0, _scratch);
    this.sample(t1, out);
    out.sub(_scratch);
    if (out.lengthSq() < 1e-8) {
      const { segment } = this.#mapT(t);
      const a = this.points[Math.max(0, segment)];
      const b = this.points[Math.min(this.points.length - 1, segment + 1)];
      return out.copy(b).sub(a).normalize();
    }
    return out.normalize();
  }

  /** Right vector (cross up × tangent) at t. */
  right(t: number, out = _right): THREE.Vector3 {
    return out.copy(_up).cross(this.tangent(t, _tan)).normalize();
  }

  /** Closest point on the polyline approximation of the spline. */
  closestPoint(
    position: THREE.Vector3,
    samples = 128
  ): { t: number; point: THREE.Vector3; distance: number; lateral: number } {
    let bestT = 0;
    let bestDist = Infinity;
    let bestPoint = this.sample(0, new THREE.Vector3());

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = this.sample(t, _scratch);
      const d = p.distanceToSquared(position);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
        bestPoint.copy(p);
      }
    }

    let span = 1 / samples;
    for (let pass = 0; pass < 4; pass++) {
      span *= 0.5;
      for (const offset of [-span, span]) {
        const t = THREE.MathUtils.clamp(bestT + offset, 0, 1);
        const p = this.sample(t, _scratch);
        const d = p.distanceToSquared(position);
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
          bestPoint.copy(p);
        }
      }
    }

    const delta = _scratch.copy(position).sub(bestPoint);
    const r = this.right(bestT, _right);
    const lateral = delta.dot(r);
    return { t: bestT, point: bestPoint.clone(), distance: Math.sqrt(bestDist), lateral };
  }

  /** World pose for a checkpoint gate. */
  checkpointPose(checkpoint: CheckpointDef): {
    position: THREE.Vector3;
    rotationY: number;
    width: number;
  } {
    const center = this.sample(checkpoint.t, new THREE.Vector3());
    const right = this.right(checkpoint.t, new THREE.Vector3());
    const lateral = checkpoint.lateral ?? 0;
    center.addScaledVector(right, lateral);
    const tan = this.tangent(checkpoint.t, new THREE.Vector3());
    const rotationY = Math.atan2(tan.x, tan.z);
    return { position: center, rotationY, width: checkpoint.width ?? 14 };
  }

  /** Arc length in metres at normalised t. */
  distanceAt(t: number): number {
    return this.totalLength * THREE.MathUtils.clamp(t, 0, 1);
  }

  #mapT(t: number): { segment: number; localT: number } {
    const target = t * this.totalLength;
    let acc = 0;
    for (let i = 0; i < this.segmentLengths.length; i++) {
      const seg = this.segmentLengths[i];
      if (acc + seg >= target || i === this.segmentLengths.length - 1) {
        const localT = seg > 0 ? (target - acc) / seg : 0;
        return { segment: i, localT: THREE.MathUtils.clamp(localT, 0, 1) };
      }
      acc += seg;
    }
    return { segment: this.segmentLengths.length - 1, localT: 1 };
  }

  #catmullPoint(segment: number, localT: number, out: THREE.Vector3): THREE.Vector3 {
    const pts = this.points;
    const i = segment;
    _p0.copy(pts[Math.max(0, i - 1)]);
    _p1.copy(pts[i]);
    _p2.copy(pts[Math.min(pts.length - 1, i + 1)]);
    _p3.copy(pts[Math.min(pts.length - 1, i + 2)]);

    const t = localT;
    const t2 = t * t;
    const t3 = t2 * t;

    out.set(
      0.5 *
        (2 * _p1.x +
          (-_p0.x + _p2.x) * t +
          (2 * _p0.x - 5 * _p1.x + 4 * _p2.x - _p3.x) * t2 +
          (-_p0.x + 3 * _p1.x - 3 * _p2.x + _p3.x) * t3),
      0.5 *
        (2 * _p1.y +
          (-_p0.y + _p2.y) * t +
          (2 * _p0.y - 5 * _p1.y + 4 * _p2.y - _p3.y) * t2 +
          (-_p0.y + 3 * _p1.y - 3 * _p2.y + _p3.y) * t3),
      0.5 *
        (2 * _p1.z +
          (-_p0.z + _p2.z) * t +
          (2 * _p0.z - 5 * _p1.z + 4 * _p2.z - _p3.z) * t2 +
          (-_p0.z + 3 * _p1.z - 3 * _p2.z + _p3.z) * t3)
    );
    return out;
  }
}
