/**
 * Just enough quaternion and vector arithmetic for the simulations, on plain
 * arrays: [x, y, z, w] and [x, y, z]. The scene's own maths classes would do,
 * but the simulations run under Node with no scene at all.
 */

export const IDENTITY = Object.freeze([0, 0, 0, 1]);

export function axisAngle(axis, angle, out = [0, 0, 0, 1]) {
  const [x, y, z] = axis;
  const l = Math.hypot(x, y, z) || 1;
  const s = Math.sin(angle / 2) / l;
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = Math.cos(angle / 2);
  return out;
}

/** a then b: the rotation that does `b` first and `a` after, as `a * b`. */
export function multiply(a, b, out = [0, 0, 0, 1]) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function normalize(q, out = q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  out[0] = q[0] / l;
  out[1] = q[1] / l;
  out[2] = q[2] / l;
  out[3] = q[3] / l;
  return out;
}

export function conjugate(q, out = [0, 0, 0, 1]) {
  out[0] = -q[0];
  out[1] = -q[1];
  out[2] = -q[2];
  out[3] = q[3];
  return out;
}

/** The vector `v` turned by `q`. */
export function rotate(q, v, out = [0, 0, 0]) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}

export function slerp(a, b, t, out = [0, 0, 0, 1]) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let k0, k1;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / sin;
    k1 = Math.sin(t * angle) / sin;
  }
  out[0] = a[0] * k0 + bx * k1;
  out[1] = a[1] * k0 + by * k1;
  out[2] = a[2] * k0 + bz * k1;
  out[3] = a[3] * k0 + bw * k1;
  return normalize(out);
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
