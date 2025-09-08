import { describe, it, expect } from 'vitest';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from '../src/Types/MeshUtils';

describe('Mesh Normals', () => {
    it('should generate normals for sphere mesh', () => {
        const sphere = generateSphereMesh(1, 1.0);
        
        // Should have same number of normal components as vertex components
        expect(sphere.normals.length).toBe(sphere.vertices.length);
        
        // For a unit sphere, normals should be unit length and point outward
        const vertexCount = sphere.vertices.length / 3;
        for (let i = 0; i < vertexCount; i++) {
            const nx = sphere.normals[i * 3];
            const ny = sphere.normals[i * 3 + 1]; 
            const nz = sphere.normals[i * 3 + 2];
            
            // Normal should be approximately unit length
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
            expect(length).toBeCloseTo(1.0, 5);
        }
    });

    it('should generate normals for cube mesh', () => {
        const cube = generateCubeMesh(1.0);
        
        // Should have same number of normal components as vertex components
        expect(cube.normals.length).toBe(cube.vertices.length);
        
        // Cube should have 24 vertices (4 per face * 6 faces)
        expect(cube.vertices.length).toBe(24 * 3);
        expect(cube.normals.length).toBe(24 * 3);
        
        // Check that normals are unit vectors
        const vertexCount = cube.vertices.length / 3;
        for (let i = 0; i < vertexCount; i++) {
            const nx = cube.normals[i * 3];
            const ny = cube.normals[i * 3 + 1];
            const nz = cube.normals[i * 3 + 2];
            
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
            expect(length).toBeCloseTo(1.0, 5);
        }
    });

    it('should have normals for LOD_MESH', () => {
        // Should have same number of normal components as vertex components
        expect(LOD_MESH.normals.length).toBe(LOD_MESH.vertices.length);
        
        // For octahedron vertices at unit distance, normals should be the same as positions
        const vertexCount = LOD_MESH.vertices.length / 3;
        for (let i = 0; i < vertexCount; i++) {
            const vx = LOD_MESH.vertices[i * 3];
            const vy = LOD_MESH.vertices[i * 3 + 1];
            const vz = LOD_MESH.vertices[i * 3 + 2];
            
            const nx = LOD_MESH.normals[i * 3];
            const ny = LOD_MESH.normals[i * 3 + 1];
            const nz = LOD_MESH.normals[i * 3 + 2];
            
            // For unit octahedron, normals should equal positions
            expect(nx).toBeCloseTo(vx, 5);
            expect(ny).toBeCloseTo(vy, 5);
            expect(nz).toBeCloseTo(vz, 5);
        }
    });
});