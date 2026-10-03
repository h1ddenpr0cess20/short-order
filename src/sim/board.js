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
 * Pieces rest on the board or on each other. A slice that falls over lands on
 * whatever it falls on, the way rounds shingle off the end of a potato, and
 * pieces lying side by side at the same height are kept from passing through
 * one another. That is the whole of the physics on the board: nothing here
 * slides or bounces, it only falls into place.
 */

import { axisAngle, multiply, rotate, slerp } from './quat.js';
import { cutPiece, extents } from './piece.js';

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

/** How fast a piece drops onto whatever is under it. */
const FALL = 9;

export function createBoard({ halfWidth = 7.2, halfDepth = 4.9 } = {}) {
  /** @type {any[]} */
  const pieces = [];
  /** Pieces in the middle of a move: falling over, or being turned with the rest. */
  const moves = new Map();
  let turning = null;
  let chops = 0;

  function add(piece) {
    pieces.push(piece);
    keepOn(piece);
    settle(piece, true);
    return piece;
  }

  function remove(piece) {
    const i = pieces.indexOf(piece);
    if (i !== -1) pieces.splice(i, 1);
    moves.delete(piece);
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

  function overlap(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const d = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return w > 0 && d > 0 ? w * d : 0;
  }

  /**
   * How high the board, or the pieces already on it, come up under `piece` —
   * only counting the ones that are lower than it, so two pieces can never both
   * be resting on each other. A piece that has just fallen over is coming down
   * from above, so it lands on top of anything it ends up across.
   */
  function support(piece, landing = false) {
    const me = box(piece);
    const area = (me.x1 - me.x0) * (me.z1 - me.z0);
    let top = 0;
    for (const other of pieces) {
      if (other === piece || moves.has(other)) continue;
      const them = box(other);
      if (!landing && them.y0 >= me.y0 - 1e-3 && !(them.y1 <= me.y0 + 1e-3)) continue;
      const shared = overlap(me, them);
      const smaller = Math.min(area, (them.x1 - them.x0) * (them.z1 - them.z0));
      if (shared > smaller * 0.18 && them.y1 > top) top = them.y1;
    }
    return top;
  }

  /** Puts a piece down on whatever is under it — at once, or by falling. */
  function settle(piece, now = false, landing = false) {
    const e = extents(piece);
    const rest = support(piece, landing) - e.min[1];
    if (now || rest > piece.pos[1]) piece.pos[1] = rest;
    piece.rest = rest;
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
   * other are pushed apart along whichever way is shorter.
   */
  function separate() {
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
      }
    }
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
          child.rest = piece.rest;
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
      else settle(piece);
    }
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
        for (const p of pieces) keepOn(p);
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
        moves.delete(piece);
        keepOn(piece);
        settle(piece, false, true);
      }
    }

    /** Everything at rest finds what it is lying on, and drops to it. */
    if (!turning) {
      const order = pieces.filter((p) => !moves.has(p)).sort((a, b) => box(a).y0 - box(b).y0);
      for (const p of order) {
        settle(p);
        if (p.pos[1] > p.rest) p.pos[1] = Math.max(p.rest, p.pos[1] - FALL * dt);
        else p.pos[1] = p.rest;
      }
      separate();
    }
  }

  /** Lifts everything off the board, for the scraper. */
  function takeAll() {
    const all = [...pieces];
    pieces.length = 0;
    moves.clear();
    turning = null;
    return all;
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
    return !turning && moves.size === 0 && pieces.every((p) => Math.abs(p.pos[1] - p.rest) < 1e-3);
  }

  /** Bare, as it started. */
  function clear() {
    pieces.length = 0;
    moves.clear();
    turning = null;
    chops = 0;
  }

  return {
    pieces, add, remove, chop, turn, update, takeAll, bounds, still, box, clear,
    get turning() { return Boolean(turning); },
    get chops() { return chops; },
    halfWidth, halfDepth,
  };
}

const ease = (t) => t * t * (3 - 2 * t);
