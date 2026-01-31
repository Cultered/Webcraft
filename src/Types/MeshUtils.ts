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
    // Basic UV coordinates for octahedron
    uvs: new Float32Array(
        [1, 0.5,
            0, 0.5,
            0.5, 1,
            0.5, 0,
            0.75, 0.75,
            0.25, 0.25]
    ),
    // Initial faces (triangles) of the octahedron
    indices: new Uint32Array([
        4, 0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0,
        2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5,
    ])
}

export function generateHDPlaneMesh(size: number, subdivisions: number) {
    const hs = size / 2; // half size
    const step = size / subdivisions;
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= subdivisions; i++) {
        for (let j = 0; j <= subdivisions; j++) {
            const x = -hs + j * step;
            const z = -hs + i * step;
            vertices.push(x, 0, z);
            normals.push(0, 1, 0);
            uvs.push(j / subdivisions, i / subdivisions);
        }
    }
    for (let i = 0; i < subdivisions; i++) {
        for (let j = 0; j < subdivisions; j++) {
            const row1 = i * (subdivisions + 1);
            const row2 = (i + 1) * (subdivisions + 1);
            indices.push(
                row1 + j, row2 + j, row1 + j + 1,
                row1 + j + 1, row2 + j, row2 + j + 1
            );
        }
    }
    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: subdivisions > 256 ? new Uint32Array(indices) : new Uint16Array(indices),
    };
}

export function generatePlaneMesh(size: number) {
    const hs = size / 2; // half size

    // Four vertices for a plane in the XZ plane (Y=0)
    const vertices = [
        -hs, 0, -hs,  // bottom-left
        hs, 0, -hs,  // bottom-right
        hs, 0, hs,  // top-right
        -hs, 0, hs   // top-left
    ];

    // All normals point up (positive Y)
    const normals = [
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0
    ];

    // UV coordinates map the full texture to the plane
    const uvs = [
        0, 0,  // bottom-left
        1, 0,  // bottom-right
        1, 1,  // top-right
        0, 1   // top-left
    ];

    // Two triangles to form the plane
    const indices = [
        1, 0, 2,  // first triangle
        2, 0, 3   // second triangle
    ];

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint16Array(indices),
    };
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
    const outUVs: number[] = [];
    for (const vert of verts) {
        const n = normalize(vert);
        outVerts.push(n[0] * radius, n[1] * radius, n[2] * radius);
        // For spheres, normals are the same as normalized vertex positions
        outNormals.push(n[0], n[1], n[2]);

        // Generate UV coordinates using spherical mapping
        const u = 0.5 + Math.atan2(n[2], n[0]) / (2 * Math.PI);
        const v = 0.5 - Math.asin(n[1]) / Math.PI;
        outUVs.push(u, v);
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
        uvs: new Float32Array(outUVs),
        indices: indexArray,
    };
}

export function generateCubeMesh(size: number) {
    const hs = size;

    // Define vertices for each face separately to have proper normals
    const vertices = [
        // Front face
        -hs, -hs, hs, hs, -hs, hs, hs, hs, hs, -hs, hs, hs,
        // Back face  
        -hs, -hs, -hs, -hs, hs, -hs, hs, hs, -hs, hs, -hs, -hs,
        // Top face
        -hs, hs, -hs, -hs, hs, hs, hs, hs, hs, hs, hs, -hs,
        // Bottom face
        -hs, -hs, -hs, hs, -hs, -hs, hs, -hs, hs, -hs, -hs, hs,
        // Right face
        hs, -hs, -hs, hs, hs, -hs, hs, hs, hs, hs, -hs, hs,
        // Left face
        -hs, -hs, -hs, -hs, -hs, hs, -hs, hs, hs, -hs, hs, -hs
    ];

    const normals = [
        // Front face (0, 0, 1)
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        // Back face (0, 0, -1)
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        // Top face (0, 1, 0)
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        // Bottom face (0, -1, 0)
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        // Right face (1, 0, 0)
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        // Left face (-1, 0, 0)
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
    ];

    // UV coordinates - each face maps to full texture
    const uvs = [
        // Front face
        0, 0, 1, 0, 1, 1, 0, 1,
        // Back face
        1, 0, 1, 1, 0, 1, 0, 0,
        // Top face
        0, 1, 0, 0, 1, 0, 1, 1,
        // Bottom face
        1, 1, 0, 1, 0, 0, 1, 0,
        // Right face
        1, 0, 1, 1, 0, 1, 0, 0,
        // Left face
        0, 0, 1, 0, 1, 1, 0, 1
    ];

    const indices = [
        0, 1, 2, 0, 2, 3,    // Front face
        4, 5, 6, 4, 6, 7,    // Back face
        8, 9, 10, 8, 10, 11,   // Top face
        12, 13, 14, 12, 14, 15,   // Bottom face
        16, 17, 18, 16, 18, 19,   // Right face
        20, 21, 22, 20, 22, 23    // Left face
    ];

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint16Array(indices),
    };
}

