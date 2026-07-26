import type { CourseId, GameModeId } from '@/types/gameplay.ts';

export type FlowScreen =
  | 'title'
  | 'course_select'
  | 'mode_select'
  | 'playing'
  | 'paused'
  | 'results';

export interface ModeDescriptor {
  id: GameModeId;
  label: string;
  description: string;
}

export const MODE_DESCRIPTORS: ModeDescriptor[] = [
  {
    id: 'freeride',
    label: 'Freeride',
    description: 'Explore the mountain — no timer, score tricks for fun.',
  },
  {
    id: 'time_trial',
    label: 'Time Trial',
    description: 'Hit every gate and race to the finish arch.',
  },
  {
    id: 'trick_attack',
    label: 'Trick Attack',
    description: 'Maximize score with combos, grinds, and clean landings.',
  },
];

export interface FlowState {
  screen: FlowScreen;
  courseId: CourseId;
  mode: GameModeId;
  paused: boolean;
  runActive: boolean;
}

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

  navigate(screen: FlowScreen): void {
    this.#screen = screen;
    if (screen === 'playing') {
      this.#paused = false;
      this.#runActive = true;
    }
    if (screen === 'title' || screen === 'course_select' || screen === 'mode_select') {
      this.#runActive = false;
      this.#paused = false;
    }
  }

  selectCourse(id: CourseId): void {
    this.#courseId = id;
    this.#screen = 'mode_select';
  }

  selectMode(mode: GameModeId): void {
    this.#mode = mode;
    this.#screen = 'playing';
    this.#runActive = true;
    this.#paused = false;
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    this.#screen = paused ? 'paused' : this.#runActive ? 'playing' : this.#screen;
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
    this.#screen = 'course_select';
  }

  backFromCourseSelect(): void {
    this.#screen = 'title';
  }
}
