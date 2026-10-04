/**
 * A piece of food: one closed solid, where it is, which way up, and how cooked
 * each side of it is.
 *
 * The solid is kept in the piece's own frame with its middle — the middle of
 * its volume — at the origin, so it turns about itself. `pos` and `rot` put
 * it in whatever frame it is in now: the board's, the pan's, the plate's.
 *
 * How cooked it is lives on six sides — the six directions of its own frame —
 * because a piece browns on whichever face is down. Every vertex reads its
 * colour from those six, weighted by the way it faces, so a cube that has sat
 * on one face is golden there and pale everywhere else, and a curved bit of
 * skin is somewhere in between.
 */

import { measure, split, translate } from '../geometry/slice.js';
import { simplify } from '../geometry/simplify.js';
import { axisAngle, conjugate, dot3, multiply, rotate } from './quat.js';

/** The six sides, in the piece's own frame: +x, −x, +y, −y, +z, −z. */
export const SIDES = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

let nextId = 1;

/**
 * How much of a direction each side takes: the square of its component, on
 * the side it points to. The six always sum to one.
 */
export function sideWeights(x, y, z, out = new Float32Array(6)) {
  const l = x * x + y * y + z * z || 1;
  out[0] = x > 0 ? (x * x) / l : 0;
  out[1] = x < 0 ? (x * x) / l : 0;
  out[2] = y > 0 ? (y * y) / l : 0;
  out[3] = y < 0 ? (y * y) / l : 0;
  out[4] = z > 0 ? (z * z) / l : 0;
  out[5] = z < 0 ? (z * z) / l : 0;
  return out;
}

/**
 * A new piece of `kind` from a solid in some frame, standing where the solid
 * is in that frame (`pos` and `rot` are the frame the solid was drawn in).
 * `from` is the piece it was cut out of, whose cooking it inherits.
 */
export function makePiece({ solid, kind, pos = [0, 0, 0], rot = [0, 0, 0, 1], from = null }) {
  const m = measure(solid);
  const [cx, cy, cz] = m.centroid;
  translate(solid, -cx, -cy, -cz);
  const offset = rotate(rot, [cx, cy, cz]);

  /** How much surface faces each side — what the grade weighs browning by. */
  const area = new Float32Array(6);
  const w = new Float32Array(6);
  const p = solid.pos, n = solid.nrm;
  for (let t = 0; t < p.length; t += 9) {
    const ex = p[t + 3] - p[t], ey = p[t + 4] - p[t + 1], ez = p[t + 5] - p[t + 2];
    const fx = p[t + 6] - p[t], fy = p[t + 7] - p[t + 1], fz = p[t + 8] - p[t + 2];
    const a = Math.hypot(ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx) / 2;
    sideWeights(n[t] + n[t + 3] + n[t + 6], n[t + 1] + n[t + 4] + n[t + 7], n[t + 2] + n[t + 5] + n[t + 8], w);
    for (let k = 0; k < 6; k++) area[k] += a * w[k];
  }

  return {
    id: nextId++,
    kind,
    solid,
    volume: m.volume,
    area,
    capArea: m.capArea,
    surface: m.area,
    min: m.min.map((v, i) => v - m.centroid[i]),
    max: m.max.map((v, i) => v - m.centroid[i]),
    pos: [pos[0] + offset[0], pos[1] + offset[1], pos[2] + offset[2]],
    rot: [...rot],
    /** Browning on each side: 0 raw, 1 golden, past 1.6 burnt. */
    brown: from ? Float32Array.from(from.brown) : new Float32Array(6),
    /** How cooked through it is: 0 raw, 1 done. */
    core: from ? from.core : 0,
    /** Water left in it, 1 to 0. A wet piece sizzles, steams and will not brown. */
    moisture: from ? from.moisture : 1,
    /** Bumped whenever the solid or the turn changes, for anything caching off them. */
    version: 0,
    extents: null,
  };
}

/** Its size along its own three axes: what a cook would call how big the dice are. */
export function dimensions(piece) {
  return [piece.max[0] - piece.min[0], piece.max[1] - piece.min[1], piece.max[2] - piece.min[2]];
}

/**
 * Every distinct point of the piece's mesh, once: the mesh keeps three copies
 * of a corner per triangle, and the box round it only needs the corner.
 */
function corners(piece) {
  if (piece.corners && piece.corners.solid === piece.solid) return piece.corners.points;
  const p = piece.solid.pos;
  const seen = new Set();
  const out = [];
  for (let i = 0; i < p.length; i += 3) {
    const k = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p[i], p[i + 1], p[i + 2]);
  }
  const points = Float32Array.from(out);
  piece.corners = { solid: piece.solid, points };
  return points;
}