/**
 * Load a mesh from OBJ file content
 * 
 * Parses Wavefront OBJ format and creates a mesh compatible with the rendering pipeline.
 * Supports vertices (v), normals (vn), texture coordinates (vt), and faces (f).
 * Automatically triangulates quad faces and higher-order polygons.
 * 
 * @param objContent - The content of the .obj file as a string
 * @returns A Mesh object compatible with the rendering pipeline (without id field)
 * 
 * @example
 * ```typescript
 * import { loadOBJ } from './Types/MeshUtils';
 * import { loadOBJFile } from './misc/loadFiles';
 * 
 * // Load from string content
 * const objContent = `
 * v 0.0 0.0 0.0
 * v 1.0 0.0 0.0
 * v 0.5 1.0 0.0
 * f 1 2 3
 * `;
 * const meshData = loadOBJ(objContent);
 * const mesh = { id: 'my-obj-mesh', ...meshData };
 * 
 * // Use like any other mesh
 * view.uploadMeshToGPU(mesh.id, mesh.vertices, mesh.normals, mesh.uvs, mesh.indices);
 * const meshComponent = new MeshComponent(mesh, true, 'my-texture');
 * 
 * // Load from file (async)
 * const objFileContent = await loadOBJFile('/models/my-model.obj');
 * const meshFromFile = { id: 'loaded-mesh', ...loadOBJ(objFileContent) };
 * ```
 */
