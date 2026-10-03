import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { simplify } from '../src/geometry/simplify.js';
import { measure, split } from '../src/geometry/slice.js';
import { fleshAt, potatoSolid } from '../src/food/potato.js';

/** How many directed edges have no twin running back along them: none, for a closed solid. */
function open(solid) {
  const p = solid.pos, edges = new Map();
  const k = (i) => `${p[i]},${p[i + 1]},${p[i + 2]}`;
  for (let t = 0; t < p.length / 9; t++) {
    for (let e = 0; e < 3; e++) {
      const key = `${k(t * 9 + e * 3)}|${k(t * 9 + ((e + 1) % 3) * 3)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let n = 0;
  for (const [key, count] of edges) {
    const [a, b] = key.split('|');
    if ((edges.get(`${b}|${a}`) ?? 0) !== count) n += 1;
  }
  return n;
}

/** A potato diced the way the board does it, rounds then strips then cubes, simplified or not after each cut. */
function dice(lean, size = 0.62) {
  let solids = [potatoSolid({ columns: 40, rows: 28 })];
  const m = measure(solids[0]);
  for (const axis of [2, 0, 1]) {
    const normal = [0, 0, 0];
    normal[axis] = 1;
    for (let o = m.min[axis] + size; o < m.max[axis]; o += size) {
      solids = solids.flatMap((s) => {
        const { front, back } = split(s, { normal, offset: o }, { flesh: fleshAt });
        return [...front, ...back].map((x) => (lean ? simplify(x) : x));
      });
    }
  }
  return solids;
}

const triangles = (list) => list.reduce((n, s) => n + s.pos.length / 9, 0);

describe('simplifying the faces a knife leaves', () => {
  const as = dice(false);
  const lean = dice(true);

  it('leaves every piece closed', () => {
    for (const s of lean) assert.equal(open(s), 0);
  });

  it('keeps the volume exactly', () => {
    const v = (list) => list.reduce((n, s) => n + measure(s).volume, 0);
    assert.ok(Math.abs(v(lean) - v(as)) < 1e-6, `${v(lean)} against ${v(as)}`);
  });

  it('makes a cube from the middle of the potato twelve triangles', () => {
    const cubes = lean.filter((s) => s.cap.every((c) => c));
    assert.ok(cubes.length > 5, `only ${cubes.length} cubes from the middle`);
    for (const c of cubes) assert.equal(c.pos.length / 9, 12);
  });

  it('keeps a diced potato to a few times the triangles of a whole one, not tens of times', () => {
    const whole = potatoSolid({ columns: 40, rows: 28 }).pos.length / 9;
    assert.ok(triangles(lean) < whole * 6, `${triangles(lean)} triangles from a potato of ${whole}`);
    assert.ok(triangles(lean) < triangles(as) / 3, `${triangles(lean)} against ${triangles(as)} as cut`);
  });

  it('leaves a piece the next cut can still go through cleanly', () => {
    const piece = lean.reduce((a, s) => (measure(s).volume > measure(a).volume ? s : a));
    const m = measure(piece);
    const { front, back } = split(piece, { normal: [1, 0, 0], offset: (m.min[0] + m.max[0]) / 2 }, { flesh: fleshAt });
    assert.ok(front.length && back.length);
    for (const s of [...front, ...back]) assert.equal(open(s), 0);
    const after = [...front, ...back].reduce((n, s) => n + measure(s).volume, 0);
    assert.ok(Math.abs(after - m.volume) < 1e-5);
  });
});
