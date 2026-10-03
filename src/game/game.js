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
 *
 * What is on the rail decides the rest: whether there is a potato on the
 * board, whether eggs go into the bowl or straight into the pan, whether the
 * sheet of egg is folded, and how the plate is marked (see dishes.js).
 */

import { curdSolid, friedSolid, omeletteSolid } from '../food/curd.js';
import { FILLINGS, FILLING_KINDS, fillingSolid, isFilling } from '../food/fillings.js';
import { INGREDIENTS, FLESH } from '../food/index.js';
import { BOARD } from '../scene/board.js';
import { PLATE } from '../scene/cookware.js';
import { HANDLE_TURN, LAYOUT, PAN_Y } from '../scene/kitchen.js';
import { COOK_RADIUS, FLAT, LIP_RADIUS, RIM_HEIGHT, RIM_RADIUS, floorHeight } from '../scene/pan.js';
import { TOP } from '../scene/stove.js';
import { PATS } from '../scene/props.js';
import { createBoard } from '../sim/board.js';
import { createSheet } from '../sim/eggs.js';
import { SETTINGS } from '../sim/heat.js';
import { createPan } from '../sim/pan.js';
import { makePiece } from '../sim/piece.js';
import { axisAngle, multiply, slerp } from '../sim/quat.js';
import { sprinkle } from '../sim/season.js';
import { createButterView } from '../view/butter.js';
import { createGrains } from '../view/grains.js';
import { createSheetView } from '../view/eggs.js';
import { createPieceViews } from '../view/pieces.js';
import { createEggStation } from './eggs.js';
import { DISHES } from './dishes.js';
import { BITE, diceReport, eggReport, fryReport, gradeDish, seasonReport } from './grade.js';
import { createPointer } from './pointer.js';

/** How far the pointer has to travel before a press is a drag rather than a click. */
const DRAG = 7;

/** A fingertip wanders further than a mouse in a tap: further still before it is a drag. */
const DRAG_TOUCH = 16;

/**
 * On the pile it has to go further: a press there is nearly always a chop
 * being aimed, and a hand that drifts while it clicks should still chop
 * rather than pick the whole pile up.
 */
