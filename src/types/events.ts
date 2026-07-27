import type { CourseId, GameModeId, GrabType, LandingGrade, Medal, TrickResult } from './gameplay.ts';

export type EventMap = {
  'game:ready': void;
  'engine:resized': { width: number; height: number; dpr: number };
  'engine:pointer-lock': { locked: boolean };
  'ui:navigate': { screen: string };
  'run:start': { courseId: CourseId; mode: GameModeId };
  /** Mode → run course boot — UI loading bar subscribes here. */
  'run:load-progress': { fraction: number; status: string };
  'run:checkpoint': { index: number; total: number };
  'run:finish': {
    courseId: CourseId;
    mode: GameModeId;
    time: number;
    score: number;
    medal: Medal;
  };
  'run:restart': void;
  'run:pause': { paused: boolean };
  'course:loaded': { courseId: CourseId; name: string; length: number };
  'course:checkpoint': {
    courseId: CourseId;
    checkpointId: string;
    index: number;
    total: number;
    position?: { x: number; y: number; z: number };
  };
  'course:finish': {
    courseId: CourseId;
    elapsed: number;
    checkpointsCleared: number;
    position?: { x: number; y: number; z: number };
  };
  'course:reset': { courseId: CourseId };
  'rider:spray': { intensity: number; surface: string };
  'rider:landing': { grade: LandingGrade; impact: number };
  'rider:crash': { reason: string };
  'rider:recover': void;
  /** Manual R / pad chord — snapped to path centerline at current pathT. */
  'rider:path-reset': void;
  'rider:trick': TrickResult;
  'rider:grind:start': void;
  'rider:grind:end': { duration: number };
  'rider:boost': { active: boolean };
  'rider:grab': { grab: GrabType };
  'score:popup': { text: string; points: number; x?: number; y?: number };
  'score:combo': { multiplier: number; banked: number };
  'audio:oneshot': { id: string; volume?: number };
  'settings:changed': void;
};

export type EventName = keyof EventMap;
export type EventPayload<K extends EventName> = EventMap[K];
export type EventHandler<K extends EventName> = (payload: EventPayload<K>) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  on<K extends EventName>(event: K, handler: EventHandler<K>): Unsubscribe;
  once<K extends EventName>(event: K, handler: EventHandler<K>): Unsubscribe;
  off<K extends EventName>(event: K, handler: EventHandler<K>): void;
  emit<K extends EventName>(
    ...args: EventPayload<K> extends void ? [event: K] : [event: K, payload: EventPayload<K>]
  ): void;
  clear(): void;
}
