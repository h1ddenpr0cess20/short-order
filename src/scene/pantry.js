/**
 * What the ingredients come out of: a carton of eggs and a bottle of oil.
 */

import { EGG_SCALE, eggGeometry, shellMaterial } from '../food/egg.js';

/** The carton holds six, three by two. */
export const CARTON = Object.freeze({ columns: 3, rows: 2, pitch: 2.45, height: 1.15 });

export function buildCarton(GFX) {
  const group = new GFX.Group();
  group.name = 'carton';
  const pulp = new GFX.MeshStandardMaterial({ name: 'carton-pulp', color: 0xb9ab95, roughness: 0.96, metalness: 0 });
  const pulpDark = new GFX.MeshStandardMaterial({ name: 'carton-pulp-dark', color: 0xa39782, roughness: 0.98, metalness: 0 });

  const W = CARTON.columns * CARTON.pitch + 0.3, D = CARTON.rows * CARTON.pitch + 0.3;
  const tray = new GFX.Mesh(new GFX.BoxGeometry(W, 0.35, D), pulp);
  tray.name = 'carton-tray';
  tray.position.y = CARTON.height - 0.17;
  group.add(tray);

  const cupGeo = new GFX.CylinderGeometry(1.05, 0.72, CARTON.height - 0.2, 20, 1, true);
  const slots = [];
  for (let r = 0; r < CARTON.rows; r++) {
    for (let c = 0; c < CARTON.columns; c++) {
      const x = (c - (CARTON.columns - 1) / 2) * CARTON.pitch;
      const z = (r - (CARTON.rows - 1) / 2) * CARTON.pitch;
      const cup = new GFX.Mesh(cupGeo, pulpDark);
      cup.name = 'carton-cup';
      cup.position.set(x, (CARTON.height - 0.2) / 2, z);
      group.add(cup);
      slots.push({ x, z, y: 0.42 });
    }
  }
  /** The posts between the cups that keep the lid off the eggs. */
  for (const x of [-CARTON.pitch / 2, CARTON.pitch / 2]) {
    const post = new GFX.Mesh(new GFX.ConeGeometry(0.4, 1.4, 12), pulp);
    post.name = 'carton-post';
    post.position.set(x, CARTON.height + 0.6, 0);
    group.add(post);
  }

  /** The lid, folded open past flat and tipped down onto the counter behind, inside up. */
  const lid = new GFX.Group();
  lid.name = 'carton-lid';
  const lidTop = new GFX.Mesh(new GFX.BoxGeometry(W, 0.12, D), pulp);
  lidTop.name = 'carton-lid-top';
  lidTop.position.set(0, 0, -D / 2);
  lid.add(lidTop);
  for (const s of [-1, 1]) {
    const flap = new GFX.Mesh(new GFX.BoxGeometry(0.12, 1.2, D), pulpDark);
    flap.name = 'carton-lid-side';
    flap.position.set(s * (W / 2 - 0.06), 0.6, -D / 2);
    lid.add(flap);
  }
  const lip = new GFX.Mesh(new GFX.BoxGeometry(W, 1.2, 0.12), pulpDark);
  lip.name = 'carton-lid-front';
  lip.position.set(0, 0.6, -D + 0.06);
  lid.add(lip);
  lid.position.set(0, CARTON.height, -D / 2);
  lid.rotation.x = -0.3;
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
 * A bottle of oil: green glass, gold inside, a black pourer in the neck. Drawn
 * as see-through rather than refracting — a refracting bottle costs the whole
 * kitchen drawn twice a frame, and from across the counter nobody can tell.
 */
export function buildBottle(GFX) {
  const group = new GFX.Group();
  group.name = 'oil';
  const glass = new GFX.MeshPhysicalMaterial({
    name: 'oil-bottle',
    color: 0xc2a32a,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    depthWrite: false,
  });
  const R = 1.15, H = 5.2;
  const profile = [[0, 0], [R - 0.15, 0], [R, 0.18], [R, H * 0.72], [R * 0.86, H * 0.82], [0.42, H * 0.95], [0.4, H + 0.9], [0.46, H + 1.0], [0, H + 1.0]];
  const body = new GFX.Mesh(new GFX.LatheGeometry(profile.map(([x, y]) => new GFX.Vector2(x, y)), 48), glass);
  body.name = 'oil-glass';
  group.add(body);

  const black = new GFX.MeshStandardMaterial({ name: 'oil-pourer', color: 0x141414, roughness: 0.4, metalness: 0.2 });
  const pourer = new GFX.Mesh(new GFX.CylinderGeometry(0.52, 0.52, 0.6, 20), black);
  pourer.name = 'oil-pourer';
  pourer.position.y = H + 1.25;
  group.add(pourer);
  const spout = new GFX.Mesh(new GFX.CylinderGeometry(0.1, 0.16, 1.1, 10), new GFX.MeshStandardMaterial({ name: 'oil-spout', color: 0xc8cbcf, roughness: 0.25, metalness: 1 }));
  spout.name = 'oil-spout';
  spout.position.set(0, H + 1.9, 0.18);
  spout.rotation.x = 0.5;
  group.add(spout);

  /** A paper label round the shoulder of it. */
  const label = new GFX.Mesh(
    new GFX.CylinderGeometry(R + 0.015, R + 0.015, 1.7, 48, 1, true),
    new GFX.MeshStandardMaterial({ name: 'oil-label', color: 0xe9dfc9, roughness: 0.9, metalness: 0 }),
  );
  label.name = 'oil-label';
  label.position.y = H * 0.42;
  group.add(label);
  const band = new GFX.Mesh(
    new GFX.CylinderGeometry(R + 0.02, R + 0.02, 0.28, 48, 1, true),
    new GFX.MeshStandardMaterial({ name: 'oil-label-band', color: 0x56682f, roughness: 0.8, metalness: 0 }),
  );
  band.name = 'oil-label-band';
  band.position.y = H * 0.42 + 0.5;
  group.add(band);

  return { group, height: H + 2.2, spout: new GFX.Vector3(0, H + 2.4, 0.45) };
}
