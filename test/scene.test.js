import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from '../src/vendor/gfx/index.js';

import { crackedHalves, eggGeometry } from '../src/food/egg.js';
import { BOARD, buildBoard, buildKnife } from '../src/scene/board.js';
import { BOWL, bowlRadius, buildBowl, buildPlate, buildSpatula, buildWhisk } from '../src/scene/cookware.js';
import { HANDLE_TURN, LAYOUTS, panelMargins } from '../src/scene/kitchen.js';
import { COOK_RADIUS, FLAT, RIM_HEIGHT, RIM_RADIUS, buildPan, floorHeight } from '../src/scene/pan.js';
import { CARTON, buildBottle, buildCarton } from '../src/scene/pantry.js';
import { buildButter, buildMill, buildSaltDish, buildTowel } from '../src/scene/props.js';
import { TOP, buildStove } from '../src/scene/stove.js';

describe('the pan floor', () => {
  it('is level across the flat', () => {
    for (let r = 0; r <= FLAT; r += 0.25) assert.equal(floorHeight(r), 0);
  });

  it('rises without a step all the way to the lip', () => {
    let last = 0;
    for (let r = FLAT; r <= COOK_RADIUS + 0.6; r += 0.01) {
      const h = floorHeight(r);
      assert.ok(h >= last - 1e-9, `it dips at ${r}`);
      assert.ok(h - last < 0.05, `it steps at ${r}`);
      last = h;
    }
    assert.ok(last > RIM_HEIGHT * 0.8, `the wall only gets to ${last}`);
  });
});

describe('the kitchen', () => {
  it('builds every piece of it without a page to paint textures on', () => {
    for (const build of [
      buildPan, buildStove, buildBoard, buildKnife, buildBowl, buildWhisk, buildSpatula, buildPlate, buildCarton, buildBottle,
      buildTowel, buildMill, buildSaltDish, buildButter,
    ]) {
      const built = build(GFX);
      const group = built.group ?? built;
      let meshes = 0;
      group.traverse((o) => { if (o.isMesh) meshes += 1; });
      assert.ok(meshes > 0, `${build.name} made nothing`);
    }
  });

  it('has the bowl wider at the rim than at the floor', () => {
    assert.ok(bowlRadius(BOWL.depth) > bowlRadius(0));
    assert.ok(Math.abs(bowlRadius(BOWL.depth) - BOWL.rim) < 1e-9);
  });

  for (const [name, layout] of Object.entries(LAYOUTS)) {
    it(`keeps every station clear of the others when ${name}`, () => {
      /** Footprints on the counter, as boxes. */
      const box = (x, z, w, d) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
      const stations = {
        board: box(layout.board.x, layout.board.z, BOARD.w, BOARD.d),
        stove: box(layout.stove.x, layout.stove.z, TOP.w, TOP.d),
        bowl: box(layout.bowl.x, layout.bowl.z, (BOWL.rim + BOWL.wall) * 2, (BOWL.rim + BOWL.wall) * 2),
        carton: box(layout.carton.x, layout.carton.z, CARTON.columns * CARTON.pitch + 0.3, CARTON.rows * CARTON.pitch + 0.3),
        oil: box(layout.oil.x, layout.oil.z, 2.4, 2.4),
        plate: box(layout.plate.x, layout.plate.z, 10.6, 10.6),
        towel: box(layout.towel.x, layout.towel.z, 7.7, 4.6),
        mill: box(layout.mill.x, layout.mill.z, 2, 2),
        salt: box(layout.salt.x, layout.salt.z, 3, 3),
      };
      const names = Object.keys(stations);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = stations[names[i]], b = stations[names[j]];
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0;
          assert.ok(apart, `${names[i]} and ${names[j]} overlap`);
        }
        const s = stations[names[i]];
        assert.ok(s.z0 > layout.wall, `${names[i]} is in the wall`);
      }
    });

    it(`puts the ramekins clear of each other, the plate and every station when ${name}`, () => {
      const R = 1.5;
      const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const clear = (at, x, z, w, d) => Math.abs(at.x - x) > w / 2 + R || Math.abs(at.z - z) > d / 2 + R;
      assert.equal(layout.prep.length, 6);
      for (const [i, at] of layout.prep.entries()) {
        for (const other of layout.prep.slice(i + 1)) assert.ok(near(at, other) >= 2 * R, 'two ramekins overlap');
        assert.ok(near(at, layout.plate) > 5.2 + R, 'a ramekin is under the plate');
        assert.ok(clear(at, layout.board.x, layout.board.z, BOARD.w, BOARD.d), 'a ramekin is on the board');
        assert.ok(clear(at, layout.stove.x, layout.stove.z, TOP.w, TOP.d), 'a ramekin is on the range');
        assert.ok(near(at, layout.grater) > R + 1.45, 'a ramekin is in the grater');
        assert.ok(at.z - R > layout.wall, 'a ramekin is in the wall');
      }
    });

    it(`gives the pan's handle room when ${name}`, () => {
      const reach = RIM_RADIUS + 6.6;
      const tip = { x: layout.stove.x - Math.sin(HANDLE_TURN) * reach, z: layout.stove.z - Math.cos(HANDLE_TURN) * reach };
      const b = layout.board;
      const onBoard = Math.abs(tip.x - b.x) < BOARD.w / 2 && Math.abs(tip.z - b.z) < BOARD.d / 2;
      assert.ok(!onBoard, 'the handle ends over the board');
      assert.ok(tip.z > layout.stove.z, 'the handle should come toward the cook');
    });
  }
});

