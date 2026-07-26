import * as THREE from 'three';

export interface ProceduralTintTargets {
  boardMaterials: THREE.MeshStandardMaterial[];
  suitMaterials: THREE.MeshStandardMaterial[];
  accentMaterials: THREE.MeshStandardMaterial[];
}

export interface ProceduralRig {
  root: THREE.Group;
  board: THREE.Group;
  body: THREE.Group;
  torso: THREE.Object3D;
  hips: THREE.Object3D;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  tints: ProceduralTintTargets;
  dispose: () => void;
}

/** Snowboard outline: tapered waist, rounded nose/tail. */
function createBoardGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfLen = 0.78;
  const noseW = 0.13;
  const waistW = 0.1;
  const tip = 0.1;

  shape.moveTo(0, halfLen);
  shape.bezierCurveTo(noseW * 0.55, halfLen, noseW, halfLen - tip * 0.35, noseW, halfLen - tip);
  shape.lineTo(waistW, 0.18);
  shape.lineTo(waistW * 0.95, -0.18);
  shape.lineTo(noseW, -(halfLen - tip));
  shape.bezierCurveTo(noseW, -(halfLen - tip * 0.35), noseW * 0.55, -halfLen, 0, -halfLen);
  shape.bezierCurveTo(-noseW * 0.55, -halfLen, -noseW, -(halfLen - tip * 0.35), -noseW, -(halfLen - tip));
  shape.lineTo(-waistW * 0.95, -0.18);
  shape.lineTo(-waistW, 0.18);
  shape.lineTo(-noseW, halfLen - tip);
  shape.bezierCurveTo(-noseW, halfLen - tip * 0.35, -noseW * 0.55, halfLen, 0, halfLen);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.022, 0);
  geo.computeVertexNormals();
  return geo;
}

function capsule(
  radius: number,
  length: number,
  mat: THREE.Material,
  cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), mat);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * High-quality procedural rider + board when no glTF is available.
 * Pivot is board center; body stands in a crouched carve stance.
 */
export function buildProceduralRig(): ProceduralRig {
  const root = new THREE.Group();
  root.name = 'riderVisual';

  const boardMat = new THREE.MeshStandardMaterial({
    color: 0x2a6cb8,
    metalness: 0.42,
    roughness: 0.38,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1c2430,
    metalness: 0.55,
    roughness: 0.5,
  });
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    roughness: 0.78,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.72,
    metalness: 0.08,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    roughness: 0.55,
    metalness: 0.2,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x1a3048,
    metalness: 0.85,
    roughness: 0.18,
    transparent: true,
    opacity: 0.85,
  });

  const board = new THREE.Group();
  board.name = 'board';
  const deck = new THREE.Mesh(createBoardGeometry(), boardMat);
  deck.castShadow = true;
  deck.receiveShadow = true;
  board.add(deck);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 1.2), baseMat);
  base.position.y = 0.006;
  base.castShadow = true;
  board.add(base);

  // Bindings
  for (const z of [-0.18, 0.16] as const) {
    const binding = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), accentMat);
    binding.position.set(0, 0.04, z);
    binding.castShadow = true;
    board.add(binding);
  }
  root.add(board);

  const body = new THREE.Group();
  body.name = 'body';
  body.position.set(0, 0.05, -0.02);

  const hips = new THREE.Group();
  hips.position.set(0, 0.22, 0);
  const hipMesh = capsule(0.09, 0.06, accentMat);
  hipMesh.rotation.z = Math.PI / 2;
  hipMesh.scale.set(1, 1, 0.85);
  hips.add(hipMesh);
  body.add(hips);

  const torso = new THREE.Group();
  torso.position.set(0, 0.42, -0.04);
  const torsoMesh = capsule(0.12, 0.22, suitMat);
  torsoMesh.scale.set(1.05, 1, 0.72);
  torso.add(torsoMesh);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.16;
  collar.castShadow = true;
  torso.add(collar);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.72, -0.05);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), accentMat);
  helmet.scale.set(1, 0.95, 1.05);
  helmet.castShadow = true;
  head.add(helmet);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.06), lensMat);
  goggles.position.set(0, 0.02, 0.1);
  head.add(goggles);
  body.add(head);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.09, 0.2, 0.02);
  leftLeg.rotation.set(0.42, 0.08, 0.12);
  const leftThigh = capsule(0.055, 0.16, accentMat);
  leftThigh.position.y = -0.12;
  leftLeg.add(leftThigh);
  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), bootMat);
  leftBoot.position.set(0, -0.28, 0.04);
  leftBoot.castShadow = true;
  leftLeg.add(leftBoot);
  body.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.09, 0.2, 0.08);
  rightLeg.rotation.set(-0.18, -0.06, -0.1);
  const rightThigh = capsule(0.055, 0.16, accentMat);
  rightThigh.position.y = -0.12;
  rightLeg.add(rightThigh);
  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), bootMat);
  rightBoot.position.set(0, -0.28, 0.02);
  rightBoot.castShadow = true;
  rightLeg.add(rightBoot);
  body.add(rightLeg);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.2, 0.52, -0.02);
  leftArm.rotation.set(0.25, 0, 0.55);
  const leftUpper = capsule(0.04, 0.14, suitMat);
  leftUpper.position.y = -0.1;
  leftArm.add(leftUpper);
  const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), bootMat);
  leftGlove.position.y = -0.22;
  leftArm.add(leftGlove);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.2, 0.5, 0.02);
  rightArm.rotation.set(0.15, 0, -0.45);
  const rightUpper = capsule(0.04, 0.14, suitMat);
  rightUpper.position.y = -0.1;
  rightArm.add(rightUpper);
  const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), bootMat);
  rightGlove.position.y = -0.22;
  rightArm.add(rightGlove);
  body.add(rightArm);

  root.add(body);

  const geos: THREE.BufferGeometry[] = [];
  const mats = [boardMat, baseMat, suitMat, accentMat, bootMat, lensMat];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      geos.push(obj.geometry);
    }
  });

  return {
    root,
    board,
    body,
    torso,
    hips,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tints: {
      boardMaterials: [boardMat],
      suitMaterials: [suitMat],
      accentMaterials: [accentMat],
    },
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
