import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { components, makeSolid, measure, split, translate, weld } from '../src/geometry/slice.js';
import { signedArea, triangulate } from '../src/geometry/triangulate.js';

/** An axis-aligned box as a solid, wound outward. */
function box([x0, y0, z0], [x1, y1, z1]) {
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [[0, 3, 2, 1], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]],
    [[0, 1, 5, 4], [0, -1, 0]], [[3, 7, 6, 2], [0, 1, 0]],
    [[0, 4, 7, 3], [-1, 0, 0]], [[1, 2, 6, 5], [1, 0, 0]],
  ];
  const pos = [], nrm = [], col = [];
  for (const [[a, b, q, d], n] of faces) {
    for (const i of [a, b, q, a, q, d]) {
      pos.push(...c[i]);
      nrm.push(...n);
      col.push(0.5, 0.3, 0.1);
    }
  }
  return makeSolid({ pos, nrm, col });
}

/** A UV sphere as a solid, wound outward. */
function sphere(radius = 1, w = 24, h = 16) {
  const at = (i, j) => {
    const theta = (j / h) * Math.PI;
    const phi = (i / w) * Math.PI * 2;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
  };
  const pos = [], nrm = [], col = [];
  const tri = (a, b, q) => {
    for (const p of [a, b, q]) {
      pos.push(p[0] * radius, p[1] * radius, p[2] * radius);
      nrm.push(...p);
      col.push(0.6, 0.4, 0.2);
    }
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = at(i, j), b = at(i + 1, j), q = at(i + 1, j + 1), d = at(i, j + 1);
      if (j > 0) tri(a, b, d);
      if (j < h - 1) tri(b, q, d);
    }
  }
  return weld(makeSolid({ pos, nrm, col }));
}

const key = (p, o) => `${p[o]},${p[o + 1]},${p[o + 2]}`;

