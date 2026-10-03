import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure } from '../src/geometry/slice.js';
import { curdSolid } from '../src/food/curd.js';
import { EGG_VOLUME, createBowl, createSheet } from '../src/sim/eggs.js';

function seeded(seed = 4) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('the bowl', () => {
  it('holds what is cracked into it, and pours it all out', () => {
    const bowl = createBowl();
    bowl.crack();
    bowl.crack();
    bowl.crack();
    assert.equal(bowl.eggs, 3);
    assert.equal(bowl.volume, 3 * EGG_VOLUME);
    const out = bowl.pour();
    assert.equal(out.volume, 3 * EGG_VOLUME);
    assert.equal(bowl.eggs, 0);
  });

  it('beats smooth with enough whisking, and more eggs take more', () => {
    const one = createBowl();
    const three = createBowl();
    one.crack();
    for (let k = 0; k < 3; k++) three.crack();
    one.whisk(15);
    three.whisk(15);
    assert.ok(one.mix > three.mix);
    three.whisk(500);
    assert.equal(three.mix, 1);
  });

  it('is less beaten for a fresh egg dropped into it', () => {
    const bowl = createBowl();
    bowl.crack();
    bowl.whisk(100);
    bowl.crack();
    assert.ok(bowl.mix < 0.6);
  });
});

describe('the sheet', () => {
  it('keeps every drop poured into it', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.pour(0, 0, 10);
    for (let t = 0; t < 3; t += 1 / 60) sheet.update(1 / 60, 22);
    assert.ok(Math.abs(sheet.summary().volume - 10) < 1e-3, `${sheet.summary().volume}`);
  });

  it('runs out across the floor from where it lands', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.pour(0, 0, 10);
    const covered = () => {
      let n = 0;
      for (let k = 0; k < sheet.amount.length; k++) if (sheet.amount[k] > 0.02) n += 1;
      return n;
    };
    const before = covered();
    for (let t = 0; t < 2; t += 1 / 60) sheet.update(1 / 60, 22);
    assert.ok(covered() > before * 2, `${before} patches became ${covered()}`);
  });

  it('sets on a hot pan and stays runny on a cold one', () => {
    const cold = createSheet({ random: seeded() });
    const hot = createSheet({ random: seeded() });
    cold.pour(0, 0, 10);
    hot.pour(0, 0, 10);
    for (let t = 0; t < 12; t += 1 / 60) {
      cold.update(1 / 60, 22);
      hot.update(1 / 60, 210);
    }
    assert.ok(hot.summary().set > 0.8, `hot ${hot.summary().set}`);
    assert.ok(cold.summary().set < 0.05, `cold ${cold.summary().set}`);
    assert.equal(hot.summary().liquid, 0);
  });

  it('comes away in curds where the spatula goes through it setting, losing none of it', () => {
    const sheet = createSheet({ random: seeded(8) });
    sheet.pour(0, 0, 10);
    for (let t = 0; t < 4.5; t += 1 / 60) sheet.update(1 / 60, 200);
    let curds = [];
    for (let z = -3; z <= 3; z += 0.8) {
      sheet.stir([-4, z], [4, z]);
      curds = curds.concat(sheet.takeCurds());
    }
    const inCurds = curds.reduce((sum, c) => sum + c.volume, 0);
    assert.ok(curds.length > 10, `${curds.length} curds`);
    assert.ok(Math.abs(inCurds + sheet.summary().volume - 10) < 0.2, `${inCurds} + ${sheet.summary().volume}`);
    assert.ok(curds.every((c) => c.set > 0.3));
  });

  it('breaks into big folds when the pan is tossed, leaving the liquid', () => {
    const sheet = createSheet({ random: seeded(6) });
    sheet.pour(0, 0, 10);
    for (let t = 0; t < 5; t += 1 / 60) sheet.update(1 / 60, 200);
    const before = sheet.summary().volume;
    const made = sheet.toss();
    const curds = sheet.takeCurds();
    assert.equal(made, curds.length);
    assert.ok(curds.length > 3);
    const torn = curds.reduce((sum, c) => sum + c.volume, 0);
    assert.ok(Math.abs(torn + sheet.summary().volume - before) < 1e-3);
    assert.equal(sheet.summary().liquid, sheet.summary().volume, 'only liquid should be left');
  });

  it('only pushes liquid egg around, rather than tearing it', () => {
    const sheet = createSheet({ random: seeded(2) });
    sheet.pour(0, 0, 10);
    sheet.stir([-3, 0], [3, 0]);
    assert.equal(sheet.takeCurds().length, 0);
    assert.ok(Math.abs(sheet.summary().volume - 10) < 1e-3);
  });

  it('lifts off whole for the plate', () => {
    const sheet = createSheet({ random: seeded(3) });
    sheet.pour(1, -1, 8);
    for (let t = 0; t < 10; t += 1 / 60) sheet.update(1 / 60, 200);
    const pieces = sheet.lift(4);
    assert.equal(pieces.length, 4);
    assert.ok(pieces.every((p) => p.sheet));
    assert.ok(sheet.empty);
  });
});

describe('a curd', () => {
  it('is a closed, flattish lump about as big as the egg in it', () => {
    const solid = curdSolid({ volume: 0.16, seed: 3 });
    const m = measure(solid);
    assert.ok(m.volume > 0.09 && m.volume < 0.3, `volume ${m.volume}`);
    const size = m.max.map((v, i) => v - m.min[i]);
    assert.ok(size[1] < size[0] && size[1] < size[2], 'it should lie flat');
  });
});
