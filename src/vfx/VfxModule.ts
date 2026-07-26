import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { LOD_BUFFER_CAPS, resolveLodBudgets } from '@/engine/Lod.ts';

export class VfxModule implements GameModule {
  readonly name = 'vfx';
  readonly order = 35;

  #spray: THREE.Points;
  #sprayVel: Float32Array;
  #sprayLife: Float32Array;
  #snow: THREE.Points;
  #trail: THREE.Line;
  #trailPts: THREE.Vector3[] = [];
  #boostLight: THREE.PointLight;
  #root = new THREE.Group();
  #sprayBudget: number = LOD_BUFFER_CAPS.spray;
  #snowBudget: number = LOD_BUFFER_CAPS.snow;

  constructor() {
    const sprayGeo = new THREE.BufferGeometry();
    const sprayPos = new Float32Array(LOD_BUFFER_CAPS.spray * 3);
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    sprayGeo.setDrawRange(0, LOD_BUFFER_CAPS.spray);
    this.#spray = new THREE.Points(
      sprayGeo,
      new THREE.PointsMaterial({
        color: 0xf2f7fc,
        size: 0.18,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.#sprayVel = new Float32Array(LOD_BUFFER_CAPS.spray * 3);
    this.#sprayLife = new Float32Array(LOD_BUFFER_CAPS.spray);

    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(LOD_BUFFER_CAPS.snow * 3);
    for (let i = 0; i < LOD_BUFFER_CAPS.snow; i++) {
      snowPos[i * 3] = (Math.random() - 0.5) * 80;
      snowPos[i * 3 + 1] = Math.random() * 40;
      snowPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    snowGeo.setDrawRange(0, LOD_BUFFER_CAPS.snow);
    this.#snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.12,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );

    const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.#trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xa8c8e8, transparent: true, opacity: 0.45 })
    );

    this.#boostLight = new THREE.PointLight(0x7ec8ff, 0, 12);
    this.#root.add(this.#spray, this.#snow, this.#trail, this.#boostLight);
  }

  init(ctx: EngineContext): void {
    ctx.scene.add(this.#root);
    this.#applyBudgets(ctx);
    ctx.events.on('settings:changed', () => this.#applyBudgets(ctx));
    ctx.events.on('rider:spray', ({ intensity, surface }) => {
      const rider = ctx.getModule<RiderModule>('rider');
      if (!rider) return;
      this.#emitSpray(rider.state.position, rider.state.velocity, intensity, surface);
    });
    ctx.events.on('rider:landing', ({ impact }) => {
      const rider = ctx.getModule<RiderModule>('rider');
      if (!rider) return;
      this.#emitSpray(rider.state.position, rider.state.velocity, Math.min(1.5, impact / 10), 'powder');
    });
    ctx.events.on('rider:boost', ({ active }) => {
      this.#boostLight.intensity = active ? 4 : 0;
    });
  }

  #applyBudgets(ctx: EngineContext): void {
    const budgets = resolveLodBudgets(ctx.settings);
    this.#sprayBudget = budgets.maxSprayParticles;
    this.#snowBudget = budgets.maxSnowParticles;
    this.#spray.geometry.setDrawRange(0, this.#sprayBudget);
    this.#snow.geometry.setDrawRange(0, this.#snowBudget);
  }

  update(dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    const sprayCap = this.#sprayBudget;
    const snowCap = this.#snowBudget;

    // Spray integrate
    const pos = this.#spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < sprayCap; i++) {
      if (this.#sprayLife[i]! <= 0) continue;
      this.#sprayLife[i]! -= dt;
      pos.array[i * 3]! += this.#sprayVel[i * 3]! * dt;
      pos.array[i * 3 + 1]! += this.#sprayVel[i * 3 + 1]! * dt;
      pos.array[i * 3 + 2]! += this.#sprayVel[i * 3 + 2]! * dt;
      this.#sprayVel[i * 3 + 1]! -= 9 * dt;
      if (this.#sprayLife[i]! <= 0) {
        pos.array[i * 3 + 1] = -999;
      }
    }
    pos.needsUpdate = true;

    // Snowfall around camera
    const snowPos = this.#snow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cam = ctx.camera.position;
    for (let i = 0; i < snowCap; i++) {
      snowPos.array[i * 3 + 1]! -= dt * (1.5 + (i % 5) * 0.3);
      snowPos.array[i * 3]! += dt * 0.4;
      if (snowPos.array[i * 3 + 1]! < cam.y - 10) {
        snowPos.array[i * 3] = cam.x + (Math.random() - 0.5) * 70;
        snowPos.array[i * 3 + 1] = cam.y + 15 + Math.random() * 25;
        snowPos.array[i * 3 + 2] = cam.z + (Math.random() - 0.5) * 70;
      }
    }
    snowPos.needsUpdate = true;
    (this.#snow.material as THREE.PointsMaterial).opacity = ctx.capture ? 0.35 : 0.55;

    // Trail
    if (rider?.state.grounded && rider.state.speed > 8) {
      this.#trailPts.push(rider.state.position.clone());
      if (this.#trailPts.length > 40) this.#trailPts.shift();
      this.#trail.geometry.setFromPoints(this.#trailPts);
    }

    if (rider) {
      this.#boostLight.position.copy(rider.state.position).add(new THREE.Vector3(0, 0.5, 0));
    }
  }

  #emitSpray(
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    intensity: number,
    surface: string
  ): void {
    const count = Math.floor(8 + intensity * 28 * (surface === 'powder' ? 1.4 : 1));
    const pos = this.#spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    let spawned = 0;
    for (let i = 0; i < this.#sprayBudget && spawned < count; i++) {
      if (this.#sprayLife[i]! > 0) continue;
      pos.array[i * 3] = origin.x + (Math.random() - 0.5) * 0.4;
      pos.array[i * 3 + 1] = origin.y + 0.05;
      pos.array[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.4;
      this.#sprayVel[i * 3] = -velocity.x * 0.15 + (Math.random() - 0.5) * 3;
      this.#sprayVel[i * 3 + 1] = 1.5 + Math.random() * 3 * intensity;
      this.#sprayVel[i * 3 + 2] = -velocity.z * 0.15 + (Math.random() - 0.5) * 3;
      this.#sprayLife[i] = 0.35 + Math.random() * 0.4;
      spawned++;
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.#root.removeFromParent();
    this.#spray.geometry.dispose();
    (this.#spray.material as THREE.Material).dispose();
    this.#snow.geometry.dispose();
    (this.#snow.material as THREE.Material).dispose();
    this.#trail.geometry.dispose();
    (this.#trail.material as THREE.Material).dispose();
  }
}
