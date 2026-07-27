import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourseModule } from './CourseModule.ts';
import { sampleTerrainAt } from './TerrainGenerator.ts';
import { horizontalDistance, shouldCompleteRun } from './finishPolicy.ts';
import { GameEventBus } from '@/engine/EventBus.ts';
import type { EngineContext } from '@/types/engine.ts';
import type { PhysicsWorld } from '@/types/physics.ts';

/** Minimal canvas stub so finish banners can build under node:test. */
function stubDomCanvas(): void {
  if (typeof globalThis.document !== 'undefined') return;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: '',
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
      fillRect() {},
      fillText() {},
      clearRect() {},
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).document = {
    createElement: (tag: string) => (tag === 'canvas' ? canvas : {}),
  };
}

function stubPhysics(): PhysicsWorld {
  return {
    ready: false,
    clearWorld() {},
  } as unknown as PhysicsWorld;
}

describe('finish void-bounce regression', () => {
  it('completes when pathT is past approach and rider is near arch (old lateral gate failed)', () => {
    // Reproduced from alpine probe: closest.lateral ~22–74 near finish while
    // still on the race bed — pathT fallback used to reject these.
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 0.97,
        finishT: 0.97,
        distanceToFinish: 22,
        finishRadius: 28,
        approachT: 0.91,
      }),
      true
    );
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 0.95,
        finishT: 0.97,
        distanceToFinish: 18,
        finishRadius: 28,
        approachT: 0.91,
      }),
      true
    );
  });

  it('horizontalDistance ignores vertical sink from void wallow', () => {
    assert.equal(horizontalDistance(10, 20, 10, 20), 0);
    assert.ok(horizontalDistance(0, 0, 3, 4) === 5);
  });
});

describe('CourseModule finish', () => {
  before(() => stubDomCanvas());

  it('emits course:finish when rider is on the finish bed and stops the clock', async () => {
    const events = new GameEventBus();
    let finished = false;
    let elapsed = -1;
    events.on('course:finish', (p) => {
      finished = true;
      elapsed = p.elapsed;
    });

    const riderPos = new THREE.Vector3();
    const course = new CourseModule({ getRiderPosition: () => riderPos });
    const ctx = {
      events,
      physics: stubPhysics(),
      scene: new THREE.Scene(),
      settings: {},
      getModule: () => null,
    } as unknown as EngineContext;

    await course.init(ctx);
    course.loadCourse('alpine', stubPhysics());
    const def = course.getDefinition()!;
    const terrain = course.getTerrain()!;
    const bed = sampleTerrainAt(terrain, def.finish.t, 0.5, new THREE.Vector3());
    riderPos.set(bed.x, bed.y + 1.2, bed.z);

    for (let i = 0; i < 3; i++) course.fixedUpdate(1 / 60, ctx);

    assert.equal(finished, true);
    assert.ok(elapsed >= 0);
    assert.equal(course.getProgress().finished, true);

    const t0 = course.getProgress().elapsed;
    course.fixedUpdate(1, ctx);
    assert.equal(course.getProgress().elapsed, t0);
  });

  it('finishes when short of arch but inside approach plaza (void-bounce case)', async () => {
    const events = new GameEventBus();
    let finished = false;
    events.on('course:finish', () => {
      finished = true;
    });

    const riderPos = new THREE.Vector3();
    const course = new CourseModule({ getRiderPosition: () => riderPos });
    const ctx = {
      events,
      physics: stubPhysics(),
      scene: new THREE.Scene(),
      settings: {},
      getModule: () => null,
    } as unknown as EngineContext;

    await course.init(ctx);
    course.loadCourse('alpine', stubPhysics());
    const def = course.getDefinition()!;
    const terrain = course.getTerrain()!;
    const bed = sampleTerrainAt(terrain, def.finish.t - 0.015, 0.5, new THREE.Vector3());
    riderPos.set(bed.x, bed.y - 4, bed.z);

    course.fixedUpdate(1 / 60, ctx);
    assert.equal(finished, true);
  });
});
