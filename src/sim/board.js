/**
 * What happens on the cutting board, in the board's own frame: its top is
 * y = 0, x runs left to right and z toward the cook.
 *
 * The knife only ever cuts across, in a plane z = constant, through whatever
 * lies under the length of its blade. Turning the pile a quarter turn is what
 * lets the next cuts go the other way. Between the two, a potato goes to dice
 * in three passes: rounds, which are too tall to stand and fall over flat;
 * strips, cut across the rounds; and, turned, cubes.
 *
 * Pieces rest on the board or on each other, where their undersides meet
 * what is under them (see pile.js). What the knife cuts stays where the knife
 * leaves it — a cut potato is starchy, and its rounds and strips stay put — and
 * a slice that falls over lands on whatever it falls on. What is put down
 * loose, though — a pile tipped out, shreds off the grater — slides off
 * whatever does not hold it up, so it slumps into a heap rather than standing
 * up in a tower. Pieces side by side at the same height are kept from passing
 * through one another.
 *
 * Where everything comes to rest is worked out once, whenever something on
 * the board changes — a cut, something put down or taken off, a turn, a
 * slice landing — from the bottom of the pile up; then each piece falls or
 * slides to its place and stays there. Nothing at rest is looked at again
 * until something changes, so nothing at rest ever moves.
 */

import { axisAngle, multiply, rotate, slerp } from './quat.js';
import { cutPiece, extents } from './piece.js';
import { Nearby, inEachOther, lieDown, restOn, settleIn } from './pile.js';

/** How far the blade pushes the two sides of a cut apart. */
const KERF = 0.05;

/**
 * A piece this much taller than it is thin will not stand on its cut face. Only
 * a real slice: a round falls flat, but a potato halved lengthwise, or with a
 * side taken off it, still stands where the knife left it.
 */
const TIPPY = 2.4;

/** How long a slice takes to fall over, and the pile to turn. */
const TOPPLE_TIME = 0.22;
const TURN_TIME = 0.32;

/** How fast a piece drops onto whatever is under it, and slides off what does not hold it up. */
const FALL = 9;
const SLIDE = 4;

