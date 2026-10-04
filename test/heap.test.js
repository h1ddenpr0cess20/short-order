import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from '../src/vendor/gfx/index.js';

import { shredSolids, wholeSolids } from '../src/food/fillings.js';
import { FLESH } from '../src/food/index.js';
import { potatoSolid } from '../src/food/potato.js';
import { plateDish } from '../src/scene/cookware.js';
import { buildRamekin } from '../src/scene/props.js';
import { createBoard } from '../src/sim/board.js';
import { heap } from '../src/sim/heap.js';
import { dimensions, extents, makePiece, sliceUp } from '../src/sim/piece.js';
import { axisAngle } from '../src/sim/quat.js';

const box = (p) => {
  const e = extents(p);
  return { x0: p.pos[0] + e.min[0], x1: p.pos[0] + e.max[0], y0: p.pos[1] + e.min[1], y1: p.pos[1] + e.max[1], z0: p.pos[2] + e.min[2], z1: p.pos[2] + e.max[2] };
};

/** Any two pieces whose boxes are inside one another, by more than a graze each way. */
function inside(list, graze = 0.02) {
  const boxes = list.map(box);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const d = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > graze && d > graze && h > 1e-3) return [list[i], list[j], h];
    }
  }
  return null;
}

function run(board, seconds = 2) {
  for (let t = 0; t < seconds; t += 1 / 60) board.update(1 / 60);
}

/** A potato diced on the board the way the cook does it: rounds, strips, turned, cubes. */
function dicedPotato() {
  const board = createBoard();
  const potato = makePiece({ solid: potatoSolid(), kind: 'potato', rot: axisAngle([0, 1, 0], Math.PI / 2) });
  board.add(potato);
  const strokes = () => {
    for (let z = board.bounds().z0 + 0.62; z < board.bounds().z1 - 0.15; z += 0.62) {
      board.chop({ z, flesh: FLESH });
      run(board, 0.4);
    }
  };
  strokes();
  run(board);
  strokes();
  run(board);
  board.turn(1);
  run(board, 1);
  strokes();
  run(board);
  return board.takeAll();
}

const whole = (kind, rot = [0, 0, 0, 1]) => {
  const piece = makePiece({ solid: wholeSolids(kind)[0], kind, rot });
  piece.whole = true;
  return piece;
};

describe('a ramekin', () => {
  const { dish } = buildRamekin(GFX, { name: 'test', radius: 1.5 });

  it('takes a whole diced potato with no piece inside another, all of it in the dish', () => {
    const dice = dicedPotato();
    assert.ok(dice.length > 30);
    heap(dice, dish);
    const clash = inside(dice);
    assert.equal(clash, null, clash && `two pieces are ${clash[2].toFixed(2)} into each other`);
    for (const p of dice) {
      const b = box(p);
      const out = Math.hypot(Math.max(-b.x0, b.x1), Math.max(-b.z0, b.z1));
      assert.ok(out <= dish.reach + 1e-6, `a piece is through the side, ${out.toFixed(2)} out`);
      assert.ok(b.y0 >= dish.floor(0) - 1e-6, 'a piece is through the floor');
    }
  });

  it('heaps from the floor up, the bottom of it full before the top', () => {
    const dice = dicedPotato();
    heap(dice, dish);
    const floor = dice.filter((p) => box(p).y0 < dish.floor(dish.reach) + 1e-3);
    assert.ok(floor.length >= 6, `only ${floor.length} pieces on the floor`);
    const top = Math.max(...dice.map((p) => box(p).y1));
    const lowest = Math.min(...dice.map((p) => box(p).y0));
    assert.ok(top - lowest > 0.6, 'a whole potato should heap up');
  });

  it('puts what comes in after on top of what is there, whatever the sizes', () => {
    const dice = dicedPotato().slice(0, 12);
    heap(dice, dish);
    const tomato = whole('tomato', axisAngle([1, 0, 0], Math.PI / 2));
    const more = dicedPotato().slice(0, 8);
    heap([tomato, ...more], dish, dice);
    const clash = inside([...dice, tomato, ...more]);
    assert.equal(clash, null, clash && `${clash[0].kind} and ${clash[1].kind} are ${clash[2].toFixed(2)} into each other`);
  });

  it('heaps fine shreds as well as big dice', () => {
    const shreds = shredSolids('cheese', 4).map((solid) => makePiece({ solid, kind: 'cheese' }));
    heap(shreds, dish);
    assert.equal(inside(shreds), null);
  });
});

