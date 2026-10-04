/**
 * How food lies on food: on the board, in a ramekin, on a plate.
 *
 * A piece is drawn on a fine grid as seen from above: in each little column
 * it covers, where its underside is and where its top is. A piece comes to
 * rest when its underside touches whatever is under it in any one of those
 * columns — the floor of the dish, or the top of another piece — so a dice
 * sits down into the gap between two others, a slice lies across them, and
 * nothing is ever inside anything else.
 *
 * And it only stays where it is held: a piece whose middle is not over what
 * it is touching slides off it, downhill, and a heap too steep to hold itself
 * up slumps until it is not. So food dropped in one place comes out a pile,
 * the way it does, never a tower.
 */

import { dimensions, extents, sideDown, SIDES } from './piece.js';
import { axisAngle, multiply, rotate } from './quat.js';

/** The grid's columns are this wide. */
export const CELL = 0.08;

/** How steep a heap stands before what is on it slides: rise over run, about 35°. */
export const REPOSE = 0.7;

/** Touching, to within this much. */
const TOUCH = 0.02;

/** A flat floor at y = 0: the board. */
export const FLAT = () => 0;

/**
 * The piece as seen from above, in the frame it is in: every column it
 * covers, with its underside and its top there, measured from `pos[1]`.
 * Column `m` is (I[m] + di, J[m] + dj); `cell(p, i, j)` finds a column.
 * Cached until it turns; moved across by whole columns, it is only moved.
 */
export function profile(piece) {
  const r = piece.rot, x = piece.pos[0], z = piece.pos[2];
  const c = piece.profile;
  if (c && c.version === piece.version && c.solid === piece.solid
    && c.r[0] === r[0] && c.r[1] === r[1] && c.r[2] === r[2] && c.r[3] === r[3]) {
    if (c.x === x && c.z === z) return c;
    const si = (x - c.x0) / CELL, sj = (z - c.z0) / CELL;
    if (Math.abs(si - Math.round(si)) < 1e-6 && Math.abs(sj - Math.round(sj)) < 1e-6) {
      c.x = x;
      c.z = z;
      c.di = Math.round(si);
      c.dj = Math.round(sj);
      return c;
    }
  }
  const p = piece.solid.pos, n = p.length / 3;
  const [qx, qy, qz, qw] = r;
  const wx = new Float64Array(n), wy = new Float64Array(n), wz = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const vx = p[v * 3], vy = p[v * 3 + 1], vz = p[v * 3 + 2];
    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    wx[v] = x + vx + qw * tx + (qy * tz - qz * ty);
    wy[v] = vy + qw * ty + (qz * tx - qx * tz);
    wz[v] = z + vz + qw * tz + (qx * ty - qy * tx);
  }
  const at = new Map(), I = [], J = [], lo = [], hi = [];
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (let t = 0; t < n; t += 3) {
    const ax = wx[t], az = wz[t], bx = wx[t + 1], bz = wz[t + 1], cx = wx[t + 2], cz = wz[t + 2];
    const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    /** Edge on from above: a side, which the faces round it already cover. */
    if (Math.abs(d) < 1e-12) continue;
    const i0 = Math.ceil(Math.min(ax, bx, cx) / CELL - 0.5), i1 = Math.floor(Math.max(ax, bx, cx) / CELL - 0.5);
    const j0 = Math.ceil(Math.min(az, bz, cz) / CELL - 0.5), j1 = Math.floor(Math.max(az, bz, cz) / CELL - 0.5);
    for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5) * CELL;
      for (let j = j0; j <= j1; j++) {
        const pz = (j + 0.5) * CELL;
        const u = ((px - ax) * (cz - az) - (cx - ax) * (pz - az)) / d;
        const w = ((bx - ax) * (pz - az) - (px - ax) * (bz - az)) / d;
        if (u < -1e-9 || w < -1e-9 || u + w > 1 + 1e-9) continue;
        const y = wy[t] + u * (wy[t + 1] - wy[t]) + w * (wy[t + 2] - wy[t]);
        const k = key(i, j);
        const m = at.get(k);
        if (m === undefined) {
          at.set(k, I.length);
          I.push(i);
          J.push(j);
          lo.push(y);
          hi.push(y);
        } else {
          if (y < lo[m]) lo[m] = y;
          if (y > hi[m]) hi[m] = y;
        }
      }
    }
  }
  /** Too small to cover the middle of any column: the one it is in, as high as it is. */
  if (I.length === 0) {
    const e = extents(piece);
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    I.push(i);
    J.push(j);
    lo.push(e.min[1]);
    hi.push(e.max[1]);
  }
  /**
   * A soft strand — a shred of potato or cheese — gives under what lands on
   * it: strands drape and tangle into one another rather than stacking like
   * sticks, so what lies on one sinks most of the way into it. Its own
   * underside is where it is.
   */
  if (piece.shred) for (let m = 0; m < hi.length; m++) hi[m] = lo[m] + (hi[m] - lo[m]) * 0.2;

  /** The columns again as a little table over the box round them, for finding one quickly. */
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (let m = 0; m < I.length; m++) {
    i0 = Math.min(i0, I[m]);
    i1 = Math.max(i1, I[m]);
    j0 = Math.min(j0, J[m]);
    j1 = Math.max(j1, J[m]);
  }
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const table = new Int32Array(w * h).fill(-1);
  for (let m = 0; m < I.length; m++) table[(I[m] - i0) * h + (J[m] - j0)] = m;
  piece.profile = {
    version: piece.version, solid: piece.solid, x, z, x0: x, z0: z, di: 0, dj: 0, r: [...r], I, J, lo, hi,
    i0, j0, w, h, table, thick: extents(piece).max[1] - extents(piece).min[1],
  };
  return piece.profile;
}