/**
 * The box round the piece as it now stands, relative to `pos`: every vertex
 * turned, the extremes kept. Cached until it next turns.
 */
export function extents(piece) {
  const cached = piece.extents, r = piece.rot;
  if (cached && cached.version === piece.version && cached.rot[0] === r[0] && cached.rot[1] === r[1] && cached.rot[2] === r[2] && cached.rot[3] === r[3]) {
    return cached;
  }
  const p = corners(piece);
  const [qx, qy, qz, qw] = piece.rot;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const vx = p[i], vy = p[i + 1], vz = p[i + 2];
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    const x = vx + qw * tx + (qy * tz - qz * ty);
    const y = vy + qw * ty + (qz * tx - qx * tz);
    const z = vz + qw * tz + (qx * ty - qy * tx);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  piece.extents = { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], rot: [...piece.rot], version: piece.version };
  return piece.extents;
}

/**
 * Cuts a piece with the plane `normal · p = offset`, in the frame the piece is
 * in. Returns the pieces either side, or `null` if the plane missed it.
 */
export function cutPiece(piece, normal, offset, flesh) {
  const local = rotate(conjugate(piece.rot), normal);
  const shift = offset - dot3(normal, piece.pos);
  const { front, back } = split(piece.solid, { normal: local, offset: shift }, { flesh });
  if (front.length + back.length < 2) return null;
  /** Each half with its flat faces refilled lean, so dice stay a dozen triangles rather than hundreds. */
  const child = (solid) => makePiece({ solid: simplify(solid), kind: piece.kind, pos: piece.pos, rot: piece.rot, from: piece });
  return { front: front.map(child), back: back.map(child) };
}

/**
 * A piece through the slicer, a slice at a time: cut across its length into
 * slices about `thick` thick, all alike, each laid down flat on its face where
 * it was cut, in the frame the piece is in. `next()` gives the pieces of the
 * next slice — several, for a piece already in bits — or null once it is all
 * sliced. One cut at a time, since through a whole potato each is a while.
 */
export function slicer(piece, thick, flesh) {
  let e = extents(piece);
  /** Its length front to back, so the cuts go across it. */
  if (e.max[0] - e.min[0] > e.max[2] - e.min[2]) {
    piece.rot = multiply(axisAngle([0, 1, 0], Math.PI / 2), piece.rot);
    piece.version += 1;
    e = extents(piece);
  }
  const z0 = piece.pos[2] + e.min[2], z1 = piece.pos[2] + e.max[2];
  const n = Math.max(1, Math.round((z1 - z0) / thick)), step = (z1 - z0) / n;
  const flat = axisAngle([1, 0, 0], Math.PI / 2);
  let rest = [piece], k = 1;
  return {
    /** What is still to be sliced. */
    get left() {
      return rest;
    },
    next() {
      if (!rest.length) return null;
      let out = [];
      if (k >= n) {
        out = rest;
        rest = [];
      } else {
        const z = z0 + k * step, left = [];
        k += 1;
        for (const p of rest) {
          const halves = cutPiece(p, [0, 0, 1], z, flesh);
          for (const h of halves ? [...halves.front, ...halves.back] : [p]) (h.pos[2] < z ? out : left).push(h);
        }
        rest = left;
        if (!out.length) return this.next();
      }
      for (const s of out) {
        s.rot = multiply(flat, s.rot);
        s.version += 1;
      }
      return out;
    },
  };
}

/** A piece through the slicer all at once. */
export function sliceUp(piece, thick, flesh) {
  const cut = slicer(piece, thick, flesh), out = [];
  for (let slice = cut.next(); slice; slice = cut.next()) out.push(...slice);
  return out;
}

/**
 * Which of its six sides it could lie on: any side of a dice, either face of
 * a slice or a strip, never the end of a long shred or of a strip of pepper —
 * whatever would leave it standing no more than half again as tall as it is
 * thin. A piece put down, or tipped, comes to rest on one of these.
 */
export function restingSides(piece) {
  const d = dimensions(piece), least = Math.min(...d);
  return [0, 1, 2, 3, 4, 5].filter((k) => d[k >> 1] <= least * 1.6);
}

/**
 * Which of its six sides is facing most nearly down, in the frame it is in —
 * of those it could lie on, unless `any`.
 */
export function sideDown(piece, any = false) {
  const down = rotate(conjugate(piece.rot), [0, -1, 0]);
  const sides = any ? [0, 1, 2, 3, 4, 5] : restingSides(piece);
  let best = sides[0], score = -Infinity;
  for (const k of sides) {
    const d = dot3(SIDES[k], down);
    if (d > score) {
      score = d;
      best = k;
    }
  }
  return best;
}
