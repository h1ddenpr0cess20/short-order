/**
 * Pieces heaped in a round dish — a ramekin, a plate — in the dish's own
 * frame: y up from the counter, x and z out from its middle.
 *
 * Each piece comes to rest at the lowest place in the dish it fits: on the
 * floor, or on top of whatever is already there under it. So a dish fills the
 * way dice poured into one do, from the middle out and then up, a big piece
 * and a small one each sitting on what is under it, and nothing ends up
 * inside anything else — whatever the size of the pieces, or how many.
 */

import { extents } from './piece.js';

/** How far two footprints may graze one another and still count as side by side. */
const GRAZE = 0.02;

/** How much a place further from the middle has to be lower to be taken instead: the heap mounds in the middle. */
const MIDDLE = 0.04;

/**
 * A floor `profile` as [radius, height] points, outward, as a function of how
 * far out from the middle: flat past the last point.
 */
export function floorFrom(profile) {
  return (r) => {
    if (r <= profile[0][0]) return profile[0][1];
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
      if (r <= r1) return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
    return profile[profile.length - 1][1];
  };
}

/** The box round a piece where it stands. */
function boxOf(piece) {
  const e = extents(piece);
  return {
    x0: piece.pos[0] + e.min[0], x1: piece.pos[0] + e.max[0],
    y1: piece.pos[1] + e.max[1],
    z0: piece.pos[2] + e.min[2], z1: piece.pos[2] + e.max[2],
  };
}

/** Places to try a piece, spread evenly over the dish out to `reach`: a sunflower's spiral, the middle first. */
function spots(reach) {
  const n = Math.max(48, Math.min(400, Math.ceil((Math.PI * reach * reach) / 0.05)));
  const out = [[0, 0]];
  for (let k = 0; k < n; k++) {
    const r = reach * Math.sqrt((k + 0.5) / n), a = k * 2.399963;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/**
 * Lays each piece of `list` into the dish in turn, on top of `under` — what
 * is in it already, left where it is — and of those laid before it. `floor(r)`
 * is how high the inside of the dish comes `r` out from its middle, and
 * `reach` how far out any part of a piece may come before it is in the side.
 * A piece too big to go anywhere inside goes in the middle, on top. Sets each
 * piece's `pos`; turns none of them.
 */
export function heap(list, { floor, reach }, under = []) {
  const boxes = under.map(boxOf);
  const tries = spots(reach);
  for (const piece of list) {
    const e = extents(piece);
    let best = null;
    for (const [x, z] of tries) {
      const x0 = x + e.min[0], x1 = x + e.max[0], z0 = z + e.min[2], z1 = z + e.max[2];
      /** The floor comes up toward the side: it is as high as it is under the corner furthest out. */
      const out = Math.hypot(Math.max(-x0, x1), Math.max(-z0, z1));
      if (out > reach && (x !== 0 || z !== 0)) continue;
      let y = floor(Math.min(out, reach));
      for (const b of boxes) {
        if (b.y1 > y && Math.min(x1, b.x1) - Math.max(x0, b.x0) > GRAZE && Math.min(z1, b.z1) - Math.max(z0, b.z0) > GRAZE) y = b.y1;
      }
      const score = y + MIDDLE * Math.hypot(x, z);
      if (!best || score < best.score) best = { x, z, y, score };
    }
    piece.pos = [best.x, best.y - e.min[1], best.z];
    piece.version += 1;
    boxes.push(boxOf(piece));
  }
  return list;
}
