import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from '../src/vendor/gfx/index.js';

import { shredSolids, wholeSolids } from '../src/food/fillings.js';
import { FLESH } from '../src/food/index.js';
import { potatoSolid } from '../src/food/potato.js';
import { plateDish } from '../src/scene/cookware.js';
import { buildRamekin } from '../src/scene/props.js';
import { createBoard } from '../src/sim/board.js';
import { inEachOther, pour } from '../src/sim/pile.js';
import { dimensions, extents, makePiece, sliceUp } from '../src/sim/piece.js';
import { axisAngle } from '../src/sim/quat.js';

const top = (p) => p.pos[1] + extents(p).max[1];
const bottom = (p) => p.pos[1] + extents(p).min[1];
const highest = (list) => Math.max(...list.map(top));

/** Any two pieces in each other, anywhere. */
function clash(list) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) if (inEachOther(list[i], list[j], 0.05)) return [list[i], list[j]];
  }
  return null;
}

function run(board, seconds = 2) {
  for (let t = 0; t < seconds; t += 1 / 60) board.update(1 / 60);
}

/** A seeded generator, so a pile comes out the same every run. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A potato diced on the board the way the cook does it: rounds, strips, turned, cubes. */
let diced = null;
function dicedPotato() {
  if (!diced) {
    const board = createBoard();
    board.add(makePiece({ solid: potatoSolid(), kind: 'potato', rot: axisAngle([0, 1, 0], Math.PI / 2) }));
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
    diced = board.takeAll().map((p) => ({ solid: p.solid, rot: p.rot, from: p }));
  }
  return diced.map(({ solid, rot, from }) => makePiece({ solid: { ...solid }, kind: 'potato', rot, from }));
}

const shreds = (kind, volume) => shredSolids(kind, volume).map((solid) => makePiece({ solid, kind }));

describe('a pile in a ramekin', () => {
  const { dish } = buildRamekin(GFX, { name: 'test', radius: 1.5 });
  const rim = dish.base(1.5, 0) - 0.01;

  it('heaps diced potato in a mound, nothing in anything else, and takes no more than it holds', () => {
    const dice = dicedPotato();
    const over = pour(dice, dish, [], seeded(1));
    const kept = dice.filter((p) => !over.includes(p));
    assert.ok(kept.length >= 30, `only ${kept.length} dice went in`);
    assert.ok(over.length > 0, 'a whole potato, diced, should not all fit in one ramekin');
    assert.equal(clash(kept), null, 'two dice are in each other');
    assert.ok(highest(kept) <= dish.brim + 1e-6, 'heaped up past the brim');
    for (const p of kept) assert.ok(dish.holds(p.pos[0], p.pos[2]), 'a piece is outside the dish');
    /** Heaped up in the middle, over the rim, the wall holding up what is against it. */
    const middle = kept.filter((p) => Math.hypot(p.pos[0], p.pos[2]) < 0.9), side = kept.filter((p) => Math.hypot(p.pos[0], p.pos[2]) >= 0.9);
    assert.ok(middle.length && side.length && highest(side) < highest(middle) + 0.15, 'it is piled up against the wall, higher than in the middle');
    assert.ok(highest(kept) > rim, 'it is not heaped over the rim');
    /** And the bottom of the dish is covered before anything is heaped up over the rim. */
    assert.ok(kept.filter((p) => bottom(p) < rim * 0.5).length >= 10, 'the floor of the dish is not covered');
  });

  it('gives back exactly what did not go in, as it was', () => {
    const dice = dicedPotato();
    const before = dice.map((p) => [...p.pos]);
    const over = pour(dice, dish, [], seeded(2));
    for (const p of over) assert.deepEqual(p.pos, before[dice.indexOf(p)]);
  });

  it('lets a slice lie in a ramekin as a slice does, flat or leaning, never on its edge', () => {
    const slices = sliceUp(makePiece({ solid: potatoSolid(), kind: 'potato' }), 0.2, FLESH.potato);
    const over = pour(slices, dish, [], seeded(3));
    const kept = slices.filter((p) => !over.includes(p));
    assert.ok(kept.length >= 3);
    assert.equal(clash(kept), null);
    for (const p of kept) {
      const e = extents(p);
      assert.ok(e.max[1] - e.min[1] < Math.max(...dimensions(p)) * 0.75, 'a slice is standing on its edge');
    }
  });

  it('heaps grated cheese loosely, each shred on those under it', () => {
    const cheese = shreds('cheese', 2.1);
    const over = pour(cheese, dish, [], seeded(4));
    const kept = cheese.filter((p) => !over.includes(p));
    assert.equal(clash(kept), null);
    assert.ok(highest(kept) > dish.base(0, 0) + 0.4, 'the shreds all lie flat on the floor of the dish');
  });
});

