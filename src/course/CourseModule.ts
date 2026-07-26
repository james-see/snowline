import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseDef, CourseProgress, TerrainBuildResult } from '@/types/course.ts';
import type { CourseId } from '@/types/gameplay.ts';
import type { PhysicsWorld, RigidBodyHandle } from '@/types/physics.ts';
import { SeededRng } from '@/engine/Rng.ts';
import { SplinePath } from '@/course/SplinePath.ts';
import { buildTerrain } from '@/course/TerrainGenerator.ts';
import { getCourseDef } from '@/course/CourseDefs.ts';
import {
  buildCourseProps,
  registerPropsPhysics,
  type PropTrigger,
  type PropsBuildResult,
} from '@/course/Props.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';

const _playerPos = new THREE.Vector3();

export interface CourseModuleOptions {
  defaultCourseId?: CourseId;
  getRiderPosition?: () => THREE.Vector3 | null;
}

export class CourseModule implements GameModule {
  readonly name = 'course';
  readonly order = -40;

  #root = new THREE.Group();
  #ctx: EngineContext | null = null;
  #def: CourseDef | null = null;
  #path: SplinePath | null = null;
  #terrain: TerrainBuildResult | null = null;
  #props: PropsBuildResult | null = null;
  #triggers: PropTrigger[] = [];
  #terrainBody: RigidBodyHandle | null = null;
  #getRiderPosition: (() => THREE.Vector3 | null) | null = null;

  #nextCheckpoint = 0;
  #finished = false;
  #runElapsed = 0;
  #pathT = 0;

  constructor(private readonly options: CourseModuleOptions = {}) {
    this.#getRiderPosition = options.getRiderPosition ?? null;
  }

  async init(ctx: EngineContext): Promise<void> {
    this.#ctx = ctx;
    this.#root.name = 'course';
    this.#root.visible = false;
    ctx.scene.add(this.#root);
    // Defer heavy course build until a run starts — title stays clean.
  }

  loadCourse(id: CourseId, physics?: PhysicsWorld): CourseDef {
    const ctx = this.#ctx;
    const world = physics ?? ctx?.physics;
    this.#clearVisual();
    world?.clearWorld();

    const def = getCourseDef(id);
    const path = new SplinePath(def.controlPoints);
    const rng = new SeededRng(def.seed);
    const terrain = buildTerrain({ course: def, path, rng });
    const props = buildCourseProps(def.props, path, def.checkpoints);

    this.#root.add(terrain.mesh);
    this.#root.add(props.root);

    if (world?.ready) {
      // Trimesh from the authored visual mesh — more reliable than heightfield
      // parameter conventions across Rapier versions, and matches the slope
      // the player sees.
      const geo = terrain.mesh.geometry;
      const posAttr = geo.getAttribute('position');
      const idx = geo.getIndex();
      if (posAttr && idx) {
        const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
        const indices = new Uint32Array(idx.array as ArrayLike<number>);
        this.#terrainBody = world.createTrimesh(
          vertices,
          indices,
          new THREE.Vector3(0, 0, 0),
          'packed',
          'terrain'
        );
      }
      registerPropsPhysics(world, def.props, props.root);
    }

    this.#def = def;
    this.#path = path;
    this.#terrain = terrain;
    this.#props = props;
    this.#triggers = props.triggers;
    this.#root.visible = true;
    this.resetRun();

    // Snap authored spawn onto the spline bed so the rider never starts off-mesh.
    if (this.#path) {
      const bed = this.#path.sample(0.02);
      def.spawn = {
        ...def.spawn,
        position: [bed.x, bed.y + 1.2, bed.z],
        yaw: Math.atan2(-this.#path.tangent(0.02).x, -this.#path.tangent(0.02).z),
      };
    }

    ctx?.events.emit('course:loaded', {
      courseId: def.id,
      name: def.name,
      length: def.length,
    });

    return def;
  }

  getProgress(): CourseProgress {
    return {
      courseId: this.#def?.id ?? null,
      nextCheckpointIndex: this.#nextCheckpoint,
      checkpointsCleared: this.#nextCheckpoint,
      totalCheckpoints: this.#def?.checkpoints.length ?? 0,
      finished: this.#finished,
      elapsed: this.#runElapsed,
      pathT: this.#pathT,
    };
  }

  resetRun(): void {
    this.#nextCheckpoint = 0;
    this.#finished = false;
    this.#runElapsed = 0;
    this.#pathT = 0;
    if (this.#def) {
      this.#ctx?.events.emit('course:reset', { courseId: this.#def.id });
    }
  }

  getSpawnPose(): CourseDef['spawn'] | null {
    return this.#def?.spawn ?? null;
  }

  getPath(): SplinePath | null {
    return this.#path;
  }

  getDefinition(): CourseDef | null {
    return this.#def;
  }

  fixedUpdate(dt: number, ctx: EngineContext): void {
    if (!this.#def || this.#finished) return;

    this.#runElapsed += dt;

    const riderMod = ctx.getModule<RiderModule>('rider');
    const rider =
      this.#getRiderPosition?.() ??
      riderMod?.getPosition?.() ??
      riderMod?.state.position ??
      null;
    if (!rider || !this.#path) return;

    _playerPos.copy(rider);
    const closest = this.#path.closestPoint(_playerPos);
    this.#pathT = closest.t;

    for (const trigger of this.#triggers) {
      if (!trigger.bounds.containsPoint(_playerPos)) continue;

      if (trigger.kind === 'checkpoint') {
        const index = trigger.checkpointIndex ?? 0;
        if (index !== this.#nextCheckpoint) continue;
        const cp = this.#def.checkpoints[index];
        if (!cp) continue;

        this.#nextCheckpoint = index + 1;
        ctx.events.emit('course:checkpoint', {
          courseId: this.#def.id,
          checkpointId: cp.id,
          index,
          total: this.#def.checkpoints.length,
          position: { x: _playerPos.x, y: _playerPos.y, z: _playerPos.z },
        });
        ctx.events.emit('run:checkpoint', {
          index,
          total: this.#def.checkpoints.length,
        });
      }

      if (trigger.kind === 'finish' && this.#nextCheckpoint >= this.#def.checkpoints.length) {
        this.#finished = true;
        ctx.events.emit('course:finish', {
          courseId: this.#def.id,
          elapsed: this.#runElapsed,
          checkpointsCleared: this.#def.checkpoints.length,
          position: { x: _playerPos.x, y: _playerPos.y, z: _playerPos.z },
        });
      }
    }
  }

  dispose(): void {
    this.#clearVisual();
    this.#ctx?.physics.clearWorld();
    this.#root.removeFromParent();
    this.#ctx = null;
  }

  #clearVisual(): void {
    this.#terrain?.mesh.geometry.dispose();
    const mat = this.#terrain?.mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
    this.#props?.dispose();
    this.#terrainBody?.remove();
    this.#root.clear();
    this.#def = null;
    this.#path = null;
    this.#terrain = null;
    this.#props = null;
    this.#triggers = [];
    this.#terrainBody = null;
  }
}
