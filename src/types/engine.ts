import type * as THREE from 'three';
import type { EventBus } from './events.ts';
import type { InputState } from './input.ts';
import type { ResourceManager } from './assets.ts';
import type { QualitySettings } from './settings.ts';
import type { RenderPipeline } from './render.ts';
import type { PhysicsWorld } from './physics.ts';
import type { Rng } from './rng.ts';

export interface TimeState {
  readonly elapsed: number;
  readonly delta: number;
  readonly rawDelta: number;
  readonly fixedDelta: number;
  readonly alpha: number;
  readonly scale: number;
  readonly frame: number;
  readonly tick: number;
}

export interface EngineContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly time: TimeState;
  readonly input: InputState;
  readonly events: EventBus;
  readonly resources: ResourceManager;
  readonly settings: QualitySettings;
  readonly physics: PhysicsWorld;
  readonly pipeline: RenderPipeline;
  readonly rng: Rng;
  readonly viewport: { width: number; height: number; dpr: number };
  readonly capture: boolean;
  getModule<T extends GameModule>(name: string): T | undefined;
  setTimeScale(scale: number): void;
}

export interface GameModule {
  readonly name: string;
  readonly order?: number;
  init(ctx: EngineContext): Promise<void> | void;
  fixedUpdate?(dt: number, ctx: EngineContext): void;
  update?(dt: number, ctx: EngineContext): void;
  lateUpdate?(dt: number, ctx: EngineContext): void;
  dispose?(): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  fixedHz?: number;
  maxFrameTime?: number;
  seed?: number;
  capture?: boolean;
}
