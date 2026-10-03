/**
 * Cutting a solid in two with a plane, and closing up both halves.
 *
 * This is what the knife does. Every piece on the board is one of these: a
 * closed triangle soup (no index, three vertices to a triangle, each with its
 * own copy), carrying a normal and a base colour per vertex, and a flag per
 * triangle saying whether it is the outside of the thing or a face somebody
 * cut. A cut sorts the triangles to either side of the plane, splits the ones
 * it passes through, and walks the edges it left behind into closed outlines,
 * which are filled in with flesh — coloured by asking the ingredient what its
 * inside looks like at each point.
 *
 * No GFX in here, so it can be checked without a renderer and run under Node.
 * A solid is plain arrays; `toGeometry` in `pieces.js` is what hands one to
 * the scene.
 */

import { triangulate } from './triangulate.js';

/**
 * How close to the plane a vertex has to be to count as on it. Those are moved
 * onto it exactly — every copy of the vertex the same way, so nothing opens up
 * between the triangles that share it — which is what lets a knife come down
 * on a face it has already cut, or on a corner, without leaving a crack.
 */
const SNAP = 1e-6;

/** Below this a fragment is a crumb of float error rather than a piece of potato. */
const CRUMB = 1e-5;

export function makeSolid({ pos, nrm, col, cap }) {
  const tris = pos.length / 9;
  return {
    pos: pos instanceof Float32Array ? pos : Float32Array.from(pos),
    nrm: nrm instanceof Float32Array ? nrm : Float32Array.from(nrm),
    col: col instanceof Float32Array ? col : Float32Array.from(col),
    cap: cap instanceof Uint8Array ? cap : (cap ? Uint8Array.from(cap) : new Uint8Array(tris)),
  };
}

/**
 * Snaps vertices that are within a hair of each other onto one copy, so that
 * every corner two triangles share is bit-for-bit the same point. Meshes off a
 * sphere are not quite that at the seam — cos(2π) is not cos(0) — and a cut
 * finds its way round the new face by matching corners exactly. In place.
 */
