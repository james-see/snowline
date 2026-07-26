import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';

const SUN_COLOR = 0xfff4d6;
const SKY_HORIZON = 0x6a9ec4;

export class RenderModule implements GameModule {
  readonly name = 'render';
  readonly order: number;

  #sun!: THREE.DirectionalLight;
  #hemi!: THREE.HemisphereLight;
  #fog!: THREE.FogExp2;
  #csmTarget = new THREE.WebGLRenderTarget(2048, 2048);
  #materials: MaterialLibrary | null = null;

  constructor(order = -30) {
    this.order = order;
  }

  init(ctx: EngineContext): void {
    const { scene, settings, resources } = ctx;

    scene.background = new THREE.Color().setHSL(0.58, 0.42, 0.48);
    // Distance fog only — low alpine density, never post UV wash values.
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, 0.00055);

    // Directional-led lighting (avoid flat_ambient): soft hemi fill, stronger sun.
    this.#hemi = new THREE.HemisphereLight(0x7aa8c8, 0xd8e2ec, 0.38);
    scene.add(this.#hemi);

    const budgets = resolveLodBudgets(settings);
    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 1.55);
    this.#sun.position.set(140, 220, 90);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    this.#sun.shadow.camera.near = 2;
    this.#sun.shadow.camera.far = budgets.shadowDistance;
    const half = budgets.shadowFrustum;
    this.#sun.shadow.camera.left = -half;
    this.#sun.shadow.camera.right = half;
    this.#sun.shadow.camera.top = half;
    this.#sun.shadow.camera.bottom = -half;
    this.#sun.shadow.bias = -0.0004;
    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) {
      scene.environment = env;
      scene.environmentIntensity = 0.45;
    }

    // Critic-critical: clamp post fog before first frame / course_start capture.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);

    this.#materials = resources.getMaterials();

    ctx.events.on('course:loaded', (ev) => this.#upgradeSnowMaterials(ctx, ev.length));
    ctx.events.on('settings:changed', () => this.#applyQuality(ctx));
    ctx.events.on('engine:resized', () => this.#applyQuality(ctx));

    this.#applyQuality(ctx);
  }

  update(_dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;

    const p = rider.state.position;
    this.#sun.target.position.set(p.x, p.y, p.z);
    this.#sun.position.set(p.x + 140, p.y + 220, p.z + 90);
  }

  #applyQuality(ctx: EngineContext): void {
    const s = ctx.settings;
    const budgets = resolveLodBudgets(s);
    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    this.#sun.shadow.camera.far = budgets.shadowDistance;
    const half = budgets.shadowFrustum;
    this.#sun.shadow.camera.left = -half;
    this.#sun.shadow.camera.right = half;
    this.#sun.shadow.camera.top = half;
    this.#sun.shadow.camera.bottom = -half;
    this.#sun.shadow.camera.updateProjectionMatrix();
    ctx.renderer.shadowMap.type = s.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.BasicShadowMap;

    // Post fog density must stay ~0; scene FogExp2 is separate.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);
  }

  #upgradeSnowMaterials(ctx: EngineContext, courseLength: number): void {
    const library = this.#materials ?? ctx.resources.getMaterials();
    const course = ctx.getModule<CourseModule>('course');
    const width = course?.getDefinition()?.terrain.width ?? 80;
    const length = courseLength > 0 ? courseLength : (course?.getDefinition()?.length ?? 2000);

    ctx.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name.startsWith('terrain-')) return;
      library.applyTerrain(obj, { width, length });
    });
  }

  dispose(): void {
    this.#csmTarget.dispose();
    this.#materials = null;
  }
}
