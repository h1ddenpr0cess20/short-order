import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure } from '../src/geometry/slice.js';
import { friedSolid, omeletteSolid } from '../src/food/curd.js';
import { FILLINGS, FILLING_KINDS, fillingSolid } from '../src/food/fillings.js';
import { DISHES, MENU, ticket } from '../src/game/dishes.js';
import { extrasReport, friedReport, gradeDish, omeletteReport, timeReport } from '../src/game/grade.js';
import { EGG_VOLUME, YOLK_SHARE, createSheet } from '../src/sim/eggs.js';
import { makePiece } from '../src/sim/piece.js';

function seeded(seed = 4) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Runs the sheet at a steady pan temperature for `seconds`. */
function cook(sheet, temp, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) sheet.update(dt, temp);
}

describe('eggs broken in whole', () => {
  it('keep their yolks apart, whole, and the white round them', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.crack(-2.1, 0.5);
    sheet.crack(2.1, -0.5);
    cook(sheet, 170, 5);
    const eggs = sheet.fried();
    assert.equal(eggs.length, 2);
    for (const e of eggs) {
      assert.ok(e.yolk.whole);
      assert.ok(Math.abs(e.white.volume - EGG_VOLUME * (1 - YOLK_SHARE)) < 0.6, `white ${e.white.volume}`);
    }
  });

  it('set the white long before the yolk, which stays runny face up', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.crack(0, 0);
    cook(sheet, 170, 75);
    const [e] = sheet.fried();
    assert.ok(e.white.set > 0.9, `white ${e.white.set}`);
    assert.ok(e.yolk.set < 0.5, `yolk ${e.yolk.set}`);
  });

  it('break a yolk under a spatula drawn through it', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.crack(0, 0);
    sheet.stir([-2, 0], [2, 0], 2.4, 1 / 30);
    assert.equal(sheet.yolks[0].whole, false);
    assert.ok(sheet.events.some((e) => e.type === 'break'));
  });

  it('will not turn before the white has set, and turn whole once it has', () => {
    const early = createSheet({ random: seeded() });
    early.crack(0, 0);
    assert.equal(early.flipEgg(0, 0), 'soft');
    assert.equal(early.yolks[0].whole, true, 'a spatula under runny white breaks nothing');
    assert.equal(early.yolks[0].flips, 0);

    const later = createSheet({ random: seeded() });
    later.crack(0, 0);
    cook(later, 170, 60);
    assert.equal(later.flipEgg(0.2, 0.1), 'flip');
    assert.ok(later.yolks[0].whole);
    assert.equal(later.fried()[0].yolk.flipped, true);
  });

  it('cook the yolk far faster face down', () => {
    const up = createSheet({ random: seeded() }), down = createSheet({ random: seeded() });
    for (const s of [up, down]) {
      s.crack(0, 0);
      cook(s, 170, 60);
    }
    down.flipEgg(0, 0);
    cook(up, 170, 20);
    cook(down, 170, 20);
    assert.ok(down.yolks[0].set > up.yolks[0].set + 0.2);
  });

  it('come up one by one for the plate, and leave the pan empty', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.crack(-2, 0);
    sheet.crack(2, 0);
    sheet.season('salt', 2);
    cook(sheet, 170, 30);
    const eggs = sheet.liftFried();
    assert.equal(eggs.length, 2);
    assert.ok(Math.abs(eggs[0].salt + eggs[1].salt - 2) < 0.01);
    assert.ok(sheet.empty);
    assert.equal(sheet.yolks.length, 0);
  });
});