export function weld(solid, tolerance = 1e-6) {
  const seen = new Map();
  const p = solid.pos;
  const q = 1 / tolerance;
  for (let i = 0; i < p.length; i += 3) {
    const key = `${Math.round(p[i] * q)},${Math.round(p[i + 1] * q)},${Math.round(p[i + 2] * q)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else {
      p[i] = p[first];
      p[i + 1] = p[first + 1];
      p[i + 2] = p[first + 2];
    }
  }
  return solid;
}

export function triangleCount(solid) {
  return solid.pos.length / 9;
}

/**
 * An indexed or unindexed mesh, unrolled into a solid. `colour(x, y, z, i)`
 * gives the base colour of each original vertex.
 */
export function solidFromBuffers({ positions, normals, index = null, colour }) {
  const order = index ?? Array.from({ length: positions.length / 3 }, (_, i) => i);
  const n = order.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const cache = new Map();
  for (let k = 0; k < n; k++) {
    const i = order[k];
    pos[k * 3] = positions[i * 3];
    pos[k * 3 + 1] = positions[i * 3 + 1];
    pos[k * 3 + 2] = positions[i * 3 + 2];
    nrm[k * 3] = normals[i * 3];
    nrm[k * 3 + 1] = normals[i * 3 + 1];
    nrm[k * 3 + 2] = normals[i * 3 + 2];
    let c = cache.get(i);
    if (!c) {
      c = colour(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], i);
      cache.set(i, c);
    }
    col[k * 3] = c[0];
    col[k * 3 + 1] = c[1];
    col[k * 3 + 2] = c[2];
  }
  return weld(makeSolid({ pos, nrm, col, cap: new Uint8Array(n / 3) }));
}

/** Growable float storage, so a cut does not have to guess its size up front. */
class Floats {
  constructor(size = 1024) {
    this.a = new Float32Array(size);
    this.n = 0;
  }

  push3(x, y, z) {
    if (this.n + 3 > this.a.length) {
      const next = new Float32Array(this.a.length * 2);
      next.set(this.a);
      this.a = next;
    }
    this.a[this.n++] = x;
    this.a[this.n++] = y;
    this.a[this.n++] = z;
  }

  done() {
    return this.a.slice(0, this.n);
  }
}

class Builder {
  constructor(size) {
    this.pos = new Floats(size);
    this.nrm = new Floats(size);
    this.col = new Floats(size);
    this.cap = [];
    /** Per vertex: whether it lies in the cutting plane. */
    this.on = [];
  }

  vertex(v) {
    this.pos.push3(v.px, v.py, v.pz);
    this.nrm.push3(v.nx, v.ny, v.nz);
    this.col.push3(v.r, v.g, v.b);
    this.on.push(v.on === true);
  }

  point(i) {
    const a = this.pos.a;
    return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
  }

  /** Exact, as stored: copies of one vertex are bit-for-bit the same, and nothing else should match them. */
  key(i) {
    const a = this.pos.a;
    return `${a[i * 3]},${a[i * 3 + 1]},${a[i * 3 + 2]}`;
  }

  triangle(a, b, c, cap) {
    /**
     * A split that lands exactly on a corner leaves a triangle with two corners
     * in one place. It has no area and its two real edges cancel each other,
     * so it goes — as stored, since two different doubles can be one float.
     */
    if (same(a, b) || same(b, c) || same(c, a)) return;
    this.vertex(a);
    this.vertex(b);
    this.vertex(c);
    this.cap.push(cap);
  }

  get empty() {
    return this.cap.length === 0;
  }

  solid() {
    return makeSolid({ pos: this.pos.done(), nrm: this.nrm.done(), col: this.col.done(), cap: Uint8Array.from(this.cap) });
  }
}

const f = Math.fround;
const same = (a, b) => f(a.px) === f(b.px) && f(a.py) === f(b.py) && f(a.pz) === f(b.pz);

function readVertex(solid, i, normal, d) {
  const o = i * 3;
  const v = {
    px: solid.pos[o], py: solid.pos[o + 1], pz: solid.pos[o + 2],
    nx: solid.nrm[o], ny: solid.nrm[o + 1], nz: solid.nrm[o + 2],
    r: solid.col[o], g: solid.col[o + 1], b: solid.col[o + 2],
    on: false,
  };
  if (d === 0 && normal) {
    /** On the plane: put it exactly there, along the normal. */
    const e = solid.pos[o] * normal[0] + solid.pos[o + 1] * normal[1] + solid.pos[o + 2] * normal[2] - normal[3];
    v.px -= e * normal[0];
    v.py -= e * normal[1];
    v.pz -= e * normal[2];
    v.on = true;
  }
  return v;
}

/** Lexicographic, so both triangles that share an edge cut it from the same end. */
function before(a, b) {
  if (a.px !== b.px) return a.px < b.px;
  if (a.py !== b.py) return a.py < b.py;
  return a.pz < b.pz;
}

/**
 * Where the plane crosses the edge from `a` to `b`. Always worked out from
 * the same end of the edge, whichever triangle asks, so the two triangles
 * either side of it get bit-for-bit the same point and the outline closes.
 */
function crossing(a, da, b, db) {
  if (!before(a, b)) [a, da, b, db] = [b, db, a, da];
  const t = da / (da - db);
  const nx = a.nx + (b.nx - a.nx) * t;
  const ny = a.ny + (b.ny - a.ny) * t;
  const nz = a.nz + (b.nz - a.nz) * t;
  const len = Math.hypot(nx, ny, nz) || 1;
  return {
    px: a.px + (b.px - a.px) * t,
    py: a.py + (b.py - a.py) * t,
    pz: a.pz + (b.pz - a.pz) * t,
    nx: nx / len, ny: ny / len, nz: nz / len,
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    on: true,
  };
}

const keyOf = (x, y, z) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;

/**
 * Cuts `solid` with the plane `normal · p = offset`. Returns the pieces in
 * front of it (the side the normal points to) and behind it, each a list —
 * one cut through a lumpy thing can leave more than one piece on a side.
 *
 * `flesh(x, y, z)` is the colour of the inside at a point, for the new faces.
 * A plane that misses the solid hands it back whole, on the side it is on.
 */
export function split(solid, { normal, offset }, { flesh = () => [1, 1, 1] } = {}) {
  const [nx, ny, nz] = normal;
  const plane = [nx, ny, nz, offset];
  const tris = triangleCount(solid);

  /** Which side each vertex is on: 1 in front, -1 behind, 0 on the plane. */
  const side = new Int8Array(tris * 3);
  const dist = new Float64Array(tris * 3);
  let anyFront = false, anyBack = false;
  for (let i = 0; i < tris * 3; i++) {
    const d = solid.pos[i * 3] * nx + solid.pos[i * 3 + 1] * ny + solid.pos[i * 3 + 2] * nz - offset;
    if (Math.abs(d) <= SNAP) continue;
    dist[i] = d;
    side[i] = d > 0 ? 1 : -1;
    if (d > 0) anyFront = true;
    else anyBack = true;
  }
  if (!anyBack) return { front: [solid], back: [] };
  if (!anyFront) return { front: [], back: [solid] };

  const front = new Builder(solid.pos.length + 64);
  const back = new Builder(solid.pos.length + 64);
  const builderFor = (s) => (s > 0 ? front : back);

  for (let t = 0; t < tris; t++) {
    const idx = [t * 3, t * 3 + 1, t * 3 + 2];
    const s = idx.map((i) => side[i]);
    const cap = solid.cap[t];
    const hasFront = s.includes(1), hasBack = s.includes(-1);
    const v = idx.map((i) => readVertex(solid, i, plane, side[i]));

    if (!hasFront || !hasBack) {
      let target;
      if (hasFront) target = front;
      else if (hasBack) target = back;
      else {
        /**
         * Lying in the plane: a face this exact cut has been made along before.
         * It bounds whatever is on the side it does not face.
         */
        const fx = (v[1].py - v[0].py) * (v[2].pz - v[0].pz) - (v[1].pz - v[0].pz) * (v[2].py - v[0].py);
        const fy = (v[1].pz - v[0].pz) * (v[2].px - v[0].px) - (v[1].px - v[0].px) * (v[2].pz - v[0].pz);
        const fz = (v[1].px - v[0].px) * (v[2].py - v[0].py) - (v[1].py - v[0].py) * (v[2].px - v[0].px);
        target = fx * nx + fy * ny + fz * nz > 0 ? back : front;
      }
      target.triangle(v[0], v[1], v[2], cap);
      continue;
    }

    const zero = s.indexOf(0);
    if (zero !== -1) {
      /** One corner on the plane and the other two either side of it: one cut, two triangles. */
      const Z = v[zero], A = v[(zero + 1) % 3], B = v[(zero + 2) % 3];
      const dA = dist[idx[(zero + 1) % 3]], dB = dist[idx[(zero + 2) % 3]];
      const I = crossing(A, dA, B, dB);
      builderFor(s[(zero + 1) % 3]).triangle(Z, A, I, cap);
      builderFor(s[(zero + 2) % 3]).triangle(Z, I, B, cap);
      continue;
    }

    /**
     * One vertex is alone on its side. Rotate the triangle so it comes first —
     * which keeps the winding — and the cut runs between its two edges.
     */
    let lone;
    if (s[0] !== s[1] && s[0] !== s[2]) lone = 0;
    else if (s[1] !== s[0] && s[1] !== s[2]) lone = 1;
    else lone = 2;
    const L = v[lone], P = v[(lone + 1) % 3], Q = v[(lone + 2) % 3];
    const dL = dist[idx[lone]], dP = dist[idx[(lone + 1) % 3]], dQ = dist[idx[(lone + 2) % 3]];
    const I1 = crossing(L, dL, P, dP);
    const I2 = crossing(L, dL, Q, dQ);
    const alone = builderFor(s[lone]);
    const pair = builderFor(-s[lone]);
    alone.triangle(L, I1, I2, cap);
    pair.triangle(I1, P, Q, cap);
    pair.triangle(I1, Q, I2, cap);
  }

  capOff(back, normal, 1, flesh);
  capOff(front, normal, -1, flesh);

  return {
    front: front.empty ? [] : components(front.solid()),
    back: back.empty ? [] : components(back.solid()),
  };
}

/**
 * Fills in the hole a cut left in one side. `facing` is which way along the
 * normal the new face looks: +1 for the piece behind the plane, -1 in front.
 *
 * The hole is found from the side itself rather than from the cut: its edges
 * are the ones lying in the plane that no other triangle on this side runs
 * back along. A surface that only touched the plane there has both directions
 * and leaves nothing behind. The hole's edges run the opposite way to the
 * face that closes it, which says which outline is the rim of a face and which
 * is a hole in one.
 */
function capOff(builder, normal, facing, flesh) {
  if (builder.empty) return;
  const [nx, ny, nz] = normal;
  const edges = new Map();
  const tris = builder.on.length / 3;
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = t * 3 + e, b = t * 3 + ((e + 1) % 3);
      if (!builder.on[a] || !builder.on[b]) continue;
      const ka = builder.key(a), kb = builder.key(b);
      if (ka === kb) continue;
      const reverse = `${kb}|${ka}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(`${ka}|${kb}`, [ka, kb, a, b]);
    }
  }
  if (edges.size < 3) return;

  /** The hole's rim, as cap edges: each one reversed. */
  const next = new Map();
  for (const [ka, kb, a, b] of edges.values()) next.set(kb, [ka, b, a]);

  /** u × v = n, so counter-clockwise in (u, v) faces along n. */
  let ux, uy, uz;
  if (Math.abs(nx) < 0.9) [ux, uy, uz] = [0, nz, -ny];
  else [ux, uy, uz] = [-nz, 0, nx];
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;

  const seen = new Set();
  for (const startKey of next.keys()) {
    if (seen.has(startKey)) continue;
    const loop = [];
    let key = startKey;
    let closed = false;
    for (let guard = 0; guard <= next.size; guard++) {
      if (seen.has(key)) {
        closed = key === startKey;
        break;
      }
      seen.add(key);
      const step = next.get(key);
      if (!step) break;
      loop.push(step[1]);
      key = step[0];
    }
    if (!closed || loop.length < 3) continue;

    const flat = [];
    for (const i of loop) {
      const [px, py, pz] = builder.point(i);
      flat.push(px * ux + py * uy + pz * uz, px * vx + py * vy + pz * vz);
    }
    /** A rim runs counter-clockwise seen from the way its face looks; a hole the other way. */
    let area = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      area += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
    }
    if (area * facing <= 0) continue;

    const index = triangulate(flat);
    const corner = loop.map((i) => {
      const [px, py, pz] = builder.point(i);
      const [r, g, b] = flesh(px, py, pz);
      return { px, py, pz, nx: nx * facing, ny: ny * facing, nz: nz * facing, r, g, b, on: true };
    });
    for (let k = 0; k < index.length; k += 3) {
      const a = corner[index[k]], b = corner[index[k + 1]], c = corner[index[k + 2]];
      if (facing > 0) builder.triangle(a, b, c, 1);
      else builder.triangle(a, c, b, 1);
    }
  }
}