describe('the shot round the panels', () => {
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  const px = (share, size) => Math.round((share / 2) * size);

  it('keeps out of a ticket down the left and a bar along the bottom', () => {
    const m = panelMargins(1440, 900, [rect(16, 16, 306, 531), rect(176, 832, 1264, 886)]);
    assert.equal(px(m.left, 1440), 318);
    assert.equal(px(m.bottom, 900), 80);
    assert.equal(px(m.top, 900), 12);
    assert.equal(px(m.right, 1440), 12);
  });

  it('takes the switch riding on the bar with the bar, not down the side', () => {
    const m = panelMargins(1024, 700, [rect(16, 16, 306, 531), rect(12, 590, 1012, 686), rect(833, 551, 1001, 584)]);
    assert.equal(px(m.right, 1024), 12);
    assert.equal(px(m.bottom, 700), 161);
  });

  it('keeps under a ticket across the top of a tall window', () => {
    const m = panelMargins(390, 844, [rect(8, 8, 382, 130), rect(8, 668, 382, 836)]);
    assert.equal(px(m.top, 844), 142);
    assert.equal(px(m.bottom, 844), 188);
    assert.equal(px(m.left, 390), 12);
  });

  it('keeps right of the rail on a phone on its side', () => {
    const m = panelMargins(844, 390, [rect(8, 8, 244, 120), rect(8, 160, 244, 382)]);
    assert.equal(px(m.left, 844), 256);
    assert.equal(px(m.top, 390), 12);
    assert.equal(px(m.bottom, 390), 12);
  });

  it('pays no mind to a panel that is not showing', () => {
    const m = panelMargins(800, 600, [rect(0, 0, 0, 0), null]);
    assert.deepEqual([px(m.left, 800), px(m.right, 800), px(m.top, 600), px(m.bottom, 600)], [12, 12, 12, 12]);
  });
});

describe('an egg', () => {
  it('breaks into two halves that are the whole shell between them', () => {
    const whole = eggGeometry(GFX);
    const { top, bottom } = crackedHalves(GFX);
    const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    assert.equal(tris(top) + tris(bottom), tris(whole));
    assert.ok(tris(top) > tris(whole) * 0.2 && tris(bottom) > tris(whole) * 0.2);
  });
});