describe('the omelette', () => {
  it('folds the sheet off the floor in one go, and not a scrap of egg is too little', () => {
    const sheet = createSheet({ random: seeded() });
    assert.equal(sheet.fold(), null);
    sheet.pour(0, 0, EGG_VOLUME * 3, 0.33);
    cook(sheet, 150, 40);
    const out = sheet.fold();
    assert.ok(Math.abs(out.volume - EGG_VOLUME * 3) < 0.05);
    assert.ok(out.set > 0.5);
    assert.ok(sheet.empty);
  });

  it('turns over whole once set, mirrored, with the browned face up', () => {
    const sheet = createSheet({ random: seeded() });
    sheet.pour(0, 2, EGG_VOLUME * 3, 0.33);
    assert.equal(sheet.flipSheet(), 'soft', 'still running: it will not hold together to turn');
    cook(sheet, 190, 40);
    const before = sheet.summary();
    let under = 0, front = 0;
    for (let k = 0; k < sheet.amount.length; k++) {
      under += sheet.brown[k];
      if (Math.floor(k / sheet.N) >= sheet.N / 2) front += sheet.amount[k];
    }
    assert.equal(sheet.flipSheet(), 'flip');
    const after = sheet.summary();
    assert.ok(Math.abs(after.volume - before.volume) < 1e-6, 'none of it lost');
    let top = 0, back = 0;
    for (let k = 0; k < sheet.amount.length; k++) {
      top += sheet.top[k];
      if (Math.floor(k / sheet.N) < sheet.N / 2) back += sheet.amount[k];
    }
    assert.ok(Math.abs(top - under) < 1e-3, 'what was underneath is on top');
    assert.ok(Math.abs(back - front) < 1e-3, 'what was at the front is at the back');
  });

  it('is a closed solid holding what it was made to, rolled or folded', () => {
    for (const shape of ['roll', 'half']) {
      const m = measure(omeletteSolid({ volume: 10.8, shape }));
      assert.ok(Math.abs(m.volume - 10.8) < 0.05, `${shape} ${m.volume}`);
    }
    const fried = measure(friedSolid({ radius: 2 }));
    assert.ok(fried.volume > 0 && fried.max[1] > 0.5, 'a fried egg has its yolk standing up off it');
  });
});

describe('the extras', () => {
  it('are each a small closed solid of their own colour', () => {
    for (const kind of FILLING_KINDS) {
      const s = fillingSolid(kind, seeded());
      const m = measure(s);
      assert.ok(m.volume > 0 && m.volume < 0.1, `${kind} ${m.volume}`);
      assert.ok(FILLINGS[kind].handful > 0);
    }
  });

  const bits = (kind, n, { core = 0.8, brown = 0 } = {}) => Array.from({ length: n }, (_, i) => {
    const p = makePiece({ solid: fillingSolid(kind, seeded(i + 1)), kind });
    p.core = core;
    p.brown.fill(brown);
    return p;
  });

  it('want cheese and one more folded into a diner omelette', () => {
    const inside = [...bits('cheese', 12), ...bits('ham', 8)];
    const good = extrasReport([], { dish: 'american', inside, wants: true });
    const outside = extrasReport(inside, { dish: 'american', wants: true });
    const none = extrasReport([], { dish: 'american', wants: true });
    assert.ok(good.score >= 90, `folded in ${good.score}`);
    assert.ok(outside.score < good.score - 15);
    assert.equal(none.score, 0);
  });

  it('mark raw onion, unmelted cheese and odd choices down', () => {
    const cooked = extrasReport(bits('onion', 8, { core: 0.8 }), { dish: 'hash' });
    const raw = extrasReport(bits('onion', 8, { core: 0 }), { dish: 'hash' });
    assert.ok(raw.score < cooked.score);
    const melted = extrasReport(bits('cheese', 12, { core: 0.9 }), { dish: 'scramble' });
    const cold = extrasReport(bits('cheese', 12, { core: 0 }), { dish: 'scramble' });
    assert.ok(cold.score < melted.score);
    assert.ok(extrasReport(bits('ham', 8), { dish: 'french' }).odd > 0);
    assert.equal(extrasReport([], { dish: 'fried' }).score, null, 'no extras, nothing to mark');
  });
});

