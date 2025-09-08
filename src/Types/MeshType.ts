export type Mesh = {
    id: string;
    vertices: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array | Uint16Array;
};