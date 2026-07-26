import type { EngineContext } from './engine.ts';

export interface RenderPipeline {
  render(ctx: EngineContext): void;
  setSize(width: number, height: number, dpr: number): void;
  dispose(): void;
}