export function createBoard({ halfWidth = 7.2, halfDepth = 4.9 } = {}) {
  /** @type {any[]} */
  const pieces = [];
  /** Pieces in the middle of a move: falling over, or being turned with the rest. */
  const moves = new Map();
  let turning = null;
  let chops = 0;
  /** Something has changed: where everything rests wants working out again. */
  let changed = false;

  /** Where a piece's middle may be when it slides: anywhere on the board. */
  const holds = (x, z) => Math.abs(x) < halfWidth - 0.3 && Math.abs(z) < halfDepth - 0.3;

  /** Put down at once where it is, on whatever is under it. */
  function add(piece) {
    keepOn(piece);
    piece.pos[1] = restOn(piece, pieces, { landing: true, skip: moving }).y;
    piece.target = [...piece.pos];
    pieces.push(piece);
    changed = true;
    return piece;
  }

  /**
   * Sets a pile down: `list`, each piece where it lay in the pile, the lowest
   * first. Each comes down onto whatever it ends up over — what was on the
   * board already, and the pieces of the pile under it — and then, unless
   * `slump` is false, does what a pile put down does: whatever is not held up
   * slides off, whatever is on a slope steeper than a heap stands runs down
   * it, and each lies along what it is on. So a pile set down is a heap,
   * never a tower, however it was held. `settled`, it has been poured into
   * its place already, and nothing else need move for it.
   */
  function lay(list, { slump = true, settled = false } = {}) {
    const low = new Map(list.map((p) => [p, box(p).y0]));
    for (const piece of [...list].sort((a, b) => low.get(a) - low.get(b))) {
      keepOn(piece);
      const others = pieces.filter((p) => !moves.has(p));
      if (slump) {
        settleIn(piece, others, { holds });
        lieDown(piece, others);
        keepOn(piece);
      }
      piece.pos[1] = restOn(piece, others, { landing: true }).y;
      piece.target = [...piece.pos];
      /** Put down loose: until the knife goes through it, it slides off what does not hold it up. */
      piece.loose = true;
      pieces.push(piece);
    }
    /** Already settled where it lies — poured onto the pile — it changes nothing under it. */
    if (!settled) changed = true;
    return list;
  }

  function remove(piece) {
    const i = pieces.indexOf(piece);
    if (i !== -1) pieces.splice(i, 1);
    moves.delete(piece);
    changed = true;
  }

  /** The footprint and heights of a piece as it stands. */
  function box(piece) {
    const e = extents(piece);
    return {
      x0: piece.pos[0] + e.min[0], x1: piece.pos[0] + e.max[0],
      y0: piece.pos[1] + e.min[1], y1: piece.pos[1] + e.max[1],
      z0: piece.pos[2] + e.min[2], z1: piece.pos[2] + e.max[2],
    };
  }

  const moving = (p) => moves.has(p);

  /**
   * Where everything comes to rest, worked out from the bottom of the pile up
   * on where everything is going to: what is side by side and in each other
   * is pushed apart, then each piece comes down onto the board or onto the
   * pieces already settled under it, and slides off any that does not hold
   * it up. Each is left where it is now, to fall or slide to its place.
   */
  function resolve() {
    changed = false;
    const shown = new Map(pieces.map((p) => [p, [...p.pos]]));
    for (const p of pieces) if (p.target) p.pos = [...p.target];
    /** Down into place; then what has ended up side by side in each other pushed apart, and down again, till nothing is. */
    settleAll();
    for (let k = 0; k < 12 && separate(); k++) settleAll();
    for (const p of pieces) {
      p.target = [...p.pos];
      const [x, y, z] = shown.get(p);
      /** Never shown inside what it is now on: if its place is higher than it is, it is there at once. */
      p.pos = [x, Math.max(y, p.target[1]), z];
    }
  }

  /**
   * Every piece onto what is under it, from the bottom of the pile up; and
   * last of all whatever has just fallen over, which comes down from above
   * onto all of it.
   */
  function settleAll() {
    const settled = new Nearby();
    const order = [...pieces].sort((a, b) => (a.landed ? 1 : 0) - (b.landed ? 1 : 0) || box(a).y0 - box(b).y0);
    for (const p of order) {
      keepOn(p);
      if (!p.loose) {
        /** Knife work: straight down onto what it is over, as it always was. */
        p.pos[1] = cutRest(p, settled.around(p), p.landed);
        p.landed = false;
        settled.add(p);
        continue;
      }
      const r = restOn(p, settled.around(p), { landing: true });
      p.pos[1] = r.y;
      if (!r.held) {
        settleIn(p, settled, { holds, slump: false });
        keepOn(p);
        p.pos[1] = restOn(p, settled.around(p), { landing: true }).y;
      }
      settled.add(p);
    }
  }

  /**
   * Where a piece of knife work rests: on the board, or on the highest of the
   * pieces under it that it is well across — a good part of the smaller of
   * the two — and that are lower than it, so two pieces can never both be
   * resting on each other. One that has just fallen over is coming down from
   * above, so it lands on top of anything it ends up across.
   */
  function cutRest(piece, under, landing) {
    const me = box(piece), e = extents(piece);
    const area = (me.x1 - me.x0) * (me.z1 - me.z0);
    let top = 0;
    for (const other of under) {
      const them = box(other);
      if (!landing && them.y0 >= me.y0 - 1e-3 && !(them.y1 <= me.y0 + 1e-3)) continue;
      const w = Math.min(me.x1, them.x1) - Math.max(me.x0, them.x0);
      const d = Math.min(me.z1, them.z1) - Math.max(me.z0, them.z0);
      const shared = w > 0 && d > 0 ? w * d : 0;
      const smaller = Math.min(area, (them.x1 - them.x0) * (them.z1 - them.z0));
      if (shared > smaller * 0.18 && them.y1 > top) top = them.y1;
    }
    return top - e.min[1];
  }

  /** Each piece a step on toward its place: sliding across, falling down. */
  function toPlaces(dt) {
    for (const p of pieces) {
      if (!p.target || moves.has(p)) continue;
      const [tx, ty, tz] = p.target;
      const dx = tx - p.pos[0], dz = tz - p.pos[2], d = Math.hypot(dx, dz), step = SLIDE * dt;
      if (d <= step) {
        p.pos[0] = tx;
        p.pos[2] = tz;
      } else {
        p.pos[0] += (dx / d) * step;
        p.pos[2] += (dz / d) * step;
      }
      p.pos[1] = p.pos[1] < ty ? ty : Math.max(ty, p.pos[1] - FALL * dt);
    }
  }

  /** Keeps every piece's footprint on the board. */
  function keepOn(piece) {
    const e = extents(piece);
    const x0 = -halfWidth - e.min[0], x1 = halfWidth - e.max[0];
    const z0 = -halfDepth - e.min[2], z1 = halfDepth - e.max[2];
    piece.pos[0] = x0 > x1 ? 0 : Math.min(x1, Math.max(x0, piece.pos[0]));
    piece.pos[2] = z0 > z1 ? 0 : Math.min(z1, Math.max(z0, piece.pos[2]));
  }

  /**
   * Two pieces side by side at the same height that have ended up in each
   * other are pushed apart along whichever way is shorter. Whether any were.
   */
  function separate() {
    let pushed = false;
    const boxes = pieces.map(box);
    for (let i = 0; i < pieces.length; i++) {
      if (moves.has(pieces[i])) continue;
      for (let j = i + 1; j < pieces.length; j++) {
        if (moves.has(pieces[j])) continue;
        const a = boxes[i], b = boxes[j];
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (h < Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.5) continue;
        const px = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const pz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (px <= 0.002 || pz <= 0.002) continue;
        const P = pieces[i], Q = pieces[j];
        /** Their boxes cross; tumbled loose, they themselves may not, the way two dice lie close in a heap. */
        if ((P.loose || Q.loose) && !inEachOther(P, Q)) continue;
        if (px < pz) {
          const s = (a.x0 + a.x1 < b.x0 + b.x1 ? -1 : 1) * (px / 2 + 0.002);
          P.pos[0] += s;
          Q.pos[0] -= s;
        } else {
          const s = (a.z0 + a.z1 < b.z0 + b.z1 ? -1 : 1) * (pz / 2 + 0.002);
          P.pos[2] += s;
          Q.pos[2] -= s;
        }
        keepOn(P);
        keepOn(Q);
        boxes[i] = box(P);
        boxes[j] = box(Q);
        pushed = true;
      }
    }
    return pushed;
  }

  /**
   * One stroke of the knife at `z`, along the blade from `x0` to `x1`. Every
   * piece the blade passes through is cut in two and the halves pushed apart;
   * any that are now too thin to stand fall away from the cut. Returns how many
   * pieces were cut.
   */
  function chop({ z, x0 = -Infinity, x1 = Infinity, flesh }) {
    /** Not mid-turn: the pieces it would leave would be left out of the turn. */
    if (turning) return 0;
    let cut = 0;
    const created = [];
    for (const piece of [...pieces]) {
      if (moves.has(piece)) continue;
      const b = box(piece);
      if (b.z0 >= z || b.z1 <= z || b.x1 <= x0 || b.x0 >= x1) continue;
      const halves = cutPiece(piece, [0, 0, 1], z, flesh[piece.kind]);
      if (!halves) continue;
      remove(piece);
      cut += 1;
      for (const [list, dir] of [[halves.front, 1], [halves.back, -1]]) {
        for (const child of list) {
          child.pos[2] += dir * KERF;
          child.target = null;
          pieces.push(child);
          created.push({ piece: child, dir });
        }
      }
    }
    if (cut) chops += 1;
    for (const { piece, dir } of created) {
      const e = extents(piece);
      const width = e.max[0] - e.min[0], tall = e.max[1] - e.min[1], deep = e.max[2] - e.min[2];
      if (tall > TIPPY * Math.min(width, deep) && tall > 0.4) topple(piece, deep <= width ? 'z' : 'x', dir);
    }
    if (cut) changed = true;
    return cut;
  }

  /**
   * Tips a piece over a quarter turn onto the side it is falling to, about the
   * edge it is standing on. `way` is which axis it falls along, `dir` which end.
   */
  function topple(piece, way, dir) {
    const e = extents(piece);
    const axis = way === 'z' ? [1, 0, 0] : [0, 0, -1];
    const turn = axisAngle(axis, (Math.PI / 2) * dir);
    const pivot = [
      piece.pos[0] + (way === 'x' ? (dir > 0 ? e.max[0] : e.min[0]) : 0),
      piece.pos[1] + e.min[1],
      piece.pos[2] + (way === 'z' ? (dir > 0 ? e.max[2] : e.min[2]) : 0),
    ];
    const arm = [piece.pos[0] - pivot[0], piece.pos[1] - pivot[1], piece.pos[2] - pivot[2]];
    const swung = rotate(turn, arm);
    const to = { pos: [pivot[0] + swung[0], pivot[1] + swung[1], pivot[2] + swung[2]], rot: multiply(turn, piece.rot) };
    moves.set(piece, { from: { pos: [...piece.pos], rot: [...piece.rot] }, to, pivot, axis, dir, t: 0, time: TOPPLE_TIME, kind: 'topple' });
  }

  /** A quarter turn of everything on the board, about the middle of the pile. */
  function turn(dir = 1) {
    if (turning || pieces.length === 0) return false;
    const all = pieces.map(box);
    const cx = (Math.min(...all.map((b) => b.x0)) + Math.max(...all.map((b) => b.x1))) / 2;
    const cz = (Math.min(...all.map((b) => b.z0)) + Math.max(...all.map((b) => b.z1))) / 2;
    /** From where everything is going to, so nothing is left behind half fallen. */
    for (const p of pieces) if (p.target) p.pos = [...p.target];
    turning = {
      t: 0, dir, centre: [cx, 0, cz],
      start: pieces.map((p) => ({ piece: p, pos: [...p.pos], rot: [...p.rot] })),
    };
    return true;
  }

  function update(dt) {
    if (turning) {
      turning.t = Math.min(1, turning.t + dt / TURN_TIME);
      const k = ease(turning.t);
      const q = axisAngle([0, 1, 0], (Math.PI / 2) * turning.dir * k);
      for (const { piece, pos, rot } of turning.start) {
        if (!pieces.includes(piece)) continue;
        const arm = rotate(q, [pos[0] - turning.centre[0], 0, pos[2] - turning.centre[2]]);
        piece.pos[0] = turning.centre[0] + arm[0];
        piece.pos[2] = turning.centre[2] + arm[2];
        piece.rot = multiply(q, rot);
        piece.version += 1;
      }
      if (turning.t >= 1) {
        turning = null;
        for (const p of pieces) {
          keepOn(p);
          p.target = null;
        }
        changed = true;
      }
    }

    for (const [piece, m] of moves) {
      m.t = Math.min(1, m.t + dt / m.time);
      const k = m.t * m.t;
      const q = axisAngle(m.axis, (Math.PI / 2) * m.dir * k);
      const arm = rotate(q, [m.from.pos[0] - m.pivot[0], m.from.pos[1] - m.pivot[1], m.from.pos[2] - m.pivot[2]]);
      piece.pos = [m.pivot[0] + arm[0], m.pivot[1] + arm[1], m.pivot[2] + arm[2]];
      piece.rot = slerp(m.from.rot, m.to.rot, k);
      if (m.t >= 1) {
        piece.pos = m.to.pos;
        piece.rot = m.to.rot;
        piece.target = null;
        piece.landed = true;
        moves.delete(piece);
        keepOn(piece);
        changed = true;
      }
    }

    /** Once nothing is mid-turn or falling over, anything changed is worked out; then everything goes to its place. */
    if (!turning && moves.size === 0 && changed) resolve();
    if (!turning) toPlaces(dt);
  }

  /**
   * Rolls one piece a quarter turn over onto its side, about the edge nearest
   * the cook — its top comes to face the cook — so the knife, which only ever
   * cuts straight down, can go through it the third way. `dir` −1 rolls it
   * away instead. Not while it, or the pile, is moving.
   */
  function roll(piece, dir = 1) {
    if (turning || moves.has(piece) || !pieces.includes(piece)) return false;
    topple(piece, 'z', dir);
    return true;
  }

  /** Lifts everything off the board, for the scraper. */
  function takeAll() {
    const all = [...pieces];
    pieces.length = 0;
    moves.clear();
    turning = null;
    changed = false;
    return all;
  }

  /** Lifts just these pieces off the board; whatever was lying on them drops down. */
  function take(list) {
    if (turning) return [];
    const out = list.filter((p) => pieces.includes(p));
    for (const p of out) remove(p);
    return out;
  }

  /** The piece at (x, z) on the board, the one on top where several are: or the nearest, within `reach`; or null. */
  function pieceAt(x, z, reach = 0.35) {
    let best = null, top = -Infinity, near = reach;
    for (const p of pieces) {
      const b = box(p);
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
        if (b.y1 > top) {
          top = b.y1;
          best = p;
        }
        continue;
      }
      if (top > -Infinity) continue;
      const d = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
      if (d < near) {
        near = d;
        best = p;
      }
    }
    return best;
  }

  /** The box round everything on the board, or null if it is bare. */
  function bounds() {
    if (pieces.length === 0) return null;
    const all = pieces.map(box);
    return {
      x0: Math.min(...all.map((b) => b.x0)), x1: Math.max(...all.map((b) => b.x1)),
      y0: 0, y1: Math.max(...all.map((b) => b.y1)),
      z0: Math.min(...all.map((b) => b.z0)), z1: Math.max(...all.map((b) => b.z1)),
    };
  }

  /** Whether everything has finished falling and turning. */
  function still() {
    return !turning && moves.size === 0 && !changed
      && pieces.every((p) => p.target && Math.abs(p.pos[0] - p.target[0]) < 1e-3 && Math.abs(p.pos[1] - p.target[1]) < 1e-3 && Math.abs(p.pos[2] - p.target[2]) < 1e-3);
  }

  /** Bare, as it started. */
  function clear() {
    pieces.length = 0;
    moves.clear();
    turning = null;
    chops = 0;
  }

  return {
    pieces, add, lay, remove, chop, turn, roll, update, takeAll, take, pieceAt, bounds, still, box, clear,
    get turning() { return Boolean(turning); },
    get chops() { return chops; },
    halfWidth, halfDepth,
  };
}

const ease = (t) => t * t * (3 - 2 * t);