export function loadOBJ(objContent: string): Omit<Mesh, 'id'> {
    const lines = objContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

    const vertices: number[][] = [];
    const normals: number[][] = [];
    const uvs: number[][] = [];
    const faces: Array<{ vertex: number, uv?: number, normal?: number }[]> = [];

    // Parse OBJ file line by line
    for (const line of lines) {
        const parts = line.split(/\s+/);
        const type = parts[0];

        switch (type) {
            case 'v': // Vertex
                if (parts.length >= 4) {
                    vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
                }
                break;

            case 'vn': // Vertex normal
                if (parts.length >= 4) {
                    normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
                }
                break;

            case 'vt': // Vertex texture coordinate
                if (parts.length >= 3) {
                    uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
                }
                break;

            case 'f': // Face
                if (parts.length >= 4) {
                    const faceVertices: { vertex: number, uv?: number, normal?: number }[] = [];

                    // Parse face vertices (support formats: v, v/vt, v/vt/vn, v//vn)
                    for (let i = 1; i < parts.length; i++) {
                        const vertexData = parts[i].split('/');
                        const vertex = parseInt(vertexData[0]) - 1; // Convert to 0-based index
                        const uv = vertexData[1] && vertexData[1] !== '' ? parseInt(vertexData[1]) - 1 : undefined;
                        const normal = vertexData[2] && vertexData[2] !== '' ? parseInt(vertexData[2]) - 1 : undefined;

                        faceVertices.push({ vertex, uv, normal });
                    }

                    // Triangulate face if it has more than 3 vertices (simple fan triangulation)
                    for (let i = 1; i < faceVertices.length - 1; i++) {
                        faces.push([faceVertices[0], faceVertices[i], faceVertices[i + 1]]);
                    }
                }
                break;
        }
    }

    // Validate that we have at least some vertices and faces
    if (vertices.length === 0) {
        throw new Error('No vertices found in OBJ file');
    }
    if (faces.length === 0) {
        throw new Error('No faces found in OBJ file');
    }

    // Build output arrays
    const outVertices: number[] = [];
    const outNormals: number[] = [];
    const outUVs: number[] = [];
    const outIndices: number[] = [];

    // Create vertex index map to handle vertex/normal/uv combinations
    const vertexMap = new Map<string, number>();
    let nextIndex = 0;

    for (const face of faces) {
        for (const faceVertex of face) {
            const key = `${faceVertex.vertex}_${faceVertex.uv ?? -1}_${faceVertex.normal ?? -1}`;

            let index = vertexMap.get(key);
            if (index === undefined) {
                index = nextIndex++;
                vertexMap.set(key, index);

                // Add vertex position
                const vertex = vertices[faceVertex.vertex];
                outVertices.push(vertex[0], vertex[1], vertex[2]);

                // Add UV coordinates (default to 0,0 if not specified)
                if (faceVertex.uv !== undefined && uvs[faceVertex.uv]) {
                    const uv = uvs[faceVertex.uv];
                    outUVs.push(uv[0], uv[1]);
                } else {
                    outUVs.push(0, 0);
                }

                // Add normal (compute if not specified)
                if (faceVertex.normal !== undefined && normals[faceVertex.normal]) {
                    const normal = normals[faceVertex.normal];
                    outNormals.push(normal[0], normal[1], normal[2]);
                } else {
                    // For now, use a default normal (0, 0, 1) - in a real implementation,
                    // we would compute face normals
                    outNormals.push(0, 0, 1);
                }
            }

            outIndices.push(index);
        }
    }

    // If no normals were provided in the file, compute face normals
    if (normals.length === 0) {
        computeFaceNormals(outVertices, outIndices, outNormals);
    }

    // Choose appropriate index array type
    const indexArray = nextIndex > 0xffff ? new Uint32Array(outIndices) : new Uint16Array(outIndices);

    return {
        vertices: new Float32Array(outVertices),
        normals: new Float32Array(outNormals),
        uvs: new Float32Array(outUVs),
        indices: indexArray,
    };
}

/**
 * Compute face normals for triangular faces
 */
function computeFaceNormals(vertices: number[], indices: number[], normals: number[]): void {
    // Initialize all normals to zero
    for (let i = 0; i < normals.length; i++) {
        normals[i] = 0;
    }

    // Accumulate face normals to vertex normals
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;

        // Get triangle vertices
        const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
        const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
        const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];

        // Compute face normal using cross product
        const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
        const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

        const faceNormal = [
            edge1[1] * edge2[2] - edge1[2] * edge2[1],
            edge1[2] * edge2[0] - edge1[0] * edge2[2],
            edge1[0] * edge2[1] - edge1[1] * edge2[0]
        ];

        // Normalize face normal
        const length = Math.sqrt(faceNormal[0] * faceNormal[0] + faceNormal[1] * faceNormal[1] + faceNormal[2] * faceNormal[2]);
        if (length > 0) {
            faceNormal[0] /= length;
            faceNormal[1] /= length;
            faceNormal[2] /= length;
        }

        // Add face normal to all vertices of this face
        normals[i1] += faceNormal[0];
        normals[i1 + 1] += faceNormal[1];
        normals[i1 + 2] += faceNormal[2];

        normals[i2] += faceNormal[0];
        normals[i2 + 1] += faceNormal[1];
        normals[i2 + 2] += faceNormal[2];

        normals[i3] += faceNormal[0];
        normals[i3 + 1] += faceNormal[1];
        normals[i3 + 2] += faceNormal[2];
    }

    // Normalize all vertex normals
    for (let i = 0; i < normals.length; i += 3) {
        const length = Math.sqrt(normals[i] * normals[i] + normals[i + 1] * normals[i + 1] + normals[i + 2] * normals[i + 2]);
        if (length > 0) {
            normals[i] /= length;
            normals[i + 1] /= length;
            normals[i + 2] /= length;
        }
    }
}

