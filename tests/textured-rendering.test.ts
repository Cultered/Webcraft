import { describe, it, expect } from 'vitest';
import { generateSphereMesh, generateCubeMesh } from '../src/Types/MeshUtils';
import { MeshComponent } from '../src/Model/Components/MeshComponent';

describe('Textured Rendering', () => {
    it('should generate sphere mesh with UV coordinates', () => {
        const sphereMesh = generateSphereMesh(1, 1);
        
        // Should have UV coordinates
        expect(sphereMesh.uvs).toBeDefined();
        expect(sphereMesh.uvs.length).toBeGreaterThan(0);
        
        // UV coordinates should be 2 per vertex
        const vertexCount = sphereMesh.vertices.length / 3;
        expect(sphereMesh.uvs.length).toBe(vertexCount * 2);
        
        // UV coordinates should be in range [0, 1]
        for (let i = 0; i < sphereMesh.uvs.length; i++) {
            expect(sphereMesh.uvs[i]).toBeGreaterThanOrEqual(0);
            expect(sphereMesh.uvs[i]).toBeLessThanOrEqual(1);
        }
    });
    
    it('should generate cube mesh with UV coordinates', () => {
        const cubeMesh = generateCubeMesh(1);
        
        // Should have UV coordinates
        expect(cubeMesh.uvs).toBeDefined();
        expect(cubeMesh.uvs.length).toBeGreaterThan(0);
        
        // UV coordinates should be 2 per vertex
        const vertexCount = cubeMesh.vertices.length / 3;
        expect(cubeMesh.uvs.length).toBe(vertexCount * 2);
        
        // UV coordinates should be in range [0, 1] 
        for (let i = 0; i < cubeMesh.uvs.length; i++) {
            expect(cubeMesh.uvs[i]).toBeGreaterThanOrEqual(0);
            expect(cubeMesh.uvs[i]).toBeLessThanOrEqual(1);
        }
    });
    
    it('should create MeshComponent with texture property', () => {
        const cubeMesh = {id:"test", ...generateCubeMesh(1)};
        const meshComponent = new MeshComponent(cubeMesh, 'test-texture');
        
        expect(meshComponent.mesh).toBe(cubeMesh);
        expect(meshComponent.texture).toBe('test-texture');
    });
    
    it('should use default primitive texture when no texture specified', () => {
        const cubeMesh = {id:"test", ...generateCubeMesh(1)};
        const meshComponent = new MeshComponent(cubeMesh,);
        
        expect(meshComponent.texture).toBe('primitive');
    });
});