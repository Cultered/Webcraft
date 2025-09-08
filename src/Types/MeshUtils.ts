import type { Mesh } from './MeshType';

export const LOD_MESH: Mesh = {
        id: "builtin-lod-mesh",
        vertices: new Float32Array(
            [1, 0, 0,
            -1, 0, 0,
            0, 1, 0,
            0, -1, 0,
            0, 0, 1,
            0, 0, -1]
        ),
        // For octahedron vertices, normals are the same as normalized positions
        normals: new Float32Array(
            [1, 0, 0,
            -1, 0, 0,
            0, 1, 0,
            0, -1, 0,
            0, 0, 1,
            0, 0, -1]
        ),

        // Initial faces (triangles) of the octahedron
        indices: new Uint32Array([
            4, 0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0,
            2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5,
        ])
    }
// Sphere generation by subdividing an octahedron.
export function generateSphereMesh(subdivisions: number, radius: number) {
    subdivisions = Math.max(0, Math.floor(subdivisions));

    // Initial octahedron vertices (unit length)
    const verts: number[][] = [
        [1, 0, 0],  // 0
        [-1, 0, 0], // 1
        [0, 1, 0],  // 2
        [0, -1, 0], // 3
        [0, 0, 1],  // 4
        [0, 0, -1], // 5
    ];

    // Initial faces (triangles) of the octahedron
    let faces: number[][] = [
        [4, 0, 2], [4, 2, 1], [4, 1, 3], [4, 3, 0],
        [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
    ];

    // Cache for midpoints to avoid duplicate vertices
    const midCache: Map<string, number> = new Map();

    const normalize = (p: number[]) => {
        const len = Math.hypot(p[0], p[1], p[2]) || 1;
        return [p[0] / len, p[1] / len, p[2] / len];
    };

    const getMidpointIndex = (i: number, j: number) => {
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        const existing = midCache.get(key);
        if (existing !== undefined) return existing;
        const a = verts[i];
        const b = verts[j];
        const mid = normalize([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
        const idx = verts.length;
        verts.push(mid);
        midCache.set(key, idx);
        return idx;
    };

    // Subdivide faces
    for (let s = 0; s < subdivisions; s++) {
        const nextFaces: number[][] = [];
        for (const f of faces) {
            const [a, b, c] = f;
            const ab = getMidpointIndex(a, b);
            const bc = getMidpointIndex(b, c);
            const ca = getMidpointIndex(c, a);
            nextFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
        }
        faces = nextFaces;
    }

    // Flatten vertices and scale to requested radius
    const outVerts: number[] = [];
    const outNormals: number[] = [];
    for (const v of verts) {
        const n = normalize(v);
        outVerts.push(n[0] * radius, n[1] * radius, n[2] * radius);
        // For spheres, normals are the same as normalized vertex positions
        outNormals.push(n[0], n[1], n[2]);
    }

    // Build indices
    const outIndices: number[] = [];
    for (const f of faces) {
        outIndices.push(f[0], f[1], f[2]);
    }

    // Choose appropriate index array type
    const indexArray = verts.length > 0xffff ? new Uint32Array(outIndices) : new Uint16Array(outIndices);

    return {
        vertices: new Float32Array(outVerts),
        normals: new Float32Array(outNormals),
        indices: indexArray,
    };
}

export function generateCubeMesh(size: number) {
    const hs = size;
    
    // Define vertices for each face separately to have proper normals
    const vertices = [
        // Front face
        -hs, -hs,  hs,   hs, -hs,  hs,   hs,  hs,  hs,  -hs,  hs,  hs,
        // Back face  
        -hs, -hs, -hs,  -hs,  hs, -hs,   hs,  hs, -hs,   hs, -hs, -hs,
        // Top face
        -hs,  hs, -hs,  -hs,  hs,  hs,   hs,  hs,  hs,   hs,  hs, -hs,
        // Bottom face
        -hs, -hs, -hs,   hs, -hs, -hs,   hs, -hs,  hs,  -hs, -hs,  hs,
        // Right face
         hs, -hs, -hs,   hs,  hs, -hs,   hs,  hs,  hs,   hs, -hs,  hs,
        // Left face
        -hs, -hs, -hs,  -hs, -hs,  hs,  -hs,  hs,  hs,  -hs,  hs, -hs
    ];

    const normals = [
        // Front face (0, 0, 1)
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        // Back face (0, 0, -1)
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        // Top face (0, 1, 0)
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        // Bottom face (0, -1, 0)
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        // Right face (1, 0, 0)
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        // Left face (-1, 0, 0)
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
    ];

    const indices = [
        0,  1,  2,   0,  2,  3,    // Front face
        4,  5,  6,   4,  6,  7,    // Back face
        8,  9,  10,  8,  10, 11,   // Top face
        12, 13, 14,  12, 14, 15,   // Bottom face
        16, 17, 18,  16, 18, 19,   // Right face
        20, 21, 22,  20, 22, 23    // Left face
    ];

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}