/**
 * A solid broken into the separate lumps it is made of: triangles that share a
 * corner are one piece. One cut through a dented outline can leave two.
 */
export function components(solid) {
  const tris = triangleCount(solid);
  if (tris === 0) return [];
  const parent = Int32Array.from({ length: tris }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const owner = new Map();
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 3;
      const key = keyOf(solid.pos[o], solid.pos[o + 1], solid.pos[o + 2]);
      const other = owner.get(key);
      if (other === undefined) owner.set(key, t);
      else {
        const a = find(t), b = find(other);
        if (a !== b) parent[a] = b;
      }
    }
  }

  const groups = new Map();
  for (let t = 0; t < tris; t++) {
    const root = find(t);
    const list = groups.get(root);
    if (list) list.push(t);
    else groups.set(root, [t]);
  }
  if (groups.size === 1) return [solid];

  const out = [];
  for (const list of groups.values()) {
    const piece = pick(solid, list);
    if (Math.abs(measure(piece).volume) > CRUMB) out.push(piece);
  }
  return out;
}

function pick(solid, list) {
  const pos = new Float32Array(list.length * 9);
  const nrm = new Float32Array(list.length * 9);
  const col = new Float32Array(list.length * 9);
  const cap = new Uint8Array(list.length);
  list.forEach((t, k) => {
    pos.set(solid.pos.subarray(t * 9, t * 9 + 9), k * 9);
    nrm.set(solid.nrm.subarray(t * 9, t * 9 + 9), k * 9);
    col.set(solid.col.subarray(t * 9, t * 9 + 9), k * 9);
    cap[k] = solid.cap[t];
  });
  return makeSolid({ pos, nrm, col, cap });
}

