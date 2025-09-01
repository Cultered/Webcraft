import { describe, it, expect } from 'vitest';
import { MeshComponent } from './MeshComponent';
import { Entity } from '../Entity';
import type { Mesh } from '../../Types/Mesh';

// Mock mesh for testing
const mockMesh: Mesh = {
    id: 'test-mesh',
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2])
};

describe('MeshComponent', () => {
    it('should create mesh component with correct properties', () => {
        const component = new MeshComponent(mockMesh, true);
        
        expect(component.mesh).toBe(mockMesh);
        expect(component.useLOD).toBe(true);
    });

    it('should create mesh component with LOD disabled', () => {
        const component = new MeshComponent(mockMesh, false);
        
        expect(component.mesh).toBe(mockMesh);
        expect(component.useLOD).toBe(false);
    });

    it('should set entity mesh property on start', () => {
        const entity = new Entity('test-entity');
        const component = new MeshComponent(mockMesh, true);
        
        component.start(entity);
        
        expect(entity.props.mesh).toBe('test-mesh');
    });

    it('should restore original mesh', () => {
        const entity = new Entity('test-entity');
        const component = new MeshComponent(mockMesh, true);
        
        // Simulate LOD mesh being set
        entity.props.mesh = 'builtin-lod-mesh';
        
        component.restoreMesh(entity);
        
        expect(entity.props.mesh).toBe('test-mesh');
    });

    it('should apply LOD when useLOD is true', () => {
        const entity = new Entity('test-entity');
        const component = new MeshComponent(mockMesh, true);
        
        // Start with original mesh
        component.start(entity);
        expect(entity.props.mesh).toBe('test-mesh');
        
        // Apply LOD reduction
        component.LODReduce(entity);
        
        expect(entity.props.mesh).toBe('builtin-lod-mesh');
    });

    it('should not apply LOD when useLOD is false', () => {
        const entity = new Entity('test-entity');
        const component = new MeshComponent(mockMesh, false);
        
        // Start with original mesh
        component.start(entity);
        expect(entity.props.mesh).toBe('test-mesh');
        
        // Try to apply LOD reduction (should not change)
        component.LODReduce(entity);
        
        expect(entity.props.mesh).toBe('test-mesh'); // Should remain unchanged
    });

    it('should work with complex mesh data', () => {
        const complexMesh: Mesh = {
            id: 'complex-mesh',
            vertices: new Float32Array([
                -1, -1, 0,  // vertex 0
                 1, -1, 0,  // vertex 1
                 0,  1, 0   // vertex 2
            ]),
            indices: new Uint32Array([0, 1, 2]) // Using Uint32Array
        };
        
        const entity = new Entity('test-entity');
        const component = new MeshComponent(complexMesh, true);
        
        component.start(entity);
        expect(entity.props.mesh).toBe('complex-mesh');
        
        component.LODReduce(entity);
        expect(entity.props.mesh).toBe('builtin-lod-mesh');
        
        component.restoreMesh(entity);
        expect(entity.props.mesh).toBe('complex-mesh');
    });

    it('should maintain mesh reference integrity', () => {
        const component = new MeshComponent(mockMesh, true);
        
        // Mesh should be stored by reference, not copied
        expect(component.mesh).toBe(mockMesh);
        expect(component.mesh.vertices).toBe(mockMesh.vertices);
        expect(component.mesh.indices).toBe(mockMesh.indices);
    });
});