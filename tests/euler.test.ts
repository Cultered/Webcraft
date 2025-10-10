import { describe, it, expect } from "vitest";
import { mat4Rotation, mat4GetEulerZYX, mat4Identity } from "../src/misc/mat4";
import { Entity } from "../src/Model/Entity";

function almostEqual(a: number, b: number, eps = 1e-5) {
  return Math.abs(a - b) < eps;
}

describe("Euler angles", () => {
  describe("mat4GetEulerZYX", () => {
    it("extracts identity rotation as zero angles", () => {
      const identity = mat4Identity();
      const [x, y, z] = mat4GetEulerZYX(identity);
      expect(almostEqual(x, 0)).toBe(true);
      expect(almostEqual(y, 0)).toBe(true);
      expect(almostEqual(z, 0)).toBe(true);
    });

    it("extracts simple X rotation", () => {
      const angle = Math.PI / 4;
      const rot = mat4Rotation(angle, 0, 0);
      const [x, y, z] = mat4GetEulerZYX(rot);
      expect(almostEqual(x, angle)).toBe(true);
      expect(almostEqual(y, 0)).toBe(true);
      expect(almostEqual(z, 0)).toBe(true);
    });

    it("extracts simple Y rotation", () => {
      const angle = Math.PI / 3;
      const rot = mat4Rotation(0, angle, 0);
      const [x, y, z] = mat4GetEulerZYX(rot);
      expect(almostEqual(x, 0)).toBe(true);
      expect(almostEqual(y, angle)).toBe(true);
      expect(almostEqual(z, 0)).toBe(true);
    });

    it("extracts simple Z rotation", () => {
      const angle = Math.PI / 6;
      const rot = mat4Rotation(0, 0, angle);
      const [x, y, z] = mat4GetEulerZYX(rot);
      expect(almostEqual(x, 0)).toBe(true);
      expect(almostEqual(y, 0)).toBe(true);
      expect(almostEqual(z, angle)).toBe(true);
    });

    it("extracts combined XYZ rotation", () => {
      const xAngle = 0.5;
      const yAngle = 0.3;
      const zAngle = 0.7;
      const rot = mat4Rotation(xAngle, yAngle, zAngle);
      const [x, y, z] = mat4GetEulerZYX(rot);
      expect(almostEqual(x, xAngle)).toBe(true);
      expect(almostEqual(y, yAngle)).toBe(true);
      expect(almostEqual(z, zAngle)).toBe(true);
    });

    it("round-trip: rotation -> euler -> rotation preserves rotation", () => {
      const xAngle = 0.5;
      const yAngle = 0.3;
      const zAngle = 0.7;
      const rot1 = mat4Rotation(xAngle, yAngle, zAngle);
      const [x, y, z] = mat4GetEulerZYX(rot1);
      const rot2 = mat4Rotation(x, y, z);
      
      // Check if matrices are equal
      for (let i = 0; i < 16; i++) {
        expect(almostEqual(rot1[i], rot2[i])).toBe(true);
      }
    });
  });

  describe("Entity Euler API", () => {
    it("getEuler returns zero for default entity", () => {
      const entity = new Entity("test");
      const [x, y, z] = entity.getEuler();
      expect(almostEqual(x, 0)).toBe(true);
      expect(almostEqual(y, 0)).toBe(true);
      expect(almostEqual(z, 0)).toBe(true);
    });

    it("setEuler sets rotation correctly", () => {
      const entity = new Entity("test");
      const xAngle = 0.5;
      const yAngle = 0.3;
      const zAngle = 0.7;
      
      entity.setEuler(xAngle, yAngle, zAngle);
      const [x, y, z] = entity.getEuler();
      
      expect(almostEqual(x, xAngle)).toBe(true);
      expect(almostEqual(y, yAngle)).toBe(true);
      expect(almostEqual(z, zAngle)).toBe(true);
    });

    it("rotateEuler adds to current rotation", () => {
      const entity = new Entity("test");
      entity.setEuler(0.1, 0.2, 0.3);
      entity.rotateEuler(0.4, 0.5, 0.6);
      
      const [x, y, z] = entity.getEuler();
      expect(almostEqual(x, 0.5)).toBe(true);
      expect(almostEqual(y, 0.7)).toBe(true);
      expect(almostEqual(z, 0.9)).toBe(true);
    });

    it("getEuler caches result when rotation unchanged", () => {
      const entity = new Entity("test");
      entity.setEuler(0.5, 0.3, 0.7);
      
      const euler1 = entity.getEuler();
      const euler2 = entity.getEuler();
      
      // Should return the same array reference (cached)
      expect(euler1).toBe(euler2);
    });

    it("getEuler recalculates when rotation changed externally", () => {
      const entity = new Entity("test");
      entity.setEuler(0.5, 0.3, 0.7);
      
      const euler1 = entity.getEuler();
      
      // Change rotation directly
      entity.rotation = mat4Rotation(0.1, 0.2, 0.3);
      
      const euler2 = entity.getEuler();
      
      // Should be different arrays (recalculated)
      expect(euler1).not.toBe(euler2);
      expect(almostEqual(euler2[0], 0.1)).toBe(true);
      expect(almostEqual(euler2[1], 0.2)).toBe(true);
      expect(almostEqual(euler2[2], 0.3)).toBe(true);
    });

    it("setEuler marks inverse rotation for update", () => {
      const entity = new Entity("test");
      entity.updateInverseRotation = false;
      
      entity.setEuler(0.5, 0.3, 0.7);
      
      expect(entity.updateInverseRotation).toBe(true);
    });
  });
});