/** Which of profile `p`'s columns is column (i, j), or −1 if it does not cover it. */
function cell(p, i, j) {
  const ii = i - p.di - p.i0, jj = j - p.dj - p.j0;
  return ii < 0 || jj < 0 || ii >= p.w || jj >= p.h ? -1 : p.table[ii * p.h + jj];
}

/**
 * Where `piece` would come to rest, straight down from where it is, on
 * `base` (the floor, as a height at a point) and on `others`. Only the
 * others under it count: those `under` says, or, coming down from above
 * (`landing`), all of them; or else the ones that are lower than it where
 * the two overlap, by more than a little — two pieces side by side, level,
 * hold each other up no more than two dice do.
 *
 * Gives the height to put `pos[1]` at; whether it is held there — its middle
 * over what it is touching, or nothing but the floor under it where the
 * floor is level enough — and, if not, which way it slides off; and how high
 * what is under it comes in each column, for laying it along a slope.
 */
export function restOn(piece, others, { base = FLAT, under = null, landing = false, skip = null } = {}) {
  const a = profile(piece), n = a.I.length, ay = piece.pos[1];
  const top = new Float64Array(n), floor = new Uint8Array(n).fill(1), ks = new Int32Array(n);
  const ai = new Int32Array(n), aj = new Int32Array(n);
  for (let m = 0; m < n; m++) {
    ai[m] = a.I[m] + a.di;
    aj[m] = a.J[m] + a.dj;
    top[m] = base((ai[m] + 0.5) * CELL, (aj[m] + 0.5) * CELL);
  }
  const ea = extents(piece);
  const x0 = piece.pos[0] + ea.min[0], x1 = piece.pos[0] + ea.max[0], z0 = piece.pos[2] + ea.min[2], z1 = piece.pos[2] + ea.max[2];
  for (const other of others) {
    if (other === piece || skip?.(other)) continue;
    const eb = extents(other), ox = other.pos[0], oz = other.pos[2];
    if (ox + eb.max[0] <= x0 || ox + eb.min[0] >= x1 || oz + eb.max[2] <= z0 || oz + eb.min[2] >= z1) continue;
    const b = profile(other), by = other.pos[1];
    let lift = 0, shared = 0;
    for (let m = 0; m < n; m++) {
      const k = (ks[m] = cell(b, ai[m], aj[m]));
      if (k < 0) continue;
      lift += by + (b.lo[k] + b.hi[k]) / 2 - (ay + (a.lo[m] + a.hi[m]) / 2);
      shared += 1;
    }
    if (shared === 0) continue;
    /** Lower than it, on average where the two overlap, by a good part of the thinner of them. */
    const below = under ? under(other) : landing || lift / shared < -0.3 * Math.min(a.thick, b.thick);
    if (!below) continue;
    for (let m = 0; m < n; m++) {
      const k = ks[m];
      if (k < 0) continue;
      const y = by + b.hi[k];
      if (y > top[m]) {
        top[m] = y;
        floor[m] = 0;
      }
    }
  }
  /** Never with its very lowest point below the lowest of the floor under it: the columns can miss a corner between them. */
  let y = -Infinity, low = Infinity, floorY = -Infinity;
  for (let m = 0; m < n; m++) {
    y = Math.max(y, top[m] - a.lo[m]);
    const b = base((ai[m] + 0.5) * CELL, (aj[m] + 0.5) * CELL);
    low = Math.min(low, b);
    floorY = Math.max(floorY, b - a.lo[m]);
  }
  if (piece.shred && n > 4) {
    /**
     * A shred is limp: it drapes over what is under it, sagging between the
     * high points rather than bridging them, so it lies at the height most of
     * it is held up at — never into the floor.
     */
    const needs = Array.from({ length: n }, (_, m) => top[m] - a.lo[m]).sort((p, q) => p - q);
    y = Math.max(floorY, needs[Math.floor(n * 0.6)]);
  }
  y = Math.max(y, low - ea.min[1]);

  /** What it is touching: where its underside is down on what is under it. */
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, si = 0, sj = 0, count = 0, onFloor = true, floorAt = 0;
  for (let m = 0; m < n; m++) {
    if (top[m] - a.lo[m] < y - TOUCH) continue;
    floorAt += top[m];
    i0 = Math.min(i0, ai[m]);
    i1 = Math.max(i1, ai[m]);
    j0 = Math.min(j0, aj[m]);
    j1 = Math.max(j1, aj[m]);
    si += ai[m];
    sj += aj[m];
    count += 1;
    if (!floor[m]) onFloor = false;
  }
  const ci = piece.pos[0] / CELL - 0.5, cj = piece.pos[2] / CELL - 0.5;
  let held = count > 0 && ci >= i0 - 1 && ci <= i1 + 1 && cj >= j0 - 1 && cj <= j1 + 1;
  let away = count > 0 ? [ci - si / count, cj - sj / count] : [0, 0];
  if (count === 0) held = true;
  else if (onFloor) {
    /**
     * On nothing but the floor: held where the floor under its middle is
     * level enough and is what it is down on — a round piece on the board,
     * touching it off its middle, stays put; one propped up on the side of a
     * dish does not.
     */
    const h = 0.2, x = piece.pos[0], z = piece.pos[2];
    const gx = (base(x + h, z) - base(x - h, z)) / (2 * h), gz = (base(x, z + h) - base(x, z - h)) / (2 * h);
    held = Math.hypot(gx, gz) <= REPOSE && Math.abs(floorAt / count - base(x, z)) < 0.1;
    if (!held && Math.hypot(gx, gz) > REPOSE) away = [-gx, -gz];
  }
  const l = Math.hypot(away[0], away[1]) || 1;
  return { y, held, away: [away[0] / l, away[1] / l], top, ai, aj };
}

