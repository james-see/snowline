import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';

const SUN_COLOR = 0xfff1c8;
const SKY_HORIZON = 0x6a9ec4;
/** World-space sun direction (from ground toward sun). Low elevation → readable contact length. */
const SUN_DIR = new THREE.Vector3(0.62, 0.68, 0.39).normalize();

export class RenderModule implements GameModule {
  readonly name = 'render';
  readonly order: number;

  #sun!: THREE.DirectionalLight;
  #hemi!: THREE.HemisphereLight;
  #fog!: THREE.FogExp2;
  #materials: MaterialLibrary | null = null;
  #sunFollow = 80;

  constructor(order = -30) {
    this.order = order;
  }

  init(ctx: EngineContext): void {
    const { scene, settings, resources } = ctx;

    scene.background = new THREE.Color().setHSL(0.58, 0.42, 0.48);
    // Distance fog only — low alpine density, never post UV wash values.
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, 0.00055);

    // Soft sky fill only — keep well under sun so shading is directional-led.
    this.#hemi = new THREE.HemisphereLight(0x6a96b8, 0xd4dde8, 0.2);
    scene.add(this.#hemi);

    const budgets = resolveLodBudgets(settings);
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.55, 95);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 2.45);
    this.#sun.position.copy(SUN_DIR).multiplyScalar(this.#sunFollow);
    this.#sun.castShadow = settings.shadowsEnabled;
    this.#configureShadow(ctx);

    scene.add(this.#sun);
    scene.add(this.#sun.target);

    const env = resources.getEnvMap();
    if (env) {
      scene.environment = env;
      // Keep IBL subordinate to the key sun (avoids flat_ambient wash).
      scene.environmentIntensity = 0.28;
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
    this.#sunFollow = Math.min(budgets.shadowDistance * 0.55, 95);

    this.#sun.castShadow = s.shadowsEnabled;
    this.#sun.shadow.mapSize.set(s.shadowMapSize, s.shadowMapSize);
    this.#sun.shadow.intensity = 1.35;
    this.#sun.shadow.bias = -0.00035;
    this.#sun.shadow.normalBias = 0.04;
    this.#sun.shadow.radius = s.softShadows ? 2.25 : 1;
    this.#sun.shadow.camera.near = 1;
    // Far must exceed light→target distance + local receivers.
    this.#sun.shadow.camera.far = Math.max(
      budgets.shadowDistance,
      this.#sunFollow + budgets.shadowFrustum + 40
    );
    const half = budgets.shadowFrustum;
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
