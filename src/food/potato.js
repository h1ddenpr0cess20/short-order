/**
 * The potato: Tater's russet, from the debate, with the face taken off and the
 * knife put to it.
 *
 * The surface is the one his rig is cut from — a sphere pushed out into blunt
 * barrel ends, one end a little fatter, a flat belly to lie on, and lumps from
 * the same lattice noise — at the size a real potato is next to a real pan,
 * and coarse enough to slice in a frame. His eyes, which were little meshes
 * sunk into the skin, are painted on instead: a solid has to be one closed
 * skin for a knife to go through it, and from a cook's height an eye is a dark
 * spot anyway.
 *
 * Plain numbers throughout, no GFX: the potato is a solid (see
 * `geometry/slice.js`) and a colour for its inside, both checkable under Node.
 */

import { hex } from './colour.js';
import { vnoise } from './noise.js';
import { solidFromBuffers } from '../geometry/slice.js';

/**
 * Half its length, height and depth. About 9 cm end to end at the scale the
 * pan is drawn at, where a unit is a little under two and a half centimetres.
 */
export const HALF = Object.freeze({ x: 1.95, y: 1.28, z: 1.16 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The lobes and the coarse grain — the first four of Tater's seven octaves.
 * The fine three were for a mesh ten times this dense, and on this one they
 * would only alias into dark patches.
 */
export function lumps(x, y, z) {
  return (
    0.140 * vnoise(x * 1.5 + 63.9, y * 1.5 + 27.4, z * 1.5 + 82.6) +
    0.070 * vnoise(x * 2.1 + 11.3, y * 2.1 + 4.7, z * 2.1 + 19.1) +
    0.018 * vnoise(x * 4.6 + 31.7, y * 4.6 + 2.3, z * 4.6 + 5.9) +
    0.005 * vnoise(x * 9.3 + 47.1, y * 9.3 + 61.5, z * 9.3 + 8.2)
  );
}

/** A unit direction to the point on the skin it lands on. Tater's `surf`, at this size. */
export function surface(x, y, z, out = [0, 0, 0]) {
  const u = clamp(x, -1, 1);
  const r = Math.max(1e-6, Math.sqrt(Math.max(0, 1 - u * u)));
  const profile = (1 - Math.abs(u) ** 2.7) ** (1 / 2.9);
  const lean = 1 + 0.05 * u - 0.05 * u * u;
  const belly = 1 - 0.09 * Math.max(0, -y) ** 2;
  const b = 1 + lumps(x, y, z);
  const k = b * lean * belly;
  out[0] = u * HALF.x * b * lean;
  out[1] = (y / r) * profile * HALF.y * k;
  out[2] = (z / r) * profile * HALF.z * k;
  return out;
}

/** Where the eyes sit — Tater's, as directions on the unit sphere. */
export const EYES = Object.freeze([
  [0.62, 0.55, 0.56], [-0.48, 0.44, -0.76], [0.12, 0.86, -0.49],
  [-0.80, 0.30, 0.52], [0.44, -0.32, 0.84], [-0.10, -0.58, -0.81],
  [0.86, -0.18, -0.48], [-0.66, -0.52, 0.54], [0.28, 0.30, -0.91],
  [-0.30, 0.82, 0.49], [0.72, 0.62, -0.31], [-0.90, -0.14, -0.41],
  [0.05, -0.86, 0.51], [0.52, 0.10, 0.85],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}));

/** HSL to RGB, taking the values as linear, the way the rig's skin was tuned. */
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const EYE = hex(0x4a3116);

/**
 * Russet skin at a direction: Tater's netting and patchiness, then darker where
 * an eye is, with a paler ring round each one where the skin puckers.
 */
export function skinAt(x, y, z) {
  const net = vnoise(x * 18, y * 18, z * 18) * 0.45
    + vnoise(x * 40 + 5, y * 40 + 5, z * 40 + 5) * 0.35
    + vnoise(x * 90 + 9, y * 90 + 9, z * 90 + 9) * 0.2;
  const patch = vnoise(x * 5 + 90, y * 5 + 90, z * 5 + 90);
  let colour = hsl(0.080 + 0.010 * patch, 0.36 + 0.06 * patch, 0.44 + 0.10 * net + 0.05 * patch);
  for (const [ex, ey, ez] of EYES) {
    const d = Math.acos(clamp(x * ex + y * ey + z * ez, -1, 1));
    if (d > 0.16) continue;
    if (d < 0.07) {
      const t = 1 - d / 0.07;
      colour = colour.map((c, i) => c + (EYE[i] - c) * t * 0.85);
    } else {
      const t = 1 - Math.abs(d - 0.105) / 0.055;
      colour = colour.map((c) => c * (1 + 0.18 * Math.max(0, t)));
    }
  }
  return colour;
}

/** Cream with a little yellow in it: the inside of a floury potato, raw. */
export const FLESH = hex(0xf1e3b6);

/**
 * The colour of the inside at a point, for a face the knife has just made.
 * Flat, give or take a little starchy mottle — the cap is drawn from its
 * outline alone, so there is nowhere inside it to put a ring anyway.
 */
export function fleshAt(x, y, z) {
  const m = 1 + 0.035 * vnoise(x * 6.1 + 3.3, y * 6.1 + 8.1, z * 6.1 + 1.7);
  return [FLESH[0] * m, FLESH[1] * m, FLESH[2] * m];
}

/**
 * The whole potato as a closed solid, lying along x on its belly.
 *
 * A sphere without a seam — the columns wrap round and each pole is one
 * vertex — pushed out onto the skin, with normals averaged from the faces
 * round each vertex so the lumps shade smoothly.
 */
export function potatoSolid({ columns = 72, rows = 48 } = {}) {
  const dirs = [];
  dirs.push([0, 1, 0]);
  for (let j = 1; j < rows; j++) {
    const theta = (j / rows) * Math.PI;
    for (let i = 0; i < columns; i++) {
      const phi = (i / columns) * Math.PI * 2;
      dirs.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)]);
    }
  }
  dirs.push([0, -1, 0]);
  const last = dirs.length - 1;
  const at = (i, j) => 1 + (j - 1) * columns + (i % columns);

  const index = [];
  for (let i = 0; i < columns; i++) index.push(0, at(i, 1), at(i + 1, 1));
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 0; i < columns; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      index.push(a, d, b, b, d, c);
    }
  }
  for (let i = 0; i < columns; i++) index.push(last, at(i + 1, rows - 1), at(i, rows - 1));

  const positions = new Float64Array(dirs.length * 3);
  const p = [0, 0, 0];
  dirs.forEach(([x, y, z], i) => {
    surface(x, y, z, p);
    positions.set(p, i * 3);
  });

  /** The flat of the belly is what it lies on, so that is where y = 0 goes. */
  let low = Infinity;
  for (let i = 1; i < positions.length; i += 3) low = Math.min(low, positions[i]);
  for (let i = 1; i < positions.length; i += 3) positions[i] -= low;

  const normals = vertexNormals(positions, index);
  return solidFromBuffers({
    positions,
    normals,
    index,
    colour: (_x, _y, _z, i) => skinAt(...dirs[i]),
  });
}

/** Area-weighted face normals, summed at each corner. */
export function vertexNormals(positions, index) {
  const out = new Float64Array(positions.length);
  for (let k = 0; k < index.length; k += 3) {
    const a = index[k] * 3, b = index[k + 1] * 3, c = index[k + 2] * 3;
    const ex = positions[b] - positions[a], ey = positions[b + 1] - positions[a + 1], ez = positions[b + 2] - positions[a + 2];
    const fx = positions[c] - positions[a], fy = positions[c + 1] - positions[a + 1], fz = positions[c + 2] - positions[a + 2];
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    for (const v of [a, b, c]) {
      out[v] += nx;
      out[v + 1] += ny;
      out[v + 2] += nz;
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const l = Math.hypot(out[v], out[v + 1], out[v + 2]) || 1;
    out[v] /= l;
    out[v + 1] /= l;
    out[v + 2] /= l;
  }
  return out;
}