/**
 * Pieces sorted into squares of the counter, by where they lie, so that what
 * might be under a piece is found among those near it, not all of them.
 */
export class Nearby {
  constructor(pieces = []) {
    this.squares = new Map();
    for (const p of pieces) this.add(p);
  }

  static SIZE = 1.2;

  /** The squares the box round a piece covers, widened by `pad`. */
  static *cover(piece, pad = 0) {
    const e = extents(piece), S = Nearby.SIZE;
    const i0 = Math.floor((piece.pos[0] + e.min[0] - pad) / S), i1 = Math.floor((piece.pos[0] + e.max[0] + pad) / S);
    const j0 = Math.floor((piece.pos[2] + e.min[2] - pad) / S), j1 = Math.floor((piece.pos[2] + e.max[2] + pad) / S);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) yield i * 100003 + j;
  }

  add(piece) {
    for (const k of Nearby.cover(piece)) {
      let list = this.squares.get(k);
      if (!list) this.squares.set(k, (list = []));
      list.push(piece);
    }
  }

  /** Everything whose squares meet the ones `piece` covers where it is now. */
  around(piece) {
    const out = new Set();
    for (const k of Nearby.cover(piece)) for (const p of this.squares.get(k) ?? []) out.add(p);
    return out;
  }
}

/** The turn that takes direction `a` onto direction `b`, both unit. */
function turnOnto(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) return axisAngle(Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], Math.PI);
  const axis = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const l = Math.hypot(...axis);
  return axisAngle([axis[0] / l, axis[1] / l, axis[2] / l], Math.acos(d));
}

/**
 * Turned to lie on whichever of its faces is nearest to down, keeping which
 * way it faces: the way anything put down on a level surface ends up.
 */
export function flatten(piece) {
  const down = rotate(piece.rot, SIDES[sideDown(piece)]);
  piece.rot = multiply(turnOnto(down, [0, -1, 0]), piece.rot);
  piece.version += 1;
}

/**
 * Tumbled, the way a piece lands after a fall: on one of the faces it could
 * lie on — any face of a dice, either face of a slice, never a shred on its
 * end — turned any way round.
 */
