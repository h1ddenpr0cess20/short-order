/**
 * The things that are not the pan: a mixing bowl, a balloon whisk, a fish
 * spatula and a plate. Lathed, bent out of primitives or cast, all at the
 * scale the pan is drawn at, and all dressed alike: bottle-green glaze, cream
 * china, gilt, walnut and brass.
 */

import { cast } from './cast.js';
import { extrude } from './sdf.js';
import { walnut } from './textures.js';
import { floorFrom } from '../sim/heap.js';

/** The bowl's inside, as (radius, height) from the bottom of the well up to the rim. */
export const BOWL = Object.freeze({ rim: 3.6, depth: 2.7, floor: 1.55, wall: 0.16, foot: 0.22 });

/**
 * How wide the inside of the bowl is at height `y` above its floor — where a
 * surface of whatever is in it meets the glaze. The wall is a quarter ellipse
 * from the flat of the floor out to the rim.
 */
export function bowlRadius(y) {
  const t = Math.min(1, Math.max(0, y / BOWL.depth));
  return BOWL.floor + (BOWL.rim - BOWL.floor) * Math.sqrt(1 - (1 - t) * (1 - t));
}

const v2 = (GFX, points) => points.map(([x, y]) => new GFX.Vector2(x, y));

export function buildBowl(GFX) {
  const group = new GFX.Group();
  group.name = 'bowl';

  const glazeOut = new GFX.MeshPhysicalMaterial({
    name: 'bowl-glaze', color: 0x1f3d30, roughness: 0.2, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.1,
  });
  const glazeIn = new GFX.MeshPhysicalMaterial({
    name: 'bowl-inside', color: 0xf1ebe0, roughness: 0.22, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2,
  });

  const lift = BOWL.foot;
  /** Inside: from the middle of the floor, out and up to the rim — listed top down so it faces in. */
  const inside = [];
  for (let k = 20; k >= 0; k--) {
    const y = (k / 20) * BOWL.depth;
    inside.push([bowlRadius(y), lift + y]);
  }
  inside.push([0, lift]);
  const insideMesh = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, inside), 44), glazeIn);
  insideMesh.name = 'bowl-inside';
  group.add(insideMesh);

  /** Outside: the foot, the belly, and over the rounded rim to meet the inside. */
  const outside = [[0, 0], [BOWL.floor * 0.82, 0], [BOWL.floor * 0.86, lift * 0.5]];
  for (let k = 0; k <= 20; k++) {
    const y = (k / 20) * BOWL.depth;
    outside.push([bowlRadius(y) + BOWL.wall, lift + y - BOWL.wall * 0.5 * (1 - k / 20)]);
  }
  for (let k = 1; k <= 6; k++) {
    const a = (k / 6) * Math.PI;
    outside.push([BOWL.rim + BOWL.wall / 2 + Math.cos(a) * BOWL.wall / 2, lift + BOWL.depth + Math.sin(a) * 0.09]);
  }
  const outsideMesh = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, outside), 44), glazeOut);
  outsideMesh.name = 'bowl-outside';
  group.add(outsideMesh);

  /** A gilt line round the top of the rim. */
  const rim = new GFX.Mesh(
    new GFX.TorusGeometry(BOWL.rim + BOWL.wall / 2, 0.055, 8, 72),
    new GFX.MeshStandardMaterial({ name: 'bowl-gilt', color: 0xd8b26a, roughness: 0.28, metalness: 1 }),
  );
  rim.name = 'bowl-gilt';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = lift + BOWL.depth + 0.07;
  group.add(rim);

  return { group, floor: lift };
}

/**
 * A balloon whisk: a steel handle and eight wire loops through it. Built
 * standing up, handle on top, the bottom of the loops at y = 0.
 */
