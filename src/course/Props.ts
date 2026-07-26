import * as THREE from 'three';
import type { CheckpointDef, PropPlacement } from '@/types/course.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import type { PhysicsWorld } from '@/types/physics.ts';
import type { SplinePath } from '@/course/SplinePath.ts';

export interface PropTrigger {
  id: string;
  kind: 'checkpoint' | 'finish';
  checkpointIndex?: number;
  bounds: THREE.Box3;
}

export interface PropsBuildResult {
  root: THREE.Group;
  triggers: PropTrigger[];
  dispose(): void;
}

const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.88 });
const CANOPY_MAT = [
  new THREE.MeshStandardMaterial({ color: 0x1f4d2e, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x255c36, roughness: 0.94 }),
  new THREE.MeshStandardMaterial({ color: 0x2f6840, roughness: 0.93 }),
];
const RAIL_MAT = new THREE.MeshStandardMaterial({
  color: 0xb8c4d0,
  metalness: 0.82,
  roughness: 0.28,
});
const RAMP_MAT = new THREE.MeshStandardMaterial({ color: 0xdde8f2, roughness: 0.75 });
const ROCK_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x6a6764, roughness: 0.92 }),
  new THREE.MeshStandardMaterial({ color: 0x5c5956, roughness: 0.94 }),
  new THREE.MeshStandardMaterial({ color: 0x787572, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x4f4c49, roughness: 0.96 }),
];
const GATE_MAT = new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5, emissive: 0x331100 });
const FINISH_MAT = new THREE.MeshStandardMaterial({ color: 0x33ccff, roughness: 0.45, emissive: 0x002233 });
const FLAG_MAT = new THREE.MeshStandardMaterial({ color: 0xffee44, roughness: 0.6, side: THREE.DoubleSide });
const TUNNEL_MAT = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.85 });

function yawQuat(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

function buildTree(variant: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 4.2, 8), TRUNK_MAT);
  trunk.position.y = 2.1;
  trunk.castShadow = true;
  g.add(trunk);

  const mat = CANOPY_MAT[variant % CANOPY_MAT.length]!;
  for (let i = 0; i < 3; i++) {
    const scale = [1.0, 0.78, 0.58][i]!;
    const lift = [4.8, 5.8, 6.5][i]!;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6 * scale, 2.4, 10), mat);
    cone.position.y = lift;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function buildRock(variant: number, scale = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    ROCK_MATS[variant % ROCK_MATS.length]!
  );
  const s = scale * (0.85 + (variant % 3) * 0.12);
  mesh.scale.set(s * 1.2, s * 0.75, s * 1.05);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildRail(length: number): THREE.Group {
  const g = new THREE.Group();
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, length, 12), RAIL_MAT);
  rail.rotation.z = Math.PI / 2;
  rail.castShadow = true;
  g.add(rail);

  for (const side of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.2), RAMP_MAT);
    lip.position.set(side * (length * 0.5 + 0.4), -0.08, 0);
    lip.rotation.z = side * 0.25;
    g.add(lip);
  }
  return g;
}

function buildRamp(lip: number, width = 6): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, lip * 0.35);
  shape.quadraticCurveTo(0, lip * 1.15, -width / 2, lip * 0.35);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.5, bevelEnabled: false, steps: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -2.25);
  const mesh = new THREE.Mesh(geo, RAMP_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function buildCheckpointGate(width: number): THREE.Group {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 5, 8);
  for (const x of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(postGeo, GATE_MAT);
    post.position.set(x, 2.5, 0);
    post.castShadow = true;
    g.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.08), GATE_MAT);
  banner.position.y = 4.6;
  g.add(banner);
  return g;
}

function buildFinishArch(width: number): THREE.Group {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 6.5, 10);
  for (const x of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(postGeo, FINISH_MAT);
    post.position.set(x, 3.25, 0);
    post.castShadow = true;
    g.add(post);
  }
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(width * 0.48, 0.14, 8, 24, Math.PI),
    FINISH_MAT
  );
  arch.rotation.z = Math.PI;
  arch.position.y = 6.2;
  g.add(arch);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.85, 1.4), FINISH_MAT);
  banner.position.set(0, 5.2, 0);
  g.add(banner);
  return g;
}

function buildFlag(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 6), RAIL_MAT);
  pole.position.y = 2.5;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), FLAG_MAT);
  flag.position.set(0.8, 4.2, 0);
  g.add(flag);
  return g;
}

function buildTunnel(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 16), TUNNEL_MAT);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.5, 6), TUNNEL_MAT);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, -1.2 + i * 0.15, (i - 2.5) * 0.9);
    g.add(log);
  }
  return g;
}

function applyTransform(object: THREE.Object3D, placement: PropPlacement): void {
  object.position.set(...placement.position);
  if (placement.rotationY !== undefined) {
    object.quaternion.copy(yawQuat(placement.rotationY));
  }
  if (placement.scale !== undefined) {
    if (typeof placement.scale === 'number') object.scale.setScalar(placement.scale);
    else object.scale.set(...placement.scale);
  }
}

function triggerBounds(object: THREE.Object3D, padding = 2): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(object);
  box.min.subScalar(padding);
  box.max.addScalar(padding);
  return box;
}

function registerMeshCollider(
  physics: PhysicsWorld,
  mesh: THREE.Mesh,
  surface: SurfaceKind,
  actorId: string
): void {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const position = geometry.getAttribute('position');
  const vertices = new Float32Array(position.array);
  const index = geometry.getIndex();
  const indices = index
    ? new Uint32Array(index.array)
    : new Uint32Array(Array.from({ length: position.count }, (_, i) => i));
  physics.createTrimesh(vertices, indices, new THREE.Vector3(0, 0, 0), surface, actorId);
  geometry.dispose();
}