export function tumble(piece, random = Math.random) {
  const d = dimensions(piece), least = Math.min(...d);
  const faces = [0, 1, 2].filter((k) => d[k] <= least * 1.6);
  const k = faces[Math.floor(random() * faces.length) % faces.length];
  const side = [0, 0, 0];
  side[k] = random() < 0.5 ? 1 : -1;
  const yaw = axisAngle([0, 1, 0], random() * Math.PI * 2);
  piece.rot = multiply(yaw, turnOnto(side, [0, -1, 0]));
  piece.version += 1;
}

/** Laid along the slope of what is under it, as found by `restOn`, no steeper than a heap stands. */
function alongSlope(piece, rest) {
  const { top, ai, aj } = rest;
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (let m = 0; m < ai.length; m++) {
    const x = (ai[m] + 0.5) * CELL - piece.pos[0], z = (aj[m] + 0.5) * CELL - piece.pos[2], y = top[m];
    n += 1;
    sx += x;
    sz += z;
    sy += y;
    sxx += x * x;
    szz += z * z;
    sxz += x * z;
    sxy += x * y;
    szy += z * y;
  }
  if (n < 4) return;
  /** Least squares: y = a + gx·x + gz·z, about the middle of the piece. */
  const mx = sx / n, mz = sz / n, my = sy / n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
  const cxy = sxy / n - mx * my, czy = szy / n - mz * my;
  const det = cxx * czz - cxz * cxz;
  if (Math.abs(det) < 1e-9) return;
  const clamp = (g) => Math.max(-REPOSE, Math.min(REPOSE, g));
  const gx = clamp((cxy * czz - czy * cxz) / det), gz = clamp((czy * cxx - cxy * cxz) / det);
  /** Up the slope by `gx` along x, `gz` along z: the normal of that plane, and the turn onto it. */
  const l = Math.hypot(gx, 1, gz);
  piece.rot = multiply(turnOnto([0, 1, 0], [-gx / l, 1 / l, -gz / l]), piece.rot);
  piece.version += 1;
}

/** A normal deviate, for where a pour lands round its middle. */
function gauss(random) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/**
 * Lets `piece` find its place from where it is, on the floor (`base`) and on
 * `placed`, coming down onto them: it slides off whatever does not hold it
 * up, runs down any slope steeper than a heap stands — off the top of a
 * column, down the side of a mound — and rattles down into any hollow close
 * by, the way poured dice pack; so long as its middle stays where `holds`
 * allows. Not `slump`, it only slides off what it hangs from. Leaves it
 * resting there, and gives what it is resting on.
 */
export function settleIn(piece, placed, { base = FLAT, holds = () => true, slump = true } = {}) {
  /**
   * Long thin strips — grated cheese, shredded potato — catch on each other
   * and stand in a fluffy heap, steeper, and do not rattle down into gaps.
   */
  const [short, mid, long] = dimensions(piece).sort((a, b) => a - b);
  const strands = long > mid * 2.5 && long > short * 3;
  const repose = strands ? 0.95 : REPOSE;
  const index = placed instanceof Nearby ? placed : new Nearby(placed);
  const at = (x, z) => {
    piece.pos[0] = x;
    piece.pos[2] = z;
    return restOn(piece, index.around(piece), { base, landing: true });
  };
  const size = Math.max(...dimensions(piece));
  const step = Math.max(CELL * 2, size * 0.35);
  /** How far it rattles about to find a hollow: no more than about its own size. */
  const near = strands ? 0 : size * 0.75;
  /** Moves are by whole columns, so it is only ever moved, not drawn again. */
  const snap = (v) => Math.round(v / CELL) * CELL;
  /** From (x, z): off whatever it is hanging from, never climbing, until something holds it. */
  const slide = (x, z, r) => {
    for (let k = 0; k < 40 && !r.held && (r.away[0] || r.away[1]); k++) {
      let ox = snap(r.away[0] * step * 0.5), oz = snap(r.away[1] * step * 0.5);
      if (!ox && !oz) Math.abs(r.away[0]) > Math.abs(r.away[1]) ? (ox = Math.sign(r.away[0]) * CELL) : (oz = Math.sign(r.away[1]) * CELL);
      const nx = x + ox, nz = z + oz;
      if (!holds(nx, nz)) break;
      const q = at(nx, nz);
      if (q.y > r.y + 1e-3) break;
      x = nx;
      z = nz;
      r = q;
    }
    return { x, z, r };
  };
  let here = slide(piece.pos[0], piece.pos[2], at(piece.pos[0], piece.pos[2]));
  for (let moves = 0; slump && moves < 60; moves++) {
    let best = null, most = 0;
    /** Close by, for hollows; and a couple of its own sizes off, for the lie of the heap as a whole, not just the lump it is on. */
    for (const reach of strands ? [step, size * 1.2] : [step * 0.5, step, step * 2.5, size * 2]) {
      for (let k = 0; k < 8; k++) {
        const a = ((k + (reach === step ? 0.5 : 0)) / 8) * Math.PI * 2, nx = here.x + snap(Math.cos(a) * reach), nz = here.z + snap(Math.sin(a) * reach);
        if (nx === here.x && nz === here.z) continue;
        if (!holds(nx, nz)) continue;
        const there = slide(nx, nz, at(nx, nz));
        const drop = here.r.y - there.r.y, run = Math.hypot(there.x - here.x, there.z - here.z);
        /** Steeper than a heap stands, there, or a hollow right by it: it goes. */
        if ((drop > repose * run || (run <= near && drop > 0.01)) && drop > most) {
          most = drop;
          best = there;
        }
      }
    }
    if (!best) break;
    here = best;
  }
  const rest = at(here.x, here.z);
  piece.pos[1] = rest.y;
  piece.version += 1;
  return rest;
}

