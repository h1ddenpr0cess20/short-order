/**
 * Salt and pepper: how much goes on, and where it ends up.
 *
 * A pinch of salt or a twist of the mill goes over the food in the pan, each
 * piece taking a share by how much of the floor it covers, and any egg still
 * lying on the floor taking a share by its own spread. With nothing in the
 * pan the seasoning goes into the bowl, if there are eggs in it, and from
 * there into the pan with them when they are poured.
 *
 * Seasoning is counted in pinches and twists, kept on each piece as `salt`
 * and `pepper`. Measured against how much food it is on, it is what the plate
 * is marked on: about a pinch to every eight of volume — a whole potato and
 * three eggs want four or so — and a twist to every five.
 */

import { extents } from './piece.js';

/** Volume of food a pinch of salt, and a twist of pepper, is right for. */
export const PER = Object.freeze({ salt: 8, pepper: 5 });

/** How far either way of right still tastes right, as a share of right. */
export const RIGHT = Object.freeze({ salt: [0.65, 1.45], pepper: [0.35, 2.2] });

/** The share of the floor a piece covers, as it lies. */
function footprint(piece) {
  const e = extents(piece);
  return (e.max[0] - e.min[0]) * (e.max[2] - e.min[2]);
}

/**
 * Sprinkles `amount` of `kind` ('salt' or 'pepper') over the food in the pan:
 * `pieces`, and `sheet` (the egg on the floor, or null). Returns how much
 * landed on food — none, if there is no food there.
 */
export function sprinkle(kind, amount, { pieces, sheet = null }) {
  const sheetArea = sheet ? sheet.area() : 0;
  let covered = sheetArea;
  for (const p of pieces) covered += footprint(p);
  if (covered <= 0) return 0;
  for (const p of pieces) p[kind] = (p[kind] ?? 0) + (amount * footprint(p)) / covered;
  if (sheet && sheetArea > 0) sheet.season(kind, (amount * sheetArea) / covered);
  return amount;
}

/** How a measure of seasoning sits against right for this much food: 1 is right. */
export function ratio(kind, amount, volume) {
  return volume > 0 ? (amount * PER[kind]) / volume : 0;
}

/**
 * How it tastes, 0 to 1: full marks across the right range, down to nothing
 * at none, and down again past it — salt quickly, pepper slowly.
 */
export function taste(kind, r) {
  const [lo, hi] = RIGHT[kind];
  if (r >= lo && r <= hi) return 1;
  if (r < lo) return Math.max(0, r / lo) ** (kind === 'salt' ? 1.4 : 1);
  const over = kind === 'salt' ? 1.1 : 2.4;
  return Math.max(0, 1 - (r - hi) / over);
}
