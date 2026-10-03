/**
 * What the ingredients come out of: a carton of eggs and a bottle of oil.
 */

import { EGG_SCALE, eggGeometry, shellMaterial } from '../food/egg.js';
import { cast } from './cast.js';
import { blend, carve, ellipsoid, extrude, planarUV, roundRect } from './sdf.js';
import { cartonLabel, oilLabel, pulp } from './textures.js';

/** The carton holds six, three by two. */
export const CARTON = Object.freeze({ columns: 3, rows: 2, pitch: 2.45, height: 1.15 });

export function buildCarton(GFX) {
  const group = new GFX.Group();
  group.name = 'carton';
  const map = pulp(GFX);
  const fibre = new GFX.MeshStandardMaterial({
    name: 'carton-pulp', color: map ? 0xffffff : 0xb9ab95, map, bumpMap: map, bumpScale: 2, roughness: 0.97, metalness: 0,
    side: GFX.DoubleSide,
  });

  const W = CARTON.columns * CARTON.pitch + 0.3, D = CARTON.rows * CARTON.pitch + 0.3, H = CARTON.height;
  const slots = [];
  for (let r = 0; r < CARTON.rows; r++) {
    for (let c = 0; c < CARTON.columns; c++) {
      slots.push({ x: (c - (CARTON.columns - 1) / 2) * CARTON.pitch, z: (r - (CARTON.rows - 1) / 2) * CARTON.pitch, y: 0.42 });
    }
  }
  const posts = [-CARTON.pitch / 2, CARTON.pitch / 2];

  /**
   * The tray, moulded in one: a block whose sides bulge round every cup, a
   * flat flange round the top, a cup scooped out under every egg, and a post
   * between each pair of cups that holds the lid off the eggs. It sits on the
   * counter, so its underside is never seen and never made: the box it is
   * cast in starts just above the bottom, and leaves it open.
   */
  const CUP = { y: 0.66, r: 0.98, h: 0.56 };
  const tray = (x, y, z) => {
    /** Only the cup it is over can be scooped out here; only the cups near it bulge here. */
    const near = slots[Math.min(CARTON.columns - 1, Math.max(0, Math.round(x / CARTON.pitch + (CARTON.columns - 1) / 2)))
      + CARTON.columns * (z < 0 ? 0 : 1)];
    const nx = x - near.x, nz = z - near.z;
    const hollow = Math.min(ellipsoid(nx, y - CUP.y, nz, CUP.r, CUP.h, CUP.r), Math.max(Math.hypot(nx, nz) - CUP.r, CUP.y - y));
    let bulge = Math.hypot(nx, nz) - 1.2;
    for (const slot of slots) {
      const dx = x - slot.x, dz = z - slot.z;
      if (slot !== near && Math.abs(dx) < 2.4 && Math.abs(dz) < 2.4) bulge = blend(bulge, Math.hypot(dx, dz) - 1.2, 0.5);
    }
    const body = extrude(bulge, y, -0.2, H - 0.1, 0.18);
    const flange = extrude(roundRect(x, z, W, D, 0.4), y, H - 0.16, H, 0.06);
    let solid = carve(blend(flange, body, 0.18), hollow, 0.12);
    for (const px of posts) {
      const rise = (y - H) / 1.35;
      const post = Math.max(Math.hypot(x - px, z) - 0.46 * (1 - rise * 0.75), y - (H + 1.35), H - 0.4 - y) * 0.8;
      solid = blend(solid, post, 0.25);
    }
    return solid;
  };
  const trayGeometry = planarUV(GFX, cast(GFX, { distance: tray, from: [-W / 2 - 0.15, 0.02, -D / 2 - 0.15], to: [W / 2 + 0.15, H + 1.45, D / 2 + 0.15], step: 0.12 }), 4);
  const trayMesh = new GFX.Mesh(trayGeometry, fibre);
  trayMesh.name = 'carton-tray';
  group.add(trayMesh);

  /**
   * The lid, folded open and leant back against the wall behind, inside out
   * to the room: a shallow open box, moulded the same, with the farm's stamp
   * printed inside it.
   */
  const lid = new GFX.Group();
  lid.name = 'carton-lid';
  const box = (x, y, z) => {
    const outer = extrude(roundRect(x, z, W, D, 0.45), y, 0, 1.2, 0.14);
    const inner = extrude(roundRect(x, z, W - 0.4, D - 0.4, 0.3), y, 0.2, 2, 0.1);
    return Math.max(outer, -inner);
  };
  /** Its outside is to the wall, so like the tray's underside it is left open. */
  const lidGeometry = planarUV(GFX, cast(GFX, { distance: box, from: [-W / 2 - 0.1, 0.04, -D / 2 - 0.1], to: [W / 2 + 0.1, 1.25, D / 2 + 0.1], step: 0.12 }), 4);
  lidGeometry.translate(0, 0, -D / 2);
  const lidMesh = new GFX.Mesh(lidGeometry, fibre);
  lidMesh.name = 'carton-lid-top';
  lid.add(lidMesh);
  const stamp = cartonLabel(GFX);
  if (stamp) {
    const label = new GFX.Mesh(
      new GFX.PlaneGeometry(4.4, 2.75),
      new GFX.MeshStandardMaterial({ name: 'carton-stamp', map: stamp, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false }),
    );
    label.name = 'carton-stamp';
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.21, -D / 2);
    lid.add(label);
  }
  lid.position.set(0, H, -D / 2);
  lid.rotation.x = Math.PI / 2 - 0.22;
  group.add(lid);

  const geometry = eggGeometry(GFX);
  const material = shellMaterial(GFX);
  const eggs = slots.map((slot, i) => {
    const egg = new GFX.Mesh(geometry, material);
    egg.name = `egg-${i + 1}`;
    egg.position.set(slot.x, slot.y, slot.z);
    egg.rotation.set(0.06 * Math.sin(i * 1.7), i * 1.3, 0.06 * Math.cos(i * 2.3));
    group.add(egg);
    return egg;
  });

  return { group, eggs, slots, eggHeight: geometry.boundingBox.max.y, eggScale: EGG_SCALE };
}

