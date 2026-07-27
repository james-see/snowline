import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { LOD_BUFFER_CAPS, resolveLodBudgets } from '@/engine/Lod.ts';
import { ParticlePool } from './ParticlePool.ts';
import { BoardTrail } from './BoardTrail.ts';
import { SpeedLines } from './SpeedLines.ts';

/** Hardware buffer ceilings; live counts clamped by Lod + settings.maxParticles. */
const CAP_SNOW = LOD_BUFFER_CAPS.snow;
const CAP_SPRAY = LOD_BUFFER_CAPS.spray;
const CAP_BURST = 900;
const CAP_BOOST = 700;
const CAP_SPEED = 80;

const BOOST_COLOR = 0x7ec8ff;
const SPRAY_COLOR = 0xf2f7fc;
const BURST_COLOR = 0xe8f2fc;

interface ParticleBudgets {
  snow: number;
  spray: number;
  burst: number;
  boost: number;
  speed: number;
}

function allocateBudgets(
  settings: EngineContext['settings'],
  reducedMotion: boolean
): ParticleBudgets {
  const lod = resolveLodBudgets(settings);
  const scale = reducedMotion ? 0.35 : 1;
  return {
    snow: Math.max(64, Math.floor(lod.maxSnowParticles * scale)),
    spray: Math.max(32, Math.floor(lod.maxSprayParticles * scale)),
    burst: Math.min(CAP_BURST, Math.floor(settings.maxParticles * 0.1 * scale)),
    boost: Math.min(CAP_BOOST, Math.floor(settings.maxParticles * 0.08 * scale)),
    speed: Math.min(CAP_SPEED, Math.floor(settings.maxParticles * 0.04 * scale)),
  };
}

export class VfxModule implements GameModule {
  readonly name = 'vfx';
  readonly order = 35;

  readonly #root = new THREE.Group();
  readonly #snow: ParticlePool;
  readonly #spray: ParticlePool;
  readonly #burst: ParticlePool;
  readonly #boostParts: ParticlePool;
  readonly #trail: BoardTrail;
  readonly #speedLines: SpeedLines;
  readonly #boostLight: THREE.PointLight;
  readonly #boostHalo: THREE.PointLight;

