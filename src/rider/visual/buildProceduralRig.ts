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
  leftShin: THREE.Object3D;
  rightShin: THREE.Object3D;
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
 * Pivot is board center; body stands in a crouched carve-ready stance.
 * Gear is vivid alpine race kit (lime / orange) — not a grey capsule.
 */
export function buildProceduralRig(): ProceduralRig {
  const root = new THREE.Group();
  root.name = 'riderVisual';

  // Vivid topsheet — reads as race board against snow.
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0xff5a12,
    metalness: 0.35,
    roughness: 0.42,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c10,
    metalness: 0.55,
    roughness: 0.38,
  });
  // Deep ink shell + high-sat accents (alpine ref language).
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x0c1220,
    roughness: 0.62,
    metalness: 0.18,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xb8ff2e,
    roughness: 0.48,
    metalness: 0.12,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x101418,
    roughness: 0.45,
    metalness: 0.28,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a28,
    metalness: 0.9,
    roughness: 0.12,
    transparent: true,
    opacity: 0.92,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xff6a14,
    roughness: 0.42,
    metalness: 0.2,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xd4ff3a,
    roughness: 0.5,
    metalness: 0.1,
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

  // Topsheet race stripe — lime center line.
  const deckStripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.01, 1.35), accentMat);
  deckStripe.position.y = 0.048;
  deckStripe.castShadow = true;
  board.add(deckStripe);

  for (const z of [-0.18, 0.16] as const) {
    const binding = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), bootMat);
    binding.position.set(0, 0.04, z);
    binding.castShadow = true;
    board.add(binding);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.04), accentMat);
    strap.position.set(0, 0.055, z);
    strap.castShadow = true;
    board.add(strap);
  }
  root.add(board);

  const body = new THREE.Group();
  body.name = 'body';
  // Lowered + forward for crouch; lean animation offsets from here.
  body.position.set(0, 0.02, -0.04);

  const hips = new THREE.Group();
  hips.position.set(0, 0.18, 0.02);
  const hipMesh = capsule(0.09, 0.06, suitMat);
  hipMesh.rotation.z = Math.PI / 2;
  hipMesh.scale.set(1, 1, 0.85);
  hips.add(hipMesh);
  // Hip race panel — breaks capsule silhouette.
  const hipPanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), panelMat);
  hipPanel.position.set(0, 0, 0.06);
  hipPanel.castShadow = true;
  hips.add(hipPanel);
  body.add(hips);

  const torso = new THREE.Group();
  torso.position.set(0, 0.36, -0.02);
  const torsoMesh = capsule(0.12, 0.2, suitMat);
  torsoMesh.scale.set(1.05, 1, 0.72);
  torso.add(torsoMesh);
  // Chest lime panel + orange side stripe — athlete kit, not grey blob.
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08), panelMat);
  chest.position.set(0, 0.02, 0.07);
  chest.castShadow = true;
  torso.add(chest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.03), stripeMat);
  stripe.position.set(0.1, 0.01, 0.09);
  stripe.castShadow = true;
  torso.add(stripe);
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.03), stripeMat);
  stripeL.position.set(-0.1, 0.01, 0.09);
  stripeL.castShadow = true;
  torso.add(stripeL);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.14;
  collar.castShadow = true;
  torso.add(collar);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.62, -0.04);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), suitMat);
  helmet.scale.set(1, 0.95, 1.05);
  helmet.castShadow = true;
  head.add(helmet);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), accentMat);
  lid.position.set(0, 0.08, 0.02);
  lid.castShadow = true;
  head.add(lid);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.055, 0.07), lensMat);
  goggles.position.set(0, 0.02, 0.1);
  head.add(goggles);
  const goggleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.065, 0.03), stripeMat);
  goggleFrame.position.set(0, 0.02, 0.07);
  head.add(goggleFrame);
  body.add(head);

  // Duck stance: lead (left) foot forward, trail flexed — carve-ready crouch.
  const leftLeg = new THREE.Group();
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.09, 0.16, -0.04);
  leftLeg.rotation.set(0.88, 0.12, 0.18);
  const leftThigh = capsule(0.052, 0.13, suitMat);
  leftThigh.position.y = -0.1;
  leftLeg.add(leftThigh);
  const leftThighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.03), accentMat);
  leftThighStripe.position.set(-0.04, -0.1, 0.03);
  leftThighStripe.castShadow = true;
  leftLeg.add(leftThighStripe);
  const leftShin = new THREE.Group();
  leftShin.name = 'leftShin';
  leftShin.position.set(0, -0.2, 0.01);
  leftShin.rotation.x = -1.15;
  const leftShinMesh = capsule(0.045, 0.12, suitMat);
  leftShinMesh.position.y = -0.09;
  leftShin.add(leftShinMesh);
  const leftShinAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.03), stripeMat);
  leftShinAccent.position.set(0.03, -0.09, 0.03);
  leftShin.add(leftShinAccent);
  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), bootMat);
  leftBoot.position.set(0, -0.2, 0.05);
  leftBoot.castShadow = true;
  leftShin.add(leftBoot);
  leftLeg.add(leftShin);
  body.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.09, 0.16, 0.1);
  rightLeg.rotation.set(0.7, -0.1, -0.16);
  const rightThigh = capsule(0.052, 0.13, suitMat);
  rightThigh.position.y = -0.1;
  rightLeg.add(rightThigh);
  const rightThighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.03), accentMat);
  rightThighStripe.position.set(0.04, -0.1, 0.03);
  rightThighStripe.castShadow = true;
  rightLeg.add(rightThighStripe);
  const rightShin = new THREE.Group();
  rightShin.name = 'rightShin';
  rightShin.position.set(0, -0.2, 0.01);
  rightShin.rotation.x = -1.05;
  const rightShinMesh = capsule(0.045, 0.12, suitMat);
  rightShinMesh.position.y = -0.09;
  rightShin.add(rightShinMesh);
  const rightShinAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.03), stripeMat);
  rightShinAccent.position.set(-0.03, -0.09, 0.03);
  rightShin.add(rightShinAccent);
  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), bootMat);
  rightBoot.position.set(0, -0.2, 0.03);
  rightBoot.castShadow = true;
  rightShin.add(rightBoot);
  rightLeg.add(rightShin);
  body.add(rightLeg);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.2, 0.44, -0.02);
  leftArm.rotation.set(0.42, 0, 0.72);
  const leftUpper = capsule(0.04, 0.14, suitMat);
  leftUpper.position.y = -0.1;
  leftArm.add(leftUpper);
  const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), stripeMat);
  leftSleeve.position.set(-0.02, -0.1, 0.02);
  leftArm.add(leftSleeve);
  const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), accentMat);
  leftGlove.position.y = -0.22;
  leftArm.add(leftGlove);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.2, 0.42, 0.02);
  rightArm.rotation.set(0.35, 0, -0.62);
  const rightUpper = capsule(0.04, 0.14, suitMat);
  rightUpper.position.y = -0.1;
  rightArm.add(rightUpper);
  const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), stripeMat);
  rightSleeve.position.set(0.02, -0.1, 0.02);
  rightArm.add(rightSleeve);
  const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), accentMat);
  rightGlove.position.y = -0.22;
  rightArm.add(rightGlove);
  body.add(rightArm);

  root.add(body);

  const geos: THREE.BufferGeometry[] = [];
  const mats = [boardMat, baseMat, suitMat, accentMat, bootMat, lensMat, stripeMat, panelMat];
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
    leftShin,
    rightShin,
    tints: {
      boardMaterials: [boardMat],
      suitMaterials: [suitMat],
      accentMaterials: [accentMat, panelMat, stripeMat],
    },
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