describe('a pile on a plate', () => {
  it('falls in a mound in the well, nothing in anything else or through the plate', () => {
    const dice = dicedPotato();
    assert.deepEqual(pour(dice, plateDish, [], seeded(5)), [], 'a plate takes it all');
    assert.equal(clash(dice), null);
    for (const p of dice) assert.ok(bottom(p) >= plateDish.floor(0) - 0.02, 'a piece is through the plate');
    const h = highest(dice);
    assert.ok(h > 1 && h < 4, `a mound ${h.toFixed(2)} high`);
    const spread = Math.max(...dice.map((p) => Math.hypot(p.pos[0], p.pos[2])));
    assert.ok(spread > 1.8, 'it is all in a column in the middle');
  });
});

describe('a pile on the board', () => {
  it('will not stand a tower: one slumps into a heap', () => {
    const board = createBoard();
    const dice = dicedPotato().slice(0, 24);
    /** Dropped one on top of the other, straight down. */
    dice.forEach((p, i) => {
      p.pos = [0.05 * (i % 3), 0.6 * i, 0.05 * (i % 2)];
      p.version += 1;
    });
    board.lay(dice);
    run(board, 3);
    assert.ok(highest(board.pieces) < 1.6, `still ${highest(board.pieces).toFixed(2)} high`);
    assert.equal(clash(board.pieces), null);
    for (const p of board.pieces) assert.ok(bottom(p) > -0.02, 'a piece is in the board');
  });

  it('lets a piece left hanging off another slide off it and fall', () => {
    const board = createBoard();
    /** Two good dice, not slivers of skin. */
    const [under, over] = dicedPotato().filter((p) => Math.min(...dimensions(p)) > 0.35);
    under.pos = [0, 0, 0];
    board.add(under);
    /** Only its very edge over the one under it: its middle well out past it. */
    over.pos = [extents(under).max[0] - 0.25 - extents(over).min[0], 3, 0];
    over.version += 1;
    board.lay([over], { slump: false });
    assert.ok(bottom(over) > 0.1, 'it should start up on the other one');
    run(board, 2);
    assert.ok(bottom(over) < 0.02, 'it is still hanging there');
  });

  it('sets a pile from a ramekin down as a heap, not a tower', () => {
    const { dish } = buildRamekin(GFX, { name: 'test', radius: 1.5 });
    const dice = dicedPotato();
    const over = pour(dice, dish, [], seeded(6));
    const kept = dice.filter((p) => !over.includes(p));
    const board = createBoard();
    board.lay(kept);
    run(board, 3);
    assert.equal(clash(board.pieces), null);
    assert.ok(highest(board.pieces) < 1.8, `${highest(board.pieces).toFixed(2)} high`);
  });

  it('pours grated cheese out in a heap: thicker than one shred, nowhere near a tower', () => {
    const board = createBoard();
    const cheese = shreds('cheese', 2.1);
    pour(cheese, { centre: [0, 0], spread: 0.45, holds: (x, z) => Math.abs(x) < 6.8 && Math.abs(z) < 4.5 }, [], seeded(7));
    for (const p of cheese) board.lay([p], { slump: false });
    run(board, 2);
    const thick = Math.max(...cheese.map((p) => Math.min(...dimensions(p))));
    assert.ok(highest(board.pieces) > thick * 4, 'the shreds all lie flat');
    assert.ok(highest(board.pieces) < 1.5, 'the shreds stand up in a tower');
    assert.equal(clash(board.pieces), null);
  });

  it('keeps a whole tomato off the dice it is put down on', () => {
    const board = createBoard();
    for (const p of dicedPotato().slice(0, 30)) board.lay([p]);
    run(board);
    const tomato = makePiece({ solid: wholeSolids('tomato')[0], kind: 'tomato', rot: axisAngle([1, 0, 0], Math.PI / 2) });
    tomato.pos = [0, 4, 0];
    board.lay([tomato]);
    run(board, 2);
    assert.equal(clash(board.pieces), null);
  });
});

describe('the slicing side of the grater', () => {
  it('slices a block of cheese into flat slices, all of it', () => {
    const piece = makePiece({ solid: wholeSolids('cheese')[0], kind: 'cheese' });
    const before = piece.volume;
    const slices = sliceUp(piece, 0.2, FLESH.cheese);
    assert.ok(slices.length >= 6, `only ${slices.length} slices`);
    assert.ok(Math.abs(slices.reduce((a, p) => a + p.volume, 0) - before) / before < 1e-3, 'some of it went missing');
    for (const p of slices) assert.ok(Math.min(...dimensions(p)) < 0.3 && !p.whole);
  });

  it('grates a potato into shreds of potato, all of it', () => {
    const volume = makePiece({ solid: potatoSolid(), kind: 'potato' }).volume;
    const strips = shredSolids('potato', volume, Math.random, { flesh: FLESH.potato, most: 220, long: 1.5 }).map((solid) => makePiece({ solid, kind: 'potato' }));
    assert.ok(strips.length > 150);
    assert.ok(Math.abs(strips.reduce((a, p) => a + p.volume, 0) - volume) / volume < 1e-3);
    for (const p of strips) assert.ok(Math.min(...dimensions(p)) < 0.3, 'a shred is a chunk');
  });
});
