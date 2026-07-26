import type { Color } from 'three';
import type { EngineContext } from './engine.ts';

export interface RenderPipeline {
  render(ctx: EngineContext): void;
  setSize(width: number, height: number, dpr: number): void;
  /** Post grade density only — never scene FogExp2 values. */
  setFog?(color: Color, density: number): void;
  dispose(): void;
}
