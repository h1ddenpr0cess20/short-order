/**
 * The things that are not the pan: a mixing bowl, a balloon whisk, a fish
 * spatula and a plate. All lathed or bent out of primitives, all at the scale
 * the pan is drawn at.
 */

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
    name: 'bowl-glaze', color: 0x6f8f86, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
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
  const handleMat = new GFX.MeshStandardMaterial({ name: 'whisk-handle', color: 0x2c2b2a, roughness: 0.5, metalness: 0.1 });

  const loops = new GFX.Group();
  loops.name = 'whisk-loops';
  const torus = new GFX.TorusGeometry(1, 0.035, 6, 48);
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

  const ferrule = new GFX.Mesh(new GFX.CylinderGeometry(0.2, 0.26, 0.7, 16), wire);
  ferrule.name = 'whisk-ferrule';
  ferrule.position.y = 3.95;
  group.add(ferrule);
  const handle = new GFX.Mesh(new GFX.CylinderGeometry(0.26, 0.2, 3.6, 16), handleMat);
  handle.name = 'whisk-handle';
  handle.position.y = 6.1;
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
  const steel = new GFX.MeshStandardMaterial({ name: 'spatula-steel', color: 0xd4d7db, roughness: 0.3, metalness: 1, side: GFX.DoubleSide });
  const wood = new GFX.MeshStandardMaterial({ name: 'spatula-wood', color: 0x6b4423, roughness: 0.6, metalness: 0 });

  /** The blade, as slats between the slots: wider at the front, angled a touch. */
  const blade = new GFX.Group();
  blade.name = 'spatula-blade';
  const W = 2.6, L = 3.1;
  const slats = 6;
  for (let k = 0; k < slats; k++) {
    const x0 = -W / 2 + (k / slats) * W;
    const slat = new GFX.Mesh(new GFX.BoxGeometry(W / slats * 0.62, 0.04, L * 0.86), steel);
    slat.name = 'spatula-slat';
    slat.position.set(x0 + W / slats / 2, 0.02, L * 0.5);
    blade.add(slat);
  }
  const front = new GFX.Mesh(new GFX.BoxGeometry(W, 0.04, 0.26), steel);
  front.name = 'spatula-edge';
  front.position.set(0, 0.02, 0.13);
  blade.add(front);
  const backBar = new GFX.Mesh(new GFX.BoxGeometry(W * 0.8, 0.05, 0.3), steel);
  backBar.name = 'spatula-heel';
  backBar.position.set(0, 0.025, L - 0.1);
  blade.add(backBar);
  group.add(blade);

  const neck = new GFX.Mesh(new GFX.BoxGeometry(0.28, 0.06, 2.2), steel);
  neck.name = 'spatula-neck';
  neck.position.set(0, 0.35, L + 0.95);
  neck.rotation.x = -0.32;
  group.add(neck);
  const handle = new GFX.Mesh(new GFX.CylinderGeometry(0.3, 0.26, 4.4, 16), wood);
  handle.name = 'spatula-handle';
  handle.rotation.x = Math.PI / 2 - 0.32;
  handle.position.set(0, 1.35, L + 3.9);
  group.add(handle);
  return { group, width: W, length: L };
}

/** A white plate with a wide rim. Its well is at y = 0.18. */
export const PLATE = Object.freeze({ radius: 5.2, well: 3.3, floor: 0.18 });

export function buildPlate(GFX) {
  const porcelain = new GFX.MeshPhysicalMaterial({
    name: 'plate', color: 0xe6e1d8, roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18,
  });
  const R = PLATE.radius, W = PLATE.well;
  const profile = [
    [0, PLATE.floor], [W, PLATE.floor], [W + 0.5, 0.32], [R - 0.4, 0.55], [R, 0.62],
    [R + 0.06, 0.52], [R - 0.3, 0.4], [W + 0.4, 0.12], [W * 0.75, 0], [0, 0],
  ];
  /** Top surface listed outward then round under the rim and back in along the bottom. */
  const mesh = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [...profile].reverse()), 72), porcelain);
  mesh.name = 'plate';
  const group = new GFX.Group();
  group.name = 'plate';
  group.add(mesh);
  return { group };
}
