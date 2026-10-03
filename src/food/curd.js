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
/** Raw white on dark iron: clear, so mostly the iron showing through, a little milky. */
const GLASS = hex(0x9a9484);

/** Raw egg of a given yolkiness: 0 all white, 1 all yolk, a third is beaten whole egg. */
export function rawEgg(yolk) {
  const y = Math.min(1, Math.max(0, yolk * 2.6));
  /** White on its own, unbeaten, is glass; beaten with any yolk, it is foam and opaque. */
  if (y < 0.15) return mix(GLASS, WHITE, y / 0.15);
  return mix(WHITE, YOLK, y);
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

/** Subdivided once more for every `times`: twice is enough for the lumps to read as lumps, not facets. */
function finer(times = 1) {
  const once = icosphere();
  const { v, mid } = once;
  let f = once.f;
  for (let n = 0; n < times; n++) {
    const next = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = next;
  }
  return { v, f };
}

const BASE = finer();
/** A fried egg wants more: a round yolk on a wide, thin disc. */
const FINE = finer(2);

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

/** The normals of a deformed sphere, worked out again from its faces. */
function faceNormals(positions, index) {
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
  return normals;
}

/** The sphere pushed about by `shape(x, y, z, out)`, coloured by `colour`, scaled to hold `volume`. */
function moulded({ shape, colour, volume, base = BASE }) {
  const { v, f } = base;
  const positions = new Float64Array(v.length * 3);
  const out = [0, 0, 0];
  v.forEach(([x, y, z], i) => {
    shape(x, y, z, out);
    positions[i * 3] = out[0];
    positions[i * 3 + 1] = out[1];
    positions[i * 3 + 2] = out[2];
  });
  const index = f.flat();
  const solid = solidFromBuffers({ positions, normals: faceNormals(positions, index), index, colour });
  if (volume) {
    const k = Math.cbrt(volume / Math.max(1e-6, measure(solid).volume));
    for (let i = 0; i < solid.pos.length; i++) solid.pos[i] *= k;
  }
  return solid;
}

/** The colour a fried egg's yolk is painted with, raw: how its vertices are told from the white's. */
export const YOLK_RAW = rawEgg(1);

/**
 * A fried egg: a thin, ragged disc of white `radius` across, with the yolk a
 * dome on top of it — or, broken, a smear of yolk run through the white.
 */
export function friedSolid({ radius = 2.4, thickness = 0.22, yolk = 0.75, whole = true, seed = 1 } = {}) {
  const white = rawEgg(0.02);
  const dome = whole ? 0.62 : 0;
  return moulded({
    base: FINE,
    shape: (x, y, z, out) => {
      const a = Math.atan2(z, x);
      /** Ragged at the rim, the way white runs out across the iron and stops. */
      const rim = radius * (1 + 0.1 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 2.3) + 0.04 * vnoise(x * 3 + seed, 0, z * 3));
      const px = x * rim, pz = z * rim;
      const r = Math.hypot(px, pz);
      let py = y * thickness * (0.75 + 0.5 * Math.max(0, 1 - r / radius));
      if (y > 0 && r < yolk) py += dome * Math.sqrt(1 - (r / yolk) ** 2);
      out[0] = px;
      out[1] = py;
      out[2] = pz;
    },
    colour: (x, y, z) => {
      const r = Math.hypot(x, z);
      if (whole && y > thickness * 0.4 && r < yolk * 0.97) return [...YOLK_RAW];
      /** Broken, the yolk has run out through the white in streaks. */
      if (!whole && vnoise(x * 1.4 + seed, y, z * 1.4) > 0.25 && r < radius * 0.6) return rawEgg(0.45);
      return [...white];
    },
  });
}

/**
 * An omelette: a French one rolled into a plump, tapered cigar with its seam
 * underneath, or a diner one folded in half into a half-moon — or 'flat', the
 * sheet before it is folded, `radius` across. Holds `volume`, or for a flat
 * one is as wide as it is told.
 */
export function omeletteSolid({ volume = 10, shape = 'roll', yolk = 0.33, seed = 1, radius = 4 } = {}) {
  const raw = rawEgg(yolk);
  const solid = moulded({
    volume: shape === 'flat' ? 0 : volume,
    shape: shape === 'flat'
      ? (x, y, z, out) => {
        /** Not yet folded: the round sheet as it lay, thin and a little ragged at the edge. */
        const a = Math.atan2(z, x);
        const rim = 1 + 0.05 * Math.sin(a * 5 + seed) + 0.03 * Math.sin(a * 11 + seed);
        out[0] = x * 4 * rim;
        out[1] = y * 0.18;
        out[2] = z * 4 * rim;
      }
      : shape === 'roll'
      ? (x, y, z, out) => {
        /** Long along x, tapering to soft points, a little flat where it lies. */
        const taper = Math.max(0.12, 1 - 0.55 * x * x);
        out[0] = x * 2.4;
        out[1] = y * 0.85 * taper * (y < 0 ? 0.8 : 1);
        out[2] = z * 1.05 * taper;
      }
      : (x, y, z, out) => {
        /** A half disc: round on the far side, nearly straight along the fold, thickest at the fold. */
        const px = x * 3;
        const pz = z < 0 ? z * 3 : z * 0.45;
        const fold = 1 - Math.min(1, Math.hypot(px / 3, (pz + 0.4) / 3));
        out[0] = px;
        out[1] = y * (0.32 + 0.38 * fold);
        out[2] = pz + 0.9;
      },
    colour: (x, y, z) => {
      const m = 1 + 0.08 * vnoise(x * 3 + seed, y * 3, z * 3);
      return [raw[0] * m, raw[1] * m, raw[2] * m];
    },
  });
  if (shape === 'flat') {
    for (let i = 0; i < solid.pos.length; i += 3) {
      solid.pos[i] *= radius / 4;
      solid.pos[i + 2] *= radius / 4;
    }
  }
  return solid;
}
