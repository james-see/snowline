import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { MaterialLibrary } from '@/render/materials/index.ts';

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

    scene.background = new THREE.Color().setHSL(0.58, 0.35, 0.72);
    scene.fog = this.#fog = new THREE.FogExp2(SKY_HORIZON, 0.00085);

    this.#hemi = new THREE.HemisphereLight(SKY_HORIZON, 0xdde8f0, 0.55);
    scene.add(this.#hemi);

    this.#sun = new THREE.DirectionalLight(SUN_COLOR, 1.35);
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
    // Post-stack "fog" is a mild vertical grade, not distance fog — keep it low.
    pipeline.setFog?.(new THREE.Color(SKY_HORIZON), 0.08);
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