/**
 * A bottle of oil: olive glass with the gold showing through it, a gold foil
 * capsule round the neck, a black pourer, and a cream paper label round its
 * front. Drawn as see-through rather than refracting — a refracting bottle
 * costs the whole kitchen drawn twice a frame, and from across the counter
 * nobody can tell.
 */
export function buildBottle(GFX) {
  const group = new GFX.Group();
  group.name = 'oil';
  const glass = new GFX.MeshPhysicalMaterial({
    name: 'oil-bottle',
    color: 0xa8942a,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    depthWrite: false,
  });
  const R = 1.15, H = 5.2;
  const profile = [
    [0, 0], [R - 0.15, 0], [R, 0.16], [R, H * 0.7], [R * 0.95, H * 0.77], [R * 0.72, H * 0.85], [0.46, H * 0.93],
    [0.4, H * 0.98], [0.4, H + 0.9], [0.46, H + 1.0], [0, H + 1.0],
  ];
  const body = new GFX.Mesh(new GFX.LatheGeometry(profile.map(([x, y]) => new GFX.Vector2(x, y)), 48), glass);
  body.name = 'oil-glass';
  group.add(body);

  const foil = new GFX.MeshStandardMaterial({ name: 'oil-capsule', color: 0xd2ab62, roughness: 0.32, metalness: 1 });
  const capsule = new GFX.Mesh(new GFX.CylinderGeometry(0.47, 0.44, 0.9, 24), foil);
  capsule.name = 'oil-capsule';
  capsule.position.y = H + 0.6;
  group.add(capsule);
  const black = new GFX.MeshStandardMaterial({ name: 'oil-pourer', color: 0x141414, roughness: 0.4, metalness: 0.2 });
  const pourer = new GFX.Mesh(new GFX.CylinderGeometry(0.5, 0.52, 0.5, 20), black);
  pourer.name = 'oil-pourer';
  pourer.position.y = H + 1.3;
  group.add(pourer);
  const spout = new GFX.Mesh(new GFX.CylinderGeometry(0.1, 0.16, 1.1, 10), new GFX.MeshStandardMaterial({ name: 'oil-spout', color: 0xc8cbcf, roughness: 0.25, metalness: 1 }));
  spout.name = 'oil-spout';
  spout.position.set(0, H + 1.9, 0.18);
  spout.rotation.x = 0.5;
  group.add(spout);

  /** The label, round the front of it, facing the cook. */
  const art = oilLabel(GFX);
  const SPAN = 2.3;
  const label = new GFX.Mesh(
    new GFX.CylinderGeometry(R + 0.015, R + 0.015, 1.85, 32, 1, true, -SPAN / 2, SPAN),
    new GFX.MeshStandardMaterial({ name: 'oil-label', color: art ? 0xffffff : 0xe9dfc9, map: art, roughness: 0.85, metalness: 0 }),
  );
  label.name = 'oil-label';
  label.position.y = H * 0.4;
  group.add(label);
  /** A gold neck band, the small label every good bottle has. */
  const collar = new GFX.Mesh(new GFX.CylinderGeometry(R * 0.86 + 0.02, R * 0.95 + 0.02, 0.36, 40, 1, true), foil);
  collar.name = 'oil-collar';
  collar.position.y = H * 0.76;
  group.add(collar);

  return { group, height: H + 2.2, spout: new GFX.Vector3(0, H + 2.4, 0.45) };
}
