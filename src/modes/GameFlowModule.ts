import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId } from '@/types/gameplay.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { loadSave, writeSave } from '@/score/SaveData.ts';

export type ScreenId =
  | 'title'
  | 'course'
  | 'mode'
  | 'playing'
  | 'paused'
  | 'results'
  | 'settings';

export class GameFlowModule implements GameModule {
  readonly name = 'flow';
  readonly order = 5;

  screen: ScreenId = 'title';
  courseId: CourseId = 'alpine';
  mode: GameModeId = 'freeride';
  #ctx: EngineContext | null = null;
  #paused = false;
  lastResults: {
    time: number;
    score: number;
    medal: string;
    courseId: CourseId;
    mode: GameModeId;
  } | null = null;

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    ctx.input.setLockout(true);

    ctx.events.on('run:finish', (payload) => {
      this.lastResults = payload;
      this.screen = 'results';
      ctx.input.setLockout(true);
      ctx.input.exitPointerLock();
      ctx.events.emit('ui:navigate', { screen: 'results' });
    });
  }

  update(_dt: number, ctx: EngineContext): void {
    if (this.screen === 'playing' && ctx.input.wasPressed('pause')) {
      this.togglePause();
    } else if (this.screen === 'paused' && ctx.input.wasPressed('pause')) {
      this.togglePause();
    }
  }

  goTitle(): void {
    this.screen = 'title';
    this.#ctx?.input.setLockout(true);
    this.#ctx?.events.emit('ui:navigate', { screen: 'title' });
  }

  goCourseSelect(): void {
    this.screen = 'course';
    this.#ctx?.events.emit('ui:navigate', { screen: 'course' });
  }

  goModeSelect(courseId: CourseId): void {
    this.courseId = courseId;
    this.screen = 'mode';
    this.#ctx?.events.emit('ui:navigate', { screen: 'mode' });
  }

  goSettings(): void {
    this.screen = 'settings';
    this.#ctx?.events.emit('ui:navigate', { screen: 'settings' });
  }

  startRun(mode?: GameModeId): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    if (mode) this.mode = mode;

    const course = ctx.getModule<CourseModule>('course');
    const rider = ctx.getModule<RiderModule>('rider');
    course?.loadCourse(this.courseId, ctx.physics);
    // Re-attach rider body after clearWorld
    const spawn = course?.getSpawnPose();
    if (rider && spawn) {
      const pos = new THREE.Vector3(...spawn.position);
      rider.spawnAt(pos, spawn.yaw);
    }
    course?.resetRun();

    this.screen = 'playing';
    this.#paused = false;
    ctx.setTimeScale(1);
    ctx.input.setLockout(false);
    if (!ctx.capture) ctx.input.requestPointerLock();

    const save = loadSave();
    if (!save.tutorialDone && this.courseId === 'alpine') {
      // first-run tip handled by UI
    }

    ctx.events.emit('run:start', { courseId: this.courseId, mode: this.mode });
    ctx.events.emit('ui:navigate', { screen: 'playing' });
  }

  togglePause(): void {
    const ctx = this.#ctx;
    if (!ctx || (this.screen !== 'playing' && this.screen !== 'paused')) return;
    this.#paused = !this.#paused;
    this.screen = this.#paused ? 'paused' : 'playing';
    ctx.setTimeScale(this.#paused ? 0 : 1);
    ctx.input.setLockout(this.#paused);
    if (this.#paused) ctx.input.exitPointerLock();
    else if (!ctx.capture) ctx.input.requestPointerLock();
    ctx.events.emit('run:pause', { paused: this.#paused });
    ctx.events.emit('ui:navigate', { screen: this.screen });
  }

  restart(): void {
    this.startRun(this.mode);
  }

  markTutorialDone(): void {
    const save = loadSave();
    save.tutorialDone = true;
    writeSave(save);
  }
}

