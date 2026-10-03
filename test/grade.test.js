import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { curdSolid } from '../src/food/curd.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';
import { diceReport, eggReport, fryReport, grade, stars, timeReport } from '../src/game/grade.js';
import { makePiece } from '../src/sim/piece.js';

function dice(size = 0.62) {
  let solids = [potatoSolid({ columns: 48, rows: 32 })];
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

const whole = () => [makePiece({ solid: potatoSolid({ columns: 48, rows: 32 }), kind: 'potato' })];

function fried(pieces, brown, core = 1) {
  for (const p of pieces) {
    p.brown.fill(brown);
    p.core = core;
  }
  return pieces;
}

const curds = (n, set, brown = 0) => Array.from({ length: n }, (_, i) => {
  const p = makePiece({ solid: curdSolid({ volume: 0.16, seed: i + 1 }), kind: 'egg' });
  p.core = set;
  p.brown.fill(brown);
  return p;
});

describe('the dice', () => {
  it('marks a diced potato well and a whole one badly', () => {
    const good = diceReport(dice());
    const bad = diceReport(whole());
    assert.ok(good.bite > 0.6, `bite ${good.bite}`);
    assert.ok(good.score > 60, `score ${good.score}`);
    assert.equal(bad.bite, 0);
    assert.ok(bad.whole > 0.9);
    assert.ok(bad.score < 10);
  });

  it('marks coarse chunks between the two', () => {
    const chunks = diceReport(dice(1.4));
    assert.ok(chunks.score < diceReport(dice()).score);
  });
});

describe('the fry', () => {
  it('calls golden golden, pale pale, burnt burnt and raw raw', () => {
    assert.ok(fryReport(fried(dice(), 1)).golden > 0.95);
    assert.ok(fryReport(fried(dice(), 0.2)).pale > 0.95);
    assert.ok(fryReport(fried(dice(), 2)).burnt > 0.95);
    assert.ok(fryReport(fried(dice(), 1, 0.3)).raw > 0.95);
  });

  it('scores golden and cooked through above everything else', () => {
    const best = fryReport(fried(dice(), 1)).score;
    for (const [brown, core] of [[0.2, 1], [2, 1], [1, 0.3]]) {
      assert.ok(fryReport(fried(dice(), brown, core)).score < best - 30);
    }
  });

  it('counts one burnt side as a burnt piece', () => {
    const pieces = fried(dice(), 1);
    for (const p of pieces) p.brown[3] = 2.2;
    assert.ok(fryReport(pieces).burnt > 0.9);
  });
});

describe('the eggs', () => {
  it('likes soft curds from beaten eggs', () => {
    const r = eggReport({ curds: curds(60, 1), beaten: 1, eggs: 3 });
    assert.ok(r.soft > 0.95 && r.scrambled === 1);
    assert.ok(r.score > 90, `score ${r.score}`);
  });

  it('calls a flat sheet an omelette, and runny runny', () => {
    const omelette = eggReport({ sheet: { volume: 10, set: 1, brown: 0 }, beaten: 1, eggs: 3 });
    assert.equal(omelette.scrambled, 0);
    const runny = eggReport({ curds: curds(60, 0.3), beaten: 1, eggs: 3 });
    assert.ok(runny.runny > 0.95);
    assert.ok(runny.score < 40);
  });

  it('marks down browned and rubbery eggs', () => {
    const good = eggReport({ curds: curds(60, 1), beaten: 1, eggs: 3 }).score;
    assert.ok(eggReport({ curds: curds(60, 1, 1), beaten: 1, eggs: 3 }).score < good - 20);
    assert.ok(eggReport({ curds: curds(60, 1.6), beaten: 1, eggs: 3 }).score < good - 20);
  });

  it('gives nothing for no eggs', () => {
    assert.equal(eggReport({ curds: [], eggs: 0 }).score, 0);
  });
});

describe('the plate', () => {
  it('stars a great plate five and an empty one none', () => {
    const great = grade({ pieces: [...fried(dice(), 1), ...curds(60, 1)], beaten: 1, eggs: 3, seconds: 200 });
    assert.ok(great.total >= 85, `total ${great.total}`);
    assert.ok(great.stars >= 4);
    const empty = grade({ pieces: [], eggs: 0, seconds: 30 });
    assert.equal(empty.stars, 0);
    assert.match(empty.verdict, /empty/i);
  });

  it('says something about every part', () => {
    const g = grade({ pieces: whole(), eggs: 0, seconds: 500 });
    for (const part of ['dice', 'fry', 'eggs', 'time']) assert.ok(g.notes[part].length > 3);
  });

  it('runs its stars and its clock the right way', () => {
    assert.ok(stars(95) > stars(70) && stars(70) > stars(10));
    assert.ok(timeReport(120).score > timeReport(600).score);
  });
});
