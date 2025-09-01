import { describe, it, expect } from 'vitest';
import { Rotator } from './Rotator';
import { Entity } from '../Entity';
import * as M from '../../misc/Matrix4x4';

// Helper to compare matrices with tolerance for floating point precision
function matricesEqual(a: Float32Array, b: Float32Array, tolerance = 1e-6): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > tolerance) return false;
    }
    return true;
}

describe('Rotator', () => {
    it('should create rotator with default values', () => {
        const rotator = new Rotator();
        
        expect(rotator.speed).toBe(0.1);
        expect(rotator.axis).toEqual({ x: 0, y: 1, z: 0 }); // Default Y-axis rotation
    });

    it('should create rotator with custom values', () => {
        const rotator = new Rotator(0.5, { x: 1, y: 0, z: 0 });
        
        expect(rotator.speed).toBe(0.5);
        expect(rotator.axis).toEqual({ x: 1, y: 0, z: 0 });
    });

    it('should implement start method', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator();
        
        // start() should exist and not throw, but currently returns undefined
        const result = rotator.start(entity);
        expect(result).toBeUndefined();
    });

    it('should update entity rotation around Y-axis', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(1.0, { x: 0, y: 1, z: 0 }); // 1 radian per second around Y
        
        const originalRotation = new Float32Array(entity.rotation);
        
        // Update with 1000ms (1 second)
        const result = rotator.update(entity, 1000);
        
        // Entity rotation should have changed
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(false);
        expect(result).toBe(entity.rotation);
    });

    it('should update entity rotation around X-axis', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(1.0, { x: 1, y: 0, z: 0 }); // Around X-axis
        
        const originalRotation = new Float32Array(entity.rotation);
        
        // Update with 500ms (0.5 seconds)
        rotator.update(entity, 500);
        
        // Entity rotation should have changed
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(false);
    });

    it('should use default deltaMs when not provided', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(1.0, { x: 0, y: 1, z: 0 });
        
        const originalRotation = new Float32Array(entity.rotation);
        
        // Update without deltaMs (should use default 16ms)
        rotator.update(entity);
        
        // Should still rotate, just by a small amount
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(false);
    });

    it('should accumulate rotation over multiple updates', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(Math.PI, { x: 0, y: 1, z: 0 }); // π radians per second
        
        // Apply rotation twice, each for 500ms (total: π radians)
        rotator.update(entity, 500);
        const halfRotation = new Float32Array(entity.rotation);
        
        rotator.update(entity, 500);
        const fullRotation = entity.rotation;
        
        // Both rotations should be different from identity and from each other
        expect(matricesEqual(halfRotation, M.mat4Identity())).toBe(false);
        expect(matricesEqual(fullRotation, M.mat4Identity())).toBe(false);
        expect(matricesEqual(halfRotation, fullRotation)).toBe(false);
    });

    it('should handle zero speed correctly', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(0, { x: 0, y: 1, z: 0 });
        
        const originalRotation = new Float32Array(entity.rotation);
        
        rotator.update(entity, 1000);
        
        // Rotation should remain unchanged with zero speed
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(true);
    });

    it('should handle negative speed (reverse rotation)', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(-1.0, { x: 0, y: 1, z: 0 });
        
        const originalRotation = new Float32Array(entity.rotation);
        
        rotator.update(entity, 1000);
        
        // Should rotate in opposite direction
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(false);
    });

    it('should handle rotation around custom axis', () => {
        const entity = new Entity('test-entity');
        // Diagonal axis (normalized by the matrix function)
        const rotator = new Rotator(1.0, { x: 1, y: 1, z: 1 });
        
        const originalRotation = new Float32Array(entity.rotation);
        
        rotator.update(entity, 1000);
        
        expect(matricesEqual(entity.rotation, originalRotation)).toBe(false);
    });

    it('should work with entity that has existing rotation', () => {
        const entity = new Entity('test-entity');
        // Set initial rotation
        entity.rotation = M.mat4Rotation(Math.PI / 4, 0, 0); // 45 degrees around X
        
        const rotator = new Rotator(1.0, { x: 0, y: 1, z: 0 });
        const initialRotation = new Float32Array(entity.rotation);
        
        rotator.update(entity, 1000);
        
        // Should be different from initial rotation
        expect(matricesEqual(entity.rotation, initialRotation)).toBe(false);
    });

    it('should return the updated rotation matrix', () => {
        const entity = new Entity('test-entity');
        const rotator = new Rotator(1.0, { x: 0, y: 1, z: 0 });
        
        const result = rotator.update(entity, 1000);
        
        // The return value should be the entity's rotation matrix
        expect(result).toBe(entity.rotation);
        expect(result).toBeInstanceOf(Float32Array);
        expect(result.length).toBe(16); // 4x4 matrix
    });
});