/**
 * Volume, the middle of that volume, and the box round it — by the divergence
 * theorem, one tetrahedron from the origin per triangle. A closed solid wound
 * outward has positive volume.
 */
export function measure(solid) {
  const p = solid.pos;
  let volume = 0, cx = 0, cy = 0, cz = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let area = 0, capArea = 0;
  for (let t = 0; t < p.length; t += 9) {
    const ax = p[t], ay = p[t + 1], az = p[t + 2];
    const bx = p[t + 3], by = p[t + 4], bz = p[t + 5];
    const qx = p[t + 6], qy = p[t + 7], qz = p[t + 8];
    const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    volume += v;
    cx += v * (ax + bx + qx) / 4;
    cy += v * (ay + by + qy) / 4;
    cz += v * (az + bz + qz) / 4;
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = qx - ax, fy = qy - ay, fz = qz - az;
    const a = Math.hypot(ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx) / 2;
    area += a;
    if (solid.cap[t / 9]) capArea += a;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [qx, qy, qz]]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  const centroid = volume !== 0 ? [cx / volume, cy / volume, cz / volume] : [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  return { volume, centroid, min: [minX, minY, minZ], max: [maxX, maxY, maxZ], area, capArea };
}

/** Moves every vertex by (dx, dy, dz), in place. */
export function translate(solid, dx, dy, dz) {
  for (let i = 0; i < solid.pos.length; i += 3) {
    solid.pos[i] += dx;
    solid.pos[i + 1] += dy;
    solid.pos[i + 2] += dz;
  }
  return solid;
}
