/**
 * A curd of scrambled egg: a soft, lumpy, flattened blob, folded over on
 * itself the way egg comes off a spatula. An icosahedron, subdivided once,
 * pushed in and out by noise and squashed flat — every one a little different.
 */

import { hex, mix } from './colour.js';
import { vnoise } from './noise.js';
import { measure, solidFromBuffers } from '../geometry/slice.js';

const WHITE = hex(0xf3ead2);
const YOLK = hex(0xf2a71e);

/** Raw egg of a given yolkiness: 0 all white, 1 all yolk, a third is beaten whole egg. */
export function rawEgg(yolk) {
  return mix(WHITE, YOLK, Math.min(1, Math.max(0, yolk * 2.6)));
}

function icosphere() {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
  let f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  /** Once round: every edge split at its middle, pushed back out to the sphere. */
  const mids = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let i = mids.get(key);
    if (i === undefined) {
      const p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
      const l = Math.hypot(...p);
      i = v.length;
      v.push([p[0] / l, p[1] / l, p[2] / l]);
      mids.set(key, i);
    }
    return i;
  };
  const next = [];
  for (const [a, b, c] of f) {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  f = next;
  return { v, f, mid };
}

/** Subdivided twice: enough vertices for the lumps to read as lumps, not facets. */
function finer() {
  const once = icosphere();
  const { v, mid } = once;
  const next = [];
  for (const [a, b, c] of once.f) {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { v, f: next };
}

const BASE = finer();

/**
 * A curd holding `volume` of egg, of the given yolkiness. `seed` decides its
 * lumps. Lies flat, its middle at the origin.
 */
export function curdSolid({ volume = 0.16, yolk = 0.33, seed = 1 } = {}) {
  const { v, f } = BASE;
  /** A flattened ellipsoid this size holds about `volume`: (4/3)π a·a·(0.45a). */
  const a = Math.cbrt(volume / ((4 / 3) * Math.PI * 0.45)) * 1.05;
  const r = (k) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const stretch = 0.75 + r(1) * 0.7;
  const flat = 0.32 + r(2) * 0.22;
  /** Folded: the ends curl up a little, as egg does pushed off the iron in a sheet. */
  const fold = (r(3) - 0.3) * 0.9;
  const twist = r(4) * Math.PI;
  const positions = new Float64Array(v.length * 3);
  v.forEach(([x, y, z], i) => {
    /** Big soft folds, then the cauliflower lumps, then a little roughness. */
    const n = 1 + 0.45 * vnoise(x * 1.5 + seed * 3.1, y * 1.5 + seed * 1.3, z * 1.5 + seed * 7.7)
      + 0.26 * Math.abs(vnoise(x * 3.6 + seed, y * 3.6, z * 3.6 - seed))
      + 0.12 * vnoise(x * 8 - seed, y * 8 + seed, z * 8)
      + 0.05 * vnoise(x * 17 + seed, y * 17, z * 17 + seed);
    const px = x * a * n * stretch, pz = z * a * n / stretch;
    const cx = px * Math.cos(twist) - pz * Math.sin(twist), cz = px * Math.sin(twist) + pz * Math.cos(twist);
    positions[i * 3] = cx;
    positions[i * 3 + 1] = y * a * n * flat + fold * (cx * cx) / (a * 2);
    positions[i * 3 + 2] = cz;
  });
  const index = f.flat();
  const normals = new Float64Array(positions.length);
  for (let k = 0; k < index.length; k += 3) {
    const p = index[k] * 3, q = index[k + 1] * 3, r = index[k + 2] * 3;
    const ex = positions[q] - positions[p], ey = positions[q + 1] - positions[p + 1], ez = positions[q + 2] - positions[p + 2];
    const fx = positions[r] - positions[p], fy = positions[r + 1] - positions[p + 1], fz = positions[r + 2] - positions[p + 2];
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    for (const o of [p, q, r]) {
      normals[o] += nx;
      normals[o + 1] += ny;
      normals[o + 2] += nz;
    }
  }
  for (let o = 0; o < normals.length; o += 3) {
    const l = Math.hypot(normals[o], normals[o + 1], normals[o + 2]) || 1;
    normals[o] /= l;
    normals[o + 1] /= l;
    normals[o + 2] /= l;
  }
  const raw = rawEgg(yolk);
  const solid = solidFromBuffers({
    positions, normals, index,
    colour: (x, y, z) => {
      /** Beaten egg sets in streaks — paler where the white was, deeper where the yolk was. */
      const m = 1 + 0.12 * vnoise(x * 4 + seed, y * 4, z * 4) + 0.06 * vnoise(x * 11, y * 11 + seed, z * 11);
      return [raw[0] * m, raw[1] * m, raw[2] * m];
    },
  });
  /** The lumps change how much it holds, so it is measured and scaled to hold what it should. */
  const k = Math.cbrt(volume / Math.max(1e-6, measure(solid).volume));
  for (let i = 0; i < solid.pos.length; i++) solid.pos[i] *= k;
  return solid;
}