/** Every edge shared by exactly two triangles, running opposite ways: closed, and wound consistently. */
function assertClosed(solid, label) {
  const edges = new Map();
  for (let t = 0; t < solid.pos.length; t += 9) {
    const k = [key(solid.pos, t), key(solid.pos, t + 3), key(solid.pos, t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3];
      if (a === b) continue;
      const id = `${a}>${b}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  for (const [id, count] of edges) {
    const [a, b] = id.split('>');
    const back = edges.get(`${b}>${a}`) ?? 0;
    assert.equal(count, 1, `${label}: edge ${id} used ${count} times one way`);
    assert.equal(back, 1, `${label}: edge ${id} has ${back} partners`);
  }
}

describe('triangulate', () => {
  const area = (flat, index) => {
    let total = 0;
    for (let k = 0; k < index.length; k += 3) total += signedArea(flat, [index[k], index[k + 1], index[k + 2]]);
    return total;
  };

  it('fills a square with two triangles of the right area', () => {
    const flat = [0, 0, 1, 0, 1, 1, 0, 1];
    const index = triangulate(flat);
    assert.equal(index.length, 6);
    assert.ok(Math.abs(area(flat, index) - 1) < 1e-9);
  });

  it('fills a dented outline without spilling out of the dent', () => {
    const flat = [0, 0, 3, 0, 3, 3, 2, 3, 2, 1, 1, 1, 1, 3, 0, 3];
    const index = triangulate(flat);
    assert.ok(Math.abs(area(flat, index) - 7) < 1e-9);
  });

  it('winds counter-clockwise whichever way the outline came in', () => {
    const flat = [0, 1, 1, 1, 1, 0, 0, 0];
    const index = triangulate(flat);
    for (let k = 0; k < index.length; k += 3) assert.ok(signedArea(flat, index.slice(k, k + 3)) > 0);
  });

  it('never throws on a degenerate outline', () => {
    assert.doesNotThrow(() => triangulate([0, 0, 1, 0, 1, 0, 2, 0, 0, 0]));
    assert.deepEqual(triangulate([0, 0, 1, 1]), []);
  });
});

describe('split', () => {
  it('cuts a box into two closed boxes with the volume shared out', () => {
    const solid = box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);
    const { front, back } = split(solid, { normal: [1, 0, 0], offset: 0.2 });
    assert.equal(front.length, 1);
    assert.equal(back.length, 1);
    assert.ok(Math.abs(measure(front[0]).volume - 0.3) < 1e-6);
    assert.ok(Math.abs(measure(back[0]).volume - 0.7) < 1e-6);
    assertClosed(front[0], 'front');
    assertClosed(back[0], 'back');
  });

  it('faces the new flesh outward on both sides', () => {
    const solid = box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);
    const { front, back } = split(solid, { normal: [1, 0, 0], offset: 0 });
    const capNormals = (piece) => {
      const out = new Set();
      for (let t = 0; t < piece.cap.length; t++) if (piece.cap[t]) out.add(Math.sign(piece.nrm[t * 9]));
      return [...out];
    };
    assert.deepEqual(capNormals(front[0]), [-1]);
    assert.deepEqual(capNormals(back[0]), [1]);
  });

  it('colours the cut face from the flesh, and leaves the skin alone', () => {
    const solid = box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);
    const { back } = split(solid, { normal: [0, 0, 1], offset: 0.1 }, { flesh: () => [0.9, 0.9, 0.7] });
    const piece = back[0];
    for (let t = 0; t < piece.cap.length; t++) {
      const r = piece.col[t * 9];
      if (piece.cap[t]) assert.ok(Math.abs(r - 0.9) < 1e-6);
      else assert.ok(Math.abs(r - 0.5) < 1e-6);
    }
  });

  it('hands back a solid the plane misses, whole and on its own side', () => {
    const solid = box([0, 0, 0], [1, 1, 1]);
    const ahead = split(solid, { normal: [1, 0, 0], offset: -2 });
    assert.equal(ahead.front[0], solid);
    assert.equal(ahead.back.length, 0);
    const behind = split(solid, { normal: [1, 0, 0], offset: 5 });
    assert.equal(behind.back[0], solid);
  });

  it('keeps a round body closed and its volume whole through a cut off the grid', () => {
    const ball = sphere(1);
    const before = measure(ball).volume;
    const { front, back } = split(ball, { normal: [0.6, 0.3, -0.74].map((v, _, a) => v / Math.hypot(...a)), offset: 0.137 });
    const after = [...front, ...back].reduce((sum, p) => sum + measure(p).volume, 0);
    assert.ok(Math.abs(after - before) < 1e-4, `${before} became ${after}`);
    for (const p of [...front, ...back]) assertClosed(p, 'sphere piece');
  });

  it('dices a ball into closed cubes without losing any of it', () => {
    let pieces = [sphere(1, 32, 20)];
    const before = measure(pieces[0]).volume;
    for (const normal of [[1, 0, 0], [0, 0, 1], [0, 1, 0]]) {
      for (let offset = -0.75; offset < 0.8; offset += 0.37) {
        pieces = pieces.flatMap((p) => {
          const { front, back } = split(p, { normal, offset });
          return [...front, ...back];
        });
      }
    }
    assert.ok(pieces.length > 40, `only ${pieces.length} pieces`);
    const after = pieces.reduce((sum, p) => sum + measure(p).volume, 0);
    assert.ok(Math.abs(after - before) < 1e-3, `${before} became ${after}`);
    for (const p of pieces) {
      assert.ok(measure(p).volume > 0, 'a piece came out inside out');
      assertClosed(p, 'cube');
    }
  });
});

describe('components', () => {
  it('tells two lumps apart', () => {
    const a = box([0, 0, 0], [1, 1, 1]);
    const b = translate(box([0, 0, 0], [1, 1, 1]), 3, 0, 0);
    const both = makeSolid({
      pos: [...a.pos, ...b.pos], nrm: [...a.nrm, ...b.nrm], col: [...a.col, ...b.col],
    });
    assert.equal(components(both).length, 2);
  });

  it('cuts a dumbbell through its waist into two, and across both ends into four', () => {
    const left = box([0, 0, 0], [1, 1, 1]);
    const right = translate(box([0, 0, 0], [1, 1, 1]), 1.5, 0, 0);
    const pair = makeSolid({ pos: [...left.pos, ...right.pos], nrm: [...left.nrm, ...right.nrm], col: [...left.col, ...right.col] });
    const { front, back } = split(pair, { normal: [0, 1, 0], offset: 0.5 });
    assert.equal(front.length, 2);
    assert.equal(back.length, 2);
  });
});

describe('measure', () => {
  it('finds the volume, middle and bounds of a box', () => {
    const m = measure(box([1, 2, 3], [3, 3, 7]));
    assert.ok(Math.abs(m.volume - 8) < 1e-6);
    assert.deepEqual(m.centroid.map((v) => Math.round(v * 1e6) / 1e6), [2, 2.5, 5]);
    assert.deepEqual(m.min, [1, 2, 3]);
    assert.deepEqual(m.max, [3, 3, 7]);
  });
});
