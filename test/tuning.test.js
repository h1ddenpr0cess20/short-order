import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';
import { fryReport } from '../src/game/grade.js';
import { SETTINGS } from '../src/sim/heat.js';
import { createPan } from '../src/sim/pan.js';
import { makePiece } from '../src/sim/piece.js';

/**
 * The fry, played by a simulated cook: whether a sensible way of cooking it
 * gets it golden, and a careless one does not. These pin the browning and
 * heat numbers to a game that can be won.
 */

function dice(size = 0.62) {
  let solids = [potatoSolid({ columns: 40, rows: 28 })];
  const m = measure(solids[0]);
  for (let axis = 0; axis < 3; axis++) {
    const normal = [0, 0, 0];
    normal[axis] = 1;
    for (let o = m.min[axis] + size; o < m.max[axis]; o += size) {
      solids = solids.flatMap((s) => {
        const { front, back } = split(s, { normal, offset: o }, { flesh: fleshAt });
        return [...front, ...back];
      });
    }
  }
  return solids.map((solid) => makePiece({ solid, kind: 'potato' }));
}

function cook({ level, tossEvery, seconds, oil = true, seed = 5 }) {
  let s = seed;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pan = createPan({ random });
  pan.heat.set(level);
  pan.heat.state.temp = SETTINGS[level].temp;
  if (oil) pan.pour();
  const pieces = dice();
  for (const p of pieces) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 3.8;
    p.pos = [Math.cos(a) * r, 2, Math.sin(a) * r];
  }
  pan.add(pieces, { area: 20 });
  const best = { golden: 0, at: 0 };
  const dt = 1 / 20;
  for (let t = 0, i = 0; t < seconds; t += dt, i++) {
    pan.update(dt);
    if (tossEvery && i % Math.round(tossEvery / dt) === Math.round(tossEvery / dt) - 1) pan.toss(0.6);
    if (i % 100 === 99) {
      const r = fryReport(pan.pieces);
      if (r.golden > best.golden) Object.assign(best, { golden: r.golden, at: t, burnt: r.burnt });
    }
  }
  return { best, end: fryReport(pan.pieces) };
}

describe('the fry, cooked by a careful cook', () => {
  it('goes golden on medium, tossed every few seconds, in a couple of minutes', () => {
    const { best } = cook({ level: 3, tossEvery: 4, seconds: 170 });
    assert.ok(best.golden > 0.85, `at best ${best.golden} golden`);
    assert.ok(best.at < 170 && best.burnt < 0.08, `golden at ${best.at}s with ${best.burnt} burnt`);
  });

  it('goes golden faster on medium-high', () => {
    const medium = cook({ level: 3, tossEvery: 4, seconds: 170 }).best;
    const hotter = cook({ level: 4, tossEvery: 4, seconds: 170 }).best;
    assert.ok(hotter.golden > 0.8 && hotter.at < medium.at, `${hotter.at}s against ${medium.at}s`);
  });
});

describe('the fry, cooked by a careless cook', () => {
  it('burns on high when it is never turned', () => {
    const { end } = cook({ level: 5, tossEvery: 0, seconds: 120 });
    assert.ok(end.golden < 0.2, `${end.golden} golden`);
  });

  it('never gets golden on low', () => {
    const { best } = cook({ level: 1, tossEvery: 4, seconds: 120 });
    assert.ok(best.golden < 0.3, `${best.golden} golden`);
  });
});
