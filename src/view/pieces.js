/**
 * Pieces of food as meshes: one per piece, its colour worked out per vertex
 * from how browned each of the piece's six sides is.
 *
 * A vertex takes its share of each side by the way it faces, so the colour
 * runs smoothly round a curved bit of skin and changes sharply at the edge of
 * a cube. The cut faces — flesh — go from cream through gold to brown and
 * then to black; the skin just darkens. Each vertex also has a little jitter
 * of its own, so a browned face comes out mottled rather than painted.
 *
 * Repainting is the expensive part, so it is spread over frames: a few pieces
 * each frame, round robin, which is far faster than anything browns.
 */

import { hex, ramp } from '../food/colour.js';
import { sideWeights } from '../sim/piece.js';
import { eggColour } from './eggs.js';

/** Flesh as it fries: cream, a buttery yellow, gold, a deep fried brown, and burnt. */
const FRIED = ramp([
  [0.35, hex(0xf2dc96)],
  [0.75, hex(0xedc469)],
  [1.0, hex(0xe0a94a)],
  [1.3, hex(0xb8742c)],
  [1.6, hex(0x6e3d17)],
  [2.1, hex(0x21150c)],
]);

/** How a piece cooked through looks against raw: a little more yellow, a little less chalky. */
const COOKED = [1.0, 0.95, 0.78];

function jitter(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createPieceViews(GFX) {
  const material = new GFX.MeshPhysicalMaterial({
    name: 'food',
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  });

  const views = new Map();
  let cursor = 0;

  function build(piece) {
    const { solid } = piece;
    const n = solid.pos.length / 3;
    const geometry = new GFX.BufferGeometry();
    geometry.setAttribute('position', new GFX.BufferAttribute(solid.pos, 3));
    geometry.setAttribute('normal', new GFX.BufferAttribute(solid.nrm, 3));
    const colour = new Float32Array(n * 3);
    geometry.setAttribute('color', new GFX.BufferAttribute(colour, 3));
    geometry.computeBoundingSphere();

    /** Per vertex: its share of each side, whether it is skin, and its own little offset. */
    const weights = new Float32Array(n * 6);
    const w = new Float32Array(6);
    const skin = new Uint8Array(n);
    const wobble = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sideWeights(solid.nrm[i * 3], solid.nrm[i * 3 + 1], solid.nrm[i * 3 + 2], w);
      weights.set(w, i * 6);
      skin[i] = solid.cap[Math.floor(i / 3)] ? 0 : 1;
      wobble[i] = 0.9 + 0.2 * jitter(solid.pos[i * 3] * 0.6, solid.pos[i * 3 + 1] * 0.6, solid.pos[i * 3 + 2] * 0.6);
    }

    const mesh = new GFX.Mesh(geometry, material);
    mesh.name = `piece-${piece.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const view = { mesh, geometry, colour, weights, skin, wobble, piece, painted: -1 };
    views.set(piece.id, view);
    paint(view);
    return view;
  }

  const fried = [0, 0, 0];

  /** A curd of egg is one colour all over that sets, dries and browns where it lies on the iron. */
  function paintEgg(view) {
    const { piece, colour, weights, wobble } = view;
    const b = piece.brown;
    const base = piece.solid.col;
    const n = colour.length / 3;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      let t = 0;
      for (let k = 0; k < 6; k++) t += weights[o + k] * b[k];
      eggColour(piece.core, piece.yolk ?? 0.33, t * wobble[i], fried);
      const m = base[i * 3] / (base[i * 3] + base[i * 3 + 1] + base[i * 3 + 2] + 1e-6) * 3;
      colour[i * 3] = fried[0] * (0.97 + 0.03 * m);
      colour[i * 3 + 1] = fried[1];
      colour[i * 3 + 2] = fried[2];
    }
    view.geometry.attributes.color.needsUpdate = true;
  }

  function paint(view) {
    if (view.piece.kind === 'egg') {
      paintEgg(view);
      return;
    }
    const { piece, colour, weights, skin, wobble } = view;
    const base = piece.solid.col;
    const b = piece.brown;
    const core = Math.min(1, piece.core);
    const n = colour.length / 3;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      let t = 0;
      for (let k = 0; k < 6; k++) t += weights[o + k] * b[k];
      t *= wobble[i];
      const r = base[i * 3], g = base[i * 3 + 1], bl = base[i * 3 + 2];
      if (skin[i]) {
        /** Skin only darkens, and goes black past burnt like anything else. */
        const k = 1 - 0.42 * smooth(0.3, 1.4, t) - 0.45 * smooth(1.4, 2.0, t);
        colour[i * 3] = r * k;
        colour[i * 3 + 1] = g * k;
        colour[i * 3 + 2] = bl * k;
      } else {
        const cr = r * (1 + (COOKED[0] - 1) * core), cg = g * (1 + (COOKED[1] - 1) * core), cb = bl * (1 + (COOKED[2] - 1) * core);
        if (t < 0.35) {
          FRIED(0.35, fried);
          const k = t / 0.35;
          colour[i * 3] = cr + (fried[0] - cr) * k * k;
          colour[i * 3 + 1] = cg + (fried[1] - cg) * k * k;
          colour[i * 3 + 2] = cb + (fried[2] - cb) * k * k;
        } else {
          FRIED(t, fried);
          colour[i * 3] = fried[0];
          colour[i * 3 + 1] = fried[1];
          colour[i * 3 + 2] = fried[2];
        }
      }
    }
    view.geometry.attributes.color.needsUpdate = true;
  }

  return {
    material,

    /** The mesh for a piece, made the first time it is asked for, hung off `parent`. */
    show(piece, parent) {
      const view = views.get(piece.id) ?? build(piece);
      if (view.mesh.parent !== parent) parent.add(view.mesh);
      view.mesh.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
      view.mesh.quaternion.set(piece.rot[0], piece.rot[1], piece.rot[2], piece.rot[3]);
      view.seen = true;
      return view.mesh;
    },

    /** Repaints `count` of the pieces shown, the ones longest since their last coat. */
    repaint(count = 8) {
      const list = [...views.values()];
      if (list.length === 0) return;
      for (let k = 0; k < Math.min(count, list.length); k++) {
        cursor = (cursor + 1) % list.length;
        paint(list[cursor]);
      }
    },

    paintNow(piece) {
      const view = views.get(piece.id);
      if (view) paint(view);
    },

    /** Drops the meshes of any piece that was not shown since the last sweep. */
    sweep() {
      for (const [id, view] of views) {
        if (!view.seen) {
          view.mesh.removeFromParent();
          view.geometry.dispose();
          views.delete(id);
        }
        view.seen = false;
      }
    },

    mesh(piece) {
      return views.get(piece.id)?.mesh ?? null;
    },
  };
}

function smooth(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
