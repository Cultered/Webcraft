import { describe, it, expect } from "vitest";
import {
  quat,
  quatIdentity,
  quatFromEuler,
  quatMul,
  quatNormalize,
  quatConjugate,
  quatToMat4,
  quatRotateVec4,
} from "../src/misc/quat";
import { vec4 } from "../src/misc/vec4";
import { mat4Rotation } from "../src/misc/mat4";

function almostEqual(a: number, b: number, eps = 1e-5) {
  return Math.abs(a - b) < eps;
}

function quatEquals(a: Float32Array, b: Float32Array, eps = 1e-5) {
  for (let i = 0; i < 4; i++) {
    if (!almostEqual(a[i], b[i], eps)) {
      throw new Error(`quatEquals: element ${i} differs: ${a[i]} != ${b[i]}`);
    }
  }
  return true;
}

function vec4Equals(a: Float32Array, b: Float32Array, eps = 1e-5) {
  for (let i = 0; i < 4; i++) {
    if (!almostEqual(a[i], b[i], eps)) {
      throw new Error(`vec4Equals: element ${i} differs: ${a[i]} != ${b[i]}`);
    }
  }
  return true;
}

describe("quat", () => {
  it("identity quaternion", () => {
    const id = quatIdentity();
    expect(quatEquals(id, quat(0, 0, 0, 1))).toBe(true);
  });

  it("creates quaternion from Euler angles (no rotation)", () => {
    const q = quatFromEuler(0, 0, 0);
    expect(quatEquals(q, quat(0, 0, 0, 1))).toBe(true);
  });

  it("creates quaternion from Euler angles (90deg Y rotation)", () => {
    const q = quatFromEuler(0, Math.PI / 2, 0);
    const expected = quat(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
    expect(quatEquals(q, expected)).toBe(true);
  });

  it("quaternion multiplication", () => {
    const q1 = quatFromEuler(0, Math.PI / 2, 0);
    const q2 = quatFromEuler(0, Math.PI / 2, 0);
    const result = quat();
    quatMul(result, q1, q2);
    
    // Two 90-degree Y rotations should equal 180-degree Y rotation
    const expected = quatFromEuler(0, Math.PI, 0);
    expect(quatEquals(result, expected)).toBe(true);
  });

  it("quaternion normalization", () => {
    const q = quat(1, 2, 3, 4);
    const normalized = quat();
    quatNormalize(normalized, q);
    
    const len = Math.sqrt(
      normalized[0] * normalized[0] +
      normalized[1] * normalized[1] +
      normalized[2] * normalized[2] +
      normalized[3] * normalized[3]
    );
    expect(almostEqual(len, 1.0)).toBe(true);
  });

  it("quaternion conjugate", () => {
    const q = quat(1, 2, 3, 4);
    const conj = quat();
    quatConjugate(conj, q);
    expect(quatEquals(conj, quat(-1, -2, -3, 4))).toBe(true);
  });

  it("quaternion to matrix conversion (identity)", () => {
    const q = quatIdentity();
    const m = quatToMat4(q);
    
    // Should produce identity matrix
    const expected = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    for (let i = 0; i < 16; i++) {
      expect(almostEqual(m[i], expected[i])).toBe(true);
    }
  });

  it("rotates vector by quaternion", () => {
    // 90-degree rotation around Y axis
    const q = quatFromEuler(0, Math.PI / 2, 0);
    const v = vec4(1, 0, 0, 0); // X-axis
    const result = vec4();
    
    quatRotateVec4(result, q, v);
    
    // Should rotate X-axis to Z-axis
    expect(almostEqual(result[0], 0, 1e-5)).toBe(true);
    expect(almostEqual(result[1], 0, 1e-5)).toBe(true);
    expect(almostEqual(result[2], -1, 1e-5)).toBe(true);
    expect(result[3]).toBe(0);
  });

  it("converts Euler angles to matrix matches mat4Rotation", () => {
    const q = quatFromEuler(0, Math.PI / 2, 0);
    const quatM = quatToMat4(q);
    const mat4M = mat4Rotation(0, Math.PI / 2, 0);
    
    // Compare the two matrices
    for (let i = 0; i < 16; i++) {
      expect(almostEqual(quatM[i], mat4M[i], 1e-5)).toBe(true);
    }
  });
});