export function buildWhisk(GFX) {
  const group = new GFX.Group();
  group.name = 'whisk';
  const wire = new GFX.MeshStandardMaterial({ name: 'whisk-wire', color: 0xd8dbdf, roughness: 0.22, metalness: 1 });
  const grain = walnut(GFX, { seed: 43 });
  const handleMat = new GFX.MeshPhysicalMaterial({
    name: 'whisk-handle', color: grain ? 0xffffff : 0x4a2f1d, map: grain, roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3,
  });
  const brass = new GFX.MeshStandardMaterial({ name: 'whisk-brass', color: 0xd0a95e, roughness: 0.3, metalness: 1 });

  const loops = new GFX.Group();
  loops.name = 'whisk-loops';
  const torus = new GFX.TorusGeometry(1, 0.03, 6, 56);
  for (let k = 0; k < 6; k++) {
    const loop = new GFX.Mesh(torus, wire);
    loop.name = 'whisk-wire';
    /** A ring stretched tall and pinched at the top into the handle. */
    loop.scale.set(0.85, 1.9, 1);
    loop.position.y = 1.9;
    loop.rotation.y = (k / 6) * Math.PI;
    loops.add(loop);
  }
  group.add(loops);

  const ferrule = new GFX.Mesh(new GFX.CylinderGeometry(0.22, 0.17, 0.8, 20), brass);
  ferrule.name = 'whisk-ferrule';
  ferrule.position.y = 4.0;
  group.add(ferrule);
  /** A turned handle: a collar, a swell to hold, and a rounded end. */
  const handle = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [0, 0], [0.24, 0], [0.27, 0.1], [0.22, 0.3], [0.26, 1.4], [0.31, 2.6], [0.3, 3.2], [0.22, 3.5], [0.1, 3.62], [0, 3.64],
  ]), 24), handleMat);
  handle.name = 'whisk-handle';
  handle.position.y = 4.35;
  group.add(handle);
  return { group, loops };
}

/**
 * A fish spatula: a thin, slotted, slightly flexible blade and a wooden handle.
 * Built with the blade flat on y = 0, its front edge along x at z = 0 and the
 * handle running back towards +z and up.
 */
export function buildSpatula(GFX) {
  const group = new GFX.Group();
  group.name = 'spatula';
  const steel = new GFX.MeshStandardMaterial({ name: 'spatula-steel', color: 0xd4d7db, roughness: 0.26, metalness: 1, side: GFX.DoubleSide });
  const grain = walnut(GFX, { seed: 47 });
  const wood = new GFX.MeshPhysicalMaterial({
    name: 'spatula-wood', color: grain ? 0xffffff : 0x4a2f1d, map: grain, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3,
  });
  const brass = new GFX.MeshStandardMaterial({ name: 'spatula-brass', color: 0xd0a95e, roughness: 0.3, metalness: 1 });

  /**
   * The blade: one thin sheet, widest at its bevelled front edge and tapering
   * back to the neck, with five long slots cut through it on a slant — cast,
   * so the slots are cut clean with rounded ends.
   */
  const W = 2.6, L = 3.1, T = 0.06;
  const SLOTS = 5, SLOT = 0.055, TILT = 0.12;
  const half = (z) => (W / 2) * (1 - 0.26 * Math.min(1, Math.max(0, z / L)));
  const distance = (x, y, z) => {
    const r = 0.22;
    const qx = Math.abs(x) - half(z) + r, qz = Math.abs(z - L / 2) - L / 2 + r;
    let flat = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
    for (let k = 0; k < SLOTS; k++) {
      const z0 = 0.5, z1 = L - 0.55;
      const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
      const sz = z0 + (z1 - z0) * t;
      const sx = (k - (SLOTS - 1) / 2) * 0.4 * (1 - 0.22 * (sz / L)) + TILT * (sz - L / 2);
      flat = Math.max(flat, SLOT - Math.hypot(x - sx, z - sz));
    }
    return extrude(flat, y, 0, T, 0.02);
  };
  /** Sampled so that at least one row of the grid always falls inside the sheet. */
  const blade = new GFX.Mesh(cast(GFX, { distance, from: [-1.42, -0.03, -0.07], to: [1.42, 0.13, L + 0.07], step: 0.04 }), steel);
  blade.name = 'spatula-blade';
  group.add(blade);

  const neck = new GFX.Mesh(
    new GFX.BoxGeometry(0.28, 0.06, 2.2),
    new GFX.MeshStandardMaterial({ name: 'spatula-tang', color: 0xa9adb3, roughness: 0.45, metalness: 1 }),
  );
  neck.name = 'spatula-neck';
  neck.position.set(0, 0.35, L + 0.95);
  neck.rotation.x = -0.32;
  group.add(neck);
  /** The handle: walnut scales on the tang, held by brass rivets, a brass collar where the steel goes in. */
  const handle = new GFX.Mesh(new GFX.CylinderGeometry(0.3, 0.26, 4.4, 20), wood);
  handle.name = 'spatula-handle';
  handle.rotation.x = Math.PI / 2 - 0.32;
  handle.position.set(0, 1.35, L + 3.9);
  handle.scale.set(1, 1, 0.78);
  group.add(handle);
  const along = new GFX.Vector3(0, Math.sin(0.32), Math.cos(0.32));
  const collar = new GFX.Mesh(new GFX.CylinderGeometry(0.27, 0.3, 0.36, 20), brass);
  collar.name = 'spatula-collar';
  collar.rotation.copy(handle.rotation);
  collar.scale.set(1, 1, 0.8);
  collar.position.copy(handle.position).addScaledVector(along, -2.2);
  group.add(collar);
  const rivetGeo = new GFX.SphereGeometry(0.075, 10, 6);
  for (const s of [-1.1, 0.2, 1.5]) {
    for (const side of [-1, 1]) {
      const rivet = new GFX.Mesh(rivetGeo, brass);
      rivet.name = 'spatula-rivet';
      rivet.position.copy(handle.position).addScaledVector(along, s);
      rivet.position.x = side * 0.225;
      group.add(rivet);
    }
  }
  return { group, width: W, length: L };
}

