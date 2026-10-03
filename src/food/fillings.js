/**
 * The extras, cut and waiting in their dishes: grated cheese, diced tomato,
 * ham, green pepper and onion, and snipped chives. Any of them goes into the
 * pan by the handful — over the food as a topping, or onto the egg to be
 * folded inside an omelette — and from then on each bit is a piece like any
 * other: it slides, it is tossed, it cooks. Onion and pepper soften, ham
 * crisps, cheese melts.
 *
 * Plain numbers, no GFX: each bit is a small closed solid with its colour.
 */

import { hex } from './colour.js';
import { solidFromBuffers } from '../geometry/slice.js';

/**
 * Each extra: its name on the counter, its colour, the size of one bit, and
 * how many bits make a handful. `cooks` is whether it wants to be softened in
 * the pan before it is eaten — raw onion is not a filling anyone asked for.
 */
export const FILLINGS = Object.freeze({
  cheese: { name: 'cheese', key: '1', colour: hex(0xf2b33d), size: [0.6, 0.08, 0.13], handful: 12, cooks: false, melts: true },
  tomato: { name: 'tomato', key: '2', colour: hex(0xd8402a), size: [0.36, 0.22, 0.34], handful: 8, cooks: false },
  ham: { name: 'ham', key: '3', colour: hex(0xe39a95), size: [0.4, 0.2, 0.4], handful: 8, cooks: false },
  pepper: { name: 'pepper', key: '4', colour: hex(0x3f8a2e), size: [0.38, 0.09, 0.36], handful: 8, cooks: true },
  onion: { name: 'onion', key: '5', colour: hex(0xf1ead8), size: [0.34, 0.08, 0.32], handful: 8, cooks: true },
  chives: { name: 'chives', key: '6', colour: hex(0x4f9a35), size: [0.07, 0.07, 0.3], handful: 14, cooks: false },
});

export const FILLING_KINDS = Object.freeze(Object.keys(FILLINGS));

export const isFilling = (piece) => Boolean(FILLINGS[piece.kind]);

/** A box of the given size round the origin, one flat colour, each face its own four corners. */
function box([w, h, d], colour) {
  const x = w / 2, y = h / 2, z = d / 2;
  const faces = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z]]],
    [[0, 0, -1], [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]]],
  ];
  const positions = [], normals = [], index = [];
  for (const [n, quad] of faces) {
    const base = positions.length / 3;
    for (const p of quad) {
      positions.push(...p);
      normals.push(...n);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return solidFromBuffers({
    positions: Float64Array.from(positions), normals: Float64Array.from(normals), index,
    colour: () => [...colour],
  });
}

/** One bit of `kind`, a little different every time: `random` gives its jitter. */
export function fillingSolid(kind, random = Math.random) {
  const f = FILLINGS[kind];
  const k = 0.8 + random() * 0.4;
  const size = [f.size[0] * k, f.size[1] * (0.85 + random() * 0.3), f.size[2] * k];
  /** Not every bit of a vegetable is the same colour: a little lighter or darker. */
  const shade = 0.88 + random() * 0.24;
  return box(size, f.colour.map((c) => c * shade));
}