/**
 * Generate a texture visualization of UV coordinates from an OBJ file
 * 
 * Creates an ImageData representing the UV layout of a 3D model. The texture shows
 * the UV islands with vertex colors (if available) or default colors with triangle 
 * edges drawn for visualization. Useful for debugging UV unwrapping and creating 
 * UV layout templates.
 * 
 * @param objContent - The content of the .obj file as a string
 * @param textureSize - Size of the generated texture (width and height in pixels), default 1024
 * @param backgroundColor - Background color [r, g, b, a] (0-255), default white [255, 255, 255, 255]
 * @param lineColor - Color for triangle edges [r, g, b, a] (0-255), default black [0, 0, 0, 255]
 * @param fillColor - Fill color for UV triangles when no vertex colors [r, g, b, a] (0-255), default semi-transparent [100, 100, 255, 128]
 * @returns ImageData that can be used as a texture
 * 
 * @example
 * ```typescript
 * import { generateUVTextureFromOBJ } from './Types/MeshUtils';
 * import { loadOBJFile } from './misc/loadFiles';
 * 
 * // Load OBJ and generate UV texture
 * const objContent = await loadOBJFile('/models/character.obj');
 * const uvTexture = generateUVTextureFromOBJ(objContent, 1024);
 * 
 * // Add to view as a texture
 * view.addTexture('uv-layout', uvTexture);
 * 
 * // Use on a plane to visualize
 * const plane = generatePlaneMesh(10);
 * const planeEntity = new Entity('uv-preview', vec4(0, 0, 0));
 * planeEntity.addComponent(new MeshComponent({id: 'uv-plane', ...plane}, 'uv-layout'));
 * ```
 */
