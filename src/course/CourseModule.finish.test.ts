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
  it('completes when pathT crosses finish.t even 50m+ from arch', () => {
    // Alpine probe: at terrain t=0.95 closest pathT≈0.97 but XZ dist≈52m —
    // prior plaza radius (45) rejected these void-bounce spots.
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 0.97,
        finishT: 0.97,
        distanceToFinish: 52,
        finishRadius: 280,
        approachT: 0.82,
      }),
      true
    );
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 1,
        finishT: 0.97,
        distanceToFinish: 56,
        finishRadius: 280,
        approachT: 0.82,
      }),
      true
    );
  });

  it('completes freeride end-zone void short of arch (CP cleared, timer stuck)', () => {
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 0.9,
        finishT: 0.97,
        distanceToFinish: 183,
        finishRadius: 280,
        approachT: 0.82,
        endZoneT: 0.79,
        inEndZoneVoid: true,
      }),
      true
    );
  });

  it('plaza covers Alpine last-checkpoint distance (~230 m)', () => {
    assert.equal(
      shouldCompleteRun({
        alreadyFinished: false,
        inFinishTrigger: false,
        pathT: 0.88,
        finishT: 0.97,
        distanceToFinish: 230,
        finishRadius: 280,
        approachT: 0.82,
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
    const bed = sampleTerrainAt(terrain, def.finish.t - 0.02, 0.5, new THREE.Vector3());
    riderPos.set(bed.x, bed.y - 4, bed.z);

    course.fixedUpdate(1 / 60, ctx);
    assert.equal(finished, true);
  });

  it('soft-completes when void-recovering past last checkpoint (freeride end bounce)', async () => {
    const events = new GameEventBus();
    let finished = false;
    events.on('course:finish', () => {
      finished = true;
    });

    const riderPos = new THREE.Vector3();
    const course = new CourseModule({ getRiderPosition: () => riderPos });
    const voidBoard = { voidRecovering: true };
    const ctx = {
      events,
      physics: stubPhysics(),
      scene: new THREE.Scene(),
      settings: {},
      getModule: (name: string) =>
        name === 'rider' ? { board: voidBoard, getPosition: () => riderPos, state: { position: riderPos } } : null,
    } as unknown as EngineContext;

    await course.init(ctx);
    course.loadCourse('alpine', stubPhysics());
    const def = course.getDefinition()!;
    const terrain = course.getTerrain()!;
    // ~pathT 0.90 — past CP5, ~180 m short of arch (screenshot bounce zone).
    const bed = sampleTerrainAt(terrain, 0.9, 0.5, new THREE.Vector3());
    riderPos.set(bed.x, bed.y - 6, bed.z);

    course.fixedUpdate(1 / 60, ctx);
    assert.equal(finished, true);
    assert.equal(course.getProgress().finished, true);
  });

  it('soft-completes void before last CP (legacy kill-plane bounce at t≈0.80)', async () => {
    const events = new GameEventBus();
    let finished = false;
    events.on('course:finish', () => {
      finished = true;
    });

    const riderPos = new THREE.Vector3();
    const course = new CourseModule({ getRiderPosition: () => riderPos });
    const voidBoard = { voidRecovering: true };
    const ctx = {
      events,
      physics: stubPhysics(),
      scene: new THREE.Scene(),
      settings: {},
      getModule: (name: string) =>
        name === 'rider' ? { board: voidBoard, getPosition: () => riderPos, state: { position: riderPos } } : null,
    } as unknown as EngineContext;

    await course.init(ctx);
    course.loadCourse('alpine', stubPhysics());
    const terrain = course.getTerrain()!;
    const bed = sampleTerrainAt(terrain, 0.8, 0.5, new THREE.Vector3());
    // Deep snow below the old −48 kill plane, still short of Village Approach CP.
    assert.ok(bed.y < -48);
    riderPos.set(bed.x, bed.y + 1.2, bed.z);

    course.fixedUpdate(1 / 60, ctx);
    assert.equal(finished, true);
  });

  it('finishes on Alpine last-checkpoint plaza without void', async () => {
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
    const lastCp = def.checkpoints[def.checkpoints.length - 1]!;
    const bed = sampleTerrainAt(terrain, lastCp.t, 0.5, new THREE.Vector3());
    riderPos.set(bed.x, bed.y + 1.2, bed.z);

    course.fixedUpdate(1 / 60, ctx);
    assert.equal(finished, true);
  });
});
