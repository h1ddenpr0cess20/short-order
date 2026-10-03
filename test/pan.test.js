import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';
import { COOK_RADIUS } from '../src/scene/pan.js';
import { createHeat, SETTINGS } from '../src/sim/heat.js';
import { createPan } from '../src/sim/pan.js';
import { dimensions, extents, makePiece, sideDown } from '../src/sim/piece.js';

/** A potato cut into dice the quick way: a grid of planes straight through it. */
function dice(size = 0.6) {
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

/** Seeded, so a test that tosses things is the same test every time. */
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function scatter(pieces, random) {
  for (const p of pieces) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 3.5;
    p.pos = [Math.cos(a) * r, 2 + random() * 2, Math.sin(a) * r];
  }
  return pieces;
}

const run = (pan, seconds, every = null) => {
  let t = 0;
  for (let i = 0; t < seconds; i++, t += 1 / 60) {
    pan.update(1 / 60);
    if (every) every(t, i);
  }
};

describe('heat', () => {
  it('brings an empty pan up to where the knob says, slowly', () => {
    const heat = createHeat();
    heat.set(3);
    for (let t = 0; t < 5; t += 0.1) heat.update(0.1);
    assert.ok(heat.temp > 60 && heat.temp < SETTINGS[3].temp - 40, `after 5s it is ${heat.temp}`);
    for (let t = 0; t < 60; t += 0.1) heat.update(0.1);
    assert.ok(Math.abs(heat.temp - SETTINGS[3].temp) < 3);
  });

  it('is knocked down by a pan full of wet food', () => {
    const empty = createHeat({ temp: 195 });
    const full = createHeat({ temp: 195 });
    empty.set(3);
    full.set(3);
    for (let t = 0; t < 20; t += 0.1) {
      empty.update(0.1, 0);
      full.update(0.1, 20);
    }
    assert.ok(full.temp < empty.temp - 15, `${full.temp} against ${empty.temp}`);
  });
});

describe('the pan', () => {
  it('catches what falls into it, flat on a face, inside the rim', () => {
    const random = seeded();
    const pan = createPan({ random });
    const pieces = scatter(dice(), random);
    pan.add(pieces);
    run(pan, 3);
    assert.equal(pan.airborne, false);
    for (const p of pan.pieces) {
      assert.ok(Math.hypot(p.pos[0], p.pos[2]) < COOK_RADIUS, 'a piece is over the rim');
      /** Lying on a face: one of its own axes points straight down. */
      const e = extents(p);
      const [w, h, d] = dimensions(p).sort((a, b) => a - b);
      assert.ok(e.max[1] - e.min[1] <= d + 0.05 && w + h + d > 0, 'a piece is standing on a corner');
    }
  });

  it('keeps pieces on the floor out of each other', () => {
    const random = seeded(3);
    const pan = createPan({ random });
    pan.add(scatter(dice(), random));
    run(pan, 4);
    const floor = pan.pieces;
    let worst = Infinity;
    for (let i = 0; i < floor.length; i++) {
      for (let j = i + 1; j < floor.length; j++) {
        const a = floor[i], b = floor[j];
        const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
        const ea = extents(a), eb = extents(b);
        const ra = Math.min(ea.max[0] - ea.min[0], ea.max[2] - ea.min[2]) / 2;
        const rb = Math.min(eb.max[0] - eb.min[0], eb.max[2] - eb.min[2]) / 2;
        worst = Math.min(worst, d / Math.max(1e-6, ra + rb));
      }
    }
    assert.ok(worst > 0.6, `two pieces are ${worst} of the way into each other`);
  });

  it('browns only the face that is down, until something turns it over', () => {
    const random = seeded(5);
    const pan = createPan({ random });
    pan.heat.set(4);
    pan.heat.state.temp = 222;
    pan.pour();
    pan.add(scatter(dice(), random));
    run(pan, 20);
    const one = pan.pieces[0];
    const down = sideDown(one);
    const sorted = [...one.brown].sort((a, b) => b - a);
    assert.ok(one.brown[down] === sorted[0] && sorted[0] > 0.5 && sorted[1] < 0.2, `browning ${[...one.brown].map((v) => v.toFixed(2))}`);
  });

  it('browns every side, given enough tossing', () => {
    const random = seeded(9);
    const pan = createPan({ random });
    pan.heat.set(4);
    pan.heat.state.temp = 222;
    pan.pour();
    pan.add(scatter(dice(), random));
    run(pan, 100, (t, i) => { if (i % 300 === 299) pan.toss(0.6); });
    const sides = pan.pieces.map((p) => [...p.brown].filter((b) => b > 0.3).length);
    const mean = sides.reduce((a, b) => a + b, 0) / sides.length;
    assert.ok(mean > 3, `on average only ${mean.toFixed(1)} sides have any colour`);
  });

  it('cooks dice through long before it cooks a whole potato through', () => {
    const pan = createPan({ random: seeded(2) });
    pan.heat.set(4);
    pan.heat.state.temp = 222;
    pan.pour();
    const whole = makePiece({ solid: potatoSolid({ columns: 48, rows: 32 }), kind: 'potato' });
    whole.pos = [-2.5, 2, 0];
    const cube = dice()[20];
    cube.pos = [2.5, 2, 0];
    pan.add([whole, cube]);
    run(pan, 40);
    assert.ok(cube.core > 0.9, `the dice is at ${cube.core}`);
    assert.ok(whole.core < 0.4, `the whole potato is at ${whole.core}`);
  });

  it('turns things over when the spatula goes through them', () => {
    const random = seeded(11);
    const pan = createPan({ random });
    const pieces = scatter(dice(), random);
    pan.add(pieces);
    run(pan, 2);
    const before = new Map(pan.pieces.map((p) => [p.id, sideDown(p)]));
    for (let k = 0; k < 30; k++) {
      const x = -4 + (k / 30) * 8;
      pan.stir([x, 0], [x + 0.27, 0], 1 / 60);
      pan.update(1 / 60);
    }
    run(pan, 1);
    const turned = pan.pieces.filter((p) => before.get(p.id) !== sideDown(p)).length;
    assert.ok(turned > 3, `only ${turned} pieces turned over`);
  });
});