describe('a plate', () => {
  it('heaps what is served in the well, nothing through the plate or in anything else', () => {
    const dice = dicedPotato();
    heap(dice, plateDish);
    assert.equal(inside(dice), null);
    for (const p of dice) assert.ok(box(p).y0 >= plateDish.floor(0) - 1e-6, 'a piece is through the plate');
  });
});

describe('the board, setting a pile down', () => {
  it('lays it on top of what is there already, not in it', () => {
    const board = createBoard();
    const tomato = whole('tomato', axisAngle([1, 0, 0], Math.PI / 2));
    board.add(tomato);
    const dice = dicedPotato().slice(0, 20);
    /** The pile as it lay on the board where it was cut, put down over the tomato. */
    const cx = dice.reduce((s, p) => s + p.pos[0], 0) / dice.length, cz = dice.reduce((s, p) => s + p.pos[2], 0) / dice.length;
    for (const p of dice) {
      p.pos[0] -= cx;
      p.pos[2] -= cz;
    }
    board.lay(dice);
    run(board);
    const clash = inside(board.pieces);
    assert.equal(clash, null, clash && `${clash[0].kind} and ${clash[1].kind} are ${clash[2].toFixed(2)} into each other`);
    assert.ok(dice.some((p) => box(p).y0 > box(tomato).y1 - 0.05), 'none of it is on the tomato');
  });

  it('lets grated cheese fall in a heap, each shred on the ones before', () => {
    const board = createBoard();
    const shreds = shredSolids('cheese', 4).map((solid) => makePiece({ solid, kind: 'cheese' }));
    for (const [i, p] of shreds.entries()) {
      const a = i * 2.4, r = (i % 7) * 0.12;
      p.pos = [Math.cos(a) * r, 0, Math.sin(a) * r];
      board.lay([p]);
    }
    run(board);
    const thick = Math.max(...shreds.map((p) => box(p).y1 - box(p).y0));
    const top = Math.max(...shreds.map((p) => box(p).y1));
    assert.ok(top > thick * 2, 'the shreds all lie flat on the board');
    assert.equal(inside(board.pieces), null);
  });
});

describe('the slicing side of the grater', () => {
  for (const [kind, solid] of [['potato', () => potatoSolid()], ['cheese', () => wholeSolids('cheese')[0]]]) {
    it(`slices ${kind === 'potato' ? 'a potato' : 'a block of cheese'} into flat slices, all of it`, () => {
      const piece = makePiece({ solid: solid(), kind });
      const before = piece.volume;
      const slices = sliceUp(piece, 0.2, FLESH[kind]);
      assert.ok(slices.length >= 6, `only ${slices.length} slices`);
      assert.ok(Math.abs(slices.reduce((a, p) => a + p.volume, 0) - before) / before < 1e-3, 'some of it went missing');
      for (const p of slices) {
        const e = extents(p);
        const tall = e.max[1] - e.min[1];
        assert.ok(tall < 0.3, `a slice is standing up, ${tall.toFixed(2)} tall`);
        assert.ok(Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2]) > tall * 2, 'a slice is not lying on its face');
        assert.ok(!p.whole);
      }
    });
  }

  it('grates a potato into shreds of potato, all of it', () => {
    const volume = makePiece({ solid: potatoSolid(), kind: 'potato' }).volume;
    const shreds = shredSolids('potato', volume, Math.random, { flesh: FLESH.potato, most: 150 }).map((solid) => makePiece({ solid, kind: 'potato' }));
    assert.ok(shreds.length > 90);
    assert.ok(Math.abs(shreds.reduce((a, p) => a + p.volume, 0) - volume) / volume < 1e-3);
    for (const p of shreds) assert.ok(Math.min(...dimensions(p)) < 0.35, 'a shred is a chunk');
  });
});