export function buildCourseProps(
  placements: readonly PropPlacement[],
  path: SplinePath,
  checkpointDefs: readonly CheckpointDef[]
): PropsBuildResult {
  const root = new THREE.Group();
  root.name = 'course-props';
  const triggers: PropTrigger[] = [];
  const treeTransforms: { matrix: THREE.Matrix4; variant: number }[] = [];
  const disposables: THREE.BufferGeometry[] = [];

  for (const placement of placements) {
    if (placement.kind === 'tree') {
      treeTransforms.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(...placement.position),
          yawQuat(placement.rotationY ?? 0),
          new THREE.Vector3(1, 1, 1)
        ),
        variant: placement.variant ?? 0,
      });
      continue;
    }

    let object: THREE.Object3D;
    switch (placement.kind) {
      case 'rock':
        object = buildRock(placement.variant ?? 0, (placement.scale as number | undefined) ?? 1);
        break;
      case 'rail':
        object = buildRail(placement.length ?? 12);
        break;
      case 'ramp':
        object = buildRamp(placement.lip ?? 2.4);
        break;
      case 'checkpoint_gate':
        object = buildCheckpointGate(14);
        break;
      case 'finish_arch':
        object = buildFinishArch(20);
        break;
      case 'flag':
        object = buildFlag();
        break;
      case 'tunnel':
        object = buildTunnel();
        break;
      default:
        continue;
    }

    applyTransform(object, placement);
    object.name = placement.id;
    root.add(object);

    if (placement.kind === 'checkpoint_gate') {
      const cpIndex = checkpointDefs.findIndex((cp) => placement.id === `gate-${cp.id}`);
      triggers.push({
        id: placement.id,
        kind: 'checkpoint',
        checkpointIndex: cpIndex >= 0 ? cpIndex : triggers.filter((t) => t.kind === 'checkpoint').length,
        bounds: triggerBounds(object, 3),
      });
    }
    if (placement.kind === 'finish_arch') {
      triggers.push({ id: placement.id, kind: 'finish', bounds: triggerBounds(object, 4) });
    }
  }

  const byVariant = new Map<number, THREE.Matrix4[]>();
  for (const t of treeTransforms) {
    let list = byVariant.get(t.variant);
    if (!list) {
      list = [];
      byVariant.set(t.variant, list);
    }
    list.push(t.matrix);
  }
  for (const [variant, matrices] of byVariant) {
    const proto = buildTree(variant);
    for (const part of proto.children as THREE.Mesh[]) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material as THREE.Material, matrices.length);
      inst.castShadow = true;
      inst.name = `trees-v${variant}`;
      for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]!);
      inst.instanceMatrix.needsUpdate = true;
      root.add(inst);
    }
    proto.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) disposables.push(m.geometry);
    });
  }

  for (let i = 0; i < checkpointDefs.length; i++) {
    const cp = checkpointDefs[i]!;
    if (triggers.some((t) => t.kind === 'checkpoint' && t.checkpointIndex === i)) continue;
    const pose = path.checkpointPose(cp);
    triggers.push({
      id: `trigger-${cp.id}`,
      kind: 'checkpoint',
      checkpointIndex: i,
      bounds: new THREE.Box3(
        new THREE.Vector3(pose.position.x - pose.width / 2, pose.position.y - 2, pose.position.z - 3),
        new THREE.Vector3(pose.position.x + pose.width / 2, pose.position.y + 8, pose.position.z + 3)
      ),
    });
  }

  return {
    root,
    triggers,
    dispose() {
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) mesh.geometry.dispose();
      });
      for (const geo of disposables) geo.dispose();
      root.removeFromParent();
    },
  };
}

export function registerPropsPhysics(
  physics: PhysicsWorld,
  placements: readonly PropPlacement[],
  root: THREE.Group
): void {
  if (!physics.ready) return;

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;

    const placement = placements.find((p) => p.id === mesh.name);
    const surface: SurfaceKind =
      placement?.surface ??
      (placement?.kind === 'rail'
        ? 'rail'
        : placement?.kind === 'rock'
          ? 'rock'
          : placement?.kind === 'tunnel'
            ? 'wood'
            : 'packed');

    if (placement?.kind === 'checkpoint_gate' || placement?.kind === 'finish_arch') {
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      physics.createStaticBox(
        size.multiplyScalar(0.5),
        center,
        mesh.quaternion.clone(),
        'packed',
        placement.id,
        true
      );
      return;
    }

    if (placement?.recovery) return;

    if (placement?.kind === 'rail') {
      const len = placement.length ?? 12;
      physics.createStaticCapsule(
        len * 0.5,
        0.08,
        mesh.getWorldPosition(new THREE.Vector3()),
        mesh.getWorldQuaternion(new THREE.Quaternion()),
        'rail',
        placement.id
      );
      return;
    }

    registerMeshCollider(physics, mesh, surface, placement?.id ?? mesh.name);
  });

  for (const placement of placements) {
    if (placement.recovery || placement.kind !== 'tree') continue;
    physics.createStaticBox(
      new THREE.Vector3(0.5, 2.2, 0.5),
      new THREE.Vector3(...placement.position).add(new THREE.Vector3(0, 2, 0)),
      yawQuat(placement.rotationY ?? 0),
      'wood',
      placement.id
    );
  }
}
