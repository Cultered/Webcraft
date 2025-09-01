import { describe, it, expect } from "vitest";
import {
  mat4, mat4Identity, mat4Inverse, mat4Mul, mat4MulVec4,
  mat4Translation, mat4Scale, mat4Rotation, mat4TRS, mat4Projection,
} from "../src/misc/mat4";
import { vec4LenSq } from "../src/misc/vec4";
function almostEqual(a: number, b: number, eps = 1e-5) {
  return Math.abs(a - b) < eps;
}

function matEquals(a: Float32Array, b: Float32Array, eps = 1e-5) {
  for (let i = 0; i < 16; i++) {
    if (!almostEqual(a[i], b[i], eps)) throw new Error(`matEquals: element ${i} differs: ${a[i]} != ${b[i]}`);
  }
  return true;
}

describe("mat4", () => {
  it("identity matrix", () => {
    const id = mat4Identity();
    const expected = mat4(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    expect(matEquals(id, expected)).toBe(true);
  });

  it("inverse(identity) = identity", () => {
    const out = mat4();
    mat4Inverse(out, mat4Identity());
    expect(matEquals(out, mat4Identity())).toBe(true);
  });

  it("A * A^-1 = identity", () => {
    const a = mat4Rotation(1, 2, 3);
    const inv = mat4();
    mat4Inverse(inv, a);
    const out = mat4();
    mat4Mul(out, a, inv);
    expect(matEquals(out, mat4Identity())).toBe(true);
  });

  it("inverse works", () => {
    const a = mat4(
      1, 22234, 3, 4243,
      5243, 6, 7423, 8,
      9234, 10, 11, 12,
      13, 12344, 15, 16432);
    const inv = mat4Inverse(new Float32Array(16), a);
    const expected = mat4(
      0, 0, 0.00010838664614517212595, 0,
      0.000052502847847078432678, 0, 0, 0. - 0.00001355706861796709521,
      0, 0.00013482988810888231194, -0.000076555443718470262167, 0,
      -0.000039441038301478260688, 0, 0, 0.000071041238182107464138

    );
    expect(matEquals(inv, expected)).toBe(true);
  });
  it("vector multiplication works", () => {
    const m = mat4(
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16);
    const v = new Float32Array([1, 2, 3, 4]);
    const out = mat4MulVec4(new Float32Array(4), m, v);
    expect(Array.from(out)).toEqual([30, 70, 110, 150]);
  });

  it("multiplication works", () => {
    const a = mat4(
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16);
    const b = mat4(
      17, 18, 19, 20,
      21, 22, 23, 24,
      25, 26, 27, 28,
      29, 30, 31, 32);
    const out = mat4Mul(new Float32Array(16), a, b);
    const expected = mat4(
      250, 260, 270, 280,
      618, 644, 670, 696,
      986, 1028, 1070, 1112,
      1354, 1412, 1470, 1528
    );
    expect(matEquals(out, expected)).toBe(true);
  });

  it("translation works", () => {
    const m = mat4Translation(2, 3, 4);
    const v = new Float32Array([1, 1, 1, 1]);
    const out = mat4MulVec4(new Float32Array(4), m, v);
    expect(Array.from(out)).toEqual([3, 4, 5, 1]);
  });

  it("scale works", () => {
    const m = mat4Scale(2, 3, 4);
    const v = new Float32Array([1, 1, 1, 1]);
    const out = new Float32Array(4);
    mat4MulVec4(out, m, v);
    expect(Array.from(out)).toEqual([2, 3, 4, 1]);
  });

  it("rotation works", () => {
    const m = mat4Rotation(0, 0, Math.PI);
    const v = new Float32Array([1, 2, 3, 0]);
    const out = new Float32Array(4);
    mat4MulVec4(out, m, v);
    const dlen = vec4LenSq(v) - vec4LenSq(out);
    expect(dlen).toBeCloseTo(0);
    expect(out[0]).toBeCloseTo(-1)
    expect(out[1]).toBeCloseTo(-2)
    expect(out[2]).toBeCloseTo(3)
  })
  it("rotation 100x times will not change vector length", () => {
    const m = mat4Rotation(-2, 53453, 312);
    const v = new Float32Array([1, 2, 3, 0]);
    let out = new Float32Array(4);
    for (let i = 0; i < 100; i++)
      mat4MulVec4(out, m, v);
    const dlen = vec4LenSq(v) - vec4LenSq(out);
    expect(dlen).toBeCloseTo(0);
  })

  it("projection has correct perspective", () => {
    const proj = mat4Projection(Math.PI / 2, 1, 1, 1000);
    const v = new Float32Array([0, 0, -900, 1]);

    const clip = mat4MulVec4(new Float32Array(4), proj, v);
    const ndcX = clip[0] / clip[3];
    const ndcY = clip[1] / clip[3];
    const ndcZ = clip[2] / clip[3];

    expect(ndcX).toBeCloseTo(0);
    expect(ndcY).toBeCloseTo(0);

    expect(ndcZ).toBeGreaterThan(0);
    expect(ndcZ).toBeLessThan(1);
  });
  it("TRS matches manual composition", () => {
    const t = [1, 2, 3];
    const r = mat4Rotation(0, Math.PI / 2, 0);
    const s = [2, 2, 2];

    const trs = mat4TRS(t, r, s);

    const tmp = mat4();
    const manual = mat4();
    mat4Mul(tmp, r, mat4Scale(2, 2, 2));
    mat4Mul(manual, mat4Translation(1, 2, 3), tmp);

    expect(matEquals(trs, manual)).toBe(true);
  });
});
