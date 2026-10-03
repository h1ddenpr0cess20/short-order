/**
 * The range: a brushed steel top set into the counter, one big burner under a
 * cast iron grate, and the knob that runs it.
 *
 * The grate is what the pan stands on, so its height is the one number the
 * rest of the kitchen needs from here: `GRATE_TOP`.
 */

import { flameGeometry, flameMaterial } from './flame.js';
import { brushed, puff } from './textures.js';

/** The steel top, as it sits in the counter. */
export const TOP = Object.freeze({ w: 17, d: 16, y: 0.1 });

/** Where the fingers of the grate come to, which is where the bottom of a pan sits. */
export const GRATE_TOP = 1.25;

/** How far the grate's fingers reach in towards the burner, and out to its frame. */
const FINGER = { from: 2.35, to: 7.3, width: 0.46 };
const FRAME = { half: 7.5, width: 0.5, height: 0.62 };

/** The burner's ring of ports, which is where the flame comes out. */
export const BURNER_RADIUS = 1.45;

/** The knob's sweep, off to full. */
export const KNOB_SWEEP = Object.freeze({ off: Math.PI * 0.75, full: -Math.PI * 0.75 });

/**
 * A bar with its edges rounded over: a rounded rectangle profile pushed out
 * along its length. What the grate is made of.
 */
