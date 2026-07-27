import type { Engine } from './Engine.ts';
import type { InputAction } from '@/types/input.ts';
import type { GameFlowModule } from '@/modes/GameFlowModule.ts';
import type { UiModule } from '@/ui/UiModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CameraModule } from '@/camera/CameraModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import { lateralToU, sampleTerrainAt } from '@/course/TerrainGenerator.ts';
import type { CourseId, GameModeId } from '@/types/gameplay.ts';
import * as THREE from 'three';

const _placeBed = new THREE.Vector3();
const _placeTan = new THREE.Vector3();

export interface ShotPreset {
  id: string;
  intent: string;
  warmup?: number;
  setup?: () => Promise<void> | void;
}

export interface CaptureApi {
  ready(): Promise<void>;
  presets(): ShotPreset[];
  setShot(id: string): Promise<void>;
  step(frames: number, deltaSeconds?: number): void;
  converge(frames?: number): void;
  hold(maxFrames?: number): { frames: number; stable: boolean };
  stats(): { mean: number; low1: number; max: number; calls: number; triangles: number };
  perform(actions: string[], frames: number, settleFrames?: number): void;
  setHud(visible: boolean): void;
  setSetting(key: string, value: unknown): void;
  startRun(courseId?: CourseId, mode?: GameModeId): void;
  /** Place rider at the finish arch and step until results (or timeout). */
  finishRun(maxFrames?: number): { finished: boolean; frames: number; screen: string };
  readonly version: string;
}

const CONVERGE_FRAMES = 48;
const HOLD_MAX_FRAMES = 180;
const HOLD_STABLE_RUNS = 3;
const HOLD_SAMPLE_INTERVAL = 4;

declare global {
  interface Window {
    __snowline?: CaptureApi;
    __READY?: boolean;
  }
}

export function parseCaptureParams(): {
  capture: boolean;
  seed?: number;
  hud: boolean;
  shot?: string;
} {
  const q = new URLSearchParams(location.search);
  return {
    capture: q.get('capture') === '1',
    seed: q.has('seed') ? Number(q.get('seed')) : undefined,
    hud: q.get('hud') !== '0',
    shot: q.get('shot') ?? undefined,
  };
}

export class CaptureBridge {
  #engine: Engine;
  #ready = false;
  #readyWaiters: Array<() => void> = [];
  #presets: ShotPreset[] = [];

