import type { Quaternion } from '../Types/Quaternion';
import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';

// Factory - creates a quaternion [x, y, z, w]
export function quat(x = 0, y = 0, z = 0, w = 1): Quaternion {
  const q = new Float32Array(4);
  q[0] = x; q[1] = y; q[2] = z; q[3] = w;
  return q;
}

// Identity quaternion (no rotation)
export function quatIdentity(): Quaternion {
  return quat(0, 0, 0, 1);
}

// Create quaternion from Euler angles (in radians, ZYX order matching mat4Rotation)
export function quatFromEuler(x: number, y: number, z: number): Quaternion {
  const cx = Math.cos(x * 0.5), sx = Math.sin(x * 0.5);
  const cy = Math.cos(y * 0.5), sy = Math.sin(y * 0.5);
  const cz = Math.cos(z * 0.5), sz = Math.sin(z * 0.5);

  // Create individual axis rotations
  const qx = quat(sx, 0, 0, cx);  // Rotation around X
  const qy = quat(0, sy, 0, cy);  // Rotation around Y
  const qz = quat(0, 0, sz, cz);  // Rotation around Z

  // Combine in ZYX order (same as mat4Rotation: rotZ * rotY * rotX)
  const tmp = quat();
  const result = quat();
  quatMul(tmp, qz, qy);
  quatMul(result, tmp, qx);
  
  return result;
}

// Multiply two quaternions: out = a * b
export function quatMul(out: Quaternion, a: Quaternion, b: Quaternion): Quaternion {
  if (out.length !== 4) {
    throw new Error("quatMul: out length must be 4");
  }
  if (out === a || out === b) {
    throw new Error("Unsafe: out must not be the same as a or b");
  }

  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];

  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;

  return out;
}

// Normalize a quaternion
export function quatNormalize(out: Quaternion, q: Quaternion): Quaternion {
  if (out.length !== 4) {
    throw new Error("quatNormalize: out length must be 4");
  }
  if (out === q) {
    throw new Error("Unsafe: out must not be the same as q");
  }

  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len === 0) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
    return out;
  }

  const invLen = 1.0 / len;
  out[0] = q[0] * invLen;
  out[1] = q[1] * invLen;
  out[2] = q[2] * invLen;
  out[3] = q[3] * invLen;

  return out;
}

// Conjugate of a quaternion (inverse for unit quaternions)
export function quatConjugate(out: Quaternion, q: Quaternion): Quaternion {
  if (out.length !== 4) {
    throw new Error("quatConjugate: out length must be 4");
  }
  if (out === q) {
    throw new Error("Unsafe: out must not be the same as q");
  }

  out[0] = -q[0];
  out[1] = -q[1];
  out[2] = -q[2];
  out[3] = q[3];

  return out;
}

// Convert quaternion to 4x4 rotation matrix (row-major order to match mat4)
export function quatToMat4(q: Quaternion): Matrix4x4 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  // Row-major order (transpose of standard column-major quaternion matrix)
  return new Float32Array([
    1 - (yy + zz), xy - wz,       xz + wy,       0,
    xy + wz,       1 - (xx + zz), yz - wx,       0,
    xz - wy,       yz + wx,       1 - (xx + yy), 0,
    0,             0,             0,             1
  ]);
}

// Rotate a vector by a quaternion
export function quatRotateVec4(out: Vector4, q: Quaternion, v: Vector4): Vector4 {
  if (out.length !== 4) {
    throw new Error("quatRotateVec4: out length must be 4");
  }
  if (out === v || out === q) {
    throw new Error("Unsafe: out must not be the same as v or q");
  }

  const x = v[0], y = v[1], z = v[2];
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];

  // Calculate quat * vector * quat^-1
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  out[3] = v[3]; // preserve w component

  return out;
}
