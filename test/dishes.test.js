import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure } from '../src/geometry/slice.js';
import { curdSolid, friedSolid, omeletteSolid } from '../src/food/curd.js';
import { FILLINGS, FILLING_KINDS, HASH, PORTION, shredSolids, wholeSolids } from '../src/food/fillings.js';
import { FLESH } from '../src/food/index.js';
import { potatoSolid } from '../src/food/potato.js';
import { DISHES, MENU, ticket } from '../src/game/dishes.js';
import { extrasReport, friedReport, gradeDish, omeletteReport, timeReport } from '../src/game/grade.js';
import { createBoard } from '../src/sim/board.js';
import { EGG_VOLUME, YOLK_SHARE, createSheet } from '../src/sim/eggs.js';
import { dimensions, makePiece } from '../src/sim/piece.js';
import { axisAngle } from '../src/sim/quat.js';

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

/** Every edge of a closed solid is walked once each way. */
function unpaired(solid) {
  const p = solid.pos;
  const key = (i) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
  const edges = new Map();
  for (let t = 0; t < p.length; t += 9) {
    for (let e = 0; e < 3; e++) {
      const k = `${key(t + e * 3)}|${key(t + ((e + 1) % 3) * 3)}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, n] of edges) {
    const [a, b] = k.split('|');
    if ((edges.get(`${b}|${a}`) ?? 0) !== n) bad += 1;
  }
  return bad;
}

const settle = (board, seconds = 1.5) => {
  for (let t = 0; t < seconds; t += 1 / 60) board.update(1 / 60);
};

/** One of the extras off the counter, onto a board of its own, as the kitchen puts it down. */
function onBoard(kind) {
  const board = createBoard();
  for (const solid of wholeSolids(kind)) {
    const p = makePiece({ solid, kind });
    p.whole = true;
    board.add(p);
  }
  return board;
}

/** Diced the way a cook would: slices, across them, turned, and across again. */
function dice(kind, step = 0.4) {
  const board = onBoard(kind);
  for (let pass = 0; pass < 2; pass++) {
    const b = board.bounds();
    for (let z = b.z0 + step; z < b.z1; z += step) board.chop({ z, flesh: FLESH });
    settle(board);
    board.turn(1);
    settle(board);
  }
  const b = board.bounds();
  for (let z = b.z0 + step; z < b.z1; z += step) board.chop({ z, flesh: FLESH });
  settle(board);
  return board.pieces;
}

describe('the extras', () => {
  it('come off the counter whole: closed solids, lying front to back', () => {
    for (const kind of FILLING_KINDS) {
      const solids = wholeSolids(kind);
      let volume = 0;
      for (const s of solids) {
        const m = measure(s);
        assert.ok(m.volume > 0, `${kind} ${m.volume}`);
        assert.equal(unpaired(s), 0, `${kind} is not closed`);
        volume += m.volume;
        assert.ok(m.max[2] - m.min[2] >= 1.3, `${kind} should lie along the knife's path`);
      }
      assert.ok(Math.abs(volume - PORTION[kind]) < 1e-6, `${kind} is a portion`);
      assert.ok(FILLINGS[kind].bite > 0 && FILLINGS[kind].whole);
    }
  });

  it('dice on the board into bite-size bits, and lose none of themselves doing it', () => {
    for (const kind of ['tomato', 'onion', 'cheese', 'chives']) {
      const before = PORTION[kind];
      const bits = dice(kind, kind === 'chives' ? 0.3 : 0.4);
      const after = bits.reduce((a, p) => a + p.volume, 0);
      assert.ok(Math.abs(after - before) / before < 1e-3, `${kind} ${before} → ${after}`);
      assert.ok(bits.length > 12, `${kind}: ${bits.length} bits`);
      assert.ok(bits.every((p) => p.kind === kind && !p.whole), 'cut pieces are the same thing, and no longer whole');
      const big = bits.filter((p) => Math.max(...dimensions(p)) > FILLINGS[kind].bite).reduce((a, p) => a + p.volume, 0);
      assert.ok(big / after < 0.2, `${kind}: ${(big / after).toFixed(2)} still too big`);
    }
  });

  const bits = (kind, { core = 0.8, brown = 0 } = {}) => dice(kind).map((p) => {
    p.core = core;
    p.brown.fill(brown);
    return p;
  });

  it('want cheese and one more folded into a diner omelette', () => {
    const inside = [...bits('cheese'), ...bits('ham')];
    const good = extrasReport([], { dish: 'american', inside, wants: true });
    const outside = extrasReport(inside, { dish: 'american', wants: true });
    const none = extrasReport([], { dish: 'american', wants: true });
    assert.ok(good.score >= 90, `folded in ${good.score}`);
    assert.ok(outside.score < good.score - 15);
    assert.equal(none.score, 0);
  });

  it('mark raw onion, unmelted cheese and odd choices down', () => {
    const cooked = extrasReport(bits('onion', { core: 0.8 }), { dish: 'hash' });
    const raw = extrasReport(bits('onion', { core: 0 }), { dish: 'hash' });
    assert.ok(raw.score < cooked.score);
    const melted = extrasReport(bits('cheese', { core: 0.9 }), { dish: 'scramble' });
    const cold = extrasReport(bits('cheese', { core: 0 }), { dish: 'scramble' });
    assert.ok(cold.score < melted.score);
    assert.ok(extrasReport(bits('ham'), { dish: 'french' }).odd > 0);
    assert.equal(extrasReport([], { dish: 'fried' }).score, null, 'no extras, nothing to mark');
  });

  it('name only the extras that were raw', () => {
    const r = gradeDish(DISHES.hash, { pieces: bits('onion', { core: 0 }) });
    const note = r.parts.find((p) => p.key === 'extras').note;
    assert.match(note, /The onion wanted cooking first/);
    assert.doesNotMatch(note, /pepper/);
  });

  it('want cutting: a whole tomato thrown in, or one only sliced, is marked down', () => {
    const whole = onBoard('tomato').pieces.map((p) => Object.assign(p, { core: 0.8 }));
    const sliced = onBoard('tomato');
    for (let z = -0.8; z < 0.9; z += 0.35) sliced.chop({ z, flesh: FLESH });
    settle(sliced);
    for (const p of sliced.pieces) p.core = 0.8;
    const diced = bits('tomato');
    const r = (list) => extrasReport(list, { dish: 'hash' });
    assert.equal(r(whole).whole, 1);
    assert.ok(r(sliced.pieces).chunky > 0.8, `rounds are not dice: ${r(sliced.pieces).chunky}`);
    assert.ok(r(diced).chunky < 0.2);
    assert.ok(r(whole).score < r(diced).score - 25, `${r(whole).score} vs ${r(diced).score}`);
    assert.ok(r(sliced.pieces).score < r(diced).score - 25);
  });

  it('weigh how much went in by volume: four tomatoes is a lot of tomato', () => {
    const one = extrasReport(bits('tomato'), { dish: 'hash' });
    const four = extrasReport([...bits('tomato'), ...bits('tomato'), ...bits('tomato'), ...bits('tomato')], { dish: 'hash' });
    assert.ok(Math.abs(one.handfuls - 1) < 0.01);
    assert.ok(four.heavy > 0 && four.score < one.score);
  });
});

