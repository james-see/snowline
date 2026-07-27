import type { CourseId, GameModeId } from '@/types/gameplay.ts';
import { normalizeMode } from '@/score/SaveData.ts';

export type FlowScreen =
  | 'title'
  | 'course'
  | 'mode'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'results'
  | 'settings';

export interface ModeDescriptor {
  id: 'freeride' | 'time_trial' | 'trick_attack';
  label: string;
  description: string;
}

export const MODE_DESCRIPTORS: ModeDescriptor[] = [
  {
    id: 'freeride',
    label: 'Freeride',
    description: 'Ride end-to-end. Medals on time.',
  },
  {
    id: 'time_trial',
    label: 'Time Trial',
    description: 'Ghost the clock. Clean lines win.',
  },
  {
    id: 'trick_attack',
    label: 'Trick Attack',
    description: 'Bank style points. Variety pays.',
  },
];

export interface FlowState {
  screen: FlowScreen;
  courseId: CourseId;
  mode: GameModeId;
  paused: boolean;
  runActive: boolean;
}

/**
 * Pure navigation state for title → course → mode → run → results → restart.
 * GameFlowModule owns side effects (load course, pointer lock, events).
 */
export class ModeController {
  #screen: FlowScreen = 'title';
  #courseId: CourseId = 'alpine';
  #mode: GameModeId = 'freeride';
  #paused = false;
  #runActive = false;

  get state(): FlowState {
    return {
      screen: this.#screen,
      courseId: this.#courseId,
      mode: this.#mode,
      paused: this.#paused,
      runActive: this.#runActive,
    };
  }

  get screen(): FlowScreen {
    return this.#screen;
  }

  set screen(screen: FlowScreen) {
    this.navigate(screen);
  }

  get courseId(): CourseId {
    return this.#courseId;
  }

  set courseId(id: CourseId) {
    this.#courseId = id;
  }

  get mode(): GameModeId {
    return this.#mode;
  }

  set mode(mode: GameModeId) {
    this.#mode = normalizeMode(mode);
  }

  navigate(screen: FlowScreen): void {
    this.#screen = screen;
    if (screen === 'playing') {
      this.#paused = false;
      this.#runActive = true;
    } else if (screen === 'paused') {
      this.#paused = true;
      this.#runActive = true;
    } else if (screen === 'results') {
      this.#runActive = false;
      this.#paused = false;
    } else if (
      screen === 'title' ||
      screen === 'course' ||
      screen === 'mode' ||
      screen === 'loading' ||
      screen === 'settings'
    ) {
      this.#runActive = false;
      this.#paused = false;
    }
  }

  /** Mode confirmed — show load bar while course/physics boot. */
  beginLoading(): void {
    this.#screen = 'loading';
    this.#runActive = false;
    this.#paused = false;
  }

  selectCourse(id: CourseId): void {
    this.#courseId = id;
    this.#screen = 'mode';
    this.#runActive = false;
    this.#paused = false;
  }

  selectMode(mode: GameModeId): void {
    this.#mode = normalizeMode(mode);
    this.#screen = 'playing';
    this.#runActive = true;
    this.#paused = false;
  }

  setPaused(paused: boolean): void {
    if (!this.#runActive && this.#screen !== 'paused' && this.#screen !== 'playing') return;
    this.#paused = paused;
    this.#screen = paused ? 'paused' : 'playing';
  }

  finishRun(): void {
    this.#runActive = false;
    this.#paused = false;
    this.#screen = 'results';
  }

  restartRun(): void {
    this.#screen = 'playing';
    this.#runActive = true;
    this.#paused = false;
  }

  backToTitle(): void {
    this.#screen = 'title';
    this.#runActive = false;
    this.#paused = false;
  }

  backFromModeSelect(): void {
    this.#screen = 'course';
    this.#runActive = false;
    this.#paused = false;
  }

  backFromCourseSelect(): void {
    this.#screen = 'title';
    this.#runActive = false;
    this.#paused = false;
  }

  goSettings(): void {
    this.#screen = 'settings';
    this.#runActive = false;
    this.#paused = false;
  }
}