  constructor(engine: Engine) {
    this.#engine = engine;
    this.#presets = this.#buildPresets();
    const api: CaptureApi = {
      ready: () =>
        this.#ready
          ? Promise.resolve()
          : new Promise((resolve) => this.#readyWaiters.push(resolve)),
      presets: () => this.#presets,
      setShot: (id) => this.setShot(id),
      step: (frames, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) this.#engine.stepManual(dt);
      },
      converge: (frames = CONVERGE_FRAMES) => {
        this.#engine.pinFrame(false);
        this.#engine.setTimeScale(0);
        for (let i = 0; i < frames; i++) this.#engine.stepManual(0);
      },
      hold: (maxFrames = HOLD_MAX_FRAMES) => this.#hold(maxFrames),
      stats: () => this.#engine.perf.sample(),
      perform: (actions, frames, settle = 12) => this.#perform(actions, frames, settle),
      setHud: (visible) => {
        this.#engine.ctx.getModule<UiModule>('ui')?.setHud(visible);
      },
      setSetting: (key, value) => {
        (this.#engine.settings as unknown as Record<string, unknown>)[key] = value;
      },
      startRun: (courseId = 'alpine', mode = 'freeride') => {
        const flow = this.#engine.ctx.getModule<GameFlowModule>('flow');
        if (!flow) return;
        flow.courseId = courseId;
        flow.startRun(mode);
        this.#engine.setTimeScale(1);
      },
      finishRun: (maxFrames = 90) => this.#finishRun(maxFrames),
      version: '1.0.0',
    };
    window.__snowline = api;
  }

  markReady(): void {
    this.#ready = true;
    window.__READY = true;
    for (const w of this.#readyWaiters) w();
    this.#readyWaiters = [];
  }

  async setShot(id: string): Promise<void> {
    const preset = this.#presets.find((p) => p.id === id);
    if (!preset) throw new Error(`Unknown shot ${id}`);
    this.#engine.pinFrame(false);
    this.#engine.setTimeScale(1);
    await preset.setup?.();
    if (preset.warmup) {
      for (let i = 0; i < preset.warmup; i++) this.#engine.stepManual(1 / 60);
    }
    this.#engine.setTimeScale(0);
    for (let i = 0; i < CONVERGE_FRAMES; i++) this.#engine.stepManual(0);
  }

  #hold(maxFrames: number): { frames: number; stable: boolean } {
    this.#engine.pinFrame(true);
    this.#engine.setTimeScale(0);
    let stableRuns = 0;
    let frames = 0;
    let last: Uint8Array | null = null;
    const gl = this.#engine.renderer.getContext();
    const w = 64;
    const h = 64;
    const buf = new Uint8Array(w * h * 4);

    while (frames < maxFrames) {
      for (let i = 0; i < HOLD_SAMPLE_INTERVAL; i++) {
        this.#engine.stepManual(0);
        frames++;
      }
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      if (last && buf.every((v, i) => v === last![i])) {
        stableRuns++;
        if (stableRuns >= HOLD_STABLE_RUNS) return { frames, stable: true };
      } else {
        stableRuns = 0;
        last = buf.slice();
      }
    }
    return { frames, stable: false };
  }

  /**
   * Smoke path: teleport onto the finish bed and step until GameFlow hits results.
   * Proves course:finish → run:finish → timeScale 0 without riding the full line.
   */
  #finishRun(maxFrames: number): { finished: boolean; frames: number; screen: string } {
    const ctx = this.#engine.ctx;
    const flow = ctx.getModule<GameFlowModule>('flow');
    const course = ctx.getModule<CourseModule>('course');
    const rider = ctx.getModule<RiderModule>('rider');
    if (!flow || !course || !rider) {
      return { finished: false, frames: 0, screen: flow?.screen ?? 'none' };
    }

    if (flow.screen !== 'playing' && flow.screen !== 'paused') {
      flow.courseId = flow.courseId || 'alpine';
      flow.startRun(flow.mode || 'freeride');
    }

    const def = course.getDefinition();
    const terrain = course.getTerrain();
    const path = course.getPath();
    if (!def || !terrain || !path) {
      return { finished: false, frames: 0, screen: flow.screen };
    }

    const bed = sampleTerrainAt(terrain, def.finish.t, 0.5, new THREE.Vector3());
    const tan = path.tangent(def.finish.t);
    const yaw = Math.atan2(-tan.x, -tan.z);
    rider.spawnAt(new THREE.Vector3(bed.x, bed.y + 1.2, bed.z), yaw);

    this.#engine.pinFrame(false);
    this.#engine.setTimeScale(1);
    let frames = 0;
    while (frames < maxFrames && flow.screen !== 'results') {
      this.#engine.stepManual(1 / 60);
      frames++;
    }
    return {
      finished: flow.screen === 'results' || course.getProgress().finished,
      frames,
      screen: flow.screen,
    };
  }

