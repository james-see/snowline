import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId, Medal } from '@/types/gameplay.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { loadSave, markTutorialDone as persistTutorialDone, normalizeMode } from '@/score/SaveData.ts';
import { ModeController, type FlowScreen } from './ModeController.ts';
import { resetRunProgress, setRunProgress, yieldPaint } from '@/ui/runLoader.ts';

export type ScreenId = FlowScreen;

export class GameFlowModule implements GameModule {
  readonly name = 'flow';
  readonly order = 5;

  readonly controller = new ModeController();
  #ctx: EngineContext | null = null;
  /** True until UI consumes the one-time alpine tip. */
  #tutorialPending = false;
  /** Guards double-confirm while course boots. */
  #booting = false;

  lastResults: {
    time: number;
    score: number;
    medal: Medal | string;
    courseId: CourseId;
    mode: GameModeId;
  } | null = null;

  get screen(): ScreenId {
    return this.controller.screen;
  }
  set screen(s: ScreenId) {
    this.controller.screen = s;
  }

  get courseId(): CourseId {
    return this.controller.courseId;
  }
  set courseId(id: CourseId) {
    this.controller.courseId = id;
  }

  get mode(): GameModeId {
    return this.controller.mode;
  }
  set mode(m: GameModeId) {
    this.controller.mode = m;
  }

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    ctx.input.setLockout(true);

    ctx.events.on('run:finish', (payload) => {
      this.lastResults = payload;
      this.controller.finishRun();
      ctx.setTimeScale(0);
      ctx.input.setLockout(true);
      ctx.input.exitPointerLock();
      ctx.events.emit('ui:navigate', { screen: 'results' });
    });
  }

  /**
   * Clear lockout before rider fixedUpdate (order 10). UiModule also clears
   * during playing, but that runs after physics — too late for stick carve.
   */
  fixedUpdate(_dt: number, ctx: EngineContext): void {
    if (this.controller.screen === 'playing') {
      ctx.input.setLockout(false);
    }
  }

  update(_dt: number, ctx: EngineContext): void {
    const s = this.controller.screen;
    if (s === 'playing') {
      ctx.input.setLockout(false);
    }
    if ((s === 'playing' || s === 'paused') && ctx.input.wasPressed('pause')) {
      this.togglePause();
    }
  }

  goTitle(): void {
    this.controller.backToTitle();
    this.#ctx?.input.setLockout(true);
    this.#ctx?.input.exitPointerLock();
    this.#ctx?.setTimeScale(0);
    this.#ctx?.events.emit('ui:navigate', { screen: 'title' });
  }

  goCourseSelect(): void {
    this.controller.navigate('course');
    this.#ctx?.events.emit('ui:navigate', { screen: 'course' });
  }

  goModeSelect(courseId: CourseId): void {
    this.controller.selectCourse(courseId);
    this.#ctx?.events.emit('ui:navigate', { screen: 'mode' });
  }

  goSettings(): void {
    this.controller.goSettings();
    this.#ctx?.events.emit('ui:navigate', { screen: 'settings' });
  }

  /** title → course → mode → loading → run */
  async startRun(mode?: GameModeId): Promise<void> {
    const ctx = this.#ctx;
    if (!ctx || this.#booting) return;
    this.#booting = true;

    try {
      if (mode) this.controller.mode = normalizeMode(mode);

      const capture = !!ctx.capture;
      const course = ctx.getModule<CourseModule>('course');
      const rider = ctx.getModule<RiderModule>('rider');

      if (!capture) {
        this.controller.beginLoading();
        ctx.input.setLockout(true);
        ctx.setTimeScale(0);
        resetRunProgress();
        setRunProgress(0.02, 'Preparing line');
        ctx.events.emit('run:load-progress', { fraction: 0.02, status: 'Preparing line' });
        ctx.events.emit('ui:navigate', { screen: 'loading' });
        // Paint loading UI before the sync terrain/props hitches the main thread.
        await yieldPaint();
      }

      if (capture) {
        course?.loadCourse(this.courseId, ctx.physics);
      } else {
        await course?.loadCourseAsync(this.courseId, ctx.physics, (p) => {
          setRunProgress(p.fraction, p.status);
          ctx.events.emit('run:load-progress', p);
        });
      }

      // Re-attach rider body after clearWorld
      const spawn = course?.getSpawnPose();
      if (rider && spawn) {
        const pos = new THREE.Vector3(...spawn.position);
        rider.spawnAt(pos, spawn.yaw);
      }
      course?.resetRun();

      this.controller.selectMode(this.mode);
      ctx.setTimeScale(1);
      ctx.input.setLockout(false);
      if (!ctx.capture) ctx.input.requestPointerLock();

      const save = loadSave();
      this.#tutorialPending = !save.tutorialDone && this.courseId === 'alpine';

      ctx.events.emit('run:start', { courseId: this.courseId, mode: this.mode });
      ctx.events.emit('ui:navigate', { screen: 'playing' });
    } finally {
      this.#booting = false;
    }
  }

  togglePause(): void {
    const ctx = this.#ctx;
    const s = this.controller.screen;
    if (!ctx || (s !== 'playing' && s !== 'paused')) return;
    const next = s !== 'paused';
    this.controller.setPaused(next);
    ctx.setTimeScale(next ? 0 : 1);
    ctx.input.setLockout(next);
    if (next) ctx.input.exitPointerLock();
    else if (!ctx.capture) ctx.input.requestPointerLock();
    ctx.events.emit('run:pause', { paused: next });
    ctx.events.emit('ui:navigate', { screen: this.controller.screen });
  }

  /** results → restart same course/mode */
  restart(): void {
    void this.startRun(this.mode);
  }

  /** One-time alpine tip — true only for first alpine run. */
  shouldShowTutorialTip(): boolean {
    return this.#tutorialPending;
  }

  /** UI calls after showing tip; persists tutorialDone. */
  consumeTutorialTip(): boolean {
    if (!this.#tutorialPending) return false;
    this.#tutorialPending = false;
    this.markTutorialDone();
    return true;
  }

  markTutorialDone(): void {
    // Persist only for alpine (or after consumeTutorialTip cleared the pending flag).
    if (this.courseId !== 'alpine') return;
    this.#tutorialPending = false;
    persistTutorialDone();
  }
}
