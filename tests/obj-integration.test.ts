import { describe, it, expect } from 'vitest';
import { loadOBJ } from '../src/Types/MeshUtils';

describe('OBJ Integration Workflow', () => {
    it('should demonstrate complete workflow from OBJ to renderable mesh', () => {
        // Example: A simple pyramid (square base with 4 triangular faces)
        const pyramidOBJ = `
# Pyramid with square base
v 0.0 0.0 0.0    # Base center
v 1.0 0.0 1.0    # Base corner 1  
v -1.0 0.0 1.0   # Base corner 2
v -1.0 0.0 -1.0  # Base corner 3
v 1.0 0.0 -1.0   # Base corner 4
v 0.0 2.0 0.0    # Apex

# Texture coordinates
vt 0.5 0.5
vt 1.0 0.0
vt 0.0 0.0
vt 0.0 1.0
vt 1.0 1.0
vt 0.5 1.0

# Base (using center point for triangulation)
f 1/1 2/2 3/3
f 1/1 3/3 4/4
f 1/1 4/4 5/5
f 1/1 5/5 2/2

# Side faces
f 2/2 6/6 3/3
f 3/3 6/6 4/4
f 4/4 6/6 5/5
f 5/5 6/6 2/2
`;

        const meshData = loadOBJ(pyramidOBJ);
        
        // Create a full mesh object as would be done in the application
        const mesh = {
            id: 'pyramid-mesh',
            ...meshData
        };
        
        // Verify mesh structure matches expected format
        expect(mesh.id).toBe('pyramid-mesh');
        expect(mesh.vertices).toBeInstanceOf(Float32Array);
        expect(mesh.normals).toBeInstanceOf(Float32Array);
        expect(mesh.uvs).toBeInstanceOf(Float32Array);
        expect(mesh.indices).toBeInstanceOf(Uint16Array);
        
        // Verify we have the expected geometry
        const vertexCount = mesh.vertices.length / 3;
        const triangleCount = mesh.indices.length / 3;
        
        expect(vertexCount).toBe(6); // 6 unique vertices
        expect(triangleCount).toBe(8); // 8 triangular faces
        
        expect(mesh.normals.length).toBe(mesh.vertices.length); // 3 components per vertex
        expect(mesh.uvs.length).toBe(vertexCount * 2); // 2 components per vertex
        
        // Verify all normals are unit length (or close to it)
        for (let i = 0; i < mesh.normals.length; i += 3) {
            const nx = mesh.normals[i];
            const ny = mesh.normals[i + 1]; 
            const nz = mesh.normals[i + 2];
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
            expect(length).toBeCloseTo(1.0, 5);
        }
        
        // Verify UV coordinates are in valid range
        for (let i = 0; i < mesh.uvs.length; i++) {
            expect(mesh.uvs[i]).toBeGreaterThanOrEqual(0);
            expect(mesh.uvs[i]).toBeLessThanOrEqual(1);
        }
        
        // This mesh could now be used exactly like generateSphereMesh or generateCubeMesh:
        // view.uploadMeshToGPU(mesh.id, mesh.vertices, mesh.normals, mesh.uvs, mesh.indices);
        // const meshComponent = new MeshComponent(mesh, true, 'pyramid-texture');
        
        console.log(`Successfully loaded pyramid mesh with ${vertexCount} vertices and ${triangleCount} triangles`);
    });
});