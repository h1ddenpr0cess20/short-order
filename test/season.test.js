import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';
import { seasonReport } from '../src/game/grade.js';
import { createBowl, createSheet } from '../src/sim/eggs.js';
import { BUTTER, createPan } from '../src/sim/pan.js';
import { makePiece } from '../src/sim/piece.js';
import { PER, ratio, sprinkle, taste } from '../src/sim/season.js';

function dice(size = 0.62) {
  let solids = [potatoSolid({ columns: 36, rows: 24 })];
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

const total = (list, kind) => list.reduce((s, p) => s + (p[kind] ?? 0), 0);

describe('salt and pepper', () => {
  it('goes on the food it is sprinkled over, all of it, bigger pieces taking more', () => {
    const pieces = dice();
    sprinkle('salt', 2, { pieces });
    assert.ok(Math.abs(total(pieces, 'salt') - 2) < 1e-9, `${total(pieces, 'salt')} of 2 landed`);
    const big = pieces.reduce((a, p) => (p.volume > a.volume ? p : a));
    const small = pieces.reduce((a, p) => (p.volume < a.volume ? p : a));
    assert.ok(big.salt > small.salt);
  });

  it('lands nowhere when there is nothing there', () => {
    assert.equal(sprinkle('pepper', 1, { pieces: [] }), 0);
  });

  it('shares with the egg on the floor, and the curds torn from it take their share', () => {
    const sheet = createSheet({ random: () => 0.5 });
    sheet.pour(0, 0, 10.8);
    for (let t = 0; t < 3; t += 1 / 60) sheet.update(1 / 60, 160);
    sprinkle('salt', 3, { pieces: [], sheet });
    assert.ok(Math.abs(sheet.summary().salt - 3) < 1e-9);
    for (let t = 0; t < 8; t += 1 / 60) sheet.update(1 / 60, 160);
    for (let k = 0; k < 40; k++) sheet.stir([-3, -2 + k * 0.1], [3, -2 + k * 0.1], 2.4, 1 / 60);
    const curds = sheet.takeCurds();
    assert.ok(curds.length > 0, 'no curds came off');
    const inCurds = curds.reduce((s, c) => s + c.salt, 0);
    assert.ok(Math.abs(inCurds + sheet.summary().salt - 3) < 1e-6, 'salt went missing between the sheet and the curds');
    const share = curds.reduce((s, c) => s + c.volume, 0) / (curds.reduce((s, c) => s + c.volume, 0) + sheet.summary().volume);
    assert.ok(Math.abs(inCurds / 3 - share) < 1e-6, 'curds took more than their share');
  });

  it('can go into the eggs in the bowl, and comes out with them', () => {
    const bowl = createBowl();
    assert.equal(bowl.season('salt', 1), 0, 'an empty bowl has nothing to salt');
    bowl.crack(() => 0.5);
    bowl.season('salt', 1);
    bowl.season('pepper', 2);
    const out = bowl.pour();
    assert.equal(out.salt, 1);
    assert.equal(out.pepper, 2);
    assert.equal(bowl.salt, 0);
  });

  it('tastes right across a range, bland below it, too salty above', () => {
    assert.equal(taste('salt', 1), 1);
    assert.equal(taste('salt', 0), 0);
    assert.ok(taste('salt', 0.4) < 0.7);
    assert.ok(taste('salt', 2.4) < 0.5);
    assert.ok(taste('pepper', 3) > taste('salt', 3), 'too much pepper is kinder than too much salt');
    assert.equal(ratio('salt', 1, PER.salt), 1);
  });
});

describe('the seasoning, marked', () => {
  const potato = (volume, salt = 0, pepper = 0) => ({ kind: 'potato', volume, salt, pepper });
  const egg = (volume, salt = 0, pepper = 0) => ({ kind: 'egg', volume, salt, pepper });

  it('gives full marks for salt and pepper about right on both parts', () => {
    const r = seasonReport({ pieces: [potato(16, 2, 3), egg(10.8, 1.35, 2)] });
    assert.ok(r.score >= 95, `scored ${r.score}`);
  });

  it('marks a plate with no seasoning low, and a salty one low', () => {
    assert.ok(seasonReport({ pieces: [potato(16), egg(10.8)] }).score === 0);
    assert.ok(seasonReport({ pieces: [potato(16, 7, 3), egg(10.8, 5, 2)] }).score < 40);
  });

  it('notices the eggs were left out', () => {
    const r = seasonReport({ pieces: [potato(16, 2, 3), egg(10.8)] });
    assert.ok(r.score < 70 && r.score > 30, `scored ${r.score}`);
  });

  it('does not call the extras eggs before there are any', () => {
    const onion = (volume, salt = 0) => ({ kind: 'onion', volume, salt, pepper: 0 });
    /** Thin onion takes a lot of salt for its size: on its own it would read as far too salty. */
    const before = seasonReport({ pieces: [potato(16, 1.4), onion(1.2, 0.6)] });
    assert.equal(before.egg.volume, 0);
    assert.ok(before.potato.salt > 0.65 && before.potato.salt < 1.45, `potato salt ${before.potato.salt}`);
    const after = seasonReport({ pieces: [potato(16, 1.4), onion(1.2, 0.6), egg(10.8)] });
    assert.ok(Math.abs(after.egg.volume - 12) < 1e-9, 'once there is egg, the onion is cooked in with it');
  });

  it('makes the whole plate bitter if the butter burnt', () => {
    const fine = seasonReport({ pieces: [potato(16, 2, 3), egg(10.8, 1.35, 2)] }).score;
    const burnt = seasonReport({ pieces: [potato(16, 2, 3), egg(10.8, 1.35, 2)], burntButter: true }).score;
    assert.ok(burnt < fine * 0.6, `${burnt} against ${fine}`);
  });
});

describe('butter', () => {
  const pan = (temp) => {
    const p = createPan({ random: () => 0.5 });
    p.heat.set(temp > 200 ? 4 : temp > 150 ? 2 : 0);
    p.heat.state.temp = temp;
    return p;
  };
  const run = (p, seconds) => { for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30); };

  it('melts in seconds on a hot pan, and greases it', () => {
    const p = pan(190);
    p.addButter();
    run(p, 6);
    assert.equal(p.butter.pats.length, 0, 'the pat is still there');
    assert.ok(Math.abs(p.oil - BUTTER.fat) < 0.05, `the pan has ${p.oil} of fat`);
    assert.ok(p.butter.share > 0.95);
  });

  it('just sits there on a cold pan', () => {
    const p = pan(22);
    p.heat.set(0);
    p.addButter();
    run(p, 10);
    assert.equal(p.butter.pats.length, 1);
    assert.ok(p.butter.pats[0].left > 0.99);
  });

  it('foams as it melts, and the foam cooks off', () => {
    const p = pan(170);
    p.addButter();
    run(p, 4);
    const foaming = p.butter.foam;
    run(p, 20);
    assert.ok(foaming > 0.3 && p.butter.foam < foaming * 0.3, `foam ${foaming} then ${p.butter.foam}`);
  });

  it('browns gently on medium-low and burns quickly on high', () => {
    const gentle = pan(165);
    gentle.addButter();
    run(gentle, 30);
    assert.ok(!gentle.butter.burnt && gentle.butter.brown > 0.3, `brown ${gentle.butter.brown}`);
    const hot = pan(252);
    hot.addButter();
    run(hot, 15);
    assert.ok(hot.butter.burnt, `brown ${hot.butter.brown}`);
  });
});
