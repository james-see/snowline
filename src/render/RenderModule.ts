import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';
import { makeSkyGradientTexture } from '@/render/skyGradient.ts';

/** Late-afternoon key — warm amber, bright enough for alpine groom (not muddy). */
const SUN_COLOR = 0xffd090;
/** Deep navy zenith / cool mid-horizon — aerial silhouette, not milk whiteout. */
const SKY_ZENITH = 0x2a5078;
const SKY_HORIZON = 0x7a8fa8;
/**
 * World-space sun direction (from ground toward sun).
 * ~14° elevation → long tree/rider casts on groom (alpine ref).
 * Keep ≥~13° so a single ortho map still resolves umbras (10–12° blew depth range).
 */
const SUN_DIR = new THREE.Vector3(0.86, 0.24, 0.45).normalize();
/** Scene FogExp2 — light cool wash; peaks must stay readable (B11 ≠ milk). */
const FOG_DENSITY = 0.00028;

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
    // Cool light FogExp2 — distance cue without corridor whiteout (B11).
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, FOG_DENSITY);

    // Soft sky + ground bounce — lifts shade so groom stays bright alpine, not night.
    this.#hemi = new THREE.HemisphereLight(0x8aa8c4, 0xe8d8c4, 0.42);
    scene.add(this.#hemi);

    const budgets = resolveLodBudgets(settings);
    // Short follow keeps light→target inside shadow far under grazing sun.
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.48, 88);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 4.55);
    this.#sun.position.copy(SUN_DIR).multiplyScalar(this.#sunFollow);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#configureShadow(ctx);

    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) {
      scene.environment = env;
      // Brighter IBL for soft snow fill; still below key so direction reads.
      scene.environmentIntensity = 0.28;
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
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.48, 88);

    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    // Lighter umbras — readable long casts without muddy night stripes on groom.
    this.#sun.shadow.intensity = 0.62;
    // Grazing late sun: bias tuned for soft PCF without peter-pan.
    this.#sun.shadow.bias = -0.00018;
    this.#sun.shadow.normalBias = 0.035;
    // Soft penumbra — kill razor zebra on corduroy while keeping cast length.
    this.#sun.shadow.radius = s.softShadows ? 3.25 : 2.4;
    this.#sun.shadow.camera.near = 0.8;
    // Far must cover light→target + ~30 m cast receivers under grazing sun.
    this.#sun.shadow.camera.far = Math.max(
      budgets.shadowDistance + 80,
      this.#sunFollow + budgets.shadowFrustum * 2.1 + 120
    );
    // Cover rider + forest belt; long casts need wide lateral room.
    const half = Math.max(budgets.shadowFrustum * 1.75, 96);
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
    // Soft PCF via PCFShadowMap (PCFSoftShadowMap deprecated → same path).
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
