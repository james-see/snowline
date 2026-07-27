import * as THREE from 'three';
import type { EngineContext, EngineOptions, GameModule, TimeState } from '@/types/engine.ts';
import type { RenderPipeline } from '@/types/render.ts';
import type { PhysicsWorld } from '@/types/physics.ts';
import type { ResourceManager } from '@/types/assets.ts';
import { GameEventBus } from './EventBus.ts';
import { Input } from './Input.ts';
import { Settings } from './Settings.ts';
import { SeededRng } from './Rng.ts';
import { PerfHud } from './PerfHud.ts';

class MutableTime implements TimeState {
  elapsed = 0;
  delta = 0;
  rawDelta = 0;
  fixedDelta: number;
  alpha = 0;
  scale = 1;
  frame = 0;
  tick = 0;

  constructor(fixedDelta: number) {
    this.fixedDelta = fixedDelta;
  }
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  readonly events = new GameEventBus();
  readonly input: Input;
  readonly settings = new Settings();
  readonly rng: SeededRng;
  readonly time: MutableTime;
  readonly viewport = { width: 1, height: 1, dpr: 1 };
  readonly capture: boolean;

  pipeline!: RenderPipeline;
  physics!: PhysicsWorld;
  resources!: ResourceManager;

  #modules: GameModule[] = [];
  #moduleByName = new Map<string, GameModule>();
  #accumulator = 0;
  #lastTime = 0;
  #rafId = 0;
  #running = false;
  #framePinned = false;
  #maxFrameTime: number;
  #perf: PerfHud;
  #ctx: EngineContext;
  #resizeObserver: ResizeObserver | null = null;

  constructor(options: EngineOptions) {
    const fixedHz = options.fixedHz ?? 120;
    this.time = new MutableTime(1 / fixedHz);
    this.#maxFrameTime = options.maxFrameTime ?? 0.25;
    this.capture = options.capture ?? false;
    this.rng = new SeededRng(options.seed ?? (Math.random() * 0xffffffff) >>> 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.capture,
    });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed as a distinct mode in recent Three.js;
    // PCFShadowMap is the supported soft-PCF path.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.2, 4000);
    this.scene.name = 'world';
    this.scene.background = new THREE.Color(0x87b8d8);

    this.input = new Input(options.canvas, this.events);
    this.#perf = new PerfHud(this.renderer);

    this.#ctx = {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      time: this.time,
      input: this.input,
      events: this.events,
      resources: null as unknown as ResourceManager,
      settings: this.settings,
      physics: null as unknown as PhysicsWorld,
      pipeline: null as unknown as RenderPipeline,
      rng: this.rng,
      viewport: this.viewport,
      capture: this.capture,
      getModule: <T extends GameModule>(name: string): T | undefined =>
        this.#moduleByName.get(name) as T | undefined,
      setTimeScale: (scale: number) => {
        this.time.scale = scale;
      },
    };

    this.#observeResize(options.canvas);
  }

  get ctx(): EngineContext {
    return this.#ctx;
  }

  get perf(): PerfHud {
    return this.#perf;
  }

  add(module: GameModule): this {
    if (this.#moduleByName.has(module.name)) {
      throw new Error(`[Engine] duplicate module "${module.name}"`);
    }
    this.#moduleByName.set(module.name, module);
    this.#modules.push(module);
    return this;
  }

  setServices(services: {
    pipeline: RenderPipeline;
    physics: PhysicsWorld;
    resources: ResourceManager;
  }): void {
    this.pipeline = services.pipeline;
    this.physics = services.physics;
    this.resources = services.resources;
    const mutable = this.#ctx as {
      pipeline: RenderPipeline;
      physics: PhysicsWorld;
      resources: ResourceManager;
    };
    mutable.pipeline = services.pipeline;
    mutable.physics = services.physics;
    mutable.resources = services.resources;
  }

  async boot(
    onProgress?: (name: string, index: number, total: number) => void
  ): Promise<void> {
    this.#modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.#resize();
    const total = this.#modules.length;
    for (let i = 0; i < total; i++) {
      const module = this.#modules[i]!;
      onProgress?.(module.name, i, total);
      await module.init(this.#ctx);
    }
    onProgress?.('ready', total, total);
    this.events.emit('game:ready');
    if (this.capture) this.time.scale = 0;
    this.start();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#accumulator = 0;
    const loop = (now: number): void => {
      this.#rafId = requestAnimationFrame(loop);
      this.#frame(now);
    };
    this.#rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
  }

  stepManual(deltaSeconds: number): void {
    this.#advance(deltaSeconds);
  }

  pinFrame(pinned: boolean): void {
    this.#framePinned = pinned;
  }

  setTimeScale(scale: number): void {
    this.time.scale = scale;
  }

  #frame(now: number): void {
    const rawDelta = (now - this.#lastTime) / 1000;
    this.#lastTime = now;
    this.#advance(rawDelta);
  }

  #advance(rawDelta: number): void {
    this.#perf.beginFrame();
    this.renderer.info.reset();

    const time = this.time;
    time.rawDelta = rawDelta;
    const delta = Math.min(rawDelta, this.#maxFrameTime) * time.scale;
    time.delta = delta;
    time.elapsed += delta;
    if (!this.#framePinned) time.frame++;

    this.input.beginFrame();

    this.#accumulator += delta;
    const fixed = time.fixedDelta;
    let steps = 0;
    const maxSteps = 8;
    while (this.#accumulator >= fixed && steps < maxSteps) {
      this.physics?.beginTick();
      for (const m of this.#modules) m.fixedUpdate?.(fixed, this.#ctx);
      this.physics?.step(fixed);
      this.#accumulator -= fixed;
      time.tick++;
      steps++;
    }
    if (steps >= maxSteps) this.#accumulator = 0;
    time.alpha = this.#accumulator / fixed;

    for (const m of this.#modules) m.update?.(delta, this.#ctx);
    for (const m of this.#modules) m.lateUpdate?.(delta, this.#ctx);

    this.pipeline.render(this.#ctx);

    this.input.endFrame();
    this.#perf.endFrame(this.settings.showPerfHud);
  }

  #observeResize(canvas: HTMLCanvasElement): void {
    const parent = canvas.parentElement ?? document.body;
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(parent);
    window.addEventListener('resize', () => this.#resize());
  }

  #resize(): void {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement ?? document.body;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, this.settings.maxPixelRatio);
    const width = Math.max(1, Math.floor(rect.width * this.settings.renderScale));
    const height = Math.max(1, Math.floor(rect.height * this.settings.renderScale));

    if (
      width === this.viewport.width &&
      height === this.viewport.height &&
      dpr === this.viewport.dpr
    ) {
      return;
    }

    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.dpr = dpr;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(
      Math.max(1, Math.floor(rect.width)),
      Math.max(1, Math.floor(rect.height)),
      false
    );

    this.camera.aspect = rect.width / Math.max(1, rect.height);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();

    this.pipeline?.setSize(width, height, dpr);
    this.events.emit('engine:resized', { width, height, dpr });
  }

  dispose(): void {
    this.stop();
    for (const m of this.#modules) m.dispose?.();
    this.#modules = [];
    this.#moduleByName.clear();
    this.pipeline?.dispose();
    this.physics?.dispose();
    this.resources?.dispose();
    this.input.dispose();
    this.events.clear();
    this.#resizeObserver?.disconnect();
    this.#perf.dispose();
    this.renderer.dispose();
  }
}
