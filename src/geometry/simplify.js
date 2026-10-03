/**
 * Keeping a cut piece's flat faces cheap.
 *
 * Every cut fills its new face with a fan of long thin triangles out to each
 * point of its outline; the next cut slices through all of those and fills
 * its own face the same way, and by the time a potato is dice each little
 * cube is a few hundred slivers. This puts each flat face back together as
 * one polygon and fills it again with as few triangles as its outline needs,
 * and takes out the points along the straight edge where two flat faces meet,
 * which nothing else uses — from both faces, so they still meet edge to edge
 * and the piece stays closed for the next cut. Points the skin uses stay.
 *
 * Every face it cannot be sure of — a hole in it, an outline that touches
 * itself, a refill that does not cover the same area — keeps the triangles it
 * had. Nothing here moves a point, so volume and outline are exactly as cut.
 */

import { triangulate } from './triangulate.js';
import { makeSolid } from './slice.js';

const key = (p, i) => `${p[i]},${p[i + 1]},${p[i + 2]}`;

/** Which flat face a cut triangle is on: its normal and its distance along it, to a hair. */
function planeKey(solid, t) {
  const n = solid.nrm, p = solid.pos, o = t * 9;
  const d = n[o] * p[o] + n[o + 1] * p[o + 1] + n[o + 2] * p[o + 2];
  const r = (v, s) => Math.round(v * s);
  return `${r(n[o], 1e4)},${r(n[o + 1], 1e4)},${r(n[o + 2], 1e4)},${r(d, 1e3)}`;
}

