import * as THREE from 'three';
import { mats } from '@/course/props/materials.ts';

function shadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Displace icosahedron vertices for a rocky silhouette. */
function deformRockGeometry(geo: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 3.1 + seed) * 0.12 +
      Math.cos(z * 2.7 - seed * 1.3) * 0.1 +
      Math.sin((x + z) * 1.9 + seed * 0.7) * 0.08;
    const flatten = y > 0.35 ? 0.55 : 1;
    pos.setXYZ(i, x * (1 + n), y * flatten * (1 + n * 0.4), z * (1 + n * 0.85));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildTree(variant: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tree-proto';

  const trunkH = 3.8 + (variant % 3) * 0.35;
  const trunk = shadow(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.55, trunkH, 8),
      variant % 2 === 0 ? mats.trunk : mats.trunkDark
    )
  );
  trunk.position.y = trunkH * 0.5;
  g.add(trunk);

  const canopyMat = mats.canopy[variant % mats.canopy.length]!;
  const tiers = [
    { y: trunkH + 0.2, r: 2.7, h: 2.6 },
    { y: trunkH + 1.35, r: 2.1, h: 2.2 },
    { y: trunkH + 2.35, r: 1.45, h: 1.9 },
    { y: trunkH + 3.15, r: 0.85, h: 1.4 },
  ];
  for (const tier of tiers) {
    const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(tier.r, tier.h, 10), canopyMat));
    cone.position.y = tier.y;
    g.add(cone);
  }

  const snow = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 8), mats.snowCap));
  snow.position.y = trunkH + 3.7;
  g.add(snow);

  return g;
}

export function buildRock(variant: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const geo = deformRockGeometry(new THREE.IcosahedronGeometry(1.1, 1), variant * 17.3);
  const body = shadow(new THREE.Mesh(geo, mats.rock[variant % mats.rock.length]!));
  const s = scale * (0.9 + (variant % 4) * 0.08);
  body.scale.set(s * 1.35, s * 0.85, s * 1.15);
  body.rotation.y = variant * 0.7;
  g.add(body);

  const cap = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.55 * s, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      mats.snowCap
    )
  );
  cap.position.y = 0.55 * s;
  cap.scale.set(1.4, 0.55, 1.2);
  g.add(cap);
  return g;
}

/** Flat-bar grind rail with posts, pads, and approach lips. Local X = length. */
export function buildRail(length: number): THREE.Group {
  const g = new THREE.Group();
  const half = length * 0.5;
  const barH = 0.85;

  const bar = shadow(new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.16), mats.rail));
  bar.position.y = barH;
  g.add(bar);

  const tube = shadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, length, 12), mats.rail)
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.y = barH + 0.08;
  g.add(tube);

  const postCount = Math.max(2, Math.round(length / 3.2));
  for (let i = 0; i < postCount; i++) {
    const t = postCount === 1 ? 0 : i / (postCount - 1);
    const x = -half + t * length;
    const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, barH, 0.1), mats.railDark));
    post.position.set(x, barH * 0.5, 0);
    g.add(post);

    const pad = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), mats.concrete));
    pad.position.set(x, 0.04, 0);
    g.add(pad);
  }

  for (const side of [-1, 1] as const) {
    const lip = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.9), mats.snowDeck));
    lip.position.set(side * (half + 0.55), 0.22, 0);
    lip.rotation.z = side * -0.38;
    g.add(lip);

    const wedge = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), mats.concrete));
    wedge.position.set(side * (half + 0.15), 0.08, 0);
    g.add(wedge);
  }

  return g;
}

/** Snow kicker with wood understructure, side walls, and lip coping. Fall line = +Z. */
export function buildRamp(lip: number, width = 6.5): THREE.Group {
  const g = new THREE.Group();
  const depth = 5.2;
  const lipH = Math.max(1.2, lip);

  const approach = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, depth * 0.55), mats.snowDeck)
  );
  approach.position.set(0, 0.18, -depth * 0.12);
  approach.rotation.x = -0.18;
  g.add(approach);

  const face = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, lipH, 1.4), mats.snowDeck)
  );
  face.position.set(0, lipH * 0.5, depth * 0.28);
  face.rotation.x = -0.55;
  g.add(face);

  const deck = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.22, 1.1), mats.snowDeck)
  );
  deck.position.set(0, lipH * 0.72, depth * 0.12);
  deck.rotation.x = -0.32;
  g.add(deck);

  const coping = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, 0.12, 0.28), mats.rail)
  );
  coping.position.set(0, lipH + 0.02, depth * 0.42);
  g.add(coping);

  for (const side of [-1, 1] as const) {
    const wall = shadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.18, lipH * 0.85, depth * 0.7), mats.wood)
    );
    wall.position.set(side * (width * 0.5 + 0.05), lipH * 0.4, depth * 0.05);
    g.add(wall);
  }

  const under = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, lipH * 0.55, depth * 0.35), mats.woodDark)
  );
  under.position.set(0, lipH * 0.28, depth * 0.22);
  g.add(under);

  return g;
}

