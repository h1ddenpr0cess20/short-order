/**
 * Ear clipping for the face a knife leaves behind.
 *
 * A cut through a potato is one closed outline, nearly always star-shaped but
 * never guaranteed to be: the lumps on the skin can give it a dent. So this is
 * real ear clipping rather than a fan from the middle, and unlike the one the
 * geometry module uses for extrusions it never throws. An outline it cannot
 * finish — two points on top of each other, an edge that doubles back — is
 * finished as a fan, because a slightly wrong cap is a better potato than a
 * hole in one.
 *
 * Points are flat, x then y. Returns indices into them, three to a triangle,
 * wound counter-clockwise.
 */
export function triangulate(flat) {
  const n = flat.length / 2;
  if (n < 3) return [];

  const ring = [];
  for (let i = 0; i < n; i++) ring.push(i);
  if (signedArea(flat, ring) < 0) ring.reverse();

  const out = [];
  let guard = 0;
  while (ring.length > 3 && guard < n * n) {
    guard += 1;
    let clipped = false;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k + ring.length - 1) % ring.length];
      const b = ring[k];
      const c = ring[(k + 1) % ring.length];
      if (!isEar(flat, ring, a, b, c)) continue;
      out.push(a, b, c);
      ring.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }

  if (ring.length === 3) {
    out.push(ring[0], ring[1], ring[2]);
  } else if (ring.length > 3) {
    /** Stuck: whatever is left goes in as a fan, wound the right way. */
    for (let k = 1; k < ring.length - 1; k++) {
      const a = ring[0], b = ring[k], c = ring[k + 1];
      if (cross(flat, a, b, c) >= 0) out.push(a, b, c);
      else out.push(a, c, b);
    }
  }
  return out;
}

/** Twice the signed area of a ring of indices; positive is counter-clockwise. */
export function signedArea(flat, ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[j] * 2, q = ring[i] * 2;
    a += flat[p] * flat[q + 1] - flat[q] * flat[p + 1];
  }
  return a / 2;
}

function cross(flat, a, b, c) {
  const ax = flat[a * 2], ay = flat[a * 2 + 1];
  return (flat[b * 2] - ax) * (flat[c * 2 + 1] - ay) - (flat[b * 2 + 1] - ay) * (flat[c * 2] - ax);
}

function isEar(flat, ring, a, b, c) {
  if (cross(flat, a, b, c) <= 1e-12) return false;
  const ax = flat[a * 2], ay = flat[a * 2 + 1];
  const bx = flat[b * 2], by = flat[b * 2 + 1];
  const cx = flat[c * 2], cy = flat[c * 2 + 1];
  for (const p of ring) {
    if (p === a || p === b || p === c) continue;
    const px = flat[p * 2], py = flat[p * 2 + 1];
    /** A point sitting exactly on a corner is a duplicate, not an obstruction. */
    if ((px === ax && py === ay) || (px === bx && py === by) || (px === cx && py === cy)) continue;
    const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
    const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
    if (d1 >= 0 && d2 >= 0 && d3 >= 0) return false;
  }
  return true;
}
