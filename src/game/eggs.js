/**
 * The egg station: the carton, the bowl and the whisk, and the trip from the
 * bowl to the pan.
 *
 * A click on the carton breaks the next egg into the bowl. Dragging round in
 * the bowl whisks — how far the whisk travels through the eggs is how beaten
 * they get. Pouring tips the bowl out over the pan, moving round as it goes,
 * into the sheet the pan keeps; stirring that sheet is the spatula's job, and
 * every curd it tears off comes back here to be made into a piece.
 */

import { curdSolid } from '../food/curd.js';
import { BOWL } from '../scene/cookware.js';
import { LAYOUT, PAN_Y } from '../scene/kitchen.js';
import { CARTON } from '../scene/pantry.js';
import { createBowl } from '../sim/eggs.js';
import { makePiece } from '../sim/piece.js';
import { createBowlView, createCracker } from '../view/eggs.js';

/** No more than this many eggs go in the bowl at once. */
export const MAX_EGGS = 4;

/** How long a pour takes: over to the pan, pouring, and back. */
const POUR = { over: 0.5, pour: 1.5, back: 0.55 };

export function createEggStation({ GFX, kitchen, sheet, pan, emit }) {
  const bowl = createBowl();
  const bowlGroup = kitchen.bowl.group;
  /** Where the bowl lives on the counter, as the layout has it now. */
  const bowlHome = new GFX.Vector3();
  const home = () => bowlHome.set(LAYOUT.bowl.x, 0, LAYOUT.bowl.z);
  home();
  const view = createBowlView(GFX, bowlGroup, bowl.state, kitchen.bowl.floor);
  const rim = new GFX.Vector3();
  const cracker = createCracker(GFX, {
    room: kitchen.room,
    rimPoint: () => rim.set(bowlGroup.position.x - BOWL.rim * 0.82, kitchen.bowl.floor + BOWL.depth + 0.05, bowlGroup.position.z + 0.9),
  });
  const eggsLeft = [...kitchen.carton.eggs];
  let pending = 0;

  const whisk = kitchen.whisk.group;
  const whiskRest = kitchen.whisk.rest;
  const whiskAside = { position: new GFX.Vector3(), rotation: new GFX.Euler(0, 0.4, Math.PI / 2 - 0.05) };
  const aside = () => whiskAside.position.set(bowlHome.x + 4.6, 0.3, bowlHome.z + 1.5);
  aside();
  kitchen.onArrange(() => {
    home();
    aside();
    if (!pour) bowlGroup.position.copy(bowlHome);
  });
  const beating = { on: false, at: [0, 0], last: null, swirl: 0, spin: 0, speed: 0 };

  let pour = null;
  const stream = new GFX.Mesh(
    new GFX.CylinderGeometry(0.16, 0.22, 1, 12, 1, true),
    new GFX.MeshPhysicalMaterial({ name: 'egg-stream', color: 0xf3c13c, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.92 }),
  );
  stream.name = 'egg-stream';
  stream.visible = false;
  kitchen.room.add(stream);

  /** Breaks the next egg in the carton into the bowl, if there is one and room for it. */
  function crack() {
    if (pour || eggsLeft.length === 0 || bowl.eggs + pending >= MAX_EGGS) return false;
    const egg = eggsLeft.shift();
    pending += 1;
    cracker.start(egg, () => {
      pending -= 1;
      bowl.crack();
      emit('egg-in', { eggs: bowl.eggs });
    });
    return true;
  }

  /** Where the pointer is over the bowl, in its frame, or null if it is not. */
  function inBowl(pointer) {
    const p = pointer.at(kitchen.bowl.floor + 1.4);
    if (!p) return null;
    const x = p.x - bowlGroup.position.x, z = p.z - bowlGroup.position.z;
    return Math.hypot(x, z) < BOWL.rim + 0.3 ? [x, z] : null;
  }

  /** Whether the pointer is over the carton. */
  function onCarton(pointer) {
    const p = pointer.at(CARTON.height + 0.8);
    if (!p) return false;
    const W = (CARTON.columns * CARTON.pitch) / 2 + 0.6, D = (CARTON.rows * CARTON.pitch) / 2 + 0.6;
    return Math.abs(p.x - LAYOUT.carton.x) < W && Math.abs(p.z - LAYOUT.carton.z) < D;
  }

  /** The whisk dragged to `at` in the bowl's frame. */
  function beat(at) {
    if (pour) return;
    const r = Math.hypot(at[0], at[1]);
    const max = BOWL.rim - 1.1;
    const p = r > max ? [at[0] * (max / r), at[1] * (max / r)] : at;
    if (beating.last && bowl.eggs > 0) {
      const d = Math.hypot(p[0] - beating.last[0], p[1] - beating.last[1]);
      const before = bowl.mix;
      bowl.whisk(d);
      beating.swirl += d * 0.35;
      beating.speed = Math.min(1, beating.speed + d * 0.4);
      if (before < 1 && bowl.mix >= 1) emit('beaten');
      if (d > 0.02) emit('whisk', { mix: bowl.mix, speed: d });
    }
    beating.on = true;
    beating.at = p;
    beating.last = p;
  }

  function stopBeating() {
    beating.on = false;
    beating.last = null;
  }

  /** Tips the bowl out over the pan. */
  function startPour() {
    if (pour || bowl.eggs === 0 || pending) return false;
    pour = { t: 0, mix: bowl.mix, volume: bowl.volume, poured: 0, angle: Math.random() * Math.PI * 2 };
    /** Whatever the eggs were seasoned with goes in with them. */
    sheet.season('salt', bowl.salt);
    sheet.season('pepper', bowl.pepper);
    bowl.state.draining = 1;
    stopBeating();
    emit('pour-start');
    return true;
  }

  const ease = (t) => t * t * (3 - 2 * t);
  const overPan = () => new GFX.Vector3(kitchen.panRig.position.x - 4.6, PAN_Y + 5.2, kitchen.panRig.position.z + 1.6);

  function updatePour(dt) {
    if (!pour) return;
    pour.t += dt;
    const t = pour.t;
    const over = overPan();
    let tilt;
    if (t < POUR.over) {
      const k = ease(t / POUR.over);
      bowlGroup.position.lerpVectors(bowlHome, over, k);
      bowlGroup.position.y += Math.sin(k * Math.PI) * 1.5;
      tilt = k * 0.5;
    } else if (t < POUR.over + POUR.pour) {
      const k = (t - POUR.over) / POUR.pour;
      bowlGroup.position.copy(over);
      tilt = 0.5 + Math.min(1, k * 3) * 0.75 + k * 0.25;
      /** Out of the lip, down to the pan, wherever the stream is landing as it moves round. */
      const share = Math.min(1, k * 1.15);
      const want = pour.volume * share;
      const give = want - pour.poured;
      pour.angle += dt * 3.2;
      const radius = 1.4 + 1.2 * k;
      const x = Math.cos(pour.angle) * radius - 0.6, z = Math.sin(pour.angle) * radius;
      if (give > 0) {
        /** Not beaten smooth, the stream comes out in streaks of yolk and of white. */
        const streak = (1 - pour.mix) * Math.sin(t * 13 + pour.angle * 2);
        sheet.pour(x, z, give, Math.max(0, Math.min(1, 0.33 + streak * 0.55)));
        pour.poured += give;
      }
      bowl.state.draining = 1 - share;
      showStream(new GFX.Vector3(kitchen.panRig.position.x + x, PAN_Y, kitchen.panRig.position.z + z), tilt, share < 1);
    } else {
      const k = ease(Math.min(1, (t - POUR.over - POUR.pour) / POUR.back));
      bowlGroup.position.lerpVectors(over, bowlHome, k);
      bowlGroup.position.y += Math.sin(k * Math.PI) * 1.2;
      tilt = 1.5 * (1 - k);
      stream.visible = false;
      if (k >= 1) {
        const out = bowl.pour();
        bowl.state.draining = 1;
        emit('poured', out);
        pour = null;
      }
    }
    bowlGroup.rotation.z = -tilt;
  }

  /** The stream of egg from the bowl's lip to where it lands. */
  function showStream(land, tilt, on) {
    stream.visible = on;
    if (!on) return;
    const lip = new GFX.Vector3(BOWL.rim, kitchen.bowl.floor + BOWL.depth, 0);
    lip.applyAxisAngle(new GFX.Vector3(0, 0, 1), -tilt).add(bowlGroup.position);
    const dir = land.clone().sub(lip);
    const length = dir.length();
    stream.position.copy(lip).addScaledVector(dir, 0.5);
    stream.scale.set(1, length, 1);
    stream.quaternion.setFromUnitVectors(new GFX.Vector3(0, 1, 0), dir.normalize());
  }

  function updateWhisk(dt) {
    beating.speed *= Math.exp(-dt * 4);
    if (pour) {
      whisk.position.lerp(whiskAside.position, 1 - Math.exp(-dt * 10));
      whisk.rotation.set(whiskAside.rotation.x, whiskAside.rotation.y, whiskAside.rotation.z);
      return;
    }
    if (beating.on) {
      const [x, z] = beating.at;
      const r = Math.hypot(x, z) || 1;
      beating.spin += dt * (4 + beating.speed * 20);
      whisk.position.lerp(new GFX.Vector3(bowlGroup.position.x + x, kitchen.bowl.floor + 0.18, bowlGroup.position.z + z), 1 - Math.exp(-dt * 30));
      /** Leaning out from the middle of the bowl, the way a hand holds it. */
      whisk.rotation.set((z / r) * 0.38, beating.spin, -(x / r) * 0.38);
    } else {
      whisk.position.lerp(whiskRest.position, 1 - Math.exp(-dt * 8));
      whisk.rotation.x += (whiskRest.rotation.x - whisk.rotation.x) * (1 - Math.exp(-dt * 8));
      whisk.rotation.y += (whiskRest.rotation.y - whisk.rotation.y) * (1 - Math.exp(-dt * 8));
      whisk.rotation.z += (whiskRest.rotation.z - whisk.rotation.z) * (1 - Math.exp(-dt * 8));
    }
  }

  /** Curds the spatula tore off the sheet, made into pieces and put in the pan. */
  function collectCurds() {
    const tossed = pan.airborne;
    const made = [];
    for (const c of sheet.takeCurds()) {
      const piece = makePiece({
        solid: curdSolid({ volume: c.volume, yolk: c.yolk, seed: Math.random() * 100 }),
        kind: 'egg',
        pos: [c.x, 0.35, c.z],
      });
      piece.core = c.set;
      piece.yolk = c.yolk;
      piece.moisture = 0.7;
      piece.brown[3] = c.brown;
      piece.salt = c.salt ?? 0;
      piece.pepper = c.pepper ?? 0;
      piece.curd = true;
      made.push(piece);
    }
    if (made.length) {
      /** Curds come off the blade sitting on the iron; curds thrown by a toss come down from the air. */
      for (const p of made) {
        const s = pan.state(p);
        s.vel = [(Math.random() - 0.5) * 1.5, tossed ? 6 + Math.random() * 4 : 0, (Math.random() - 0.5) * 1.5];
        s.spin = tossed ? { axis: [Math.random() - 0.5, 0, Math.random() - 0.5], rate: (Math.random() - 0.5) * 12 } : { axis: [1, 0, 0], rate: 0 };
      }
      pan.add(made);
      emit('curds', { count: made.length });
    }
    return made.length;
  }

  function update(dt) {
    for (const e of cracker.update(dt)) emit(e === 'tap' ? 'egg-tap' : 'egg-drop');
    updatePour(dt);
    updateWhisk(dt);
    view.update(dt, beating.on ? beating.swirl * 0.2 + dt * beating.speed * 3 : 0);
    beating.swirl = 0;
    collectCurds();
  }

  /** Back to a full carton, a clean bowl and the whisk in it. */
  function reset() {
    cracker.clear();
    eggsLeft.length = 0;
    for (const egg of kitchen.carton.eggs) {
      egg.visible = true;
      eggsLeft.push(egg);
    }
    pending = 0;
    bowl.clear();
    bowl.state.draining = 1;
    pour = null;
    stream.visible = false;
    stopBeating();
    bowlGroup.position.copy(bowlHome);
    bowlGroup.rotation.set(0, 0, 0);
    whisk.position.copy(whiskRest.position);
    whisk.rotation.copy(whiskRest.rotation);
  }

  return {
    bowl, crack, inBowl, onCarton, beat, stopBeating, startPour, update, reset,
    get pouring() { return Boolean(pour); },
    get eggsLeft() { return eggsLeft.length; },
    get cracking() { return cracker.busy; },
  };
}
