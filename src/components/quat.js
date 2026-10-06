// Minimal quaternions for the Experience wheel: enough to slerp a rotation
// and turn it into a CSS matrix. [w, x, y, z]; screen axes (x right, y down,
// z toward the viewer), the same convention as CSS's own rotate functions.

export const qIdentity = [1, 0, 0, 0];

export function qAxis(x, y, z, angle) {
  const l = Math.hypot(x, y, z) || 1;
  const s = Math.sin(angle / 2) / l;
  return [Math.cos(angle / 2), x * s, y * s, z * s];
}

export function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = b.map((v) => -v);
  }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (bb[i] - v) * t);
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}

/** Row-major 3x3 rotation matrix. */
export function qMat([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

export function qRot(q, [vx, vy, vz]) {
  const m = qMat(q);
  return [
    m[0] * vx + m[1] * vy + m[2] * vz,
    m[3] * vx + m[4] * vy + m[5] * vz,
    m[6] * vx + m[7] * vy + m[8] * vz,
  ];
}

/** CSS matrix3d() for rotation q, uniform scale s, then translation t. */
export function cssMatrix(q, s, [tx, ty, tz]) {
  const m = qMat(q);
  const f = (v) => v.toFixed(5);
  // matrix3d is column-major.
  return `matrix3d(${f(m[0] * s)},${f(m[3] * s)},${f(m[6] * s)},0,${f(m[1] * s)},${f(m[4] * s)},${f(m[7] * s)},0,${f(m[2] * s)},${f(m[5] * s)},${f(m[8] * s)},0,${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(2)},1)`;
}
