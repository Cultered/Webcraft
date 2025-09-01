import type { Vector4 } from '../Types/Vector4';

// factory
export function vec4(x=0, y=0, z=0, w=0): Vector4 {
  const v = new Float32Array(4);
  v[0] = x; v[1] = y; v[2] = z; v[3] = w;
  return v;
}

// constants
export const up = () => vec4(0,1,0,0);
export const right = () => vec4(1,0,0,0);
export const forward = () =>  vec4(0,0,1,0);

// operations (out pattern to avoid allocs)
export function vec4Neg(out: Vector4, a: Vector4): Vector4 {
  if(out === a) {
    throw new Error("Unsafe : out must not be the same as a");
  }
  if(out.length !== 4) {
    throw new Error("vec4Scale: out length must be 4");
  }
  out[0] = -a[0]; out[1] = -a[1]; out[2] = -a[2]; out[3] = -a[3];
  return out;
}

export function vec4Add(out: Vector4, a: Vector4, b: Vector4): Vector4 {
  if(out.length !== 4) {
    throw new Error("vec4Scale: out length must be 4");
  }
  if(out === a ||out === b) {
    throw new Error("Unsafe : out must not be the same as a or b");
  }
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  return out;
}

export function vec4Sub(out: Vector4, a: Vector4, b: Vector4): Vector4 {
  if(out.length !== 4) {
    throw new Error("vec4Scale: out length must be 4");
  }
  if(out === a ||out === b) {
    throw new Error("Unsafe : out must not be the same as a or b");
  }
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  return out;
}

export function vec4Scale(out: Vector4, a: Vector4, q: number): Vector4 {
  if(out.length !== 4) {
    throw new Error("vec4Scale: out length must be 4");
  }
  if(out === a) {
    throw new Error("Unsafe : out must not be the same as a");
  }
  out[0] = a[0] * q;
  out[1] = a[1] * q;
  out[2] = a[2] * q;
  out[3] = a[3] * q;
  return out;
}

export function vec4Dot(a: Vector4, b: Vector4): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
}

export function vec4LenSq(a: Vector4): number {
  return vec4Dot(a, a);
}
