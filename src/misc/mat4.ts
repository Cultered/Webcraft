import type { Vector4 } from "../Types/Vector4";
import type { Matrix4x4 } from "../Types/Matrix4x4";

export function mat4(
  m00 = 1, m01 = 0, m02 = 0, m03 = 0,
  m10 = 0, m11 = 1, m12 = 0, m13 = 0,
  m20 = 0, m21 = 0, m22 = 1, m23 = 0,
  m30 = 0, m31 = 0, m32 = 0, m33 = 1
): Matrix4x4 {
  return new Float32Array([
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33]);
}
export function mat4Inverse(out: Matrix4x4, m: Matrix4x4): Matrix4x4 {
  if(out.length !== 16) {
    throw new Error("mat4x4: out length must be 16");
  }
  const inv = new Float32Array(16);

  inv[0] = m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];

  inv[4] = -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];

  inv[8] = m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];

  inv[12] = -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];

  inv[1] = -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];

  inv[5] = m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];

  inv[9] = -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];

  inv[13] = m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];

  inv[2] = m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];

  inv[6] = -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];

  inv[10] = m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];

  inv[14] = -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];

  inv[3] = -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];

  inv[7] = m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];

  inv[11] = -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];

  inv[15] = m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];

  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

  if (det === 0) {
    throw new Error("Matrix determenant is 0")
  }

  det = 1.0 / det;
  for (let i = 0; i < 16; i++) {
    out[i] = inv[i] * det;
  }

  return out;
}

export function mat4Identity(): Matrix4x4 {
  return mat4();
}

export function mat4MulVec4(out: Vector4, m: Matrix4x4, v: Float32Array): Float32Array {
  if(out.length !== 4) {
    throw new Error("vec4Scale: out length must be 4");
  }
  if(out === v ||out === m) {
    throw new Error("Unsafe : out must not be the same as m or v");
  }
  out[0] = m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3];
  out[1] = m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3];
  out[2] = m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3];
  out[3] = m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3];
  return out;
}

export function mat4Mul(out: Matrix4x4, a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
  if(out === a ||out === b) {
    throw new Error("Unsafe : out must not be the same as m or v");
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i + j * 4] =
        a[0 + j * 4] * b[i + 0] +
        a[1 + j * 4] * b[i + 4] +
        a[2 + j * 4] * b[i + 8] +
        a[3 + j * 4] * b[i + 12];
    }
  }
  return out;
}

export function mat4Translation(tx: number, ty: number, tz: number): Matrix4x4 {
  return mat4(
    1, 0, 0, tx,
    0, 1, 0, ty,
    0, 0, 1, tz,
    0, 0, 0, 1
  );
}

export function mat4Scale(sx: number, sy: number, sz: number): Matrix4x4 {
  return mat4(
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1
  );
}

export function mat4Rotation(x: number, y: number, z: number): Matrix4x4 {
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);

  const rotX = mat4(
    1, 0, 0, 0,
    0, cx, -sx, 0,
    0, sx, cx, 0,
    0, 0, 0, 1
  );

  const rotY = mat4(
    cy, 0, sy, 0,
    0, 1, 0, 0,
    -sy, 0, cy, 0,
    0, 0, 0, 1
  );

  const rotZ = mat4(
    cz, -sz, 0, 0,
    sz, cz, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  );

  const tmp = mat4();
  const out = mat4();
  mat4Mul(tmp, rotZ, rotY);
  mat4Mul(out, tmp, rotX);
  return out;
}

export function mat4Transpose(m: Matrix4x4): Matrix4x4 {
  return new Float32Array([
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]);
}

export function mat4TRS(
  translation: number[],
  rotation: Matrix4x4,
  scale: number[]
): Matrix4x4 {
  const out = new Float32Array(16);
  const t = mat4Translation(translation[0], translation[1], translation[2]);
  const s = mat4Scale(scale[0], scale[1], scale[2]);
  const tmp = mat4();
  mat4Mul(tmp, rotation, s);
  mat4Mul(out, t, tmp);
  return out;
}

export function mat4Projection(fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY * 0.5);
  const nf = 1 / (near - far);
  return mat4(
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near) * nf, 2*far * near * nf,
    0, 0, -1, 0
  );
}

/**
 * Extract Euler angles (in radians) from a rotation matrix using ZYX order.
 * Returns [x, y, z] where the rotation is applied as Z * Y * X.
 */
export function mat4GetEulerZYX(m: Matrix4x4): [number, number, number] {
  // For ZYX order: R = Rz * Ry * Rx
  // The matrix elements give us:
  // m[8] = -sin(y)
  // m[9] = cos(y) * sin(x)
  // m[10] = cos(y) * cos(x)
  // m[0] = cos(y) * cos(z)
  // m[4] = cos(y) * sin(z)
  
  const sy = -m[8];
  
  // Check for gimbal lock
  if (Math.abs(sy) >= 0.99999) {
    // Gimbal lock case
    const x = Math.atan2(-m[6], m[5]);
    const y = Math.asin(Math.max(-1, Math.min(1, sy)));
    const z = 0;
    return [x, y, z];
  } else {
    // Normal case
    const x = Math.atan2(m[9], m[10]);
    const y = Math.asin(Math.max(-1, Math.min(1, sy)));
    const z = Math.atan2(m[4], m[0]);
    return [x, y, z];
  }
}
