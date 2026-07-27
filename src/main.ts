import { Engine } from '@/engine/Engine.ts';
import { RapierPhysics } from '@/engine/Physics.ts';
import { Resources } from '@/engine/Resources.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';
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
import {
  hideLoader,
  resetBootProgress,
  setPhaseProgress,
  setStatus,
} from '@/ui/bootLoader.ts';

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

function showError(err: unknown): void {
  const box = document.getElementById('error');
  const text = document.getElementById('error-text');
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  if (text) text.textContent = message;
  box?.classList.add('visible');
  console.error(err);
}

async function main(): Promise<void> {
  resetBootProgress();
  setStatus('Initialising renderer');
  setPhaseProgress('physics', 0);

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
  engine.input.setGamepadBindings(engine.settings.gamepadBindings);

  const bridge = new CaptureBridge(engine);

  setStatus('Starting physics');
  setPhaseProgress('physics', 0.15);
  const physics = new RapierPhysics();
  await physics.init();
  setPhaseProgress('physics', 1);

  setStatus('Building pipeline');
  setPhaseProgress('pipeline', 0.2);
  const pipeline = new ForwardPipeline(
    engine.renderer,
    Math.floor(window.innerWidth * Math.min(window.devicePixelRatio, 2)),
    Math.floor(window.innerHeight * Math.min(window.devicePixelRatio, 2))
  );
  setPhaseProgress('pipeline', 1);

  const resources = new Resources(engine.renderer);
  engine.setServices({ pipeline, physics, resources });

  setStatus('Loading assets');
  setPhaseProgress('assets', 0);
  const lod = resolveLodBudgets(engine.settings);
  await resources.preload(
    (p) => {
      const t = p.total > 0 ? p.loaded / p.total : 1;
      setPhaseProgress('assets', t);
      setStatus(p.current === 'done' ? 'Assets ready' : `Loading ${p.current}`);
    },
    { budgets: { textureSize: lod.textureSize, anisotropy: lod.anisotropy } }
  );
  setPhaseProgress('assets', 1);

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

  setStatus('Bootstrapping systems');
  setPhaseProgress('modules', 0);
  await engine.boot((name, index, total) => {
    const t = total > 0 ? index / total : 1;
    setPhaseProgress('modules', t);
    setStatus(`Starting ${name}`);
  });
  setPhaseProgress('modules', 1);

  setStatus('Compiling shaders');
  setPhaseProgress('shaders', 0.2);
  engine.renderer.compile(engine.scene, engine.camera);
  setPhaseProgress('shaders', 1);
  setStatus('Ready');

  if (import.meta.env.DEV) {
    (window as unknown as { engine: Engine }).engine = engine;
  }
  (window as unknown as { __flow: GameFlowModule }).__flow = flow;

  if (params.capture) {
    hideLoader(true);
    if (!params.hud) ui.setHud(false);
    await nextPresentedFrame();
    bridge.markReady();
    return;
  }

  hideLoader();
  await nextPresentedFrame();
  bridge.markReady();
  flow.goTitle();
}

main().catch(showError);