  #perform(actions: string[] | InputAction[], frames: number, settle: number): void {
    this.#engine.pinFrame(false);
    this.#engine.setTimeScale(1);
    const mapped = this.#mapMacroActions(actions as string[]);
    // Segment macros that need sequenced phases
    if (mapped.phases.length > 0) {
      for (const phase of mapped.phases) {
        this.#engine.input.inject?.(phase.actions, true);
        for (let i = 0; i < phase.frames; i++) this.#engine.stepManual(1 / 60);
        this.#engine.input.inject?.(phase.actions, false);
      }
    } else {
      this.#engine.input.inject?.(mapped.hold, true);
      for (let i = 0; i < frames; i++) this.#engine.stepManual(1 / 60);
      this.#engine.input.inject?.(mapped.hold, false);
    }
    for (let i = 0; i < settle; i++) this.#engine.stepManual(1 / 60);
  }

  /**
   * Capture helper: drop the rider on the run at pathT/lateral with downhill speed.
   * Used so grind frames the early park cluster instead of the empty start apron.
   */
  #placeOnPath(pathT: number, lateral: number, speed: number): void {
    const ctx = this.#engine.ctx;
    const course = ctx.getModule<CourseModule>('course');
    const rider = ctx.getModule<RiderModule>('rider');
    const path = course?.getPath();
    const terrain = course?.getTerrain();
    if (!course || !rider || !path || !terrain) return;

    const t = THREE.MathUtils.clamp(pathT, 0.02, 0.98);
    const u = lateralToU(lateral, terrain.meshWidth);
    sampleTerrainAt(terrain, t, u, _placeBed);
    path.tangent(t, _placeTan);
    _placeTan.y = 0;
    if (_placeTan.lengthSq() < 1e-8) _placeTan.set(0, 0, 1);
    else _placeTan.normalize();

    const yaw = Math.atan2(-_placeTan.x, -_placeTan.z);
    rider.spawnAt(new THREE.Vector3(_placeBed.x, _placeBed.y + 1.2, _placeBed.z), yaw);
    rider.board.velocity.set(_placeTan.x * speed, -2, _placeTan.z * speed);
    ctx.getModule<CameraModule>('camera')?.resnap(ctx);
  }

  #mapMacroActions(actions: string[]): {
    hold: InputAction[];
    phases: Array<{ actions: InputAction[]; frames: number }>;
  } {
    const hold = new Set<InputAction>();
    const phases: Array<{ actions: InputAction[]; frames: number }> = [];
    const direct: InputAction[] = [
      'steerLeft',
      'steerRight',
      'lean',
      'jump',
      'brake',
      'boost',
      'grabIndy',
      'grabMute',
      'grabMelon',
      'grabMethod',
      'spinLeft',
      'spinRight',
      'flipFront',
      'flipBack',
    ];

    for (const a of actions) {
      if ((direct as string[]).includes(a)) {
        hold.add(a as InputAction);
        continue;
      }
      switch (a) {
        case 'carve':
          hold.add('steerRight');
          hold.add('lean');
          break;
        case 'hard_carve':
          hold.add('steerLeft');
          hold.add('lean');
          hold.add('boost');
          break;
        case 'tuck':
          hold.add('boost');
          break;
        case 'spin_360':
        case 'spin_180':
          phases.push({ actions: ['jump'], frames: 6 });
          phases.push({
            actions: ['spinRight'],
            frames: a === 'spin_360' ? 40 : 22,
          });
          break;
        case 'flip_back':
          phases.push({ actions: ['jump'], frames: 6 });
          phases.push({ actions: ['flipBack'], frames: 40 });
          break;
        case 'grab_indy':
          phases.push({ actions: ['jump'], frames: 6 });
          phases.push({ actions: ['grabIndy'], frames: 36 });
          break;
        case 'grind':
          hold.add('steerRight');
          hold.add('boost');
          break;
        case 'land_clean':
          // hold neutral after prior jump/spin phases
          break;
        case 'land_sketchy':
          phases.push({ actions: ['jump'], frames: 6 });
          phases.push({ actions: ['flipFront', 'spinLeft'], frames: 45 });
          break;
        case 'crash':
          phases.push({ actions: ['jump'], frames: 6 });
          phases.push({ actions: ['flipFront', 'spinRight', 'spinLeft'], frames: 50 });
          break;
        case 'boost_pad':
          hold.add('boost');
          break;
        default:
          break;
      }
    }
    return { hold: [...hold], phases };
  }

  #buildPresets(): ShotPreset[] {
    const run = async (course: CourseId = 'alpine'): Promise<void> => {
      const flow = this.#engine.ctx.getModule<GameFlowModule>('flow')!;
      flow.courseId = course;
      flow.startRun('freeride');
      this.#engine.setTimeScale(1);
      for (let i = 0; i < 90; i++) this.#engine.stepManual(1 / 60);
      // Lock midfield-fill chase (B8) after settle — avoid empty far-corridor drift.
      this.#engine.ctx.getModule<CameraModule>('camera')?.resnap(this.#engine.ctx);
    };

    return [
      {
        id: 'title',
        intent: 'Title screen brand presence',
        setup: () => {
          this.#engine.ctx.getModule<GameFlowModule>('flow')?.goTitle();
        },
      },
      {
        id: 'course_select',
        intent: 'Course selection',
        setup: () => this.#engine.ctx.getModule<GameFlowModule>('flow')?.goCourseSelect(),
      },
      {
        id: 'course_start',
        intent: 'Alpine start gate',
        setup: () => run('alpine'),
        warmup: 30,
      },
      {
        id: 'carve',
        intent: 'Normal carving',
        setup: async () => {
          await run('alpine');
          this.#perform(['steerRight', 'lean'], 90, 20);
        },
      },
      {
        id: 'hard_carve',
        intent: 'Hard carve with spray',
        setup: async () => {
          await run('alpine');
          this.#perform(['steerLeft', 'lean', 'boost'], 100, 10);
        },
      },
      {
        id: 'max_speed',
        intent: 'Maximum-speed descent',
        setup: async () => {
          await run('alpine');
          const rider = this.#engine.ctx.getModule<RiderModule>('rider');
          if (rider) rider.board.velocity.set(0, -5, 45);
          this.#perform(['boost'], 120, 10);
        },
      },
      {
        id: 'jump_takeoff',
        intent: 'Jump takeoff',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 8, 20);
        },
      },
      {
        id: 'midair_spin',
        intent: 'Midair spin',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 6, 4);
          this.#perform(['spinRight'], 40, 10);
        },
      },
      {
        id: 'midair_flip',
        intent: 'Midair flip',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 6, 4);
          this.#perform(['flipFront'], 40, 10);
        },
      },
      {
        id: 'grab',
        intent: 'Grab pose',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 6, 4);
          this.#perform(['grabIndy'], 35, 8);
        },
      },
      {
        id: 'grind',
        intent: 'Rail grind — early park cluster in chase frustum',
        setup: async () => {
          await run('alpine');
          // Uphill of rail-early (pathT 0.105 / lateral 14); approach from inside.
          this.#placeOnPath(0.09, 10, 18);
          this.#perform(['steerRight', 'boost'], 36, 6);
          this.#engine.ctx.getModule<CameraModule>('camera')?.resnap(this.#engine.ctx);
        },
      },
      {
        id: 'perfect_landing',
        intent: 'Perfect landing',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 6, 50);
        },
      },
      {
        id: 'failed_landing',
        intent: 'Failed landing / crash',
        setup: async () => {
          await run('alpine');
          this.#perform(['jump'], 6, 4);
          this.#perform(['flipFront', 'spinLeft'], 55, 40);
        },
      },
      {
        id: 'crash',
        intent: 'Crash state',
        setup: async () => {
          await run('alpine');
          const rider = this.#engine.ctx.getModule<RiderModule>('rider');
          if (rider) {
            rider.board.crashed = true;
            rider.board.velocity.set(0, -20, 10);
          }
        },
      },
      {
        id: 'boost',
        intent: 'Boost activation',
        setup: async () => {
          await run('alpine');
          this.#perform(['boost'], 60, 10);
        },
      },
      {
        id: 'forest',
        intent: 'Timberline forest section',
        setup: () => run('timberline'),
        warmup: 120,
      },
      {
        id: 'summit',
        intent: 'Summit extreme section',
        setup: () => run('summit'),
        warmup: 120,
      },
      {
        id: 'pause',
        intent: 'Pause menu',
        setup: async () => {
          await run('alpine');
          this.#engine.ctx.getModule<GameFlowModule>('flow')?.togglePause();
        },
      },
      {
        id: 'results',
        intent: 'Results screen',
        setup: () => {
          const flow = this.#engine.ctx.getModule<GameFlowModule>('flow')!;
          flow.lastResults = {
            time: 102.4,
            score: 12800,
            medal: 'gold',
            courseId: 'alpine',
            mode: 'freeride',
          };
          flow.controller.finishRun();
          this.#engine.setTimeScale(0);
          this.#engine.ctx.events.emit('ui:navigate', { screen: 'results' });
        },
      },
      {
        id: 'settings',
        intent: 'Settings screen',
        setup: () => this.#engine.ctx.getModule<GameFlowModule>('flow')?.goSettings(),
      },
    ];
  }
}
