import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure, split } from '../src/geometry/slice.js';
import { FLESH, HALF, fleshAt, potatoSolid } from '../src/food/potato.js';

const key = (p, o) => `${p[o]},${p[o + 1]},${p[o + 2]}`;

function openEdges(solid) {
  const edges = new Map();
  for (let t = 0; t < solid.pos.length; t += 9) {
    const k = [key(solid.pos, t), key(solid.pos, t + 3), key(solid.pos, t + 6)];
    for (let e = 0; e < 3; e++) {
      const id = `${k[e]}>${k[(e + 1) % 3]}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const [id, n] of edges) {
    const [a, b] = id.split('>');
    if (n !== 1 || edges.get(`${b}>${a}`) !== 1) open += 1;
  }
  return open;
}

describe('the potato', () => {
  const potato = potatoSolid();
  const m = measure(potato);

  it('is one closed skin, wound outward', () => {
    assert.equal(openEdges(potato), 0);
    assert.ok(m.volume > 0);
  });

  it('is about the size of a potato next to the pan', () => {
    const size = m.max.map((v, i) => v - m.min[i]);
    assert.ok(size[0] > HALF.x * 1.6 && size[0] < HALF.x * 2.4, `length ${size[0]}`);
    assert.ok(size[0] > size[1] && size[0] > size[2], 'it should lie along its length');
    assert.ok(m.volume > 6 && m.volume < 14, `volume ${m.volume}`);
  });

  it('lies on its belly at y = 0', () => {
    assert.ok(Math.abs(m.min[1]) < 1e-6);
  });

  it('is cream inside', () => {
    const [r, g, b] = fleshAt(0.1, 0.4, -0.2);
    assert.ok(Math.abs(r - FLESH[0]) < 0.05 && g < r && b < g);
  });

  it('dices into closed pieces without losing any of it', () => {
    let pieces = [potato];
    const cuts = [];
    for (let x = m.min[0] + 0.55; x < m.max[0]; x += 0.62) cuts.push({ normal: [1, 0, 0], offset: x });
    for (let z = m.min[2] + 0.5; z < m.max[2]; z += 0.62) cuts.push({ normal: [0, 0, 1], offset: z });
    for (let y = 0.6; y < m.max[1]; y += 0.62) cuts.push({ normal: [0, 1, 0], offset: y });
    for (const cut of cuts) {
      pieces = pieces.flatMap((p) => {
        const { front, back } = split(p, cut, { flesh: fleshAt });
        return [...front, ...back];
      });
    }
    assert.ok(pieces.length > 40, `${pieces.length} pieces`);
    const total = pieces.reduce((sum, p) => sum + measure(p).volume, 0);
    assert.ok(Math.abs(total - m.volume) / m.volume < 1e-4, `${m.volume} became ${total}`);
    for (const p of pieces) assert.equal(openEdges(p), 0);
  });
});