/**
 * Lays a piece along the slope of what it has come to rest on, and puts it
 * back down on it: how a piece lies on the side of a heap.
 */
export function lieDown(piece, placed, base = FLAT) {
  const index = placed instanceof Nearby ? placed : new Nearby(placed);
  alongSlope(piece, restOn(piece, index.around(piece), { base, landing: true }));
  const rest = restOn(piece, index.around(piece), { base, landing: true });
  piece.pos[1] = rest.y;
  piece.version += 1;
}

/**
 * Pours `list` out over `dish`, one piece after another, onto `under` — what
 * is there already — and onto each other. `dish` says how high its floor is
 * at a point (`base`), where the middle of a piece can be (`holds`), and
 * where the pour is aimed and how widely it falls (`centre`, `spread`).
 *
 * Each piece tumbles as it lands, slides off whatever it is not held up by,
 * runs down any slope steeper than a heap stands, and lies along the slope of
 * what it ends up on: a pile, mounded in the middle. Sets each piece's `pos`
 * and `rot`. `under` may be a `Nearby` of what is there, kept for the next
 * pour; what is poured goes into it.
 *
 * A dish with a `brim` is heaped no higher than that: a piece that would
 * land above it, however it falls, is left as it was and not poured. Gives
 * back those pieces; with no brim, none.
 */
export function pour(list, dish, under = [], random = Math.random) {
  const { base = FLAT, holds = () => true, centre = [0, 0], spread = 0.4, brim = Infinity } = dish;
  const placed = under instanceof Nearby ? under : new Nearby(under);
  const over = [];
  for (const piece of list) {
    const was = { pos: [...piece.pos], rot: [...piece.rot] };
    let fits = false;
    for (let tries = 0; tries < (brim < Infinity ? 4 : 1) && !fits; tries++) {
      tumble(piece, random);
      let x = centre[0], z = centre[1];
      for (let t = 0; t < 12; t++) {
        const nx = centre[0] + gauss(random) * spread, nz = centre[1] + gauss(random) * spread;
        if (holds(nx, nz)) {
          x = nx;
          z = nz;
          break;
        }
      }
      piece.pos = [x, 0, z];
      settleIn(piece, placed, { base, holds });
      lieDown(piece, placed, base);
      fits = piece.pos[1] + extents(piece).max[1] <= brim;
    }
    if (fits) {
      placed.add(piece);
    } else {
      piece.pos = was.pos;
      piece.rot = was.rot;
      piece.version += 1;
      over.push(piece);
    }
  }
  return over;
}

/**
 * A floor `profile` as [radius, height] points, outward, as a function of how
 * far out from the middle: flat past the last point.
 */
export function floorFrom(profile) {
  return (r) => {
    if (r <= profile[0][0]) return profile[0][1];
    for (let i = 1; i < profile.length; i++) {
      const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
      if (r <= r1) return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
    return profile[profile.length - 1][1];
  };
}

/** Whether two pieces are in each other anywhere, by more than `by`: for checking. */
export function inEachOther(a, b, by = 0.04) {
  /** Strands tangle into each other; that is not one inside another. */
  if (a.shred && b.shred) return false;
  const pa = profile(a), pb = profile(b);
  for (let m = 0; m < pa.I.length; m++) {
    const k = cell(pb, pa.I[m] + pa.di, pa.J[m] + pa.dj);
    if (k < 0) continue;
    const lo = Math.max(a.pos[1] + pa.lo[m], b.pos[1] + pb.lo[k]), hi = Math.min(a.pos[1] + pa.hi[m], b.pos[1] + pb.hi[k]);
    if (hi - lo > by) return true;
  }
  return false;
}