export function simplify(solid) {
  const tris = solid.pos.length / 9;
  if (tris < 8) return solid;
  const p = solid.pos;

  /** Faces: flat cut faces by plane; the skin is not touched. */
  const faces = new Map();
  const faceOf = new Int32Array(tris).fill(-1);
  const faceList = [];
  for (let t = 0; t < tris; t++) {
    if (!solid.cap[t]) continue;
    const k = planeKey(solid, t);
    let f = faces.get(k);
    if (f === undefined) {
      f = faceList.length;
      faces.set(k, f);
      faceList.push({ tris: [], normal: [solid.nrm[t * 9], solid.nrm[t * 9 + 1], solid.nrm[t * 9 + 2]] });
    }
    faceList[f].tris.push(t);
    faceOf[t] = f;
  }
  if (faceList.length === 0) return solid;

  /** Every directed edge, and which face (or the skin, -1) it belongs to; every point, and who uses it. */
  const edgeFace = new Map();
  const usedBy = new Map();
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = key(p, t * 9 + e * 3), b = key(p, t * 9 + ((e + 1) % 3) * 3);
      edgeFace.set(`${a}|${b}`, faceOf[t]);
      let users = usedBy.get(a);
      if (!users) usedBy.set(a, (users = new Set()));
      users.add(faceOf[t]);
    }
  }

  /** Each face's outline: its edges that no other triangle of the same face runs back along. */
  const loopsOf = faceList.map((face, f) => {
    const out = new Map();
    let clean = true;
    for (const t of face.tris) {
      for (let e = 0; e < 3; e++) {
        const ia = t * 9 + e * 3, ib = t * 9 + ((e + 1) % 3) * 3;
        const a = key(p, ia), b = key(p, ib);
        if (edgeFace.get(`${b}|${a}`) === f) continue;
        if (out.has(a)) clean = false;
        out.set(a, { to: b, at: ia, other: edgeFace.get(`${b}|${a}`) });
      }
    }
    if (!clean) return null;
    const loops = [];
    const seen = new Set();
    for (const start of out.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let k = start;
      while (!seen.has(k)) {
        seen.add(k);
        const step = out.get(k);
        if (!step) return null;
        loop.push({ key: k, at: step.at, other: step.other });
        k = step.to;
      }
      if (k !== start) return null;
      loops.push(loop);
    }
    return loops;
  });

  /**
   * A point can go if only flat faces use it, exactly two of them, both being
   * refilled, and in each of their outlines both edges through it are on the
   * crease between the two: it is partway along a straight edge, and nothing
   * turns there. Taken out of one face it has to come out of the other too,
   * so a face that cannot be refilled keeps its points in its neighbours.
   */
  const refill = new Set();
  loopsOf.forEach((loops, f) => { if (loops && loops.length === 1) refill.add(f); });

  const plan = new Map();
  for (let round = 0; round <= faceList.length; round++) {
    plan.clear();
    let failed = false;
    for (const f of refill) {
      const loop = loopsOf[f][0];
      const kept = loop.filter((v, i) => {
        const prev = loop[(i + loop.length - 1) % loop.length];
        const users = usedBy.get(v.key);
        if (!users || users.size !== 2 || users.has(-1)) return true;
        const g = [...users].find((u) => u !== f);
        return !(refill.has(g) && prev.other === g && v.other === g);
      });
      const tris3 = fill(kept, faceList[f]);
      if (!tris3) {
        refill.delete(f);
        failed = true;
        break;
      }
      plan.set(f, tris3);
    }
    if (!failed) break;
    plan.clear();
  }

  /** The polygon `kept` filled with as few triangles as it takes, checked against what it replaces. */
  function fill(kept, face) {
    if (kept.length < 3) return null;
    const [nx, ny, nz] = face.normal;
    let ux, uy, uz;
    if (Math.abs(nx) < 0.9) [ux, uy, uz] = [0, nz, -ny];
    else [ux, uy, uz] = [-nz, 0, nx];
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const flat = [];
    for (const v of kept) flat.push(p[v.at] * ux + p[v.at + 1] * uy + p[v.at + 2] * uz, p[v.at] * vx + p[v.at + 1] * vy + p[v.at + 2] * vz);
    const index = triangulate(flat);
    if (index.length !== (kept.length - 2) * 3) return null;
    /** Same area as before, and every new triangle facing the right way, or it keeps what it had. */
    const area2 = (a, b, c) => (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
    let after = 0;
    for (let i = 0; i < index.length; i += 3) {
      const a = area2(index[i], index[i + 1], index[i + 2]);
      if (a <= 0) return null;
      after += a / 2;
    }
    let before = 0;
    for (const t of face.tris) {
      const o = t * 9;
      const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
      const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
      before += ((ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz) / 2;
    }
    if (Math.abs(after - before) > 1e-6 + Math.abs(before) * 1e-4) return null;
    const out = [];
    for (let i = 0; i < index.length; i += 3) out.push([kept[index[i]].at, kept[index[i + 1]].at, kept[index[i + 2]].at]);
    return out;
  }

  const keep = new Uint8Array(tris).fill(1);
  const added = [];
  for (const [f, tris3] of plan) {
    for (const t of faceList[f].tris) keep[t] = 0;
    added.push(...tris3);
  }
  if (added.length === 0) return solid;

  let count = added.length;
  for (let t = 0; t < tris; t++) count += keep[t];
  const pos = new Float32Array(count * 9), nrm = new Float32Array(count * 9), col = new Float32Array(count * 9);
  const cap = new Uint8Array(count);
  let w = 0;
  for (let t = 0; t < tris; t++) {
    if (!keep[t]) continue;
    pos.set(solid.pos.subarray(t * 9, t * 9 + 9), w * 9);
    nrm.set(solid.nrm.subarray(t * 9, t * 9 + 9), w * 9);
    col.set(solid.col.subarray(t * 9, t * 9 + 9), w * 9);
    cap[w] = solid.cap[t];
    w++;
  }
  for (const corners of added) {
    corners.forEach((at, c) => {
      pos.set(solid.pos.subarray(at, at + 3), w * 9 + c * 3);
      nrm.set(solid.nrm.subarray(at, at + 3), w * 9 + c * 3);
      col.set(solid.col.subarray(at, at + 3), w * 9 + c * 3);
    });
    cap[w] = 1;
    w++;
  }
  return makeSolid({ pos, nrm, col, cap });
}
