/**
 * The game: the simulations, the meshes that show them, and the hand that
 * works them.
 *
 * Each station runs in its own frame — the board's top, the pan's floor — and
 * owns a group in the scene that is that frame, so a piece is drawn by hanging
 * its mesh off whichever group it is in and copying its pose. Moving food from
 * one station to another is converting its pose from one frame to the next and
 * handing it to the other simulation.
 *
 * The hand is the pointer. Over the board it is the knife; over the pan it is
 * the spatula; over the knob, the carton, the bottle and the bowl it is
 * whatever those want. A click and a drag mean different things at each.
 */

import { curdSolid } from '../food/curd.js';
import { INGREDIENTS, FLESH } from '../food/index.js';
import { BOARD } from '../scene/board.js';
import { PLATE } from '../scene/cookware.js';
import { LAYOUT, PAN_Y } from '../scene/kitchen.js';
import { COOK_RADIUS, RIM_HEIGHT, floorHeight } from '../scene/pan.js';
import { TOP } from '../scene/stove.js';
import { createBoard } from '../sim/board.js';
import { createSheet } from '../sim/eggs.js';
import { SETTINGS } from '../sim/heat.js';
import { createPan } from '../sim/pan.js';
import { makePiece } from '../sim/piece.js';
import { axisAngle } from '../sim/quat.js';
import { createSheetView } from '../view/eggs.js';
import { createPieceViews } from '../view/pieces.js';
import { createEggStation } from './eggs.js';
import { diceReport, eggReport, fryReport, grade } from './grade.js';
import { createPointer } from './pointer.js';

/** How far the pointer has to travel before a press is a drag rather than a click. */
const DRAG = 7;

/** How high over the counter a scraped pile is carried: clear of the pan's rim. */
const CARRY = PAN_Y + RIM_HEIGHT + 1.3;

/** The knife's chop: down, a beat on the board, back up. */
const CHOP = { down: 0.06, up: 0.13 };

/** A toss: a dip, the jerk up that throws, and back down onto the grate. */
const TOSS = { time: 0.46, launch: 0.13 };