function bar(GFX, length, width, height, round = 0.12) {
  /** The bevel grows the outline by `BEVEL` all round, so the outline starts that much inside. */
  const BEVEL = 0.06;
  const shape = new GFX.Shape();
  const w = width / 2 - BEVEL, y0 = BEVEL, y1 = height - BEVEL, r = Math.min(round, w * 0.9, (y1 - y0) / 2);
  shape.moveTo(-w + r, y0);
  shape.lineTo(w - r, y0);
  shape.quadraticCurveTo(w, y0, w, y0 + r);
  shape.lineTo(w, y1 - r);
  shape.quadraticCurveTo(w, y1, w - r, y1);
  shape.lineTo(-w + r, y1);
  shape.quadraticCurveTo(-w, y1, -w, y1 - r);
  shape.lineTo(-w, y0 + r);
  shape.quadraticCurveTo(-w, y0, -w + r, y0);
  const geometry = new GFX.ExtrudeGeometry(shape, {
    depth: length - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 4,
  });
  geometry.translate(0, 0, -(length - 0.16) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildStove(GFX) {
  const stove = new GFX.Group();
  stove.name = 'stove';

  const steel = new GFX.MeshStandardMaterial({
    name: 'range-steel',
    color: 0xc9ccd0,
    map: brushed(GFX),
    roughness: 0.34,
    metalness: 0.88,
  });
  const iron = new GFX.MeshStandardMaterial({
    name: 'grate-iron',
    color: 0x1a1a1a,
    roughness: 0.72,
    metalness: 0.35,
  });
  const enamel = new GFX.MeshStandardMaterial({
    name: 'burner-enamel',
    color: 0x101010,
    roughness: 0.38,
    metalness: 0.2,
  });
  const brass = new GFX.MeshStandardMaterial({
    name: 'burner-brass',
    color: 0x6b5a3a,
    roughness: 0.5,
    metalness: 0.8,
  });

  /** The top, with a shallow drip tray pressed into it round the burner. */
  const top = new GFX.Mesh(new GFX.BoxGeometry(TOP.w, 0.5, TOP.d), steel);
  top.name = 'range-top';
  top.position.y = TOP.y - 0.25;
  stove.add(top);

  const bowl = new GFX.Mesh(new GFX.CylinderGeometry(3.2, 3.5, 0.06, 64), enamel);
  bowl.name = 'drip-bowl';
  bowl.position.y = TOP.y + 0.01;
  stove.add(bowl);

  /** The burner itself: a brass base and a black cap, the ports between them. */
  const base = new GFX.Mesh(new GFX.CylinderGeometry(1.75, 1.95, 0.32, 48), brass);
  base.name = 'burner-base';
  base.position.y = TOP.y + 0.16;
  stove.add(base);
  const cap = new GFX.Mesh(new GFX.CylinderGeometry(1.3, 1.42, 0.16, 48), enamel);
  cap.name = 'burner-cap';
  cap.position.y = TOP.y + 0.4;
  stove.add(cap);

  /** The grate: a square frame, and fingers from it in towards the flame. */
  const grate = new GFX.Group();
  grate.name = 'grate';
  const fingerLength = FINGER.to - FINGER.from;
  const fingerGeo = bar(GFX, fingerLength, FINGER.width, GRATE_TOP - TOP.y, 0.14);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const finger = new GFX.Mesh(fingerGeo, iron);
    finger.name = `grate-finger-${k}`;
    const mid = (FINGER.from + FINGER.to) / 2 * (k % 2 ? 1.04 : 1);
    finger.position.set(Math.cos(a) * mid, TOP.y, Math.sin(a) * mid);
    finger.rotation.y = -a + Math.PI / 2;
    grate.add(finger);
  }
  const sideGeo = bar(GFX, FRAME.half * 2 + FRAME.width, FRAME.width, FRAME.height, 0.14);
  for (let k = 0; k < 4; k++) {
    const side = new GFX.Mesh(sideGeo, iron);
    side.name = `grate-frame-${k}`;
    const a = (k / 4) * Math.PI * 2;
    side.position.set(Math.cos(a) * FRAME.half, TOP.y, Math.sin(a) * FRAME.half);
    side.rotation.y = -a;
    grate.add(side);
  }
  stove.add(grate);

  /** The flame, and the glow it throws on the steel round the pan. */
  const flame = new GFX.Mesh(flameGeometry(GFX, { radius: BURNER_RADIUS, height: TOP.y + 0.34 }), flameMaterial(GFX));
  flame.name = 'flame';
  flame.frustumCulled = false;
  flame.renderOrder = 2;
  stove.add(flame);

  const glow = new GFX.Mesh(
    new GFX.PlaneGeometry(17, 17),
    new GFX.MeshBasicMaterial({
      name: 'flame-glow',
      map: puff(GFX),
      color: 0x3858ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: GFX.AdditiveBlending,
    }),
  );
  glow.name = 'flame-glow';
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = TOP.y + 0.03;
  glow.renderOrder = 1;
  stove.add(glow);

  /** A blue light under the pan, so a lit burner shows on the grate and the steel. */
  const light = new GFX.PointLight(0x5a78ff, 0, 9, 2);
  light.name = 'flame-light';
  light.position.set(0, TOP.y + 0.8, 0);
  stove.add(light);

  /** The knob, at the front right of the top: a chrome skirt and a black grip with a pointer. */
  const knob = new GFX.Group();
  knob.name = 'knob';
  const chrome = new GFX.MeshStandardMaterial({ name: 'knob-chrome', color: 0xe6e6e6, roughness: 0.18, metalness: 1 });
  const skirt = new GFX.Mesh(new GFX.CylinderGeometry(1.0, 1.08, 0.12, 40), chrome);
  skirt.name = 'knob-skirt';
  skirt.position.y = 0.06;
  knob.add(skirt);
  const dial = new GFX.Group();
  dial.name = 'knob-dial';
  const grip = new GFX.Mesh(new GFX.CylinderGeometry(0.72, 0.8, 0.62, 32), enamel);
  grip.name = 'knob-grip';
  grip.position.y = 0.43;
  dial.add(grip);
  const pointer = new GFX.Mesh(new GFX.BoxGeometry(0.14, 0.08, 0.62), new GFX.MeshStandardMaterial({ name: 'knob-pointer', color: 0xf3efe6, roughness: 0.4 }));
  pointer.name = 'knob-pointer';
  pointer.position.set(0, 0.75, -0.34);
  dial.add(pointer);
  knob.add(dial);
  knob.position.set(TOP.w / 2 - 1.6, TOP.y, TOP.d / 2 - 1.6);
  stove.add(knob);

  /** Markings round the knob: off, and a fan of ticks for the heat. */
  const tickMat = new GFX.MeshBasicMaterial({ name: 'knob-ticks', color: 0x2b2b2b });
  for (let k = 0; k <= 5; k++) {
    const a = KNOB_SWEEP.off + (KNOB_SWEEP.full - KNOB_SWEEP.off) * (k / 5);
    const tick = new GFX.Mesh(new GFX.BoxGeometry(0.08, 0.02, k === 0 ? 0.36 : 0.22), tickMat);
    tick.name = `knob-tick-${k}`;
    const r = 1.3;
    tick.position.set(knob.position.x - Math.sin(a) * r, TOP.y + 0.005, knob.position.z - Math.cos(a) * r);
    tick.rotation.y = a;
    stove.add(tick);
  }

  let shown = 0;
  return {
    group: stove,
    knob,
    flame,

    /**
     * Shows the burner at `level`, 0 (off) to 1 (full), at `time` seconds.
     * The knob turns to it; the flame, its glow and its light follow a little
     * behind, the way gas catches.
     */
    update(level, time, dt) {
      shown += (level - shown) * Math.min(1, dt * 6);
      if (level === 0 && shown < 0.01) shown = 0;
      dial.rotation.y = KNOB_SWEEP.off + (KNOB_SWEEP.full - KNOB_SWEEP.off) * level;
      flame.material.uniforms.level.value = shown;
      flame.material.uniforms.time.value = time;
      flame.visible = shown > 0.005;
      glow.material.opacity = shown * 0.32;
      glow.visible = shown > 0.005;
      light.intensity = shown * (5 + 0.6 * Math.sin(time * 23));
    },
  };
}
