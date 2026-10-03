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
import { multiply } from '../sim/quat.js';
import { eggColour } from './eggs.js';

/**
 * Flesh as it fries: buttery yellow, gold, golden brown, a deep fried brown,
 * and burnt. Paced to the marking: anywhere the grade calls golden (half a
 * side's worth to one and a half) reads as gold to golden brown.
 */
const FRIED = ramp([
  [0.2, hex(0xf0d494)],
  [0.5, hex(0xeabd62)],
  [0.8, hex(0xdda049)],
  [1.1, hex(0xc8873a)],
  [1.45, hex(0x98582a)],
  [1.8, hex(0x4e2b13)],
  [2.2, hex(0x1c120a)],
]);

/** Below this the flesh is still more its own colour than the pan's. */
const FIRST = 0.2;

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

  /** Egg is soft and only a little glossy: no lacquer of oil on it the way fried potato has. */
  const eggMaterial = new GFX.MeshPhysicalMaterial({
    name: 'egg',
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.5,
    sheenColor: new GFX.Color(0xfff2c4),
    sheenRoughness: 0.6,
  });

  /** Ground pepper: dark flecks stuck to the surface. */
  const pepper = new GFX.MeshStandardMaterial({ name: 'pepper', color: 0x1f1813, roughness: 0.85, metalness: 0 });

  const views = new Map();
  let cursor = 0;

  /** A seeded generator per piece, so a piece's flecks stay put as more are added. */
  function rng(seed) {
    let t = (seed * 2654435761) >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * As much pepper as the piece has had, as flecks on its surface: a few
   * tiny dark grains at points picked over its area, riding with it.
   */
  function fleck(view) {
    const want = Math.min(16, Math.round((view.piece.pepper ?? 0) * 55));
    if (want === (view.flecks?.count ?? 0)) return;
    if (view.flecks) {
      view.mesh.remove(view.flecks.mesh);
      view.flecks.mesh.geometry.dispose();
      view.flecks = null;
    }
    if (want === 0) return;
    const { pos } = view.piece.solid;
    const tris = pos.length / 9;
    if (!view.areas) {
      view.areas = new Float32Array(tris);
      let sum = 0;
      for (let t = 0; t < tris; t++) {
        const o = t * 9;
        const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
        const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
        sum += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
        view.areas[t] = sum;
      }
    }
    const total = view.areas[tris - 1];
    const random = rng(view.piece.id);
    const out = new Float32Array(want * 12 * 3);
    const nrm = new Float32Array(want * 12 * 3);
    const CORNERS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const FACES = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    let w = 0;
    for (let n = 0; n < want; n++) {
      /** A point on the surface, chosen by area, and a hair out from it along the face. */
      const pick = random() * total;
      let lo = 0, hi = tris - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (view.areas[mid] < pick) lo = mid + 1;
        else hi = mid;
      }
      const o = lo * 9;
      let u = random(), v = random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
      const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const size = 0.028 + random() * 0.026;
      const c = [pos[o] + ax * u + bx * v + nx * size * 0.6, pos[o + 1] + ay * u + by * v + ny * size * 0.6, pos[o + 2] + az * u + bz * v + nz * size * 0.6];
      const corner = CORNERS.map(([x, y, z]) => [c[0] + x * size, c[1] + y * size * 0.6, c[2] + z * size]);
      for (const [i, j, k] of FACES) {
        const a = corner[i], b = corner[j], d = corner[k];
        const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2];
        let fnx = ey * fz - ez * fy, fny = ez * fx - ex * fz, fnz = ex * fy - ey * fx;
        const fl = Math.hypot(fnx, fny, fnz) || 1;
        fnx /= fl; fny /= fl; fnz /= fl;
        for (const q of [a, b, d]) {
          out.set(q, w);
          nrm.set([fnx, fny, fnz], w);
          w += 3;
        }
      }
    }
    const geometry = new GFX.BufferGeometry();
    geometry.setAttribute('position', new GFX.BufferAttribute(out, 3));
    geometry.setAttribute('normal', new GFX.BufferAttribute(nrm, 3));
    geometry.computeBoundingSphere();
    const mesh = new GFX.Mesh(geometry, pepper);
    mesh.name = 'pepper-flecks';
    view.mesh.add(mesh);
    view.flecks = { mesh, count: want };
  }

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

    const mesh = new GFX.Mesh(geometry, piece.kind === 'egg' ? eggMaterial : material);
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
    let rawG = 0;
    for (let i = 0; i < n; i++) rawG += base[i * 3 + 1] / n;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      let t = 0;
      for (let k = 0; k < 6; k++) t += weights[o + k] * b[k];
      eggColour(piece.core, piece.yolk ?? 0.33, t * wobble[i], fried);
      /** The streaks the curd was made with, carried through however cooked it gets. */
      const k = base[i * 3 + 1] / Math.max(1e-6, rawG);
      colour[i * 3] = fried[0] * (0.96 + 0.04 * k);
      colour[i * 3 + 1] = fried[1] * k;
      colour[i * 3 + 2] = fried[2] * (0.9 + 0.1 * k);
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
        if (t < FIRST) {
          FRIED(FIRST, fried);
          const k = t / FIRST;
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

    /**
     * The mesh for a piece, made the first time it is asked for, hung off
     * `parent`. `lean` is a turn on top of the piece's own, for a piece tipped
     * against the curve of the pan's wall.
     */
    show(piece, parent, lean = null) {
      const view = views.get(piece.id) ?? build(piece);
      if (view.mesh.parent !== parent) parent.add(view.mesh);
      view.mesh.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
      const q = lean ? multiply(lean, piece.rot) : piece.rot;
      view.mesh.quaternion.set(q[0], q[1], q[2], q[3]);
      fleck(view);
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
          view.flecks?.mesh.geometry.dispose();
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
