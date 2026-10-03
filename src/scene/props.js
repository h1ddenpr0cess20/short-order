/**
 * Things on the counter round the job: a folded tea towel, which is only
 * there to be there — a kitchen with nothing in it but the job looks like a
 * stage — and the pepper mill, the little wooden dish of salt and the butter,
 * which the cook reaches for.
 */

import { towel } from './textures.js';

export function buildTowel(GFX) {
  const map = towel(GFX);
  const cloth = new GFX.MeshStandardMaterial({ name: 'towel', color: map ? 0xffffff : 0xefe7d6, map, roughness: 0.95, metalness: 0 });
  const group = new GFX.Group();
  group.name = 'towel';
  /** Folded in three, so three slabs, each a hair smaller than the one under it. */
  for (let k = 0; k < 3; k++) {
    const slab = new GFX.Mesh(new GFX.BoxGeometry(7.2 - k * 0.06, 0.12, 3.6 - k * 0.05), cloth);
    slab.name = 'towel-fold';
    slab.position.y = 0.06 + k * 0.12;
    slab.rotation.y = k * 0.012;
    group.add(slab);
  }
  return { group };
}

export function buildMill(GFX) {
  const wood = new GFX.MeshStandardMaterial({ name: 'mill-wood', color: 0x5a3a22, roughness: 0.45, metalness: 0 });
  const steel = new GFX.MeshStandardMaterial({ name: 'mill-steel', color: 0xc9ccd0, roughness: 0.3, metalness: 1 });
  const profile = [[0, 0], [0.95, 0], [1.0, 0.25], [0.78, 1.4], [0.74, 2.6], [0.92, 3.6], [0.98, 4.2], [0.7, 4.6], [0.3, 4.9], [0, 4.95]];
  const body = new GFX.Mesh(new GFX.LatheGeometry(profile.map(([x, y]) => new GFX.Vector2(x, y)), 32), wood);
  body.name = 'mill-body';
  const knob = new GFX.Mesh(new GFX.SphereGeometry(0.22, 12, 8), steel);
  knob.name = 'mill-knob';
  knob.position.y = 5.05;
  const group = new GFX.Group();
  group.name = 'pepper-mill';
  group.add(body, knob);
  return { group, height: 5 };
}

export function buildSaltDish(GFX) {
  const wood = new GFX.MeshStandardMaterial({ name: 'salt-dish', color: 0x8a6440, roughness: 0.55, metalness: 0 });
  const salt = new GFX.MeshStandardMaterial({ name: 'salt', color: 0xf4f2ee, roughness: 1, metalness: 0 });
  const outside = [[0, 0], [1.1, 0], [1.4, 0.5], [1.5, 1.0], [1.36, 1.02], [1.25, 0.6], [0, 0.45]];
  const dish = new GFX.Mesh(new GFX.LatheGeometry(outside.map(([x, y]) => new GFX.Vector2(x, y)).reverse(), 32), wood);
  dish.name = 'salt-dish';
  const heap = new GFX.Mesh(new GFX.SphereGeometry(1.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), salt);
  heap.name = 'salt';
  heap.scale.set(1, 0.32, 1);
  heap.position.y = 0.6;
  const group = new GFX.Group();
  group.name = 'salt';
  group.add(dish, heap);
  return { group, height: 1.1 };
}

/** How many pats there are in a stick of butter. */
export const PATS = 8;

/**
 * A stick of butter on a white dish. Every pat taken off it shortens the
 * stick from the cut end; `left(k)` shows it with that share still there.
 */
export function buildButter(GFX) {
  const china = new GFX.MeshStandardMaterial({ name: 'butter-dish', color: 0xf7f5ef, roughness: 0.25, metalness: 0 });
  const fat = new GFX.MeshStandardMaterial({ name: 'butter', color: 0xf4dc8a, roughness: 0.42, metalness: 0 });
  const group = new GFX.Group();
  group.name = 'butter';
  const dish = new GFX.Mesh(new GFX.BoxGeometry(4.6, 0.22, 2.4), china);
  dish.name = 'butter-dish';
  dish.position.y = 0.11;
  group.add(dish);
  for (const [w, d, x, z] of [[4.6, 0.14, 0, -1.13], [4.6, 0.14, 0, 1.13], [0.14, 2.4, -2.23, 0], [0.14, 2.4, 2.23, 0]]) {
    const lip = new GFX.Mesh(new GFX.BoxGeometry(w, 0.2, d), china);
    lip.name = 'butter-dish-lip';
    lip.position.set(x, 0.3, z);
    group.add(lip);
  }
  const LENGTH = 3.6;
  const stick = new GFX.Mesh(new GFX.BoxGeometry(LENGTH, 1.0, 1.2), fat);
  stick.name = 'butter-stick';
  stick.position.set(0, 0.72, 0);
  group.add(stick);
  return {
    group,
    height: 1.3,
    /** Shows the stick with `k` of it left: shorter from the right-hand, cut end. */
    left(k) {
      const keep = Math.max(0, Math.min(1, k));
      stick.visible = keep > 0.01;
      stick.scale.x = Math.max(0.01, keep);
      stick.position.x = -LENGTH / 2 + (LENGTH * keep) / 2;
    },
  };
}
