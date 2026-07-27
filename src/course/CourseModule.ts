import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseDef, CourseProgress, TerrainBuildResult } from '@/types/course.ts';
import type { CourseId } from '@/types/gameplay.ts';
import type { PhysicsWorld, RigidBodyHandle } from '@/types/physics.ts';
import { SeededRng } from '@/engine/Rng.ts';
import { SplinePath } from '@/course/SplinePath.ts';
import {
  buildTerrain,
  lateralToU,
  sampleTerrainAt,
} from '@/course/TerrainGenerator.ts';
import { getCourseDef } from '@/course/CourseDefs.ts';
import {
  buildCourseProps,
  registerPropsPhysics,
  snapPropsToTerrain,
  type PropTrigger,
  type PropsBuildResult,
} from '@/course/Props.ts';
import { resolveLodBudgets } from '@/engine/Lod.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';

const _playerPos = new THREE.Vector3();
const _spawnBed = new THREE.Vector3();
const _gateBed = new THREE.Vector3();

/** Path parameter for run start — just downhill of the lip, on generated mesh. */
export const SPAWN_PATH_T = 0.02;
/** Board clearance above terrain bed at spawn (metres). */
export const SPAWN_HOVER = 1.2;

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

    const def = structuredClone(getCourseDef(id));
    const path = new SplinePath(def.controlPoints);
    const rng = new SeededRng(def.seed);
    const terrain = buildTerrain({ course: def, path, rng });
    const budgets = ctx ? resolveLodBudgets(ctx.settings) : undefined;
    const props = buildCourseProps(def.props, path, def.checkpoints, budgets);

    // Snap trees/rocks/rails/etc. onto the visual mesh; sync placement Y for physics.
    // Must use meshWidth (corridor + apron), not race corridor width — wrong U → floating Y.
    snapPropsToTerrain(props, terrain, path, terrain.meshWidth, def.props);
    // Snap gates/finish onto the visual mesh before physics registration.
    this.#snapMarkersToTerrain(def, path, terrain, props);

    // Spawn on generated terrain at path.sample(~0.02), not authored Y.
    const bed = sampleTerrainAt(terrain, SPAWN_PATH_T, 0.5, _spawnBed);
    const tan = path.tangent(SPAWN_PATH_T);
    def.spawn = {
      ...def.spawn,
      position: [bed.x, bed.y + SPAWN_HOVER, bed.z],
      yaw: Math.atan2(-tan.x, -tan.z),
    };

    this.#root.add(terrain.mesh);
    this.#root.add(terrain.backdrop);
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

  getTerrain(): TerrainBuildResult | null {
    return this.#terrain;
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

  /** Place checkpoint/finish markers and triggers on the generated mesh. */
  #snapMarkersToTerrain(
    def: CourseDef,
    path: SplinePath,
    terrain: TerrainBuildResult,
    props: PropsBuildResult
  ): void {
    const meshWidth = terrain.meshWidth;

    for (let i = 0; i < def.checkpoints.length; i++) {
      const cp = def.checkpoints[i]!;
      const u = lateralToU(cp.lateral ?? 0, meshWidth);
      const bed = sampleTerrainAt(terrain, cp.t, u, _gateBed);
      const tan = path.tangent(cp.t);
      const yaw = Math.atan2(tan.x, tan.z);
      const halfW = (cp.width ?? 14) * 0.5;

      const gate = props.root.getObjectByName(`gate-${cp.id}`);
      if (gate) {
        gate.position.copy(bed);
        gate.rotation.y = yaw;
      }

      const trigger = props.triggers.find(
        (t) => t.kind === 'checkpoint' && t.checkpointIndex === i
      );
      if (trigger) {
        trigger.bounds.set(
          new THREE.Vector3(bed.x - halfW, bed.y - 2, bed.z - 5),
          new THREE.Vector3(bed.x + halfW, bed.y + 12, bed.z + 5)
        );
      }
    }

    const fin = def.finish;
    const finBed = sampleTerrainAt(terrain, fin.t, 0.5, _gateBed);
    const finTan = path.tangent(fin.t);
    const finYaw = Math.atan2(finTan.x, finTan.z);
    const finHalf = (fin.width ?? 20) * 0.5;
    const arch = props.root.getObjectByName('finish');
    if (arch) {
      arch.position.copy(finBed);
      arch.rotation.y = finYaw;
    }
    const finTrigger = props.triggers.find((t) => t.kind === 'finish');
    if (finTrigger) {
      finTrigger.bounds.set(
        new THREE.Vector3(finBed.x - finHalf, finBed.y - 2, finBed.z - 6),
        new THREE.Vector3(finBed.x + finHalf, finBed.y + 14, finBed.z + 6)
      );
    }
  }

  #clearVisual(): void {
    this.#terrain?.mesh.geometry.dispose();
    const mat = this.#terrain?.mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
    this.#disposeBackdrop(this.#terrain?.backdrop ?? null);
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

  #disposeBackdrop(group: THREE.Group | null): void {
    if (!group) return;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}
