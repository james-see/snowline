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

/** Box limb — angular athlete silhouette, not a soft capsule blob. */
function limbBox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * High-quality procedural rider + board when no glTF is available.
 * Pivot is board center; body stands in a deep carve crouch.
 * Angular limbs + vivid kit — never a grey capsule.
 */
export function buildProceduralRig(): ProceduralRig {
  const root = new THREE.Group();
  root.name = 'riderVisual';

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
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x0a101c,
    roughness: 0.58,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xc8ff28,
    roughness: 0.42,
    metalness: 0.14,
    emissive: 0x1a3300,
    emissiveIntensity: 0.35,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x0c1014,
    roughness: 0.42,
    metalness: 0.3,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x143828,
    metalness: 0.92,
    roughness: 0.1,
    transparent: true,
    opacity: 0.94,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xff5a0a,
    roughness: 0.4,
    metalness: 0.22,
    emissive: 0x331100,
    emissiveIntensity: 0.25,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xe2ff3c,
    roughness: 0.45,
    metalness: 0.12,
    emissive: 0x223300,
    emissiveIntensity: 0.4,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc48a62,
    roughness: 0.72,
    metalness: 0.05,
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

  const deckStripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 1.4), accentMat);
  deckStripe.position.y = 0.048;
  deckStripe.castShadow = true;
  board.add(deckStripe);

  for (const z of [-0.18, 0.16] as const) {
    const binding = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.24), bootMat);
    binding.position.set(0, 0.04, z);
    binding.castShadow = true;
    board.add(binding);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.045), accentMat);
    strap.position.set(0, 0.058, z);
    strap.castShadow = true;
    board.add(strap);
  }
  root.add(board);

  const body = new THREE.Group();
  body.name = 'body';
  body.position.set(0, -0.02, -0.06);
  body.rotation.x = 0.38;

  const hips = new THREE.Group();
  hips.position.set(0, 0.14, 0.04);
  hips.add(limbBox(0.24, 0.12, 0.16, suitMat));
  const hipPanel = limbBox(0.22, 0.09, 0.06, panelMat);
  hipPanel.position.set(0, 0.01, 0.08);
  hips.add(hipPanel);
  const hipFlashL = limbBox(0.04, 0.1, 0.12, stripeMat);
  hipFlashL.position.set(-0.12, 0, 0.02);
  hips.add(hipFlashL);
  const hipFlashR = limbBox(0.04, 0.1, 0.12, stripeMat);
  hipFlashR.position.set(0.12, 0, 0.02);
  hips.add(hipFlashR);
  body.add(hips);

  const torso = new THREE.Group();
  torso.position.set(0, 0.3, -0.04);
  torso.rotation.x = -0.42;
  const torsoMesh = limbBox(0.28, 0.32, 0.16, suitMat);
  torsoMesh.scale.set(1, 1, 0.9);
  torso.add(torsoMesh);
  const shoulders = limbBox(0.36, 0.08, 0.14, suitMat);
  shoulders.position.set(0, 0.14, 0);
  torso.add(shoulders);
  const chest = limbBox(0.2, 0.22, 0.09, panelMat);
  chest.position.set(0, 0.02, 0.09);
  torso.add(chest);
  const stripe = limbBox(0.055, 0.3, 0.035, stripeMat);
  stripe.position.set(0.11, 0.02, 0.1);
  torso.add(stripe);
  const stripeL = limbBox(0.055, 0.3, 0.035, stripeMat);
  stripeL.position.set(-0.11, 0.02, 0.1);
  torso.add(stripeL);
  const collar = limbBox(0.2, 0.05, 0.12, accentMat);
  collar.position.set(0, 0.16, 0.04);
  torso.add(collar);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.52, -0.1);
  head.rotation.x = -0.18;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), suitMat);
  helmet.scale.set(1.05, 0.92, 1.08);
  helmet.castShadow = true;
  head.add(helmet);
  const lid = limbBox(0.14, 0.04, 0.12, accentMat);
  lid.position.set(0, 0.07, 0.02);
  head.add(lid);
  const goggles = limbBox(0.18, 0.055, 0.07, lensMat);
  goggles.position.set(0, 0.015, 0.1);
  head.add(goggles);
  const goggleFrame = limbBox(0.19, 0.065, 0.03, stripeMat);
  goggleFrame.position.set(0, 0.015, 0.07);
  head.add(goggleFrame);
  const neck = limbBox(0.07, 0.06, 0.07, skinMat);
  neck.position.set(0, -0.1, 0.02);
  head.add(neck);
  body.add(head);

  const leftLeg = new THREE.Group();
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.1, 0.12, -0.06);
  leftLeg.rotation.set(1.05, 0.14, 0.22);
  const leftThigh = limbBox(0.1, 0.2, 0.11, suitMat);
  leftThigh.position.y = -0.1;
  leftLeg.add(leftThigh);
  const leftThighStripe = limbBox(0.04, 0.16, 0.03, accentMat);
  leftThighStripe.position.set(-0.05, -0.1, 0.04);
  leftLeg.add(leftThighStripe);
  const leftShin = new THREE.Group();
  leftShin.name = 'leftShin';
  leftShin.position.set(0, -0.22, 0.02);
  leftShin.rotation.x = -1.38;
  const leftShinMesh = limbBox(0.09, 0.18, 0.1, suitMat);
  leftShinMesh.position.y = -0.09;
  leftShin.add(leftShinMesh);
  const leftShinAccent = limbBox(0.04, 0.12, 0.03, stripeMat);
  leftShinAccent.position.set(0.04, -0.09, 0.04);
  leftShin.add(leftShinAccent);
  const leftBoot = limbBox(0.11, 0.08, 0.2, bootMat);
  leftBoot.position.set(0, -0.2, 0.06);
  leftShin.add(leftBoot);
  const leftBootAccent = limbBox(0.12, 0.025, 0.06, accentMat);
  leftBootAccent.position.set(0, -0.16, 0.08);
  leftShin.add(leftBootAccent);
  leftLeg.add(leftShin);
  body.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.1, 0.12, 0.12);
  rightLeg.rotation.set(0.92, -0.12, -0.2);
  const rightThigh = limbBox(0.1, 0.2, 0.11, suitMat);
  rightThigh.position.y = -0.1;
  rightLeg.add(rightThigh);
  const rightThighStripe = limbBox(0.04, 0.16, 0.03, accentMat);
  rightThighStripe.position.set(0.05, -0.1, 0.04);
  rightLeg.add(rightThighStripe);
  const rightShin = new THREE.Group();
  rightShin.name = 'rightShin';
  rightShin.position.set(0, -0.22, 0.02);
  rightShin.rotation.x = -1.28;
  const rightShinMesh = limbBox(0.09, 0.18, 0.1, suitMat);
  rightShinMesh.position.y = -0.09;
  rightShin.add(rightShinMesh);
  const rightShinAccent = limbBox(0.04, 0.12, 0.03, stripeMat);
  rightShinAccent.position.set(-0.04, -0.09, 0.04);
  rightShin.add(rightShinAccent);
  const rightBoot = limbBox(0.11, 0.08, 0.2, bootMat);
  rightBoot.position.set(0, -0.2, 0.04);
  rightShin.add(rightBoot);
  const rightBootAccent = limbBox(0.12, 0.025, 0.06, accentMat);
  rightBootAccent.position.set(0, -0.16, 0.06);
  rightShin.add(rightBootAccent);
  rightLeg.add(rightShin);
  body.add(rightLeg);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.22, 0.4, -0.06);
  leftArm.rotation.set(0.55, 0.1, 0.95);
  const leftUpper = limbBox(0.08, 0.2, 0.08, suitMat);
  leftUpper.position.y = -0.1;
  leftArm.add(leftUpper);
  const leftSleeve = limbBox(0.055, 0.14, 0.045, stripeMat);
  leftSleeve.position.set(-0.02, -0.1, 0.02);
  leftArm.add(leftSleeve);
  const leftFore = limbBox(0.07, 0.14, 0.07, suitMat);
  leftFore.position.set(0, -0.22, 0.02);
  leftFore.rotation.x = 0.35;
  leftArm.add(leftFore);
  const leftGlove = limbBox(0.07, 0.07, 0.08, accentMat);
  leftGlove.position.set(0, -0.3, 0.04);
  leftArm.add(leftGlove);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.22, 0.38, 0);
  rightArm.rotation.set(0.48, -0.08, -0.88);
  const rightUpper = limbBox(0.08, 0.2, 0.08, suitMat);
  rightUpper.position.y = -0.1;
  rightArm.add(rightUpper);
  const rightSleeve = limbBox(0.055, 0.14, 0.045, stripeMat);
  rightSleeve.position.set(0.02, -0.1, 0.02);
  rightArm.add(rightSleeve);
  const rightFore = limbBox(0.07, 0.14, 0.07, suitMat);
  rightFore.position.set(0, -0.22, 0.02);
  rightFore.rotation.x = 0.3;
  rightArm.add(rightFore);
  const rightGlove = limbBox(0.07, 0.07, 0.08, accentMat);
  rightGlove.position.set(0, -0.3, 0.04);
  rightArm.add(rightGlove);
  body.add(rightArm);

  root.add(body);

  const geos: THREE.BufferGeometry[] = [];
  const mats = [
    boardMat,
    baseMat,
    suitMat,
    accentMat,
    bootMat,
    lensMat,
    stripeMat,
    panelMat,
    skinMat,
  ];
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