export function createGame({ stage, GFX, kitchen }) {
  const camera = kitchen.camera;
  const pointer = createPointer({ GFX, stage, camera });
  const views = createPieceViews(GFX);
  const board = createBoard();
  const pan = createPan();
  const listeners = new Set();

  /** The board's top, as a frame: where its pieces hang. */
  const boardTop = new GFX.Group();
  boardTop.name = 'board-top';
  boardTop.position.y = BOARD.h;
  kitchen.board.group.add(boardTop);
  const boardOrigin = new GFX.Vector3();
  const placeBoard = () => boardOrigin.set(LAYOUT.board.x, BOARD.h, LAYOUT.board.z);
  placeBoard();
  kitchen.onArrange(placeBoard);

  /** Things in the hand, in the room's frame. */
  const carry = new GFX.Group();
  carry.name = 'carry';
  kitchen.room.add(carry);
  const carried = [];
  const carryAt = new GFX.Vector3();

  const panRig = kitchen.panRig;
  /** Where the pan sits on the grate: the kitchen's, so it follows the layout. */
  const panHome = kitchen.panHome;

  /** The egg on the floor of the pan, and the carton, bowl and whisk it comes from. */
  const sheet = createSheet();
  const sheetView = createSheetView(GFX, sheet);
  panRig.add(sheetView.mesh);
  const eggs = createEggStation({
    GFX, kitchen, sheet, pan,
    emit: (type, detail) => {
      if (type === 'poured') round.pours.push(detail);
      if (type === 'egg-in' || type === 'pour-start') begin();
      emit(type, detail);
    },
  });

  const knife = { mode: 'rest', z: 0, x: 0, chop: null, queued: false };
  const spatula = { over: false, at: [0, 0], last: null, tilt: 0 };
  const press = { down: false, x: 0, y: 0, zone: null, drag: null, point: null, button: 0 };
  let zone = { zone: null };
  let toss = null;
  /** Off until the cook has started: the kitchen is there to look at behind the title. */
  let live = false;
  let elapsed = 0;

  const stats = { chops: 0, tosses: 0, stirs: 0, scrapes: 0 };

  /** This attempt at the dish: when it started, what went into the pan from the bowl, whether it is served. */
  let round = { started: null, pours: [], plated: false };
  const plateGroup = kitchen.plate.group;
  const plated = [];
  /** Pieces on their way from the pan to the plate, in the room's frame. */
  const flying = [];
  let plating = null;
  let report = null;
  let progressAt = -1;

  /** The clock starts at the first thing the cook does, not when the page loads. */
  function begin() {
    if (round.started === null) round.started = elapsed;
  }

  function emit(type, detail = {}) {
    for (const fn of listeners) fn({ type, ...detail });
  }

  /** A whole potato on the board, lying front to back, a little left of middle. */
  function newPotato(x = -1.5, z = 0) {
    const piece = makePiece({ solid: INGREDIENTS.potato.solid(), kind: 'potato', rot: axisAngle([0, 1, 0], Math.PI / 2) });
    piece.pos[0] = x;
    piece.pos[2] = z;
    board.add(piece);
    return piece;
  }

  // ------------------------------------------------------------ zones

  /** Which station the pointer is over, and where on it, in its own frame. */
  function locate() {
    const knobAt = kitchen.stove.knob.getWorldPosition(new GFX.Vector3());
    const k = pointer.at(TOP.y + 0.6);
    if (k && Math.hypot(k.x - knobAt.x, k.z - knobAt.z) < 1.35) return { zone: 'knob' };

    const oil = pointer.at(3.2);
    if (oil && Math.hypot(oil.x - LAYOUT.oil.x, oil.z - LAYOUT.oil.z) < 1.6) return { zone: 'oil' };

    if (eggs.onCarton(pointer)) return { zone: 'carton' };
    const inBowl = eggs.inBowl(pointer);
    if (inBowl && !eggs.pouring) return { zone: 'bowl', point: inBowl };

    const lift = board.bounds() ? Math.min(1.4, board.bounds().y1 * 0.6) : 0.4;
    const b = pointer.at(BOARD.h + lift);
    if (b) {
      const x = b.x - boardOrigin.x, z = b.z - boardOrigin.z;
      if (Math.abs(x) < BOARD.w / 2 && Math.abs(z) < BOARD.d / 2) return { zone: 'board', point: [x, z] };
    }

    const p = pointer.at(PAN_Y + 0.15);
    if (p) {
      const x = p.x - panHome.x, z = p.z - panHome.z;
      if (Math.hypot(x, z) < COOK_RADIUS + 0.6) return { zone: 'pan', point: [x, z] };
    }
    return { zone: null };
  }

  /** Whether a point on the board, in its frame, is on the pile — where a press means pick it all up. */
  function onPile([x, z]) {
    const b = board.bounds();
    return Boolean(b) && x > b.x0 - 0.35 && x < b.x1 + 0.35 && z > b.z0 - 0.35 && z < b.z1 + 0.35;
  }

  // ------------------------------------------------------------ actions

  /** The knife comes down where it is hovering, if it is hovering over anything. */
  function chop() {
    if (knife.mode !== 'hover' && knife.mode !== 'chop') return false;
    if (knife.chop) {
      knife.queued = true;
      return true;
    }
    knife.chop = { t: 0, cut: false, z: knife.z, x0: knife.x - 7.6, x1: knife.x };
    knife.mode = 'chop';
    begin();
    return true;
  }

  function turn() {
    if (carried.length || !board.turn(1)) return false;
    emit('turn');
    return true;
  }

  /** Everything on the board, lifted onto the flat of the knife. */
  function pickUp() {
    if (carried.length || board.pieces.length === 0 || board.turning) return false;
    const list = board.takeAll();
    const centre = new GFX.Vector3();
    for (const p of list) centre.add(new GFX.Vector3(p.pos[0], 0, p.pos[2]));
    centre.multiplyScalar(1 / list.length);
    for (const p of list) {
      p.carry = [(p.pos[0] - centre.x) * 0.72, p.pos[1] + 0.25, (p.pos[2] - centre.z) * 0.72];
      carried.push(p);
    }
    carryAt.set(boardOrigin.x + centre.x, CARRY, boardOrigin.z + centre.z);
    knife.mode = 'scrape';
    emit('pickup', { count: list.length });
    return true;
  }

  /** Lets go of the pile: into the pan if it is over the pan, back onto the board if not. */
  function letGo() {
    if (!carried.length) return;
    const list = carried.splice(0);
    const local = [carryAt.x - panHome.x, carryAt.z - panHome.z];
    if (Math.hypot(local[0], local[1]) < COOK_RADIUS + 0.4) {
      let area = 0;
      for (const p of list) {
        p.pos = [local[0] * 0.6 + p.carry[0] * 1.6, CARRY - PAN_Y + p.carry[1], local[1] * 0.6 + p.carry[2] * 1.6];
        const s = pan.state(p);
        s.vel = [(Math.random() - 0.5) * 5, -1 - Math.random() * 2, (Math.random() - 0.5) * 5];
        area += p.volume / 0.6;
        delete p.carry;
      }
      pan.add(list, { area });
      stats.scrapes += 1;
      emit('scrape', { count: list.length });
    } else {
      const x = carryAt.x - boardOrigin.x, z = carryAt.z - boardOrigin.z;
      for (const p of list) {
        p.pos = [x + p.carry[0] / 0.72, p.carry[1] + 0.5, z + p.carry[2] / 0.72];
        delete p.carry;
        board.add(p);
        p.pos[1] = p.rest + 0.6;
      }
      emit('putback', { count: list.length });
    }
    knife.mode = 'rest';
  }

  /** Scrapes the board into the pan in one go: the button for it, and the key. */
  function scrapeIntoPan() {
    if (!pickUp()) return false;
    carryAt.set(panHome.x, CARRY, panHome.z);
    letGo();
    return true;
  }

  function startToss(strength = 0.62) {
    if (toss || pan.pieces.length === 0) return false;
    toss = { t: 0, strength, thrown: false };
    stats.tosses += 1;
    return true;
  }

  function heat(delta) {
    if (round.plated) return pan.heat.level;
    begin();
    const before = pan.heat.level;
    const after = pan.heat.set(before + delta);
    if (after !== before) emit('heat', { level: after, setting: SETTINGS[after] });
    return after;
  }

  function oil() {
    if (round.plated) return false;
    begin();
    pan.pour(0.6);
    emit('oil');
    return true;
  }

  // ------------------------------------------------------------ the plate

  /**
   * Everything in the pan onto the plate, and the plate marked. The marking
   * happens now, off the food as it comes out of the pan; the flight onto the
   * plate is for the cook to watch.
   */
  function plateIt() {
    if (plating || round.plated || carried.length) return false;
    if (pan.pieces.length === 0 && sheet.empty) return false;
    const flat = sheet.summary();
    const taken = pan.takeAll();
    const poured = round.pours.reduce((a, p) => ({ eggs: a.eggs + p.eggs, mix: a.mix + p.mix * p.eggs }), { eggs: 0, mix: 0 });
    const seconds = round.started === null ? 0 : elapsed - round.started;
    report = grade({
      pieces: taken,
      sheet: flat.volume > 0.05 ? flat : null,
      beaten: poured.eggs ? poured.mix / poured.eggs : 0,
      eggs: poured.eggs,
      seconds,
    });

    /** Egg left set flat comes up in a few wide pieces, the way an omelette breaks. */
    const slabs = sheet.lift(Math.max(1, Math.min(6, Math.round(flat.volume / 0.8)))).map((c, i) => {
      const piece = makePiece({ solid: curdSolid({ volume: c.volume, yolk: c.yolk, seed: 40 + i }), kind: 'egg', pos: [c.x, 0.2, c.z] });
      piece.core = c.set;
      piece.yolk = c.yolk;
      piece.brown.fill(c.brown * 0.5);
      return piece;
    });
    const all = [...taken.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'potato' ? -1 : 1)), ...slabs];

    plateGroup.visible = true;
    const golden = 2.399963;
    const flights = all.map((piece, i) => {
      const from = panRig.localToWorld(new GFX.Vector3(...piece.pos));
      const u = (i + 0.5) / all.length;
      const r = Math.sqrt(u) * (PLATE.well - 0.3);
      const a = i * golden;
      const mound = 0.9 * (1 - (r / PLATE.well) ** 2);
      const to = [Math.cos(a) * r, PLATE.floor + 0.2 + mound + (piece.kind === 'egg' ? 0.25 : 0) + Math.random() * 0.15, Math.sin(a) * r];
      return { piece, from, to, delay: u * 1.1, done: false };
    });
    for (const f of flights) flying.push(f.piece);
    plating = { t: 0, flights };
    round.plated = true;
    pan.heat.set(0);
    kitchen.focus(plateGroup.getWorldPosition(new GFX.Vector3()).add(new GFX.Vector3(0, 0.5, 0)), { distance: 26, pitch: 0.98 });
    emit('plating', { count: all.length });
    return true;
  }

  function updatePlating(dt) {
    if (!plating) return;
    plating.t += dt;
    const base = plateGroup.getWorldPosition(new GFX.Vector3());
    let left = 0;
    for (const f of plating.flights) {
      if (f.done) continue;
      const k = Math.min(1, Math.max(0, (plating.t - f.delay) / 0.55));
      if (k <= 0) {
        left += 1;
        f.piece.pos = [f.from.x, f.from.y, f.from.z];
        continue;
      }
      const e = k * k * (3 - 2 * k);
      const to = new GFX.Vector3(base.x + f.to[0], base.y + f.to[1], base.z + f.to[2]);
      f.piece.pos = [
        f.from.x + (to.x - f.from.x) * e,
        f.from.y + (to.y - f.from.y) * e + Math.sin(e * Math.PI) * 4,
        f.from.z + (to.z - f.from.z) * e,
      ];
      if (k >= 1) {
        f.done = true;
        f.piece.pos = [...f.to];
        flying.splice(flying.indexOf(f.piece), 1);
        plated.push(f.piece);
        emit('land-plate');
      } else {
        left += 1;
      }
    }
    if (left === 0 && plating.t > 0.4) {
      plating = null;
      emit('plated', { report });
    }
  }

  /** Clears the kitchen for another go: a new potato, a full carton, a cold pan. */
  function reset() {
    plating = null;
    report = null;
    plated.length = 0;
    flying.length = 0;
    carried.length = 0;
    board.clear();
    pan.clear();
    sheet.clear();
    eggs.reset();
    plateGroup.visible = false;
    kitchen.release();
    knife.mode = 'rest';
    knife.chop = null;
    knife.queued = false;
    toss = null;
    round = { started: null, pours: [], plated: false };
    for (const k of Object.keys(stats)) stats[k] = 0;
    progressAt = -1;
    newPotato();
    emit('reset');
  }

  /** Where the dish has got to, for the recipe card. Worked out a few times a second. */
  let progress = null;
  function measureProgress() {
    /** Once it is on the plate the ticket stands as it was when it went. */
    if (round.plated && progress) {
      progress.plated = true;
      return progress;
    }
    const potato = [...board.pieces, ...pan.pieces, ...carried].filter((p) => p.kind === 'potato');
    const inPan = pan.pieces.filter((p) => p.kind === 'potato');
    const curds = pan.pieces.filter((p) => p.kind === 'egg');
    const dice = diceReport(potato);
    const fry = fryReport(inPan);
    const poured = round.pours.reduce((a, p) => ({ eggs: a.eggs + p.eggs, mix: a.mix + p.mix * p.eggs }), { eggs: 0, mix: 0 });
    const flat = sheet.summary();
    const egg = poured.eggs
      ? eggReport({ curds, sheet: flat.volume > 0.05 ? flat : null, beaten: poured.mix / poured.eggs, eggs: poured.eggs })
      : null;
    const bowlEggs = eggs.bowl.eggs;
    progress = {
      dice: { pieces: dice.pieces, bite: dice.bite, done: dice.pieces > 12 && dice.bite >= 0.7 },
      fry: { inPan: inPan.length, golden: fry.golden, cooked: inPan.length ? 1 - fry.raw : 0, burnt: fry.burnt, done: inPan.length > 0 && fry.golden >= 0.7 },
      whisk: {
        eggs: bowlEggs + poured.eggs,
        mix: bowlEggs ? eggs.bowl.mix : poured.eggs ? poured.mix / poured.eggs : 0,
        done: (bowlEggs >= 3 && eggs.bowl.mix >= 0.9) || (poured.eggs >= 3 && poured.mix / poured.eggs >= 0.9),
      },
      scramble: {
        poured: poured.eggs,
        scrambled: egg ? egg.scrambled : 0,
        soft: egg ? egg.soft : 0,
        done: Boolean(egg) && egg.scrambled >= 0.6 && egg.soft >= 0.6,
      },
      ready: pan.pieces.length > 0 || !sheet.empty,
      plated: round.plated,
    };
    return progress;
  }

  // ------------------------------------------------------------ input

  function onMove(event) {
    if (!live) return;
    pointer.aim(event);
    zone = locate();
    if (press.down && !press.drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG) {
      if (press.zone.zone === 'board' && onPile(press.zone.point) && pickUp()) press.drag = 'scrape';
      else if (press.zone.zone === 'pan') press.drag = 'stir';
      else if (press.zone.zone === 'bowl') press.drag = 'whisk';
      else press.drag = 'none';
    }
    if (press.drag === 'scrape') {
      const p = pointer.at(CARRY);
      if (p) carryAt.copy(p);
    } else if (press.drag === 'whisk') {
      const p = eggs.inBowl(pointer);
      if (p) eggs.beat(p);
    }
  }

  function onDown(event) {
    if (event.button === 2 || round.plated || !live) return;
    pointer.aim(event);
    zone = locate();
    press.down = true;
    press.x = event.clientX;
    press.y = event.clientY;
    press.zone = zone;
    press.drag = null;
    stage.setPointerCapture?.(event.pointerId);
  }

  function onUp(event) {
    if (!press.down) return;
    pointer.aim(event);
    press.down = false;
    if (press.drag === 'scrape') letGo();
    else if (press.drag === 'whisk') eggs.stopBeating();
    else if (!press.drag) click(press.zone, event);
    press.drag = null;
    spatula.last = null;
  }

  /** Puts the knife over a point on the board, the way hovering does: blade centred on it. */
  function aimKnife([x, z]) {
    const pile = board.bounds();
    if (!pile) return false;
    knife.z = Math.max(pile.z0 - 0.4, Math.min(pile.z1 + 0.4, z));
    knife.x = Math.min(BOARD.w / 2 + 1.5, Math.max(-BOARD.w / 2 + 7.6 - 1.5, x + 3.8));
    return true;
  }

  function click(at) {
    switch (at.zone) {
      case 'board':
        /** A tap on a touch screen has no hover before it: aim, then come down. */
        if (!knife.chop && aimKnife(at.point)) {
          knife.mode = 'hover';
          const pile = board.bounds();
          knifeMesh.position.set(boardOrigin.x + knife.x, boardOrigin.y + pile.y1 + 0.7, boardOrigin.z + knife.z);
          knifeMesh.rotation.set(-0.42, 0, 0);
        }
        chop();
        break;
      case 'pan': if (pan.flip(at.point[0], at.point[1])) emit('flip'); break;
      case 'knob': heat(pan.heat.level >= SETTINGS.length - 1 ? -(SETTINGS.length - 1) : 1); break;
      case 'oil': oil(); break;
      case 'carton': eggs.crack(); break;
      default: break;
    }
  }

  function onContext(event) {
    event.preventDefault();
    if (!live || round.plated) return;
    pointer.aim(event);
    const at = locate();
    if (at.zone === 'board') turn();
    else if (at.zone === 'knob') heat(-1);
  }

  function onLeave() {
    pointer.state.inside = false;
    zone = { zone: null };
  }

  function onKey(event) {
    if (!live || round.plated) return;
    if (event.target && /^(input|textarea|select|button)$/i.test(event.target.tagName) && event.key === ' ') return;
    if (event.target && /^(input|textarea|select)$/i.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      startToss();
    } else if (key === 'r') turn();
    else if (key === 'c') chop();
    else if (key === 's') scrapeIntoPan();
    else if (key === 'o') oil();
    else if (key === 'g') eggs.crack();
    else if (key === 'enter') plateIt();
    else if (key === 'p') eggs.startPour();
    else if (key === 'e' || key === '+' || key === '=' || key === ']') heat(1);
    else if (key === 'q' || key === '-' || key === '[') heat(-1);
  }

  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------ the tools

  const knifeMesh = kitchen.knife.group;
  const smoothing = (dt, rate) => 1 - Math.exp(-dt * rate);

  function updateKnife(dt) {
    const pile = board.bounds();
    if (knife.mode !== 'chop' && knife.mode !== 'scrape') {
      knife.mode = zone.zone === 'board' && pile && !carried.length ? 'hover' : 'rest';
    }
    if (!pile && knife.mode === 'chop') {
      knife.mode = 'rest';
      knife.chop = null;
    }

    let target, tilt = 0, flat = false;
    if (knife.mode === 'hover' || knife.mode === 'chop') {
      /** The heel follows the pointer, so the middle of the blade is over it. */
      if (knife.mode === 'hover' && zone.zone === 'board') aimKnife(zone.point);
      let height = pile.y1 + 0.7;
      if (knife.chop) {
        const c = knife.chop;
        c.t += dt;
        if (c.t < CHOP.down) height *= 1 - c.t / CHOP.down;
        else if (c.t < CHOP.down + 0.03) height = 0;
        else height *= Math.min(1, (c.t - CHOP.down - 0.03) / CHOP.up);
        if (!c.cut && c.t >= CHOP.down) {
          c.cut = true;
          const n = board.chop({ z: c.z, x0: c.x0, x1: c.x1, flesh: FLESH });
          stats.chops += 1;
          emit('chop', { cut: n });
        }
        if (c.t >= CHOP.down + 0.03 + CHOP.up) {
          knife.chop = null;
          knife.mode = 'hover';
          if (knife.queued) {
            knife.queued = false;
            chop();
          }
        }
        tilt = 0;
      } else {
        tilt = -0.42;
      }
      target = new GFX.Vector3(boardOrigin.x + knife.x, boardOrigin.y + height, boardOrigin.z + knife.z);
    } else if (knife.mode === 'scrape') {
      target = new GFX.Vector3(carryAt.x + 3.8, carryAt.y - 0.12, carryAt.z);
      flat = true;
    } else {
      const r = kitchen.knife.rest;
      target = new GFX.Vector3(r.x, r.y, r.z);
      flat = true;
    }

    const fast = knife.mode === 'chop' ? 1 : smoothing(dt, 18);
    knifeMesh.position.lerp(target, fast);
    const rx = flat ? -Math.PI / 2 : tilt;
    knifeMesh.rotation.x += (rx - knifeMesh.rotation.x) * smoothing(dt, 16);
    knifeMesh.rotation.y += (0 - knifeMesh.rotation.y) * smoothing(dt, 16);
    knifeMesh.rotation.z += (0 - knifeMesh.rotation.z) * smoothing(dt, 16);

    /** The guide: a sheet in the plane of the blade, across whatever it would go through. */
    const guide = kitchen.guide;
    guide.visible = false;
    if (knife.mode === 'hover' && pile) {
      let x0 = Infinity, x1 = -Infinity, y1 = 0;
      for (const p of board.pieces) {
        const b = board.box(p);
        if (b.z0 < knife.z && b.z1 > knife.z && b.x1 > knife.x - 7.6 && b.x0 < knife.x) {
          x0 = Math.min(x0, b.x0);
          x1 = Math.max(x1, b.x1);
          y1 = Math.max(y1, b.y1);
        }
      }
      if (x1 > x0) {
        guide.visible = true;
        guide.scale.set(x1 - x0 + 0.3, y1 + 0.15, 1);
        guide.position.set(boardOrigin.x + (x0 + x1) / 2, boardOrigin.y + (y1 + 0.15) / 2, boardOrigin.z + knife.z);
      }
    }
  }

  const spatulaMesh = kitchen.spatula.group;

  function updateSpatula(dt) {
    spatula.work = (spatula.work ?? 0) * Math.exp(-dt * 8);
    const over = zone.zone === 'pan' && !carried.length;
    if (over) {
      const [x, z] = zone.point;
      if (press.drag === 'stir') {
        if (spatula.last) {
          const n = pan.stir(spatula.last, [x, z], dt);
          const torn = sheet.empty ? 0 : sheet.stir(spatula.last, [x, z], 2.4, dt);
          if (n || torn) stats.stirs += dt;
          spatula.work = Math.min(1, Math.hypot(x - spatula.last[0], z - spatula.last[1]) / Math.max(dt, 1e-3) / 12);
        }
        spatula.last = [x, z];
      }
      const r = Math.min(COOK_RADIUS - 0.3, Math.hypot(x, z));
      const yaw = 0.55;
      const target = new GFX.Vector3(
        panRig.position.x + x - Math.sin(yaw) * 1.55,
        panRig.position.y + floorHeight(r) + 0.03,
        panRig.position.z + z - Math.cos(yaw) * 1.55,
      );
      spatulaMesh.position.lerp(target, smoothing(dt, 22));
      spatulaMesh.rotation.y += (yaw - spatulaMesh.rotation.y) * smoothing(dt, 12);
      spatulaMesh.rotation.x += ((press.drag === 'stir' ? 0.12 : 0.04) - spatulaMesh.rotation.x) * smoothing(dt, 12);
    } else {
      const r = kitchen.spatula.rest;
      spatulaMesh.position.lerp(new GFX.Vector3(r.x, r.y, r.z), smoothing(dt, 10));
      spatulaMesh.rotation.y += (r.yaw - spatulaMesh.rotation.y) * smoothing(dt, 10);
      spatulaMesh.rotation.x += (r.pitch - spatulaMesh.rotation.x) * smoothing(dt, 10);
    }
  }

  function updateToss(dt) {
    if (!toss) {
      panRig.position.lerp(panHome, smoothing(dt, 12));
      panRig.rotation.x *= 1 - smoothing(dt, 12);
      return;
    }
    toss.t += dt;
    const k = toss.t / TOSS.time;
    /** A quick dip, the jerk up and back toward the cook, and down again. */
    const lift = k < 0.12 ? -0.12 * (k / 0.12) : Math.sin(Math.min(1, (k - 0.12) / 0.88) * Math.PI) * (0.55 + 0.5 * toss.strength);
    panRig.position.set(panHome.x, panHome.y + lift, panHome.z + Math.sin(Math.min(1, k) * Math.PI) * 0.35);
    panRig.rotation.x = Math.sin(Math.min(1, k) * Math.PI) * -0.12;
    if (!toss.thrown && toss.t >= TOSS.launch) {
      toss.thrown = true;
      pan.toss(toss.strength);
      emit('toss', { strength: toss.strength });
    }
    if (toss.t >= TOSS.time) toss = null;
  }

  // ------------------------------------------------------------ the frame

  function update(dt, time) {
    elapsed += dt;
    board.update(dt);
    /** Egg still running on the floor is wet load on the iron, like raw potato. */
    const egg = sheet.empty ? null : sheet.summary();
    pan.update(dt, egg ? egg.liquid / 0.15 : 0);
    if (egg) sheet.update(dt, pan.heat.temp);
    eggs.update(dt);
    if (egg || sheetView.mesh.visible) sheetView.update();

    updateKnife(dt);
    updateSpatula(dt);
    updateToss(dt);
    updatePlating(dt);
    kitchen.updateCamera(dt);

    /** The pile in the hand follows it, a little behind. */
    if (carried.length) {
      for (const p of carried) {
        const want = [carryAt.x + p.carry[0], carryAt.y + p.carry[1], carryAt.z + p.carry[2]];
        p.pos = p.pos.map((v, i) => v + (want[i] - v) * smoothing(dt, 20));
      }
    }

    for (const p of board.pieces) views.show(p, boardTop);
    for (const p of pan.pieces) views.show(p, panRig);
    for (const p of carried) views.show(p, carry);
    for (const p of flying) views.show(p, carry);
    for (const p of plated) views.show(p, plateGroup);
    views.repaint(10);
    views.sweep();

    kitchen.stove.update(pan.heat.level / (SETTINGS.length - 1), time, dt);

    /** Oil in the pan is the floor turning to a dark mirror. */
    const floor = kitchen.pan.floor;
    const sheen = Math.min(1, pan.oil / 0.5);
    floor.roughness = 0.44 - 0.32 * sheen;
    floor.metalness = 0.62 - 0.2 * sheen;

    for (const e of pan.events.splice(0)) emit(e.type, e);
    if (elapsed - progressAt > 0.3) {
      progressAt = elapsed;
      measureProgress();
    }
  }

  newPotato();

  return {
    update, chop, turn, scrapeIntoPan, startToss, heat, oil, newPotato, plateIt, reset,
    crackEgg: () => eggs.crack(),
    pourEggs: () => eggs.startPour(),
    board, pan, sheet, eggs, stats, views,
    get zone() { return zone; },
    get live() { return live; },
    get stirring() { return spatula.work ?? 0; },
    set live(on) { live = Boolean(on); },
    get knife() { return knife; },
    get carrying() { return carried.length > 0; },
    get elapsed() { return elapsed; },
    get progress() { return progress ?? measureProgress(); },
    get report() { return report; },
    get plated() { return round.plated; },
    get clock() { return round.started === null ? 0 : (round.plated && report ? report.time.seconds : elapsed - round.started); },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