export function buildCheckpointGate(width: number): THREE.Group {
  const g = new THREE.Group();
  const half = width * 0.5;
  const postH = 5.2;

  for (const x of [-half, half]) {
    const base = shadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.25, 10), mats.concrete)
    );
    base.position.set(x, 0.12, 0);
    g.add(base);

    const post = shadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, postH, 10), mats.gate)
    );
    post.position.set(x, postH * 0.5, 0);
    g.add(post);

    const tip = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 8), mats.gateAccent));
    tip.position.set(x, postH + 0.15, 0);
    g.add(tip);
  }

  const cross = shadow(new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.18, 0.18), mats.gate));
  cross.position.y = postH - 0.35;
  g.add(cross);

  const banner = shadow(new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 1.05, 0.06), mats.gate));
  banner.position.y = postH - 1.1;
  g.add(banner);

  const stripe = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 0.18, 0.07), mats.gateAccent)
  );
  stripe.position.y = postH - 1.1;
  g.add(stripe);

  for (const x of [-width * 0.22, width * 0.22]) {
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), mats.flag);
    pennant.position.set(x, postH - 2.2, 0.08);
    pennant.castShadow = true;
    g.add(pennant);
  }

  return g;
}

export function buildFinishArch(width: number): THREE.Group {
  const g = new THREE.Group();
  const half = width * 0.5;
  const postH = 6.8;
  const checkerMat = new THREE.MeshStandardMaterial({
    color: 0x111820,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  for (const x of [-half, half]) {
    const plinth = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), mats.concrete));
    plinth.position.set(x, 0.22, 0);
    g.add(plinth);

    const post = shadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, postH, 12), mats.finish)
    );
    post.position.set(x, postH * 0.5 + 0.2, 0);
    g.add(post);
  }

  const arch = shadow(
    new THREE.Mesh(new THREE.TorusGeometry(width * 0.5, 0.16, 10, 28, Math.PI), mats.finish)
  );
  arch.rotation.z = Math.PI;
  arch.position.y = postH + 0.15;
  g.add(arch);

  const beam = shadow(new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.2, 0.2), mats.finish));
  beam.position.y = postH - 0.2;
  g.add(beam);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.75, 1.5), mats.finishBanner);
  banner.position.set(0, postH - 1.4, 0.05);
  g.add(banner);

  const cells = 10;
  const cellW = (width * 0.75) / cells;
  for (let i = 0; i < cells; i++) {
    if (i % 2 !== 0) continue;
    const cell = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.95, 1.45), checkerMat);
    cell.position.set(-width * 0.375 + cellW * (i + 0.5), postH - 1.4, 0.06);
    g.add(cell);
  }

  for (let i = 0; i < 5; i++) {
    const bunt = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.55, 6), mats.flag);
    bunt.rotation.x = Math.PI;
    bunt.position.set(-width * 0.3 + i * (width * 0.15), postH + 0.55, 0);
    g.add(bunt);
  }

  g.userData.checkerMat = checkerMat;
  return g;
}

export function buildFlag(): THREE.Group {
  const g = new THREE.Group();
  const pole = shadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.2, 8), mats.railDark)
  );
  pole.position.y = 2.6;
  g.add(pole);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1.8, 0.35);
  shape.lineTo(0, 0.9);
  shape.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), mats.flag);
  flag.position.set(0.05, 4.3, 0);
  flag.castShadow = true;
  g.add(flag);

  const ball = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mats.gateAccent));
  ball.position.y = 5.25;
  g.add(ball);
  return g;
}

/** Log-framed snow tunnel — ride-through arch with timber walls. Local −Z = through. */
export function buildTunnel(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const radius = 3.4 * scale;
  const length = 8.5 * scale;

  for (const z of [0, -length]) {
    const frame = shadow(
      new THREE.Mesh(new THREE.TorusGeometry(radius, 0.38 * scale, 8, 20, Math.PI), mats.tunnel)
    );
    frame.rotation.y = Math.PI / 2;
    frame.rotation.z = Math.PI;
    frame.position.set(0, radius * 0.15, z);
    g.add(frame);
  }

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i++) {
      const log = shadow(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.28 * scale, 0.32 * scale, length * 0.95, 8),
          mats.tunnel
        )
      );
      log.rotation.x = Math.PI / 2;
      log.position.set(side * (radius * 0.92), 0.35 + i * 0.55 * scale, -length * 0.5);
      g.add(log);
    }
  }

  for (let i = 0; i < 6; i++) {
    const rib = shadow(
      new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.95, 0.16 * scale, 6, 16, Math.PI),
        mats.woodDark
      )
    );
    rib.rotation.y = Math.PI / 2;
    rib.rotation.z = Math.PI;
    rib.position.set(0, radius * 0.12, -length * (i / 5));
    g.add(rib);
  }

  const snow = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(radius * 2.2, 0.35 * scale, length), mats.tunnelSnow)
  );
  snow.position.set(0, radius * 1.05, -length * 0.5);
  g.add(snow);

  for (let i = 0; i < 4; i++) {
    const sleeper = shadow(
      new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, 0.12, 0.35 * scale), mats.woodDark)
    );
    sleeper.position.set(0, 0.05, -length * (i / 3));
    g.add(sleeper);
  }

  return g;
}
