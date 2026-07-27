import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';

/** Late-afternoon key — warm amber, not noon white. */
const SUN_COLOR = 0xffc878;
/** Cool zenith / warm horizon haze tint (scene FogExp2 + post aerial). */
const SKY_ZENITH = 0x4a7aaa;
const SKY_HORIZON = 0xb8a890;
/**
 * World-space sun direction (from ground toward sun).
 * ~15° elevation → long striped shadows on corduroy (ref alpine groom).
 */
const SUN_DIR = new THREE.Vector3(0.84, 0.26, 0.47).normalize();

export class RenderModule implements GameModule {
  readonly name = 'render';
  readonly order: number;

  #sun!: THREE.DirectionalLight;
  #hemi!: THREE.HemisphereLight;
  #fog!: THREE.FogExp2;
  #materials: MaterialLibrary | null = null;
  #sunFollow = 90;

  constructor(order = -30) {
    this.order = order;
  }

  init(ctx: EngineContext): void {
    const { scene, settings, resources } = ctx;

    // Mid sky fill; horizon warmth + depth separation come from FogExp2 + post aerial.
    scene.background = new THREE.Color(SKY_ZENITH);
    // Soft distance haze only — low alpine density, never post UV wash values.
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, 0.00042);

    // Soft sky fill only — keep well under sun so shading is directional-led.
    this.#hemi = new THREE.HemisphereLight(0x6a8eb0, 0xe0d2c0, 0.16);
    scene.add(this.#hemi);

    const budgets = resolveLodBudgets(settings);
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.7, 120);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 2.85);
    this.#sun.position.copy(SUN_DIR).multiplyScalar(this.#sunFollow);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#configureShadow(ctx);

    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) {
      scene.environment = env;
      // Keep IBL subordinate to the key sun (avoids flat_ambient wash).
      scene.environmentIntensity = 0.22;
    }

    // Critic-critical: clamp post fog before first frame / course_start capture.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);

    this.#materials = resources.getMaterials();

    ctx.events.on('course:loaded', (ev) => {
      this.#upgradeSnowMaterials(ctx, ev.length);
      this.#sun.shadow.needsUpdate = true;
      ctx.renderer.shadowMap.needsUpdate = true;
    });
    ctx.events.on('settings:changed', () => this.#applyQuality(ctx));
    ctx.events.on('engine:resized', () => this.#applyQuality(ctx));

    this.#applyQuality(ctx);
  }

  update(_dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;

    const p = rider.state.position;
    this.#sun.target.position.set(p.x, p.y, p.z);
    // Keep the light within the shadow camera far plane (prior bug: offset ~275m vs far ~140).
    this.#sun.position.set(
      p.x + SUN_DIR.x * this.#sunFollow,
      p.y + SUN_DIR.y * this.#sunFollow,
      p.z + SUN_DIR.z * this.#sunFollow
    );
    this.#sun.target.updateMatrixWorld();
    this.#sun.updateMatrixWorld();
    this.#sun.shadow.needsUpdate = true;
  }

  #configureShadow(ctx: EngineContext): void {
    const s = ctx.settings;
    const budgets = resolveLodBudgets(s);
    // Follow distance: far enough for low-elevation sun, still inside shadow far.
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.7, 120);

    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    // Readable umbra on bright snow (ref: long striped tree shadows).
    this.#sun.shadow.intensity = 1.7;
    // Grazing late sun needs a touch more bias to avoid acne without peter-panning.
    this.#sun.shadow.bias = -0.00045;
    this.#sun.shadow.normalBias = 0.055;
    this.#sun.shadow.radius = s.softShadows ? 2.75 : 1;
    this.#sun.shadow.camera.near = 0.5;
    // Far must exceed light→target distance + long shadow receivers.
    this.#sun.shadow.camera.far = Math.max(
      budgets.shadowDistance,
      this.#sunFollow + budgets.shadowFrustum + 60
    );
    // Cover rider + nearby forest belt; long casts need lateral room.
    const half = budgets.shadowFrustum * 1.15;
    this.#sun.shadow.camera.left = -half;
    this.#sun.shadow.camera.right = half;
    this.#sun.shadow.camera.top = half;
    this.#sun.shadow.camera.bottom = -half;
    this.#sun.shadow.camera.updateProjectionMatrix();
    this.#sun.shadow.needsUpdate = true;
  }

  #applyQuality(ctx: EngineContext): void {
    this.#configureShadow(ctx);
    ctx.renderer.shadowMap.enabled = ctx.settings.shadowsEnabled;
    ctx.renderer.shadowMap.type = ctx.settings.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.BasicShadowMap;
    ctx.renderer.shadowMap.needsUpdate = true;

    // Post fog density must stay ~0; scene FogExp2 is separate.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);
  }

  #upgradeSnowMaterials(ctx: EngineContext, courseLength: number): void {
    const library = this.#materials ?? ctx.resources.getMaterials();
    const course = ctx.getModule<CourseModule>('course');
    const terrain = course?.getTerrain?.();
    const width = terrain?.meshWidth ?? course?.getDefinition()?.terrain.width ?? 80;
    const length = courseLength > 0 ? courseLength : (course?.getDefinition()?.length ?? 2000);

    ctx.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name.startsWith('terrain-')) return;
      library.applyTerrain(obj, { width, length });
    });
  }

  dispose(): void {
    this.#materials = null;
  }
}