export function generateUVTextureFromOBJ(
    objContent: string,
    textureSize: number = 1024,
    backgroundColor: [number, number, number, number] = [255, 255, 255, 255],
    lineColor: [number, number, number, number] = [0, 0, 0, 255],
    fillColor: [number, number, number, number] = [100, 100, 255, 128]
): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get 2D context for UV texture generation');
    }

    // Fill background
    ctx.fillStyle = `rgba(${backgroundColor[0]}, ${backgroundColor[1]}, ${backgroundColor[2]}, ${backgroundColor[3] / 255})`;
    ctx.fillRect(0, 0, textureSize, textureSize);

    // Parse OBJ to extract vertices (with colors), UV coordinates and faces
    const lines = objContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const vertices: number[][] = [];
    const vertexColors: [number, number, number][] = [];
    const uvs: [number, number][] = [];
    const faces: Array<{ vertexIdx: number[], uvIdx: number[] }> = [];
    let hasVertexColors = false;

    for (const line of lines) {
        const parts = line.split(/\s+/);
        const type = parts[0];

        if (type === 'v') {
            // Parse vertex position and optional color (format: v x y z [r g b])
            if (parts.length >= 4) {
                vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);

                if (parts.length >= 7) {
                    // Vertex has color information
                    hasVertexColors = true;
                    const r = Math.floor(parseFloat(parts[4]) * 255);
                    const g = Math.floor(parseFloat(parts[5]) * 255);
                    const b = Math.floor(parseFloat(parts[6]) * 255);
                    vertexColors.push([r, g, b]);
                } else {
                    // No color, use default
                    vertexColors.push([fillColor[0], fillColor[1], fillColor[2]]);
                }
            }
        } else if (type === 'vt') {
            // Parse UV coordinates
            if (parts.length >= 3) {
                uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
            }
        } else if (type === 'f') {
            // Parse face and extract vertex and UV indices
            if (parts.length >= 4) {
                const faceVertices: number[] = [];
                const faceUVs: number[] = [];

                for (let i = 1; i < parts.length; i++) {
                    const vertexData = parts[i].split('/');
                    const vIdx = parseInt(vertexData[0]) - 1;
                    faceVertices.push(vIdx);

                    if (vertexData[1] && vertexData[1] !== '') {
                        faceUVs.push(parseInt(vertexData[1]) - 1); // Convert to 0-based index
                    }
                }

                // Triangulate if needed (simple fan triangulation)
                if (faceUVs.length >= 3) {
                    for (let i = 1; i < faceUVs.length - 1; i++) {
                        faces.push({
                            vertexIdx: [faceVertices[0], faceVertices[i], faceVertices[i + 1]],
                            uvIdx: [faceUVs[0], faceUVs[i], faceUVs[i + 1]]
                        });
                    }
                }
            }
        }
    }

    if (uvs.length === 0) {
        console.warn('No UV coordinates found in OBJ file');
    }

    // Helper function to convert UV coordinates (-3 to 3) to canvas coordinates
    const uvToCanvas = (u: number, v: number): [number, number] => {
        // Map from [-3, 3] range to [0, textureSize]
        // Normalize: (value + 3) / 6 gives us 0-1 range
        const normalizedU = (u) * 3 - 0.4;
        const normalizedV = (v) * 3 + .3;

        // Flip V coordinate because canvas Y is top-down, UV V is bottom-up
        return [normalizedU * textureSize, (1 - normalizedV) * textureSize];
    };

    // Draw filled triangles with vertex colors or gradient
    for (const face of faces) {
        if (face.uvIdx.length === 3) {
            const uv0 = uvs[face.uvIdx[0]];
            const uv1 = uvs[face.uvIdx[1]];
            const uv2 = uvs[face.uvIdx[2]];

            if (uv0 && uv1 && uv2) {
                const [x0, y0] = uvToCanvas(uv0[0], uv0[1]);
                const [x1, y1] = uvToCanvas(uv1[0], uv1[1]);
                const [x2, y2] = uvToCanvas(uv2[0], uv2[1]);

                if (hasVertexColors && face.vertexIdx.length === 3) {
                    // Use vertex colors with gradient
                    const color0 = vertexColors[face.vertexIdx[0]];
                    const color1 = vertexColors[face.vertexIdx[1]];
                    const color2 = vertexColors[face.vertexIdx[2]];

                    // Average color for this triangle
                    const avgR = Math.floor((color0[0] + color1[0] + color2[0]) / 3);
                    const avgG = Math.floor((color0[1] + color1[1] + color2[1]) / 3);
                    const avgB = Math.floor((color0[2] + color1[2] + color2[2]) / 3);

                    ctx.fillStyle = `rgba(${avgR}, ${avgG}, ${avgB}, ${fillColor[3] / 255})`;
                } else {
                    // Use default fill color
                    ctx.fillStyle = `rgba(${fillColor[0]}, ${fillColor[1]}, ${fillColor[2]}, ${fillColor[3] / 255})`;
                }

                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // Draw triangle edges
    // ctx.strokeStyle = `rgba(${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]}, ${lineColor[3] / 255})`;
    // ctx.lineWidth = 2;

    // for (const face of faces) {
    //     if (face.uvIdx.length === 3) {
    //         const uv0 = uvs[face.uvIdx[0]];
    //         const uv1 = uvs[face.uvIdx[1]];
    //         const uv2 = uvs[face.uvIdx[2]];

    //         if (uv0 && uv1 && uv2) {
    //             const [x0, y0] = uvToCanvas(uv0[0], uv0[1]);
    //             const [x1, y1] = uvToCanvas(uv1[0], uv1[1]);
    //             const [x2, y2] = uvToCanvas(uv2[0], uv2[1]);

    //             ctx.beginPath();
    //             ctx.moveTo(x0, y0);
    //             ctx.lineTo(x1, y1);
    //             ctx.lineTo(x2, y2);
    //             ctx.closePath();
    //             ctx.stroke();
    //         }
    //     }
    // }

    // Draw grid lines for reference (representing the -3 to 3 range)
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineWidth = 1;
    const gridDivisions = 6; // One division per unit in -3 to 3 range
    for (let i = 0; i <= gridDivisions; i++) {
        const pos = (i / gridDivisions) * textureSize;
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, textureSize);
        ctx.stroke();
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(textureSize, pos);
        ctx.stroke();
    }

    // Draw center lines (0,0 in UV space) more prominently
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.8)';
    ctx.lineWidth = 2;
    const center = textureSize / 2; // This represents UV (0, 0)
    // Vertical center line (U = 0)
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, textureSize);
    ctx.stroke();
    // Horizontal center line (V = 0)
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(textureSize, center);
    ctx.stroke();

    return ctx.getImageData(0, 0, textureSize, textureSize);
}