const LIFT = 18;

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
  /** Potato sitting in egg that is still running is held at the egg's heat, and barely browns. */
  const pan = createPan({ liquid: (x, z) => sheet.liquidAt(x, z), covered: () => (sheet.empty ? 0 : sheet.area()) });
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
  const butterView = createButterView(GFX, panRig);
  const grains = createGrains({ GFX, room: kitchen.room });
  let butterLeft = PATS;
  /** The salt, the mill and the butter give a little hop when they are used. */
  const hops = { salt: 0, mill: 0, butter: 0, ...Object.fromEntries(FILLING_KINDS.map((k) => [k, 0])) };
  const eggs = createEggStation({
    GFX, kitchen, sheet, pan,
    emit: (type, detail) => {
      if (type === 'poured') round.pours.push(detail);
      if (type === 'egg-in' || type === 'pour-start' || type === 'egg-in-pan') begin();
      /** Eggs that go into a pan with fat in it, hot, have had the pan made ready for them. */
      if ((type === 'pour-start' || type === 'egg-in-pan') && (pan.oil > 0.12 || pan.butter.share > 0.15) && pan.heat.temp > 100) round.fatDone = true;
      /** Eggs that go into foaming butter are scrambled in butter. */
      if (type === 'pour-start' && pan.butter.share >= 0.3 && !pan.butter.burnt) round.buttered = true;
      emit(type, detail);
    },
  });

  const knife = { mode: 'rest', z: 0, x: 0, chop: null, queued: false, manual: false };
  /** The pan held by its handle: how far it has been pulled off its spot, and how it is moving. */
  const shake = { on: false, from: null, offset: new GFX.Vector3(), want: new GFX.Vector3(), last: null, vel: [0, 0], acc: [0, 0], trail: [] };
  const keys = new Set();
  let whiskAngle = 0, stirAngle = 0;
  const spatula = { last: null, work: 0 };
  const press = { down: false, id: null, x: 0, y: 0, zone: null, drag: null, grab: [0, 0] };
  /**
   * Fingers on the glass, for the one gesture that takes two: a twist, which
   * turns the pile the way the fingers go. `twist` is the angle between them
   * last time, and how far they have turned since the pile last did.
   */
  const fingers = new Map();
  let twist = null;
  let zone = { zone: null };
  let toss = null;
  /** Off until the cook has started: the kitchen is there to look at behind the title. */
  let live = false;
  let elapsed = 0;

  const stats = { chops: 0, tosses: 0, stirs: 0, scrapes: 0 };
  /** The order on the rail. */
  let dish = DISHES.hash;

  /** This attempt at the dish: when it started, what went into the pan from the bowl, whether it is served. */
  let round = { started: null, pours: [], plated: false, buttered: false, burntButter: false, fatDone: false };
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

  /** When the cook last did anything, or anything happened: nothing for a while, and the kitchen can rest. */
  let lastActivity = 0;

  function emit(type, detail = {}) {
    lastActivity = performance.now();
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

    /** The extras, each a ramekin's worth of floor. */
    for (const kind of FILLING_KINDS) {
      const q = pointer.at(0.9);
      const at = kitchen.extraAt(kind);
      if (q && Math.hypot(q.x - at.x, q.z - at.z) < 1.15) return { zone: 'extra', kind };
    }

    /** The salt, the pepper mill and the butter, each a round patch at its own height. */
    for (const [key, zoneName, height, radius] of [['salt', 'salt', 1.0, 1.7], ['mill', 'pepper', 2.6, 1.3], ['butter', 'butter', 1.0, 1.9]]) {
      const q = pointer.at(height);
      if (q && Math.hypot(q.x - LAYOUT[key].x, q.z - LAYOUT[key].z) < radius) return { zone: zoneName };
    }

    /** The handle: a strip running out from the rim toward the cook. */
    const h = pointer.at(PAN_Y + 1.5);
    if (h) {
      const dx = -Math.sin(HANDLE_TURN), dz = -Math.cos(HANDLE_TURN);
      const rx = h.x - panHome.x, rz = h.z - panHome.z;
      const along = rx * dx + rz * dz, across = Math.abs(rx * dz - rz * dx);
      if (along > RIM_RADIUS - 0.2 && along < RIM_RADIUS + 6.8 && across < 1.1) return { zone: 'handle' };
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

  /** A quarter turn of the pile: anticlockwise as the camera sees it, or clockwise for `dir` −1. */
  function turn(dir = 1) {
    if (carried.length || !board.turn(dir)) return false;
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
      /** Where it lay, so a pile that does not go in the pan goes back exactly as it was. */
      p.home = { pos: [...p.pos], rot: [...p.rot] };
      carried.push(p);
    }
    carryAt.set(boardOrigin.x + centre.x, CARRY, boardOrigin.z + centre.z);
    knife.mode = 'scrape';
    emit('pickup', { count: list.length });
    return true;
  }

  /** Lets go of the pile: into the pan if it is over the pan, back where it came from if not. */
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
        delete p.home;
      }
      pan.add(list, { area });
      stats.scrapes += 1;
      emit('scrape', { count: list.length });
    } else {
      /** Lowest first, so each piece finds what it was lying on already back under it. */
      list.sort((a, b) => a.home.pos[1] - b.home.pos[1]);
      for (const p of list) {
        p.pos = [...p.home.pos];
        p.rot = [...p.home.rot];
        p.version += 1;
        delete p.carry;
        delete p.home;
        board.add(p);
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
    if (toss || (pan.pieces.length === 0 && sheet.empty)) return false;
    begin();
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

  /** A pat of butter off the stick and into the pan, somewhere near the middle. */
  function butter() {
    if (round.plated || butterLeft <= 0) return false;
    begin();
    butterLeft -= 1;
    kitchen.props.butter.left(butterLeft / PATS);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 2.4;
    pan.addButter(Math.cos(a) * r, Math.sin(a) * r);
    hops.butter = 1;
    return true;
  }

  /**
   * A pinch of salt, or a twist of pepper, onto `target`: 'pan' or 'bowl'.
   * Left to itself it goes over the food in the pan if there is any, or else
   * into the eggs in the bowl. With nothing there, it goes nowhere.
   */
  function season(kind, target = null) {
    if (round.plated) return false;
    begin();
    const panFood = pan.pieces.length > 0 || !sheet.empty;
    const bowlEggs = eggs.bowl.eggs > 0 && !eggs.pouring;
    const to = target ?? (panFood ? 'pan' : 'bowl');
    let where = null;
    if (to === 'pan' && panFood) {
      sprinkle(kind, 1, { pieces: pan.pieces, sheet: sheet.empty ? null : sheet });
      where = 'pan';
      grains.pour(kind, panRig.localToWorld(new GFX.Vector3(0, 0.4, 0)), { radius: 3.4 });
    } else if (to === 'bowl' && bowlEggs) {
      eggs.bowl.season(kind, 1);
      where = 'bowl';
      grains.pour(kind, new GFX.Vector3(LAYOUT.bowl.x, kitchen.bowl.floor + 0.3, LAYOUT.bowl.z), { radius: 1.1, count: 18 });
    }
    hops[kind === 'salt' ? 'salt' : 'mill'] = 1;
    emit(kind, { where });
    if (!where) emit('season-nothing');
    return Boolean(where);
  }

  /** The hop: up and back down in a third of a second, the mill turning as it grinds. */
  function updateHops(dt) {
    for (const key of Object.keys(hops)) {
      if (hops[key] <= 0) continue;
      hops[key] = Math.max(0, hops[key] - dt / 0.32);
      const group = (kitchen.props[key] ?? kitchen.extras[key]).group;
      group.position.y = Math.sin((1 - hops[key]) * Math.PI) * (key === 'mill' ? 0.5 : 0.35);
      if (key === 'mill') group.rotation.y += dt * 9;
    }
  }

  /**
   * A handful of one of the extras into the pan, scattered over whatever is
   * in it: on the egg, to be folded in, or over the food as a topping.
   */
  function addExtra(kind) {
    if (round.plated || !FILLINGS[kind]) return false;
    begin();
    const f = FILLINGS[kind];
    const list = [];
    /** Over the egg, where there is a sheet of it; else over the middle of the pan. */
    const spread = sheet.empty ? 2.6 : 3.2;
    for (let n = 0; n < f.handful; n++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const piece = makePiece({ solid: fillingSolid(kind), kind, pos: [Math.cos(a) * r, 1.2 + Math.random() * 1.4, Math.sin(a) * r], rot: axisAngle([0, 1, 0], Math.random() * Math.PI * 2) });
      /** Cut and waiting in the fridge's chill, not yet cooked at all. */
      piece.moisture = kind === 'tomato' ? 1 : 0.6;
      const s = pan.state(piece);
      s.vel = [(Math.random() - 0.5) * 1.2, -2 - Math.random() * 2, (Math.random() - 0.5) * 1.2];
      list.push(piece);
    }
    pan.add(list);
    hops[kind] = 1;
    emit('extra', { kind, count: list.length });
    return true;
  }

  /** Fried eggs going over: each lifted on the spatula, turned in the air and laid back down, for the cook to see. */
  const turning = [];
  const TURN_TIME = 0.42;

  function startTurn(yolk) {
    const e = sheet.fried().find((f) => f.id === yolk.id);
    if (!e) return;
    const piece = makePiece({
      solid: friedSolid({ radius: Math.max(1.5, Math.min(2.4, e.white.radius * 0.9)), whole: yolk.whole, seed: 7 + yolk.id * 13 }),
      kind: 'egg',
      pos: [yolk.x, 0.1, yolk.z],
    });
    piece.fried = true;
    piece.core = e.white.set;
    piece.yolk = 0.02;
    piece.yolkSet = yolk.set;
    piece.brown.fill(e.white.brown * 0.5);
    /** Turned an odd number of times now: it was yolk up, and goes over onto its face. */
    const from = yolk.flips % 2 === 1 ? [0, 0, 0, 1] : axisAngle([1, 0, 0], Math.PI);
    turning.push({ yolk, piece, from, t: 0 });
    sheetView.hide(yolk.id, true);
  }

  function updateTurning(dt) {
    for (const turn of [...turning]) {
      turn.t += dt;
      const k = Math.min(1, turn.t / TURN_TIME);
      const e = k * k * (3 - 2 * k);
      turn.piece.rot = multiply(axisAngle([1, 0, 0], Math.PI * e), turn.from);
      turn.piece.pos = [turn.yolk.x, 0.1 + Math.sin(k * Math.PI) * 2.4, turn.yolk.z - Math.sin(k * Math.PI) * 0.6];
      turn.piece.version += 1;
      if (k >= 1) {
        turning.splice(turning.indexOf(turn), 1);
        sheetView.hide(turn.yolk.id, false);
      } else {
        views.show(turn.piece, panRig);
      }
    }
  }

  function stopTurning() {
    for (const turn of turning) sheetView.hide(turn.yolk.id, false);
    turning.length = 0;
  }

  /** The next egg from the carton: into the bowl, or for fried eggs straight into the pan. */
  function crackEgg() {
    if (round.plated) return false;
    return eggs.crack(dish.crack);
  }

  /**
   * The sheet of egg folded over on itself — rolled, for a French omelette,
   * or in half — and from then on one piece in the pan like any other.
   */
  function fold() {
    if (round.plated || eggs.pouring || sheet.yolks.length) return false;
    const shape = dish.fold ?? 'half';
    /** Whatever extras are lying on the egg go inside it. */
    const inside = pan.pieces.filter((p) => isFilling(p) && !pan.state(p).air && sheet.depthAt(p.pos[0], p.pos[2]) > 0.01);
    const data = sheet.fold();
    if (!data) return false;
    begin();
    for (const p of inside) pan.remove(p);
    const piece = makePiece({
      solid: omeletteSolid({ volume: data.volume, shape, yolk: data.yolk, seed: Math.random() * 100 }),
      kind: 'egg',
      pos: [0, 0.6, 0],
    });
    piece.omelette = shape;
    piece.inside = inside;
    if (shape === 'half' && inside.length) piece.flecks = foldFlecks(piece, inside);
    piece.keepUp = true;
    piece.core = data.set;
    piece.yolk = data.yolk;
    /** What was against the iron is now the outside, all round. */
    piece.brown.fill(data.brown * 0.85);
    piece.moisture = 0.6;
    piece.salt = data.salt;
    piece.pepper = data.pepper;
    pan.add([piece]);
    emit('fold', { shape, liquid: data.liquid });
    return true;
  }

  /**
   * Where a folded omelette's filling shows along its fold: the colour of one
   * of the extras inside it at some of the points near that edge, and none
   * (−1) everywhere else. The same point always gets the same colour, so the
   * flecks do not tear across the triangles that share it.
   */
  function foldFlecks(piece, inside) {
    const pos = piece.solid.pos;
    const n = pos.length / 3;
    const out = new Float32Array(n * 3).fill(-1);
    let edge = -Infinity;
    for (let i = 0; i < n; i++) edge = Math.max(edge, pos[i * 3 + 2]);
    const kinds = inside.map((p) => p.kind);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (z < edge - 0.45 || Math.abs(y) > 0.35) continue;
      const h = Math.sin(Math.round(x * 20) * 12.9898 + Math.round(y * 20) * 78.233 + Math.round(z * 20) * 37.719) * 43758.5453;
      const r = h - Math.floor(h);
      if (r > 0.5) continue;
      const c = FILLINGS[kinds[Math.floor(r * 2 * kinds.length) % kinds.length]].colour;
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }
    return out;
  }

  // ------------------------------------------------------------ the plate

  /**
   * Everything in the pan onto the plate, and the plate marked. The marking
   * happens now, off the food as it comes out of the pan; the flight onto the
   * plate is for the cook to watch.
   */
  function plateIt() {
    if (plating || round.plated || carried.length || eggs.pouring) return false;
    if (pan.pieces.length === 0 && sheet.empty) return false;
    stopTurning();
    const taken = pan.takeAll();
    const poured = round.pours.reduce((a, p) => ({ eggs: a.eggs + p.eggs, mix: a.mix + p.mix * p.eggs }), { eggs: 0, mix: 0 });
    const seconds = round.started === null ? 0 : elapsed - round.started;
    /** Fried eggs come up one at a time on the spatula, whole. */
    const friedEggs = sheet.yolks.length ? sheet.liftFried() : [];
    const whole = friedEggs.map((e, i) => {
      const piece = makePiece({
        solid: friedSolid({ radius: Math.max(1.5, Math.min(2.2, e.white.radius * 0.85)), whole: e.yolk.whole, seed: 7 + i * 13 }),
        kind: 'egg',
        pos: [e.x, 0.2, e.z],
      });
      piece.fried = true;
      piece.keepUp = true;
      piece.core = e.white.set;
      piece.yolk = 0.02;
      piece.yolkSet = e.yolk.set;
      piece.filmed = e.yolk.flips > 0;
      piece.brown.fill(e.white.brown * 0.5);
      piece.salt = e.salt ?? 0;
      piece.pepper = e.pepper ?? 0;
      return piece;
    });
    const flat = sheet.summary();
    const data = {
      pieces: [...taken, ...whole],
      sheet: flat.volume > 0.05 ? flat : null,
      fried: friedEggs,
      beaten: poured.eggs ? poured.mix / poured.eggs : 0,
      eggs: poured.eggs,
      seconds,
      buttered: !round.burntButter && (round.buttered || pan.butter.share >= 0.3),
      burntButter: round.burntButter,
    };
    report = gradeDish(dish, data);

    /** Egg left set flat comes up in a few wide pieces, the way an omelette breaks. */
    const slabs = sheet.lift(Math.max(1, Math.min(6, Math.round(flat.volume / 0.8)))).map((c, i) => {
      const piece = makePiece({ solid: curdSolid({ volume: c.volume, yolk: c.yolk, seed: 40 + i }), kind: 'egg', pos: [c.x, 0.2, c.z] });
      piece.core = c.set;
      piece.yolk = c.yolk;
      piece.brown.fill(c.brown * 0.5);
      piece.salt = c.salt ?? 0;
      piece.pepper = c.pepper ?? 0;
      return piece;
    });
    /** Shuffled, so potato and egg come out folded through each other rather than in the order they went in. */
    const loose = [...taken.filter((p) => !p.keepUp), ...slabs];
    for (let i = loose.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [loose[i], loose[j]] = [loose[j], loose[i]];
    }
    /** Whatever has a right way up — an omelette, a fried egg — goes on first, flat, side by side. */
    const laid = [...taken.filter((p) => p.keepUp), ...whole];
    const all = [...laid, ...loose];

    plateGroup.visible = true;
    const golden = 2.399963;
    const flights = all.map((piece, i) => {
      const from = panRig.localToWorld(new GFX.Vector3(...piece.pos));
      const u = (i + 0.5) / all.length;
      if (piece.keepUp) {
        const k = laid.indexOf(piece), n = laid.length;
        const x = (k - (n - 1) / 2) * (piece.fried ? 3.2 : 2.4);
        const yaw = axisAngle([0, 1, 0], piece.fried ? (k - 0.5) * 0.5 : 0.25);
        return { piece, from, to: [x, PLATE.floor + 0.35 - piece.min[1] * 0 + k * 0.06, (k % 2) * 0.6 - 0.3], rot: [...piece.rot], turn: piece.fried ? yaw : multiply(yaw, piece.rot), delay: u * 1.1, done: false };
      }
      const r = Math.sqrt(u) * (PLATE.well - 0.3);
      const a = i * golden;
      const mound = 0.9 * (1 - (r / PLATE.well) ** 2) + (laid.length ? 0.6 : 0);
      const to = [Math.cos(a) * r, PLATE.floor + 0.2 + mound + (piece.kind === 'egg' ? 0.1 : 0) + Math.random() * 0.15, Math.sin(a) * r];
      /** Each piece turns over on the way: off the spatula the faces that were down show as often as the tops. */
      const axis = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      const turn = multiply(axisAngle(axis, Math.PI * (0.5 + Math.random())), piece.rot);
      return { piece, from, to, rot: [...piece.rot], turn, delay: u * 1.1, done: false };
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
      f.piece.rot = slerp(f.rot, f.turn, e);
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
    stopTurning();
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
    shake.on = false;
    shake.want.set(0, 0, 0);
    shake.offset.set(0, 0, 0);
    keys.clear();
    press.down = false;
    press.drag = null;
    round = { started: null, pours: [], plated: false, buttered: false, burntButter: false, fatDone: false };
    butterLeft = PATS;
    kitchen.props.butter.left(1);
    butterView.clear();
    for (const k of Object.keys(stats)) stats[k] = 0;
    progressAt = -1;
    progress = null;
    if (dish.potato) newPotato();
    emit('reset', { dish: dish.id });
  }

  /** A new ticket on the rail: the kitchen cleared and set for it. */
  function order(id) {
    dish = DISHES[id] ?? DISHES.hash;
    reset();
    emit('order', { dish: dish.id });
    return dish;
  }

  /** How seasoned the food is so far: what is in the pan, and the eggs still in the bowl with whatever is in them. */
  function seasonProgress(flat) {
    const bowl = eggs.bowl;
    const egg = (flat?.volume ?? 0) + bowl.volume > 0
      ? { volume: (flat?.volume ?? 0) + bowl.volume, salt: (flat?.salt ?? 0) + bowl.salt, pepper: (flat?.pepper ?? 0) + bowl.pepper }
      : null;
    const s = seasonReport({ pieces: pan.pieces, sheet: egg, burntButter: round.burntButter });
    const food = pan.pieces.length > 0 || egg !== null;
    return {
      salt: s.salt, pepper: s.pepper, salted: s.salted ?? 0, peppered: s.peppered ?? 0,
      potato: s.potato, egg: s.egg, score: s.score, food,
      done: food && (pan.pieces.length > 0 || !sheet.empty) && (s.salted ?? 0) >= 0.85,
    };
  }

  /**
   * What the knife should do next, read off what is on the board: the biggest
   * share of potato that is not yet a bite, and which way it lies.
   */
  function diceAdvice() {
    if (board.pieces.length === 0) return '';
    if (board.pieces.length === 1) return 'cut it into rounds';
    let across = 0, along = 0, chunks = 0;
    for (const p of board.pieces) {
      const b = board.box(p);
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      if (Math.max(w, d) <= BITE.max && b.y1 - b.y0 <= BITE.max) continue;
      if (b.y1 - b.y0 > BITE.max && w > BITE.max && d > BITE.max) chunks += p.volume;
      /** Long side to side: the knife runs along it, not through it, until the pile is turned. */
      else if (w > BITE.max && w >= d) across += p.volume;
      else along += p.volume;
    }
    const most = Math.max(across, along, chunks);
    if (most < 0.5) return 'diced — into the pan';
    if (most === chunks) return 'keep cutting';
    if (most === along) return 'cut across them';
    return 'turn the pile, then cut across';
  }

  /** The eggs broken whole into the pan: how many, how much of their white still runs, how many turned or broken. */
  function friedProgress() {
    if (!sheet.yolks.length) return { eggs: 0, runnyWhite: 1, turned: 0, broken: 0 };
    const each = sheet.fried();
    const white = each.reduce((a, e) => a + e.white.volume, 0);
    const runny = each.reduce((a, e) => a + e.white.runny * e.white.volume, 0);
    return {
      eggs: each.length,
      runnyWhite: white > 0 ? runny / white : 1,
      turned: each.filter((e) => e.yolk.flips > 0).length,
      broken: each.filter((e) => !e.yolk.whole).length,
    };
  }

  /** Which extras have gone in, and how many bits of them are lying on the egg or folded inside it. */
  function extrasProgress() {
    const loose = pan.pieces.filter(isFilling);
    const inside = pan.pieces.filter((p) => p.omelette).flatMap((p) => p.inside ?? []);
    const onEgg = loose.filter((p) => sheet.depthAt(p.pos[0], p.pos[2]) > 0.01);
    const kinds = [...new Set([...loose, ...inside].map((p) => p.kind))];
    return { kinds, inside: inside.length, onEgg: onEgg.length, loose: loose.length, cheese: kinds.includes('cheese') };
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
      dice: { pieces: dice.pieces, bite: dice.bite, done: dice.pieces > 12 && dice.bite >= 0.7, next: diceAdvice() },
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
      season: seasonProgress(flat),
      butter: { left: butterLeft, share: pan.butter.share, brown: pan.butter.brown, burnt: pan.butter.burnt },
      fried: friedProgress(),
      omelette: {
        poured: poured.eggs,
        liquid: flat.volume > 0.05 ? flat.liquid / flat.volume : 1,
        brown: flat.brown,
        folded: pan.pieces.some((p) => p.omelette),
      },
      extras: extrasProgress(),
      temp: pan.heat.temp,
      oil: pan.oil,
      fatDone: round.fatDone,
      ready: pan.pieces.length > 0 || !sheet.empty,
      plated: round.plated,
    };
    return progress;
  }

  // ------------------------------------------------------------ input

  /** The angle of the line from the first finger down to the second, on the screen. */
  function fingerAngle() {
    const [a, b] = fingers.values();
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /**
   * A second finger down: the start of a twist, and the end of whatever the
   * first one was about to do — unless it was already carrying, stirring or
   * whisking, which a stray finger should not interrupt.
   */
  function startTwist() {
    if (press.down && press.drag) return;
    press.down = false;
    press.drag = null;
    twist = { angle: fingerAngle(), turned: 0 };
  }

  /** Twisted far enough, the pile turns; keep twisting and it turns again a quarter later. */
  function moveTwist() {
    const angle = fingerAngle();
    let d = angle - twist.angle;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    twist.angle = angle;
    twist.turned += d;
    if (Math.abs(twist.turned) < 0.55) return;
    /** Clockwise on the screen is clockwise from above, which is the board's −1. */
    const dir = twist.turned > 0 ? -1 : 1;
    if (turn(dir)) twist.turned += dir * (Math.PI / 2);
  }

  function onMove(event) {
    lastActivity = performance.now();
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!live) return;
    if (twist) {
      if (fingers.size >= 2) moveTwist();
      return;
    }
    /** Only the hand that pressed steers what it is doing. */
    if (press.down && event.pointerId !== press.id) return;
    pointer.aim(event);
    zone = locate();
    if (zone.zone === 'board') knife.manual = false;
    const moved = press.down ? Math.hypot(event.clientX - press.x, event.clientY - press.y) : 0;
    if (press.down && !press.drag && moved > (press.zone.zone === 'board' ? LIFT : press.touch ? DRAG_TOUCH : DRAG)) {
      if (press.zone.zone === 'board' && onPile(press.zone.point) && pickUp()) {
        press.drag = 'scrape';
        /** The pile stays where it is under the pointer, rather than jumping to it. */
        const p = pointer.at(CARRY);
        press.grab = p ? [carryAt.x - p.x, carryAt.z - p.z] : [0, 0];
      }
      else if (press.zone.zone === 'pan') press.drag = 'stir';
      else if (press.zone.zone === 'bowl') press.drag = 'whisk';
      else if (press.zone.zone === 'salt' || press.zone.zone === 'pepper') press.drag = 'season';
      else if (press.zone.zone === 'handle' && !toss) {
        press.drag = 'shake';
        shake.on = true;
        shake.from = pointer.at(PAN_Y + 1.5);
        shake.trail = [];
      } else press.drag = 'none';
    }
    if (press.drag === 'shake') {
      const p = pointer.at(PAN_Y + 1.5);
      if (p && shake.from) {
        shake.want.set(p.x - shake.from.x, 0, p.z - shake.from.z);
        if (shake.want.length() > 1.4) shake.want.setLength(1.4);
      }
      /** Timed by when the hand moved, not when this frame got to it: a hitch must not slow a flick down. */
      shake.trail.push({ y: event.clientY, t: event.timeStamp || performance.now() });
      if (shake.trail.length > 24) shake.trail.shift();
    }
    if (press.drag === 'scrape') {
      const p = pointer.at(CARRY);
      if (p) carryAt.set(p.x + press.grab[0], CARRY, p.z + press.grab[1]);
    } else if (press.drag === 'season') {
      /** The salt or the mill comes along in the hand, held up over the counter. */
      const p = pointer.at(4.5);
      const group = kitchen.props[press.zone.zone === 'salt' ? 'salt' : 'mill'].group;
      if (p) group.position.set(p.x, 3.2, p.z);
    } else if (press.drag === 'whisk') {
      const p = eggs.inBowl(pointer);
      if (p) eggs.beat(p);
    }
  }

  function onDown(event) {
    lastActivity = performance.now();
    if (event.pointerType === 'touch') fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.button === 2 || round.plated || !live) return;
    if (fingers.size >= 2) {
      if (!twist && fingers.size === 2) startTwist();
      return;
    }
    pointer.aim(event);
    zone = locate();
    press.down = true;
    press.id = event.pointerId;
    press.touch = event.pointerType === 'touch';
    press.x = event.clientX;
    press.y = event.clientY;
    press.zone = zone;
    press.drag = null;
    try {
      stage.setPointerCapture?.(event.pointerId);
    } catch {
      /** A pointer already gone by the time this runs: nothing to hold on to. */
    }
  }

  function onUp(event) {
    fingers.delete(event.pointerId);
    /** The twist is over when the fingers are all off: one left behind is not a tap. */
    if (twist) {
      if (fingers.size === 0) twist = null;
      return;
    }
    if (!press.down || event.pointerId !== press.id) return;
    pointer.aim(event);
    press.down = false;
    if (press.drag === 'scrape') letGo();
    else if (press.drag === 'season') {
      /** Salt or pepper carried over to the pan or the bowl and let go there. */
      const over = locate().zone;
      const target = over === 'bowl' ? 'bowl' : over === 'pan' || over === 'handle' ? 'pan' : null;
      if (target) season(press.zone.zone, target);
      const key = press.zone.zone === 'salt' ? 'salt' : 'mill';
      kitchen.props[key].group.position.set(LAYOUT[key].x, 0, LAYOUT[key].z);
    }
    else if (press.drag === 'whisk') eggs.stopBeating();
    else if (press.drag === 'shake') {
      /**
       * Let go with a flick upward and the pan throws what is in it. Only the
       * last moment of the drag counts: a slow shake and then a flick is a flick.
       */
      const now = event.timeStamp || performance.now();
      const t = shake.trail.filter((m) => now - m.t < 150);
      if (t.length >= 2) {
        const a = t[0], b = t[t.length - 1];
        const up = (a.y - b.y) / Math.max(16, b.t - a.t);
        if (up > 0.9) startToss(Math.min(1, 0.35 + (up - 0.9) * 0.35));
      }
      shake.on = false;
      shake.want.set(0, 0, 0);
    }
    else if (!press.drag) click(press.zone, event);
    press.drag = null;
    spatula.last = null;
  }

  /**
   * Aims the knife from the keys: the first time a slice in from the near end
   * of the pile, then `by` along it. Ready to come down at once.
   */
  function aimFromKeys(by = null) {
    const pile = board.bounds();
    if (!pile || carried.length) return false;
    if (by === null || !knife.manual) knife.z = pile.z1 - 0.62;
    else knife.z += by;
    knife.manual = true;
    knife.z = Math.max(pile.z0 - 0.4, Math.min(pile.z1 + 0.4, knife.z));
    knife.x = Math.min(BOARD.w / 2 + 1.5, Math.max(-BOARD.w / 2 + 6.1, (pile.x0 + pile.x1) / 2 + 3.8));
    if (knife.mode === 'rest') knife.mode = 'hover';
    return true;
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
      case 'pan':
        /** Over a fried egg, the spatula goes under it and turns it; anywhere else it flicks over what is there. */
        if (sheet.yolks.length && sheet.flipEgg(at.point[0], at.point[1])) break;
        if (pan.flip(at.point[0], at.point[1])) emit('flip');
        break;
      case 'knob': heat(pan.heat.level >= SETTINGS.length - 1 ? -(SETTINGS.length - 1) : 1); break;
      case 'oil': oil(); break;
      case 'salt': season('salt'); break;
      case 'pepper': season('pepper'); break;
      case 'butter': butter(); break;
      case 'carton': crackEgg(); break;
      case 'extra': addExtra(at.kind); break;
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

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
    if (event.key.toLowerCase() === 'w') eggs.stopBeating();
  }

  function onKey(event) {
    lastActivity = performance.now();
    if (!live || round.plated) return;
    const held = event.key.toLowerCase();
    if (held === 'w' || held === 'x') {
      keys.add(held);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      /** The knife, aimed from the keys: half a dice at a press, along the pile. */
      if (!board.bounds() || carried.length) return;
      event.preventDefault();
      if (!knife.manual) aimFromKeys();
      else aimFromKeys(event.key === 'ArrowUp' ? -0.31 : 0.31);
      return;
    }
    if (event.target && /^(input|textarea|select|button)$/i.test(event.target.tagName) && event.key === ' ') return;
    if (event.target && /^(input|textarea|select)$/i.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      startToss();
    } else if (key === 'r') turn();
    else if (key === 'c') {
      /** C chops where the keys have the knife — or, if they have not aimed it, a slice off the end. */
      if (zone.zone !== 'board' && !knife.manual) aimFromKeys();
      chop();
    }
    else if (key === 's') scrapeIntoPan();
    else if (key === 'o') oil();
    else if (key === 'b') butter();
    else if (key === 'a') season('salt');
    else if (key === 'f') season('pepper');
    else if (key === 'g') crackEgg();
    else if (key === 'l') fold();
    else if (FILLING_KINDS.some((k) => FILLINGS[k].key === key)) addExtra(FILLING_KINDS.find((k) => FILLINGS[k].key === key));
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
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  // ------------------------------------------------------------ the tools

  const knifeMesh = kitchen.knife.group;
  const smoothing = (dt, rate) => 1 - Math.exp(-dt * rate);

  function updateKnife(dt) {
    const pile = board.bounds();
    if (knife.mode !== 'chop' && knife.mode !== 'scrape') {
      knife.mode = (zone.zone === 'board' || knife.manual) && pile && !carried.length ? 'hover' : 'rest';
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

  /**
   * Where the spatula goes for the pointer at (x, z) on the pan's floor: the
   * blade's middle under the pointer, but pulled in so the whole blade is on
   * the floor rather than through the wall; and how far the handle has to be
   * tipped up for the neck and handle to clear the wall and the rim wherever
   * they cross it. `front` is the blade's front edge, in the pan's frame.
   */
  const SPATULA = Object.freeze({ yaw: 0.55, half: 1.55, side: 1.3, length: 9.2, heel: 3.1, rise: Math.tan(0.32) });
  function spatulaPose(x, z) {
    const { yaw, half, side } = SPATULA;
    const dx = Math.sin(yaw), dz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const reach = FLAT + 0.4;
    let cx = x, cz = z;
    for (let k = 0; k < 4; k++) {
      let worst = 0, wx = 0, wz = 0;
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          const px = cx + dx * half * a + sx * side * b, pz = cz + dz * half * a + sz * side * b;
          const r = Math.hypot(px, pz);
          if (r > worst) { worst = r; wx = px; wz = pz; }
        }
      }
      if (worst <= reach) break;
      cx -= (wx / worst) * (worst - reach) * 1.02;
      cz -= (wz / worst) * (worst - reach) * 1.02;
    }
    const fx = cx - dx * half, fz = cz - dz * half;
    const y0 = floorHeight(Math.min(COOK_RADIUS, Math.hypot(fx, fz))) + 0.03;
    /** Along the spatula, wherever it is over the pan's wall, it has to be above it with a little to spare. */
    let lift = 0;
    for (let s = SPATULA.heel; s <= SPATULA.length; s += 0.35) {
      const px = fx + dx * s, pz = fz + dz * s;
      const r = Math.hypot(px, pz);
      if (r > RIM_RADIUS + 0.3) break;
      const wall = r >= LIP_RADIUS ? RIM_HEIGHT : floorHeight(Math.min(r, LIP_RADIUS));
      const own = y0 + (s - SPATULA.heel) * SPATULA.rise;
      const need = wall + 0.3 - own;
      if (need > 0) lift = Math.max(lift, Math.asin(Math.min(0.95, need / s)));
    }
    return { front: [fx, y0, fz], lift };
  }

  function updateSpatula(dt) {
    spatula.work *= Math.exp(-dt * 8);
    /** Held X stirs on its own: the spatula sweeps figure-eights across the floor. */
    const auto = keys.has('x') && !carried.length && !round.plated;
    if (auto) {
      stirAngle += dt * 1.6;
      zone = { zone: 'pan', point: [Math.sin(stirAngle) * 3.4, Math.sin(stirAngle * 2) * 2.2] };
    }
    const over = zone.zone === 'pan' && !carried.length;
    if (over) {
      const [x, z] = zone.point;
      if (press.drag === 'stir' || auto) {
        if (spatula.last) {
          const n = pan.stir(spatula.last, [x, z], dt);
          const torn = sheet.empty ? 0 : sheet.stir(spatula.last, [x, z], 2.4, dt);
          if (n || torn) stats.stirs += dt;
          spatula.work = Math.min(1, Math.hypot(x - spatula.last[0], z - spatula.last[1]) / Math.max(dt, 1e-3) / 12);
        }
        spatula.last = [x, z];
      } else {
        spatula.last = null;
      }
      const { front, lift } = spatulaPose(x, z);
      const yaw = SPATULA.yaw;
      const target = new GFX.Vector3(panRig.position.x + front[0], panRig.position.y + front[1], panRig.position.z + front[2]);
      spatulaMesh.position.lerp(target, smoothing(dt, 22));
      spatulaMesh.rotation.y += (yaw - spatulaMesh.rotation.y) * smoothing(dt, 12);
      /** Handle up: a little always, and as much more as it takes to clear the rim. */
      const tilt = -(lift + (press.drag === 'stir' ? 0.04 : 0.1));
      spatulaMesh.rotation.x += (tilt - spatulaMesh.rotation.x) * smoothing(dt, 12);
    } else {
      const r = kitchen.spatula.rest;
      spatulaMesh.position.lerp(new GFX.Vector3(r.x, r.y, r.z), smoothing(dt, 10));
      spatulaMesh.rotation.y += (r.yaw - spatulaMesh.rotation.y) * smoothing(dt, 10);
      spatulaMesh.rotation.x += (r.pitch - spatulaMesh.rotation.x) * smoothing(dt, 10);
    }
  }

  /** Where the rig is being held: home, or pulled off it by the handle. */
  const held = new GFX.Vector3();

  function updateToss(dt) {
    shake.offset.lerp(shake.want, smoothing(dt, shake.on ? 18 : 7));
    held.copy(panHome).add(shake.offset);
    if (!toss) {
      panRig.position.lerp(held, smoothing(dt, 16));
      panRig.rotation.x *= 1 - smoothing(dt, 12);
      /** A held pan tips a little the way it is pushed. */
      const lean = Math.max(-0.07, Math.min(0.07, -shake.vel[0] * 0.012));
      panRig.rotation.z += (lean - panRig.rotation.z) * smoothing(dt, 10);
      return;
    }
    toss.t += dt;
    const k = toss.t / TOSS.time;
    /** A quick dip, the jerk up and back toward the cook, and down again. */
    const lift = k < 0.12 ? -0.12 * (k / 0.12) : Math.sin(Math.min(1, (k - 0.12) / 0.88) * Math.PI) * (0.55 + 0.5 * toss.strength);
    panRig.position.set(held.x, held.y + lift, held.z + Math.sin(Math.min(1, k) * Math.PI) * 0.35);
    panRig.rotation.x = Math.sin(Math.min(1, k) * Math.PI) * -0.12;
    if (!toss.thrown && toss.t >= TOSS.launch) {
      toss.thrown = true;
      /** Fried eggs go over whole, if they have set enough to hold; anything else in sheet breaks into folds. */
      if (!sheet.empty) {
        if (sheet.yolks.length) sheet.flipAll();
        else sheet.toss();
      }
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
    /** How the pan itself is being thrown about, for the food in it to lag behind. */
    if (dt > 0) {
      const p = [panRig.position.x, panRig.position.z];
      if (shake.last) {
        const v = [(p[0] - shake.last[0]) / dt, (p[1] - shake.last[1]) / dt];
        shake.acc = [(v[0] - shake.vel[0]) / dt, (v[1] - shake.vel[1]) / dt];
        shake.vel = v;
      }
      shake.last = p;
    }
    const shoving = Math.hypot(shake.acc[0], shake.acc[1]) > 2 && !toss;
    pan.update(dt, egg ? egg.liquid / 0.15 : 0, shoving ? [Math.max(-400, Math.min(400, shake.acc[0])), Math.max(-400, Math.min(400, shake.acc[1]))] : null);
    if (keys.has('w') && !round.plated) {
      whiskAngle += dt * 9;
      eggs.beat([Math.cos(whiskAngle) * 1.5, Math.sin(whiskAngle) * 1.5]);
    }
    if (egg) sheet.update(dt, pan.heat.temp);
    for (const e of sheet.events.splice(0)) {
      if (e.type === 'flip') startTurn(e.yolk);
      emit(`yolk-${e.type}`, { yolk: e.yolk });
    }
    updateTurning(dt);
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
    for (const p of pan.pieces) views.show(p, panRig, pan.state(p).lean);
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

    butterView.update(pan.butter, pan.oil, dt, time);
    grains.update(dt);
    updateHops(dt);
    /** Burnt butter in the pan with the food is in the food. */
    if (pan.butter.burnt && (pan.pieces.length > 0 || !sheet.empty)) round.burntButter = true;

    for (const e of pan.events.splice(0)) emit(e.type, e);
    if (elapsed - progressAt > 0.3) {
      progressAt = elapsed;
      measureProgress();
    }
  }

  newPotato();

  return {
    update, chop, turn, scrapeIntoPan, startToss, heat, oil, butter, season, newPotato, plateIt, reset, order, fold, addExtra, crackEgg,
    pourEggs: () => eggs.startPour(),
    board, pan, sheet, eggs, stats, views,
    get zone() { return zone; },
    get live() { return live; },
    get stirring() { return spatula.work; },
    set live(on) { live = Boolean(on); },
    get knife() { return knife; },
    get carrying() { return carried.length > 0; },
    get butterLeft() { return butterLeft; },
    get dish() { return dish; },
    /**
     * Whether nothing in the kitchen is moving or changing, and nobody has
     * touched anything for a moment: a cold, still kitchen, or the plate
     * served and sitting there. Then there is no need to draw it sixty times
     * a second.
     */
    get quiet() {
      if (performance.now() - lastActivity < 1500) return false;
      if (toss || plating || carried.length || knife.chop || eggs.pouring || eggs.cracking || shake.on || turning.length) return false;
      if (shake.offset.lengthSq() > 1e-4 || pan.airborne || !board.still()) return false;
      if (pan.heat.level > 0 || Object.values(hops).some((h) => h > 0)) return false;
      const cold = pan.heat.temp < 50;
      return cold || (pan.pieces.length === 0 && sheet.empty);
    },
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
