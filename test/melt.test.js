import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { wholeSolids } from '../src/food/fillings.js';
import { potatoSolid } from '../src/food/potato.js';
import { createPan } from '../src/sim/pan.js';
import { makePiece } from '../src/sim/piece.js';
import { melt, meltable } from '../src/view/melt.js';

const block = () => makePiece({ solid: wholeSolids('cheese')[0], kind: 'cheese' });

/** Lowest and highest along `up`, and widest across it, of a set of positions. */
function span(pos, up = [0, 1, 0]) {
  let lo = Infinity, hi = -Infinity, wide = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const h = pos[i] * up[0] + pos[i + 1] * up[1] + pos[i + 2] * up[2];
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
    wide = Math.max(wide, Math.hypot(pos[i] - h * up[0], pos[i + 1] - h * up[1], pos[i + 2] - h * up[2]));
  }
  return { lo, hi, wide };
}

describe('cheese melting', () => {
  it('slumps and spreads, sitting where it sat, whichever way up it lies', () => {
    const src = meltable(block().solid);
    for (const up of [[0, 1, 0], [1, 0, 0], [0, 0, -1]]) {
      const pos = new Float32Array(src.pos.length), nrm = new Float32Array(src.nrm.length);
      melt(src, pos, nrm, up, 1);
      const before = span(src.pos, up), after = span(pos, up);
      assert.ok(Math.abs(after.lo - before.lo) < 1e-4, `it lifted off the floor lying ${up}`);
      assert.ok(after.hi - after.lo < (before.hi - before.lo) * 0.45, `lying ${up}, it only came down to ${(after.hi - after.lo).toFixed(2)}`);
      assert.ok(after.wide > before.wide, `lying ${up}, it did not spread`);
    }
  });

  it('is unchanged before it melts, and stays one closed surface as it does', () => {
    const src = meltable(block().solid);
    const pos = new Float32Array(src.pos.length), nrm = new Float32Array(src.nrm.length);
    melt(src, pos, nrm, [0, 1, 0], 0);
    assert.ok(src.pos.every((v, i) => Math.abs(v - pos[i]) < 1e-5), 'a block that has not melted is still the block');
    melt(src, pos, nrm, [0, 1, 0], 0.7);
    /** Every vertex that started at one place has ended at one place: no seams opening. */
    const where = new Map();
    for (let i = 0; i < src.pos.length; i += 3) {
      const key = `${src.pos[i].toFixed(4)},${src.pos[i + 1].toFixed(4)},${src.pos[i + 2].toFixed(4)}`;
      const now = [pos[i], pos[i + 1], pos[i + 2]];
      const seen = where.get(key);
      if (seen) assert.ok(Math.hypot(seen[0] - now[0], seen[1] - now[1], seen[2] - now[2]) < 1e-5, 'a seam opened');
      else where.set(key, now);
    }
  });

  it('melts on a medium pan in seconds, and long before a potato cooks through', () => {
    const pan = createPan({ random: () => 0.5 });
    pan.pour();
    pan.heat.state.temp = 150;
    pan.heat.set(3);
    const cheese = Object.assign(block(), { pos: [-1.5, 3, 0] });
    const potato = Object.assign(makePiece({ solid: potatoSolid(), kind: 'potato' }), { pos: [1.5, 3, 0] });
    pan.add([cheese, potato]);
    let when = null;
    for (let t = 0; t < 30 && when === null; t += 1 / 60) {
      pan.update(1 / 60);
      if (cheese.core >= 0.5) when = t;
    }
    assert.ok(when !== null && when < 20, `the cheese took ${when ?? 'more than 30'} seconds to melt`);
    assert.ok(potato.core < 0.3, `the potato was ${potato.core.toFixed(2)} cooked by then`);
  });

  it('does not melt on a cold pan, and keeps melting folded inside an omelette', () => {
    const cold = createPan({ random: () => 0.5 });
    const block1 = Object.assign(block(), { pos: [0, 3, 0] });
    cold.add([block1]);
    for (let t = 0; t < 20; t += 1 / 60) cold.update(1 / 60);
    assert.equal(block1.core, 0);

    const pan = createPan({ random: () => 0.5 });
    pan.heat.state.temp = 140;
    pan.heat.set(3);
    const inside = block();
    const omelette = Object.assign(makePiece({ solid: wholeSolids('ham')[0], kind: 'egg' }), { pos: [0, 3, 0], omelette: true, inside: [inside] });
    pan.add([omelette]);
    for (let t = 0; t < 40; t += 1 / 60) pan.update(1 / 60);
    assert.ok(inside.core >= 0.5, `folded in, it only got to ${inside.core.toFixed(2)}`);
  });
});

describe('the grater', () => {
  it('turns cheese into thin strips, all of it, each a bite', async () => {
    const { FILLINGS, PORTION, shredSolids } = await import('../src/food/fillings.js');
    const { measure } = await import('../src/geometry/slice.js');
    const { dimensions } = await import('../src/sim/piece.js');
    let s = 3;
    const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const strips = shredSolids('cheese', PORTION.cheese, random);
    const volume = strips.reduce((a, solid) => a + measure(solid).volume, 0);
    assert.ok(Math.abs(volume - PORTION.cheese) / PORTION.cheese < 1e-3, `${volume} of ${PORTION.cheese}`);
    assert.ok(strips.length >= 40 && strips.length <= 90, `${strips.length} strips`);
    for (const solid of strips) {
      const d = dimensions(makePiece({ solid, kind: 'cheese' })).sort((a, b) => a - b);
      assert.ok(d[2] <= FILLINGS.cheese.bite, `a strip ${d[2].toFixed(2)} long`);
      assert.ok(d[0] < 0.2, `a strip ${d[0].toFixed(2)} thick`);
    }
  });

  it('melts shreds faster than a block', () => {
    return import('../src/food/fillings.js').then(({ shredSolids, PORTION }) => {
      const pan = createPan({ random: () => 0.5 });
      pan.pour();
      pan.heat.state.temp = 150;
      pan.heat.set(3);
      const shreds = shredSolids('cheese', PORTION.cheese / 4).map((solid, i) => Object.assign(makePiece({ solid, kind: 'cheese' }), { pos: [(i % 5) - 2, 3, Math.floor(i / 5) - 2] }));
      const lump = Object.assign(block(), { pos: [3.5, 3, 0] });
      pan.add([...shreds, lump]);
      for (let t = 0; t < 6; t += 1 / 60) pan.update(1 / 60);
      const mean = shreds.reduce((a, p) => a + p.core, 0) / shreds.length;
      assert.ok(mean > lump.core * 1.3, `shreds ${mean.toFixed(2)} against a block ${lump.core.toFixed(2)}`);
    });
  });
});