/** A cream plate with a wide rim, a green band and gilt edge. Its well is at y = 0.18. */
export const PLATE = Object.freeze({ radius: 5.2, well: 3.3, floor: 0.18 });

/** The plate's top: the well, the rise out of it, and the rim out to the edge. */
const PLATE_TOP = [[0, PLATE.floor], [PLATE.well, PLATE.floor], [PLATE.well + 0.5, 0.32], [PLATE.radius - 0.4, 0.55], [PLATE.radius, 0.62]];

/** What is served heaps in the well, and a little way up out of it. */
export const plateDish = Object.freeze({ floor: floorFrom(PLATE_TOP), reach: PLATE.well + 0.3 });

export function buildPlate(GFX) {
  const porcelain = new GFX.MeshPhysicalMaterial({
    name: 'plate', color: 0xf1ead9, roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.14,
  });
  const R = PLATE.radius, W = PLATE.well;
  const top = PLATE_TOP;
  const profile = [...top, [R + 0.05, 0.57], [R - 0.06, 0.47], [R - 0.4, 0.38], [W + 0.4, 0.12], [W * 0.75, 0], [0, 0]];
  /** Top surface listed outward then round under the rim and back in along the bottom. */
  const mesh = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [...profile].reverse()), 72), porcelain);
  mesh.name = 'plate';
  const group = new GFX.Group();
  group.name = 'plate';
  group.add(mesh);

  /** Where the top of the rim is, `r` out: for laying the band on it. */
  const rimY = plateDish.floor;
  const band = (from, to, material, name) => {
    const points = [];
    for (let k = 0; k <= 4; k++) {
      const r = to + ((from - to) * k) / 4;
      points.push([r, rimY(r) + 0.006]);
    }
    const ring = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, points), 96), material);
    ring.name = name;
    group.add(ring);
  };
  const gold = new GFX.MeshStandardMaterial({ name: 'plate-gilt', color: 0xd8b26a, roughness: 0.26, metalness: 1 });
  const green = new GFX.MeshPhysicalMaterial({ name: 'plate-band', color: 0x1f3d30, roughness: 0.22, metalness: 0, clearcoat: 0.8 });
  band(W + 0.95, W + 1.12, green, 'plate-band');
  band(W + 1.2, W + 1.25, gold, 'plate-line');
  const edge = new GFX.Mesh(new GFX.TorusGeometry(R - 0.02, 0.055, 8, 96), gold);
  edge.name = 'plate-gilt';
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.59;
  group.add(edge);
  return { group };
}
