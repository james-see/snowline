import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';
import { makeSkyGradientTexture } from '@/render/skyGradient.ts';

/** Late-afternoon key — warm amber, not noon white. */
const SUN_COLOR = 0xffc878;
/** Cool zenith / warm-lavender horizon (alpine aerial mood). */
const SKY_ZENITH = 0x3d6f9c;
const SKY_HORIZON = 0xc5b8a8;
/**
 * World-space sun direction (from ground toward sun).
 * ~20° elevation → long readable casts that still fit a single ortho shadow map.
 * (Ultra-grazing ~10–12° blew the depth range and erased umbras on groom.)
 */
const SUN_DIR = new THREE.Vector3(0.82, 0.34, 0.46).normalize();
/** Scene FogExp2 — readable peak wash without white-out on the corridor. */
const FOG_DENSITY = 0.00092;

export class RenderModule implements GameModule {
  readonly name = 'render';
  readonly order: number;

  #sun!: THREE.DirectionalLight;
  #hemi!: THREE.HemisphereLight;
  #fog!: THREE.FogExp2;
  #skyTex: THREE.DataTexture | null = null;
  #materials: MaterialLibrary | null = null;
  #sunFollow = 90;

  constructor(order = -30) {
    this.order = order;
  }

  init(ctx: EngineContext): void {
    const { scene, settings, resources } = ctx;

    this.#skyTex = makeSkyGradientTexture(SKY_ZENITH, SKY_HORIZON);
    scene.background = this.#skyTex;
    // Stronger alpine distance haze — peaks must separate from near groom (B11).
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, FOG_DENSITY);

    // Soft sky fill only — keep well under sun so shading is directional-led.
    this.#hemi = new THREE.HemisphereLight(0x6a8eb0, 0xe8d8c4, 0.11);
    scene.add(this.#hemi);

    const budgets = resolveLodBudgets(settings);
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.55, 100);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 3.35);
    this.#sun.position.copy(SUN_DIR).multiplyScalar(this.#sunFollow);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#configureShadow(ctx);

    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) {
      scene.environment = env;
      // Keep IBL subordinate to the key sun (avoids flat_ambient wash).
      scene.environmentIntensity = 0.14;
    }

    // Critic-critical: clamp post fog before first frame / course_start capture.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);

    this.#materials = resources.getMaterials();

    ctx.events.on('course:loaded', (ev) => {
      this.#upgradeSnowMaterials(ctx, ev.length);
      this.#ensureShadowReceivers(ctx);
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
    this.#sun.shadow.camera.updateMatrixWorld();
    this.#sun.shadow.needsUpdate = true;
  }

  #configureShadow(ctx: EngineContext): void {
    const s = ctx.settings;
    const budgets = resolveLodBudgets(s);
    // Follow distance: short enough that light→target stays inside shadow far.
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.55, 100);

    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    // Full umbra on snow — intensity is a 0–1 mix in Three r185.
    this.#sun.shadow.intensity = 1;
    // Grazing late sun: prefer normalBias over large constant bias (less peter-pan).
    this.#sun.shadow.bias = -0.00018;
    this.#sun.shadow.normalBias = 0.028;
    // Harder stripes read better on corduroy than over-soft PCF.
    this.#sun.shadow.radius = s.softShadows ? 1.6 : 1;
    this.#sun.shadow.camera.near = 1;
    // Far must exceed light→target distance + long shadow receivers.
    this.#sun.shadow.camera.far = Math.max(
      budgets.shadowDistance + 40,
      this.#sunFollow + budgets.shadowFrustum * 1.6 + 80
    );
    // Cover rider + nearby forest belt; long casts need lateral room.
    const half = Math.max(budgets.shadowFrustum * 1.45, 78);
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
    // Prefer crisp umbras for critic B3 readability (long striped casts).
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap;
    ctx.renderer.shadowMap.needsUpdate = true;

    this.#fog.density = FOG_DENSITY;
    this.#fog.color.setHex(SKY_HORIZON);

    // Post fog density must stay ~0; scene FogExp2 is separate.
    ctx.pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0);
  }

  /** Terrain receives; tree instances keep valid bounds so sun maps see casters. */
  #ensureShadowReceivers(ctx: EngineContext): void {
    ctx.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.InstancedMesh)) return;
      const n = obj.name;
      if (
        n.startsWith('terrain-') ||
        n.startsWith('backdrop-') ||
        n.startsWith('trees-') ||
        n.includes('snow')
      ) {
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.InstancedMesh && n.startsWith('trees-')) {
        // Default sphere at origin culls every instance from the shadow camera.
        obj.computeBoundingSphere();
        obj.frustumCulled = false;
      }
    });
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
    this.#skyTex?.dispose();
    this.#skyTex = null;
  }
}
