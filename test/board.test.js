import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FLESH } from '../src/food/index.js';
import { potatoSolid } from '../src/food/potato.js';
import { createBoard } from '../src/sim/board.js';
import { dimensions, extents, makePiece } from '../src/sim/piece.js';
import { axisAngle } from '../src/sim/quat.js';

/** A potato lying front to back on the board, the way the kitchen puts one down. */
function potatoOnBoard(board) {
  const piece = makePiece({ solid: potatoSolid(), kind: 'potato', rot: axisAngle([0, 1, 0], Math.PI / 2) });
  piece.pos[0] = 0;
  piece.pos[2] = 0;
  board.add(piece);
  return piece;
}

const volume = (board) => board.pieces.reduce((sum, p) => sum + p.volume, 0);

function run(board, seconds = 2) {
  for (let t = 0; t < seconds; t += 1 / 60) board.update(1 / 60);
}

describe('the board', () => {
  it('puts a potato down on its belly, front to back', () => {
    const board = createBoard();
    const potato = potatoOnBoard(board);
    const b = board.box(potato);
    assert.ok(Math.abs(b.y0) < 1e-6, `bottom at ${b.y0}`);
    assert.ok(b.z1 - b.z0 > b.x1 - b.x0, 'it should lie along z');
  });

  it('cuts in two whatever is under the blade, and nothing else', () => {
    const board = createBoard();
    const potato = potatoOnBoard(board);
    const before = potato.volume;
    assert.equal(board.chop({ z: 0.2, flesh: FLESH }), 1);
    assert.equal(board.pieces.length, 2);
    assert.ok(Math.abs(volume(board) - before) / before < 1e-4);
    assert.equal(board.chop({ z: 0.2, x0: 5, x1: 7, flesh: FLESH }), 0, 'the blade is not over it');
    assert.equal(board.chop({ z: 40, flesh: FLESH }), 0, 'the blade is past it');
  });

  it('lets a round fall flat rather than stand on its edge', () => {
    const board = createBoard();
    const potato = potatoOnBoard(board);
    const b = board.box(potato);
    board.chop({ z: b.z1 - 0.6, flesh: FLESH });
    run(board);
    const round = board.pieces.reduce((a, p) => (p.volume < a.volume ? p : a));
    const e = extents(round);
    const tall = e.max[1] - e.min[1];
    assert.ok(tall < 0.75, `the round is still ${tall} tall`);
    assert.ok(board.box(round).y0 > -1e-3, 'it went through the board');
  });

  it('will not cut while the pile is turning', () => {
    const board = createBoard();
    potatoOnBoard(board);
    board.turn(1);
    board.update(0.05);
    assert.equal(board.chop({ z: 0.1, flesh: FLESH }), 0);
    run(board, 1);
    assert.equal(board.chop({ z: 0.1, flesh: FLESH }), 1);
  });

  it('turns the whole pile a quarter turn', () => {
    const board = createBoard();
    const potato = potatoOnBoard(board);
    const before = board.box(potato);
    assert.ok(board.turn(1));
    run(board, 1);
    const after = board.box(board.pieces[0]);
    assert.ok(Math.abs((after.x1 - after.x0) - (before.z1 - before.z0)) < 0.05);
  });

  it('dices a potato in three passes: rounds, strips, and turned, cubes', () => {
    const board = createBoard();
    const potato = potatoOnBoard(board);
    const before = potato.volume;
    /** One pass front to back, as far as the pile reaches — it grows as slices fall. */
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

    assert.ok(Math.abs(volume(board) - before) / before < 1e-3, 'some of the potato went missing');
    const pieces = board.pieces;
    assert.ok(pieces.length > 30, `only ${pieces.length} pieces`);
    const bite = pieces.filter((p) => Math.max(...dimensions(p)) < 1.05);
    const share = bite.reduce((sum, p) => sum + p.volume, 0) / before;
    assert.ok(share > 0.6, `only ${(share * 100).toFixed(0)}% of it is bite size`);
    for (const p of pieces) {
      const b = board.box(p);
      assert.ok(b.y0 > -1e-3, 'a piece is in the board');
      assert.ok(b.x0 >= -board.halfWidth - 1e-3 && b.x1 <= board.halfWidth + 1e-3, 'a piece fell off the side');
    }
  });
});
