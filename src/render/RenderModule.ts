import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';

const SUN_COLOR = 0xfff4d6;
const SKY_TOP = 0x1a2844;
const SKY_HORIZON = 0x6a9ec4;

export class RenderModule implements GameModule {
  readonly name = 'render';
  readonly order: number;

  #sun!: THREE.DirectionalLight;
  #hemi!: THREE.HemisphereLight;
  #fog!: THREE.FogExp2;
  #csmTarget = new THREE.WebGLRenderTarget(2048, 2048);

  constructor(order = -30) {
    this.order = order;
  }

  init(ctx: EngineContext): void {
    const { scene, renderer, settings, resources } = ctx;

    scene.background = new THREE.Color().setHSL(0.58, 0.38, 0.62);
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, 0.0007);

    // Cool sky + snow bounce fill so form reads without blowing whites.
    this.#hemi = new THREE.HemisphereLight(0x8eb8d8, 0xe8eef4, 0.62);
    scene.add(this.#hemi);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 1.28);
    this.#sun.position.set(120, 180, 80);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    this.#sun.shadow.camera.near = 2;
    this.#sun.shadow.camera.far = settings.shadowDistance;
    this.#sun.shadow.camera.left = -80;
    this.#sun.shadow.camera.right = 80;
    this.#sun.shadow.camera.top = 80;
    this.#sun.shadow.camera.bottom = -80;
    this.#sun.shadow.bias = -0.0004;
    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) scene.environment = env;

    ctx.events.on('course:loaded', () => this.#upgradeSnowMaterials(scene));
    ctx.events.on('settings:changed', () => this.#applyQuality(ctx));
    ctx.events.on('engine:resized', () => this.#applyQuality(ctx));

    this.#applyQuality(ctx);
  }

  update(_dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;

    const p = rider.state.position;
    this.#sun.target.position.set(p.x, p.y, p.z);
    this.#sun.position.set(p.x + 120, p.y + 180, p.z + 80);
  }

  #applyQuality(ctx: EngineContext): void {
    const s = ctx.settings;
    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    this.#sun.shadow.camera.far = s.shadowDistance;
    ctx.renderer.shadowMap.type = s.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.BasicShadowMap;

    const pipeline = ctx.pipeline as { setFog?: (c: THREE.Color, d: number) => void };
    // Post-stack grade only — never feed scene FogExp2 densities into UV wash.
    pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0.04);
  }

  #upgradeSnowMaterials(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name.startsWith('terrain-')) return;
      const old = obj.material as THREE.MeshStandardMaterial;
      const phys = new THREE.MeshPhysicalMaterial({
        color: 0xe6eef6,
        vertexColors: old.vertexColors,
        roughness: 0.84,
        metalness: 0.02,
        clearcoat: 0.18,
        clearcoatRoughness: 0.35,
        sheen: 0.28,
        sheenColor: new THREE.Color(0xc8e8ff),
        sheenRoughness: 0.55,
      });
      old.dispose();
      obj.material = phys;
      obj.receiveShadow = true;
    });
  }

  dispose(): void {
    this.#csmTarget.dispose();
  }
}
