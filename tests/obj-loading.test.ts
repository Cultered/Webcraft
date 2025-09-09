import { describe, it, expect } from 'vitest';
import { loadOBJ } from '../src/Types/MeshUtils';

describe('OBJ Loading', () => {
    it('should parse a simple triangle OBJ file', () => {
        const objContent = `
# Simple triangle
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.5 1.0
f 1/1/1 2/2/2 3/3/3
`;

        const mesh = loadOBJ(objContent);
        
        expect(mesh.vertices).toBeDefined();
        expect(mesh.normals).toBeDefined();
        expect(mesh.uvs).toBeDefined();
        expect(mesh.indices).toBeDefined();
        
        // Should have 3 vertices
        expect(mesh.vertices.length).toBe(9); // 3 vertices * 3 components
        expect(mesh.normals.length).toBe(9);  // 3 normals * 3 components
        expect(mesh.uvs.length).toBe(6);      // 3 UVs * 2 components
        expect(mesh.indices.length).toBe(3);  // 1 triangle * 3 indices
        
        // Check vertex positions
        expect(mesh.vertices[0]).toBe(0.0); // v1.x
        expect(mesh.vertices[1]).toBe(0.0); // v1.y
        expect(mesh.vertices[2]).toBe(0.0); // v1.z
        expect(mesh.vertices[3]).toBe(1.0); // v2.x
        expect(mesh.vertices[6]).toBe(0.5); // v3.x
        expect(mesh.vertices[7]).toBe(1.0); // v3.y
    });

    it('should handle OBJ files without UVs', () => {
        const objContent = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
f 1//1 2//2 3//3
`;

        const mesh = loadOBJ(objContent);
        
        expect(mesh.vertices.length).toBe(9);
        expect(mesh.normals.length).toBe(9);
        // Should have default UVs (0,0) for each vertex
        expect(mesh.uvs.length).toBe(6);
        expect(mesh.indices.length).toBe(3);
    });

    it('should handle OBJ files without normals', () => {
        const objContent = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.5 1.0
f 1/1 2/2 3/3
`;

        const mesh = loadOBJ(objContent);
        
        expect(mesh.vertices.length).toBe(9);
        expect(mesh.uvs.length).toBe(6);
        // Should have computed normals
        expect(mesh.normals.length).toBe(9);
        expect(mesh.indices.length).toBe(3);
    });

    it('should throw error for invalid OBJ content', () => {
        const objContent = 'invalid content';
        
        expect(() => loadOBJ(objContent)).toThrow();
    });

    it('should handle multiple faces', () => {
        const objContent = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
v 0.5 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 1.0 0.0
f 1//1 2//2 3//3
f 1//1 3//3 4//4
`;

        const mesh = loadOBJ(objContent);
        
        expect(mesh.vertices.length).toBe(12); // 4 vertices
        expect(mesh.indices.length).toBe(6);   // 2 triangles
    });

    it('should create a mesh compatible with existing Mesh type', () => {
        const objContent = `
v -1.0 -1.0 0.0
v 1.0 -1.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.5 1.0
f 1/1/1 2/2/2 3/3/3
`;

        const meshData = loadOBJ(objContent);
        const mesh = { id: 'test-obj-mesh', ...meshData };
        
        // Verify it matches the Mesh type structure
        expect(mesh.id).toBe('test-obj-mesh');
        expect(mesh.vertices).toBeInstanceOf(Float32Array);
        expect(mesh.normals).toBeInstanceOf(Float32Array);
        expect(mesh.uvs).toBeInstanceOf(Float32Array);
        expect(mesh.indices).toBeInstanceOf(Uint16Array);
        
        // Verify arrays have consistent lengths
        const vertexCount = mesh.vertices.length / 3;
        expect(mesh.normals.length).toBe(vertexCount * 3);
        expect(mesh.uvs.length).toBe(vertexCount * 2);
        expect(mesh.indices.length % 3).toBe(0); // Should be multiple of 3 (triangles)
    });

    it('should integrate with main application workflow', () => {
        // This test shows how loadOBJ would be used in the main application
        const objContent = `
# Tetrahedron
v 0.0 1.0 0.0
v -1.0 -1.0 1.0  
v 1.0 -1.0 1.0
v 0.0 -1.0 -1.0
vt 0.5 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.5 0.0
f 1/1 2/2 3/3
f 1/1 3/3 4/4
f 1/1 4/4 2/2
f 2/2 4/4 3/3
`;

        const meshData = loadOBJ(objContent);
        const mesh = { id: 'tetrahedron-obj', ...meshData };
        
        // Verify this mesh could be used the same way as generateSphereMesh or generateCubeMesh
        expect(mesh).toHaveProperty('id');
        expect(mesh).toHaveProperty('vertices');
        expect(mesh).toHaveProperty('normals');  
        expect(mesh).toHaveProperty('uvs');
        expect(mesh).toHaveProperty('indices');
        
        // Could be passed to view.uploadMeshToGPU like: 
        // view.uploadMeshToGPU(mesh.id, mesh.vertices, mesh.normals, mesh.uvs, mesh.indices);
        
        // And used in MeshComponent like:
        // const meshComponent = new MeshComponent(mesh, true, 'example-texture');
        
        expect(mesh.vertices.length).toBe(12); // 4 vertices * 3 components
        expect(mesh.indices.length).toBe(12);  // 4 triangles * 3 indices
    });
});