describe('marking the other dishes', () => {
  const egg = ({ set = 1, runny = 0, brown = 0.2, yolk = 0.2, whole = true, flips = 0 } = {}) => ({
    white: { volume: 2.3, set, runny, brown, crisp: 0, radius: 2 },
    yolk: { whole, set: yolk, flipped: flips % 2 === 1, flips, down: 0, volume: 1.3 },
  });

  it('counts broken yolks out of however many eggs there were', () => {
    const note = (fried) => gradeDish(DISHES.free, { fried }).parts.find((p) => p.key === 'yolks').note;
    assert.equal(note([egg({ whole: false })]), 'The yolk broke.');
    assert.equal(note([egg({ whole: false }), egg({ whole: false })]), 'Both yolks broken.');
    assert.equal(note([egg({ whole: false }), egg({ whole: false }), egg()]), '2 yolks broken.');
  });

  it('wants sunny eggs set, whole and runny, and never turned', () => {
    const good = friedReport([egg(), egg()], 'sunny');
    assert.ok(good.whites.score > 85 && good.yolks.score > 85);
    assert.ok(friedReport([egg({ runny: 0.5, set: 0.6 }), egg({ runny: 0.5, set: 0.6 })], 'sunny').whites.score < 40);
    assert.ok(friedReport([egg({ whole: false }), egg({ whole: false })], 'sunny').yolks.score < 30);
    assert.ok(friedReport([egg({ flips: 1 }), egg({ flips: 1 })], 'sunny').yolks.score < good.yolks.score);
    const back = friedReport([egg({ flips: 2 }), egg({ flips: 2 })], 'sunny');
    assert.ok(back.yolks.score < good.yolks.score, 'turned over and back again is still turned');
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

  it('reads the clock to the second without ever showing sixty of them', () => {
    const r = gradeDish(DISHES.scramble, { pieces: [], seconds: 119.6, eggs: 0 });
    assert.match(r.parts.find((p) => p.key === 'time').note, /^2:00/);
  });

  it('gives a hash plate with extras the verdict its own total earns', () => {
    const board = createBoard();
    board.add(makePiece({ solid: potatoSolid(), kind: 'potato', rot: axisAngle([0, 1, 0], Math.PI / 2) }));
    for (let pass = 0; pass < 3; pass++) {
      const b = board.bounds();
      for (let z = b.z0 + 0.75; z < b.z1; z += 0.75) board.chop({ z, flesh: FLESH });
      settle(board);
      if (pass < 2) {
        board.turn(1);
        settle(board);
      }
    }
    const seasoned = (p) => Object.assign(p, { core: 1, salt: p.volume / 8, pepper: p.volume / 5 });
    const potato = board.pieces.map((p) => seasoned(Object.assign(p, { brown: new Float32Array(6).fill(1) })));
    const curds = Array.from({ length: 36 }, (_, i) => seasoned(makePiece({ solid: curdSolid({ volume: 0.3, seed: i + 1 }), kind: 'egg' })));
    const plate = { pieces: [...potato, ...curds], seconds: 60, eggs: 3, beaten: 1, buttered: true };
    assert.equal(gradeDish(DISHES.hash, plate).verdict, 'Order up. That is the one.');
    /** Half an onion thrown in whole and burnt takes it under five stars: the verdict has to follow. */
    const onion = wholeSolids('onion').map((solid) => Object.assign(makePiece({ solid, kind: 'onion' }), { whole: true, brown: new Float32Array(6).fill(2) }));
    const r = gradeDish(DISHES.hash, { ...plate, pieces: [...plate.pieces, ...onion] });
    assert.ok(r.total < 92, `${r.total}`);
    assert.notEqual(r.verdict, 'Order up. That is the one.');
  });
});

describe('freestyle', () => {
  const omelette = (core, brown) => {
    const p = makePiece({ solid: omeletteSolid({ volume: 7.2, shape: 'half' }), kind: 'egg' });
    p.core = core;
    p.brown.fill(brown);
    p.omelette = 'half';
    p.inside = [];
    return p;
  };

  it('marks whatever is on the plate, the way its own dish would, with no clock and no shortfall', () => {
    const r = gradeDish(DISHES.free, { pieces: [omelette(1.1, 0.5)], seconds: 3600, eggs: 2, beaten: 1 });
    assert.deepEqual(r.parts.map((p) => p.key), ['omelette', 'season']);
    assert.equal(r.time.seconds, 3600, 'the ticket\'s clock stops at the plate, even with no par');
    assert.ok(r.parts[0].score > 80, `two eggs is a fine omelette freestyle: ${r.parts[0].score}`);
    assert.ok(Math.abs(r.parts.reduce((a, p) => a + p.weight, 0) - 1) < 1e-9);
  });

  it('marks one fried egg as an order of one, turned or not', () => {
    const egg = (flips) => ({
      white: { volume: 2.3, set: 1, runny: 0, brown: 0.2, crisp: 0, radius: 2 },
      yolk: { whole: true, set: 0.2, flipped: flips % 2 === 1, flips, down: 0, volume: 1.3 },
    });
    for (const flips of [0, 1]) {
      const r = gradeDish(DISHES.free, { pieces: [], fried: [egg(flips)], seconds: 60 });
      assert.ok(r.parts.find((p) => p.key === 'yolks').score > 85, `flips ${flips}`);
    }
  });

  it('marks diced extras, and the potato only if there is any', () => {
    const extras = dice('pepper').map((p) => Object.assign(p, { core: 0.8 }));
    const r = gradeDish(DISHES.free, { pieces: extras, seconds: 60 });
    assert.deepEqual(r.parts.map((p) => p.key), ['extras', 'season']);
    assert.ok(r.parts[0].score > 70, `${r.parts[0].score}: ${r.parts[0].note}`);
  });

  it('marks a grated potato, fried, as hash browns: on how it fried, not as badly diced', () => {
    const volume = makePiece({ solid: potatoSolid(), kind: 'potato' }).volume;
    const strands = shredSolids('potato', volume, seeded(9), { flesh: FLESH.potato, ...HASH })
      .map((solid) => Object.assign(makePiece({ solid, kind: 'potato' }), { shred: true, core: 1, moisture: 0 }));
    for (const p of strands) p.brown.fill(1);
    const r = gradeDish(DISHES.free, { pieces: strands, seconds: 300 });
    const keys = r.parts.map((p) => p.key);
    assert.ok(!keys.includes('dice'), 'hash browns are not marked as dice');
    const fry = r.parts.find((p) => p.key === 'fry');
    assert.equal(fry.label, 'hash browns');
    assert.ok(fry.score > 70, `${fry.score}: ${fry.note}`);
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
      extras: { kinds: [], inside: 0, onEgg: 0, loose: 0, cheese: false, board: [], next: '' },
      board: { pieces: 1, next: 'cut it into rounds' },
      cut: { pieces: 0, bite: 0 },
      free: { words: [], fill: 0, done: false },
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