  #boosting = false;
  #boostTarget = 0;
  #trailAcc = 0;
  #speedAcc = 0;
  #snowSeeded = false;
  #tmp = new THREE.Vector3();
  #tmp2 = new THREE.Vector3();
  #tmp3 = new THREE.Vector3();
  #lateral = new THREE.Vector3();
  #forward = new THREE.Vector3();
  #up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.#snow = new ParticlePool({
      capacity: CAP_SNOW,
      color: 0xffffff,
      size: 0.14,
      opacity: 0.55,
    });
    this.#spray = new ParticlePool({
      capacity: CAP_SPRAY,
      color: SPRAY_COLOR,
      size: 1.05,
      opacity: 0.98,
    });
    this.#burst = new ParticlePool({
      capacity: CAP_BURST,
      color: BURST_COLOR,
      size: 0.36,
      opacity: 0.98,
    });
    this.#boostParts = new ParticlePool({
      capacity: CAP_BOOST,
      color: BOOST_COLOR,
      size: 0.16,
      opacity: 0.75,
      additive: true,
    });
    this.#trail = new BoardTrail();
    this.#speedLines = new SpeedLines(CAP_SPEED);

    this.#boostLight = new THREE.PointLight(BOOST_COLOR, 0, 14, 2);
    this.#boostHalo = new THREE.PointLight(0xb8dcff, 0, 6, 2);

    // Draw spray after snowfall so edge plumes stay readable against terrain fill.
    this.#spray.points.renderOrder = 2;
    this.#burst.points.renderOrder = 2;
    this.#trail.object.renderOrder = 1;

    this.#root.add(
      this.#snow.points,
      this.#spray.points,
      this.#burst.points,
      this.#boostParts.points,
      this.#trail.object,
      this.#speedLines.object,
      this.#boostLight,
      this.#boostHalo
    );
  }

  init(ctx: EngineContext): void {
    ctx.scene.add(this.#root);
    this.#applyBudgets(ctx);
    this.#seedSnow(ctx.camera.position);

    ctx.events.on('rider:spray', ({ intensity, surface }) => {
      const rider = ctx.getModule<RiderModule>('rider');
      if (!rider) return;
      this.#emitCarveSpray(rider, intensity, surface, ctx);
    });

    ctx.events.on('rider:landing', ({ impact }) => {
      const rider = ctx.getModule<RiderModule>('rider');
      if (!rider) return;
      this.#emitPowderBurst(rider, Math.min(2, impact / 8), ctx);
    });

    ctx.events.on('rider:boost', ({ active }) => {
      this.#boosting = active;
      this.#boostTarget = active ? 1 : 0;
    });

    ctx.events.on('rider:path-reset', () => {
      this.#trail.clear();
    });

    ctx.events.on('settings:changed', () => this.#applyBudgets(ctx));
    ctx.events.on('engine:resized', () => {
      const dpr = ctx.viewport.dpr;
      this.#snow.setPixelRatio(dpr);
      this.#spray.setPixelRatio(dpr);
      this.#burst.setPixelRatio(dpr);
      this.#boostParts.setPixelRatio(dpr);
    });
  }

  update(dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    const budgets = allocateBudgets(ctx.settings, ctx.settings.reducedMotion);

    // Keep budgets hot if settings mutated without event.
    this.#snow.setBudget(budgets.snow);
    this.#spray.setBudget(budgets.spray);
    this.#burst.setBudget(budgets.burst);
    this.#boostParts.setBudget(budgets.boost);
    this.#speedLines.setBudget(budgets.speed);

    this.#updateSnowfall(dt, ctx, budgets.snow);
    // Softer gravity so carve plumes hold volume longer (ref denser spray).
    this.#spray.update(dt, 5.8, 0.42);
    this.#burst.update(dt, 9.5, 0.48);
    this.#boostParts.update(dt, 2.5, 1.2);
    this.#speedLines.update(dt);

    const snowOpacity = ctx.capture ? 0.3 : ctx.settings.reducedMotion ? 0.35 : 0.55;
    this.#snow.setOpacity(snowOpacity);
    // Larger soft points so carve stills read as plumes, not sparse dots.
    this.#spray.setSizeScale(ctx.capture ? 1.85 : 1.35);
    this.#spray.setOpacity(ctx.capture ? 1 : ctx.settings.reducedMotion ? 0.75 : 0.98);
    this.#speedLines.setOpacity(ctx.capture ? 0.15 : this.#boosting ? 0.45 : 0.28);

    if (rider) {
      this.#trailAcc += dt;
      if (this.#trailAcc >= 1 / 40) {
        this.#trailAcc = 0;
        this.#trail.push(
          rider.state.position,
          rider.state.boardYaw,
          rider.state.edgeAngle,
          rider.state.grounded,
          rider.state.speed
        );
      }

      this.#updateBoost(dt, rider, ctx);
      this.#updateSpeedLines(dt, rider, ctx);
    } else {
      this.#boostLight.intensity = 0;
      this.#boostHalo.intensity = 0;
    }
  }

  #applyBudgets(ctx: EngineContext): void {
    const b = allocateBudgets(ctx.settings, ctx.settings.reducedMotion);
    this.#snow.setBudget(b.snow);
    this.#spray.setBudget(b.spray);
    this.#burst.setBudget(b.burst);
    this.#boostParts.setBudget(b.boost);
    this.#speedLines.setBudget(b.speed);
    const dpr = ctx.viewport.dpr;
    this.#snow.setPixelRatio(dpr);
    this.#spray.setPixelRatio(dpr);
    this.#burst.setPixelRatio(dpr);
    this.#boostParts.setPixelRatio(dpr);
  }

  #seedSnow(cam: THREE.Vector3): void {
    const pos = this.#snow.positionArray;
    const life = this.#snow.lifeArray;
    const vel = this.#snow.velocityArray;
    const n = this.#snow.capacity;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = cam.x + (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = cam.y + Math.random() * 40;
      pos[i * 3 + 2] = cam.z + (Math.random() - 0.5) * 80;
      vel[i * 3] = 0.2 + Math.random() * 0.6;
      vel[i * 3 + 1] = -(1.2 + Math.random() * 1.8);
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      life[i] = 1; // kept "alive" for recirculation
    }
    this.#snow.markPositionsDirty();
    this.#snowSeeded = true;
  }

  #updateSnowfall(dt: number, ctx: EngineContext, budget: number): void {
    if (!this.#snowSeeded) this.#seedSnow(ctx.camera.position);
    const cam = ctx.camera.position;
    const pos = this.#snow.positionArray;
    const vel = this.#snow.velocityArray;
    const wind = this.#boosting ? 1.6 : 1;

    for (let i = 0; i < budget; i++) {
      pos[i * 3]! += vel[i * 3]! * dt * wind;
      pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
      pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;

      const dx = pos[i * 3]! - cam.x;
      const dy = pos[i * 3 + 1]! - cam.y;
      const dz = pos[i * 3 + 2]! - cam.z;
      if (dy < -12 || dx * dx + dz * dz > 55 * 55) {
        pos[i * 3] = cam.x + (Math.random() - 0.5) * 70;
        pos[i * 3 + 1] = cam.y + 12 + Math.random() * 28;
        pos[i * 3 + 2] = cam.z + (Math.random() - 0.5) * 70;
        vel[i * 3] = 0.2 + Math.random() * 0.7;
        vel[i * 3 + 1] = -(1.1 + Math.random() * 2);
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
      }
    }
    this.#snow.markPositionsDirty();
  }

  #emitCarveSpray(
    rider: RiderModule,
    intensity: number,
    surface: string,
    ctx: EngineContext
  ): void {
    if (intensity <= 0) return;
    if (ctx.settings.reducedMotion && intensity < 0.2) return;
    if (!rider.state.grounded) return;

    const surfaceMul =
      surface === 'powder' ? 1.7 : surface === 'packed' ? 1.3 : surface === 'ice' ? 0.6 : 0.9;
    const captureMul = ctx.capture ? 1.55 : 1;
    // Dense plume within Lod spray budget — recycle slots rather than raise caps.
    const budget = this.#spray.budget;
    const maxPerEmit = Math.max(16, Math.floor(budget * 0.22));
    const desired = Math.floor((18 + intensity * 72) * surfaceMul * captureMul);
    const count = Math.min(maxPerEmit, Math.max(14, desired));
    const origin = rider.state.position;
    const vel = rider.state.velocity;
    const yaw = rider.state.boardYaw;
    const edge = rider.state.edgeAngle;

    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.#lateral.set(this.#forward.z, 0, -this.#forward.x).multiplyScalar(Math.sign(edge || 1));

    const sizeBase = surface === 'powder' ? 1.35 : surface === 'ice' ? 0.82 : 1.12;
    const kick = 2.8 + intensity * 5.2;

    for (let n = 0; n < count; n++) {
      // Fan along the edged rail: lateral throw + aft so spray clears the board.
      const along = (Math.random() - 0.55) * 0.85;
      const out = 0.18 + Math.random() * 0.72;
      const px =
        origin.x +
        this.#lateral.x * out +
        this.#forward.x * along +
        (Math.random() - 0.5) * 0.12;
      const pz =
        origin.z +
        this.#lateral.z * out +
        this.#forward.z * along +
        (Math.random() - 0.5) * 0.12;
      // Lift above snow mesh so depthTest doesn't bury soft points.
      const py = origin.y + 0.1 + Math.random() * 0.38;
      const vx =
        -vel.x * 0.12 +
        this.#lateral.x * kick +
        this.#forward.x * (Math.random() - 0.65) * 2.4 +
        (Math.random() - 0.5) * 1.2;
      const vy = 1.35 + Math.random() * (2.6 + intensity * 3.8) * surfaceMul;
      const vz =
        -vel.z * 0.12 +
        this.#lateral.z * kick +
        this.#forward.z * (Math.random() - 0.65) * 2.4 +
        (Math.random() - 0.5) * 1.2;
      // Majority soft mist + fewer chunky crystals → denser plume volume.
      const mist = Math.random() > 0.42;
      this.#spray.spawn(
        px,
        py,
        pz,
        mist ? vx * 0.5 : vx,
        mist ? vy * 0.7 + 0.35 : vy,
        mist ? vz * 0.5 : vz,
        mist
          ? 0.65 + Math.random() * 0.55
          : 0.48 + Math.random() * 0.6 * (0.8 + intensity),
        sizeBase * (mist ? 1.35 + Math.random() * 0.95 : 0.75 + Math.random() * 1.05)
      );
    }
  }

  #emitPowderBurst(rider: RiderModule, intensity: number, ctx: EngineContext): void {
    if (intensity < 0.15) return;
    const mul = ctx.settings.reducedMotion ? 0.45 : 1;
    const count = Math.floor((18 + intensity * 55) * mul);
    const o = rider.state.position;
    const v = rider.state.velocity;

    for (let n = 0; n < count; n++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = 2.5 + intensity * 5;
      const vx = Math.cos(angle) * spread * (0.4 + Math.random()) - v.x * 0.08;
      const vz = Math.sin(angle) * spread * (0.4 + Math.random()) - v.z * 0.08;
      const vy = 2.5 + Math.random() * 5 * intensity;
      this.#burst.spawn(
        o.x + (Math.random() - 0.5) * 0.6,
        o.y + 0.05,
        o.z + (Math.random() - 0.5) * 0.6,
        vx,
        vy,
        vz,
        0.45 + Math.random() * 0.55,
        0.2 + Math.random() * 0.25 * intensity
      );
    }

    // Extra soft mist ring for heavy landings
    if (intensity > 0.8) {
      const mist = Math.floor(12 * mul);
      for (let n = 0; n < mist; n++) {
        const angle = (n / mist) * Math.PI * 2;
        this.#spray.spawn(
          o.x + Math.cos(angle) * 0.4,
          o.y + 0.1,
          o.z + Math.sin(angle) * 0.4,
          Math.cos(angle) * 3,
          1.5 + Math.random(),
          Math.sin(angle) * 3,
          0.5,
          0.32
        );
      }
    }
  }

  #updateBoost(dt: number, rider: RiderModule, ctx: EngineContext): void {
    const target = this.#boostTarget * (ctx.settings.reducedMotion ? 0.55 : 1);
    const cur = this.#boostLight.intensity / 5;
    const next = cur + (target - cur) * Math.min(1, dt * 8);
    this.#boostLight.intensity = next * 5;
    this.#boostHalo.intensity = next * 2.2;

    this.#tmp.copy(rider.state.position).addScaledVector(this.#up, 0.55);
    this.#boostLight.position.copy(this.#tmp);
    this.#boostHalo.position.copy(rider.state.position).y += 0.2;

    if (!this.#boosting || ctx.settings.reducedMotion) return;

    const rate = 40 * (0.5 + rider.state.speed / 60);
    const emit = Math.min(12, Math.floor(rate * dt + Math.random()));
    const yaw = rider.state.boardYaw;
    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));

    for (let n = 0; n < emit; n++) {
      this.#boostParts.spawn(
        rider.state.position.x + (Math.random() - 0.5) * 0.35,
        rider.state.position.y + 0.15 + Math.random() * 0.4,
        rider.state.position.z + (Math.random() - 0.5) * 0.35,
        -this.#forward.x * (2 + Math.random() * 4) + (Math.random() - 0.5),
        0.5 + Math.random() * 1.5,
        -this.#forward.z * (2 + Math.random() * 4) + (Math.random() - 0.5),
        0.2 + Math.random() * 0.25,
        0.1 + Math.random() * 0.12
      );
    }
  }

  #updateSpeedLines(dt: number, rider: RiderModule, ctx: EngineContext): void {
    const speed = rider.state.speed;
    const show = this.#boosting || speed > 28;
    if (!show || ctx.settings.reducedMotion) return;

    this.#speedAcc += dt;
    const interval = this.#boosting ? 1 / 45 : 1 / 28;
    if (this.#speedAcc < interval) return;
    this.#speedAcc = 0;

    const cam = ctx.camera;
    const dir = this.#tmp2.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const right = this.#lateral.crossVectors(dir, this.#up).normalize();
    const camUp = this.#tmp3.crossVectors(right, dir).normalize();

    const strength = this.#boosting ? 1 : Math.min(1, (speed - 28) / 25);
    const count = 1 + Math.floor(strength * 2);
    for (let n = 0; n < count; n++) {
      const ox = (Math.random() - 0.5) * 4.5;
      const oy = (Math.random() - 0.5) * 2.8;
      this.#tmp
        .copy(cam.position)
        .addScaledVector(dir, 2.5 + Math.random() * 6)
        .addScaledVector(right, ox)
        .addScaledVector(camUp, oy);
      const len = 1.2 + strength * 2.5 + Math.random();
      this.#speedLines.spawn(this.#tmp, dir, len);
    }
  }

  dispose(): void {
    this.#root.removeFromParent();
    this.#snow.dispose();
    this.#spray.dispose();
    this.#burst.dispose();
    this.#boostParts.dispose();
    this.#trail.dispose();
    this.#speedLines.dispose();
  }
}
