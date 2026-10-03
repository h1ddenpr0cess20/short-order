/**
 * What there is to cook with, by kind: how to make one whole, and what colour
 * it is inside wherever a knife goes through it.
 */

import { fleshAt, potatoSolid } from './potato.js';

export const INGREDIENTS = Object.freeze({
  potato: { solid: potatoSolid, flesh: fleshAt },
});

/** Inside colours by kind, the shape the board's knife asks for them in. */
export const FLESH = Object.freeze(Object.fromEntries(Object.entries(INGREDIENTS).map(([k, v]) => [k, v.flesh])));
