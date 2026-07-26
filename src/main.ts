import { Engine } from '@/engine/Engine.ts';
import { RapierPhysics } from '@/engine/Physics.ts';
import { Resources } from '@/engine/Resources.ts';
import { ForwardPipeline } from '@/render/Pipeline.ts';
import { CaptureBridge, parseCaptureParams } from '@/engine/CaptureBridge.ts';
import { RenderModule } from '@/render/RenderModule.ts';
import { CourseModule } from '@/course/CourseModule.ts';
import { RiderModule } from '@/rider/RiderModule.ts';
import { CameraModule } from '@/camera/CameraModule.ts';
import { ScoreModule } from '@/score/ScoreModule.ts';
import { VfxModule } from '@/vfx/VfxModule.ts';
import { AudioModule } from '@/audio/AudioModule.ts';
import { UiModule } from '@/ui/UiModule.ts';
import { GameFlowModule } from '@/modes/GameFlowModule.ts';

function nextPresentedFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const ORDER = {
  render: -100,
  course: -40,
  flow: 5,
  rider: 10,
  score: 30,
  vfx: 35,
  audio: 40,
  ui: 50,
  camera: 60,
} as const;

function setStatus(text: string): void {
  const el = document.getElementById('loader-status');
  if (el) el.textContent = text;
}

function setProgress(fraction: number): void {
  const el = document.getElementById('bar-fill');
  if (el) el.style.width = `${Math.round(fraction * 100)}%`;
}

function showError(err: unknown): void {
  const box = document.getElementById('error');
  const text = document.getElementById('error-text');
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  if (text) text.textContent = message;
  box?.classList.add('visible');
  console.error(err);
}

async function main(): Promise<void> {
  const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('viewport canvas missing');

  const params = parseCaptureParams();

  const engine = new Engine({
    canvas,
    fixedHz: 120,
    seed: params.seed ?? 0xc0ffee,
    capture: params.capture,
  });
  engine.settings.load();

  const bridge = new CaptureBridge(engine);

  setStatus('Starting physics');
  const physics = new RapierPhysics();
  await physics.init();

  setStatus('Building pipeline');
  const pipeline = new ForwardPipeline(
    engine.renderer,
    Math.floor(window.innerWidth * Math.min(window.devicePixelRatio, 2)),
    Math.floor(window.innerHeight * Math.min(window.devicePixelRatio, 2))
  );

  const resources = new Resources(engine.renderer);
  engine.setServices({ pipeline, physics, resources });

  setStatus('Loading assets');
  await resources.preload((p) => {
    setProgress(p.total > 0 ? p.loaded / p.total : 1);
    setStatus(`Loading ${p.current}`);
  });

  const flow = new GameFlowModule();
  const ui = new UiModule();

  engine
    .add(new RenderModule(ORDER.render))
    .add(new CourseModule({ defaultCourseId: 'alpine' }))
    .add(flow)
    .add(new RiderModule(ORDER.rider))
    .add(new ScoreModule())
    .add(new VfxModule())
    .add(new AudioModule())
    .add(ui)
    .add(new CameraModule());

  setStatus('Compiling shaders');
  setProgress(0.96);
  await engine.boot();

  engine.renderer.compile(engine.scene, engine.camera);
  setProgress(1);

  if (import.meta.env.DEV) {
    (window as unknown as { engine: Engine }).engine = engine;
  }
  (window as unknown as { __flow: GameFlowModule }).__flow = flow;

  const loader = document.getElementById('loader');
  loader?.classList.add('hidden');

  if (params.capture) {
    loader?.remove();
    if (!params.hud) ui.setHud(false);
    await nextPresentedFrame();
    bridge.markReady();
    return;
  }

  await nextPresentedFrame();
  bridge.markReady();
  flow.goTitle();
}

main().catch(showError);