describe('marking the other dishes', () => {
  const egg = ({ set = 1, runny = 0, brown = 0.2, yolk = 0.2, whole = true, flips = 0 } = {}) => ({
    white: { volume: 2.3, set, runny, brown, crisp: 0, radius: 2 },
    yolk: { whole, set: yolk, flipped: flips % 2 === 1, flips, down: 0, volume: 1.3 },
  });

  it('wants sunny eggs set, whole and runny, and never turned', () => {
    const good = friedReport([egg(), egg()], 'sunny');
    assert.ok(good.whites.score > 85 && good.yolks.score > 85);
    assert.ok(friedReport([egg({ runny: 0.5, set: 0.6 }), egg({ runny: 0.5, set: 0.6 })], 'sunny').whites.score < 40);
    assert.ok(friedReport([egg({ whole: false }), egg({ whole: false })], 'sunny').yolks.score < 30);
    assert.ok(friedReport([egg({ flips: 1 }), egg({ flips: 1 })], 'sunny').yolks.score < good.yolks.score);
  });

  it('wants over easy eggs turned, the yolks still runny', () => {
    const turned = friedReport([egg({ flips: 1 }), egg({ flips: 1 })], 'easy');
    const never = friedReport([egg(), egg()], 'easy');
    const hard = friedReport([egg({ flips: 1, yolk: 1.2 }), egg({ flips: 1, yolk: 1.2 })], 'easy');
    assert.ok(turned.yolks.score > never.yolks.score);
    assert.ok(hard.yolks.score < turned.yolks.score - 30);
  });

  it('wants a French omelette pale and soft, a diner one set through', () => {
    const omelette = (core, brown) => {
      const p = makePiece({ solid: omeletteSolid({ volume: 10.8, shape: 'roll' }), kind: 'egg' });
      p.core = core;
      p.brown.fill(brown);
      p.omelette = 'roll';
      return p;
    };
    const french = omeletteReport({ omelette: omelette(0.9, 0.1), beaten: 1, eggs: 3, style: 'french' });
    const brownFrench = omeletteReport({ omelette: omelette(0.9, 1.0), beaten: 1, eggs: 3, style: 'french' });
    assert.ok(french.omelette.score > 85 && french.colour.score === 100);
    assert.ok(brownFrench.colour.score < 50);
    const runnyDiner = omeletteReport({ omelette: omelette(0.6, 0.4), beaten: 1, eggs: 3, style: 'american' });
    const diner = omeletteReport({ omelette: omelette(1.2, 0.6), beaten: 1, eggs: 3, style: 'american' });
    assert.ok(diner.omelette.score > runnyDiner.omelette.score + 15);
    assert.equal(diner.colour.score, 100, 'a little golden is right for a diner omelette');
  });

  it('gives every dish parts whose weights come to the whole plate', () => {
    for (const id of MENU) {
      const r = gradeDish(DISHES[id], { pieces: [], fried: [], seconds: 60, eggs: 0 });
      const weight = r.parts.reduce((a, p) => a + p.weight, 0);
      assert.ok(Math.abs(weight - 1) < 1e-9, `${id} weighs ${weight}`);
      assert.ok(r.total >= 0 && r.total <= 100 && typeof r.verdict === 'string');
    }
  });

  it('times each dish against its own par', () => {
    assert.equal(timeReport(140, 150).score, 100);
    assert.ok(timeReport(300, 150).score < timeReport(300, 240).score);
  });
});

describe('the menu', () => {
  it('writes a ticket line for every step of every dish, from a kitchen not yet started', () => {
    const progress = {
      dice: { pieces: 1, bite: 0, done: false, next: 'cut it into rounds' },
      fry: { inPan: 0, golden: 0, cooked: 0, burnt: 0, done: false },
      whisk: { eggs: 0, mix: 0, done: false },
      scramble: { poured: 0, scrambled: 0, soft: 0, done: false },
      season: { salt: 0, pepper: 0, salted: 0, peppered: 0, potato: { volume: 0 }, egg: { volume: 0 }, score: 0, food: false, done: false },
      butter: { left: 8, share: 0, brown: 0, burnt: false },
      fried: { eggs: 0, runnyWhite: 1, turned: 0, broken: 0 },
      omelette: { poured: 0, liquid: 1, brown: 0, folded: false },
      extras: { kinds: [], inside: 0, onEgg: 0, loose: 0, cheese: false },
      temp: 22, oil: 0, fatDone: false, ready: false, plated: false,
    };
    const words = { advice: (n) => n, flip: 'flip', fold: (w) => w };
    for (const id of MENU) {
      const lines = ticket(DISHES[id], progress, words);
      assert.equal(lines.length, DISHES[id].steps.length);
      for (const l of lines) {
        assert.equal(typeof l.how, 'string', `${id}/${l.id}`);
        assert.equal(l.done, false, `${id}/${l.id} is not done before anything happened`);
      }
    }
  });
});
