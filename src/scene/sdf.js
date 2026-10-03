/**
 * Distances for casting: the handful of solids the props are built from,
 * and the ways of putting them together. Every one is negative inside, zero
 * on the surface; see `cast.js` for how a field is turned into a mesh.
 */

/** A rectangle `w` by `d` centred on the origin with its corners rounded by `r`, in the plane. */
export function roundRect(x, z, w, d, r) {
  const qx = Math.abs(x) - w / 2 + r, qz = Math.abs(z) - d / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

/**
 * An outline in the plane, `flat` distance to it, stood up between heights
 * `y0` and `y1` with every edge rounded over by `edge`.
 */
export function extrude(flat, y, y0, y1, edge) {
  const wx = flat + edge, wy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + edge;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - edge;
}

/** An ellipsoid with radii `rx`, `ry`, `rz` — not an exact distance, but close enough to cast. */
export function ellipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/** A smooth union: two solids with a fillet `k` wide where they meet. */
export function blend(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** A smooth subtraction of `b` from `a`: the cut's edge rounded over by `k`. */
export function carve(a, b, k) {
  const h = Math.max(k - Math.abs(-b - a), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

/**
 * Gives a cast mesh texture coordinates, laid on from straight above: `scale`
 * units to one repeat. Everything cast here is seen mostly from above.
 */
export function planarUV(GFX, geometry, scale = 1) {
  const p = geometry.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / scale;
    uv[i * 2 + 1] = p.getZ(i) / scale;
  }
  geometry.setAttribute('uv', new GFX.Float32BufferAttribute(uv, 2));
  return geometry;
}
