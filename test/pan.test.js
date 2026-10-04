import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { HASH, shredSolids, wholeSolids } from '../src/food/fillings.js';
import { FLESH } from '../src/food/index.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';
import { COOK_RADIUS, LIP_RADIUS, floorHeight } from '../src/scene/pan.js';
import { createHeat, SETTINGS } from '../src/sim/heat.js';
import { createPan } from '../src/sim/pan.js';
import { dimensions, extents, makePiece, sideDown } from '../src/sim/piece.js';
import { multiply, rotate } from '../src/sim/quat.js';

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

  it('keeps every piece wholly inside the iron, however hard it is shaken and tossed', () => {
    const random = seeded(21);
    const pan = createPan({ random });
    pan.pour();
    pan.add(scatter(dice(), random));
    let worstFloor = -Infinity, worstAir = -Infinity;
    for (let i = 0; i < 60 * 20; i++) {
      /** Jerked back and forth across the grate, and thrown hard now and then. */
      const jerk = Math.sin(i * 0.35) * 420;
      pan.update(1 / 60, 0, [jerk, Math.cos(i * 0.21) * 300]);
      if (i % 90 === 89) pan.toss(1);
      for (const p of pan.pieces) {
        const e = extents(p);
        const rho = ((e.max[0] - e.min[0]) + (e.max[2] - e.min[2])) * 0.25;
        const r = Math.hypot(p.pos[0], p.pos[2]);
        if (!pan.state(p).air) {
          /** On the floor: how far any corner of it, as it is shown leaning, is into the iron. */
          const lean = pan.state(p).lean, q = lean ? multiply(lean, p.rot) : p.rot, pts = p.solid.pos;
          for (let k = 0; k < pts.length; k += 9) {
            const v = rotate(q, [pts[k], pts[k + 1], pts[k + 2]]);
            const out = Math.hypot(p.pos[0] + v[0], p.pos[2] + v[2]), y = p.pos[1] + v[1];
            worstFloor = Math.max(worstFloor, out <= COOK_RADIUS ? floorHeight(out) - y : out - COOK_RADIUS);
          }
        } else if (r + rho > COOK_RADIUS && r - rho < LIP_RADIUS) {
          /** In the air out by the wall: its bottom has to be above the iron there. */
          worstAir = Math.max(worstAir, floorHeight(Math.min(r + rho, LIP_RADIUS)) - (p.pos[1] + e.min[1]));
        }
      }
    }
    assert.ok(worstFloor < 0.3, `a piece on the floor reached ${worstFloor.toFixed(2)} into the iron`);
    assert.ok(worstAir < 0.1, `a piece in the air was ${worstAir.toFixed(2)} into the wall`);
  });

  it('keeps the food in the pan through an ordinary toss', () => {
    const random = seeded(23);
    const pan = createPan({ random });
    pan.pour();
    pan.add(scatter(dice(), random));
    const before = pan.pieces.length;
    run(pan, 60, (t, i) => { if (i % 240 === 239) pan.toss(0.62); });
    assert.equal(pan.pieces.length, before, `${before - pan.pieces.length} pieces went over the side`);
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

  it('browns the face that is down far the most, until something turns it over', () => {
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

  it('lets food slide when the pan is shaken under it, more on oil than dry', () => {
    const slid = (oiled) => {
      const random = seeded(13);
      const pan = createPan({ random });
      if (oiled) pan.pour();
      const pieces = scatter(dice(), random);
      pan.add(pieces);
      run(pan, 2);
      const before = pan.pieces.map((p) => p.pos[0]);
      /** A jerk to the right and back: the food should be left behind, to the left. */
      for (let i = 0; i < 6; i++) pan.update(1 / 60, 0, [300, 0]);
      const after = pan.pieces.map((p) => p.pos[0]);
      return before.reduce((sum, x, i) => sum + (x - after[i]), 0) / before.length;
    };
    const oiled = slid(true), dry = slid(false);
    assert.ok(oiled > 0.05, `oiled food moved ${oiled}`);
    assert.ok(oiled > dry, `oiled ${oiled} against dry ${dry}`);
  });

  it('lets food pushed across the oil come to a stop, rather than skate on', () => {
    const random = seeded(17);
    const pan = createPan({ random });
    pan.pour();
    pan.add(scatter(dice(), random));
    run(pan, 2);
    for (let k = 0; k < 60; k++) {
      const x = -4 + (k / 60) * 8;
      pan.stir([x, 0], [x + 8 / 60, 0], 1 / 60);
      pan.update(1 / 60);
    }
    run(pan, 0.5);
    const before = new Map(pan.pieces.map((p) => [p, [...p.pos]]));
    run(pan, 0.5);
    const moved = Math.max(...pan.pieces.map((p) => Math.hypot(p.pos[0] - before.get(p)[0], p.pos[2] - before.get(p)[2])));
    assert.ok(moved < 0.2, `a piece slid ${moved.toFixed(2)} in the half second after the spatula had been gone half a second`);
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

describe('hash browns, and long strips, in the pan', () => {
  const shreds = () => {
    const volume = makePiece({ solid: potatoSolid(), kind: 'potato' }).volume;
    return shredSolids('potato', volume, Math.random, { flesh: FLESH.potato, ...HASH })
      .map((solid) => Object.assign(makePiece({ solid, kind: 'potato' }), { shred: true }));
  };
  const into = (pan, list) => {
    for (const p of list) {
      p.pos = [(Math.random() - 0.5) * 4, 2 + Math.random(), (Math.random() - 0.5) * 4];
      pan.state(p);
    }
    pan.add(list, { area: 10 });
  };
  /** Standing up off the floor: taller than a piece that lies on a face it could lie on ever is. */
  const onEnd = (p) => {
    const e = extents(p);
    return e.max[1] - e.min[1] > Math.min(...dimensions(p)) * 1.7 + 0.05;
  };

  it('lets a whole grated potato lie in a tangled layer, still, rather than shoving itself round the pan', () => {
    const pan = createPan();
    const list = shreds();
    into(pan, list);
    run(pan, 3);
    const was = list.map((p) => [...p.pos]);
    run(pan, 2);
    const drift = Math.max(...list.map((p, i) => Math.hypot(p.pos[0] - was[i][0], p.pos[2] - was[i][2])));
    assert.ok(drift < 1e-3, `strands left alone moved ${drift.toFixed(3)}`);
    assert.equal(pan.pieces.length, list.length, 'strands went over the side');
  });

  it('never stands a strand, or a strip of pepper, on its end: not stirred, not tossed', () => {
    const pan = createPan();
    const strips = wholeSolids('pepper').flatMap((solid) => {
      let parts = [solid];
      for (let z = -0.7; z < 1; z += 0.35) parts = parts.flatMap((s) => { const { front, back } = split(s, { normal: [0, 0, 1], offset: z }); return [...front, ...back]; });
      return parts;
    }).map((solid) => makePiece({ solid, kind: 'pepper' }));
    const list = [...shreds(), ...strips];
    into(pan, list);
    run(pan, 3);
    for (let k = 0; k < 6; k++) {
      pan.stir([-3 + k, -2], [3 - k, 2], 1 / 30);
      run(pan, 0.3);
    }
    pan.toss(0.6);
    run(pan, 3);
    const standing = list.filter(onEnd);
    assert.equal(standing.length, 0, `${standing.length} stood on end: ${standing.map((p) => p.kind).join(', ')}`);
  });

  it('browns hash browns on the hot iron', () => {
    const pan = createPan();
    pan.heat.set(4);
    run(pan, 90);
    pan.pour(0.8);
    const list = shreds();
    into(pan, list);
    run(pan, 60);
    const brown = list.reduce((a, p) => a + Math.max(...p.brown), 0) / list.length;
    assert.ok(brown > 0.6, `browned only ${brown.toFixed(2)}`);
  });
});

describe('long pieces by the wall', () => {
  it('keeps every strand of hash browns out of the iron, ends and all, however it points', () => {
    const pan = createPan();
    const volume = makePiece({ solid: potatoSolid(), kind: 'potato' }).volume;
    const list = shredSolids('potato', volume, Math.random, { flesh: FLESH.potato, ...HASH })
      .map((solid) => Object.assign(makePiece({ solid, kind: 'potato' }), { shred: true }));
    for (const p of list) {
      p.pos = [(Math.random() - 0.5) * 9, 2 + Math.random(), (Math.random() - 0.5) * 9];
      pan.state(p);
    }
    pan.add(list, { area: 10 });
    run(pan, 4);
    for (let k = 0; k < 8; k++) {
      pan.stir([-4, -4 + k], [4, 4 - k], 1 / 30);
      run(pan, 0.3);
    }
    run(pan, 3);
    let worst = 0;
    for (const p of pan.pieces) {
      const lean = pan.state(p).lean, q = lean ? multiply(lean, p.rot) : p.rot, pts = p.solid.pos;
      for (let i = 0; i < pts.length; i += 3) {
        const v = rotate(q, [pts[i], pts[i + 1], pts[i + 2]]);
        const r = Math.hypot(p.pos[0] + v[0], p.pos[2] + v[2]), y = p.pos[1] + v[1];
        worst = Math.max(worst, r <= COOK_RADIUS ? floorHeight(r) - y : r - COOK_RADIUS);
      }
    }
    assert.ok(worst < 0.3, `a strand is ${worst.toFixed(2)} into the iron`);
  });
});
