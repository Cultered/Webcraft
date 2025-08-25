import { Vector4 } from '../misc/Vector4';
import { Matrix4x4 } from '../misc/Matrix4x4';

export type SceneObject = {
    id: string;
    // position should be treated as read-only; use Model.setObjectPosition to change
    position: Vector4;
    rotation: Matrix4x4;
    scale: Vector4;
    props: {
        mesh?: string
        inverseRotation?: Matrix4x4
        updateInverseRotation?: boolean //to compute as less inverse matrices as possible
        chunkKey?: string
    };
};

// Chunking constants (tuneable)
export const CHUNK_SIZE = 10; // world units per chunk
export const RENDER_DISTANCE = 5; // in chunks (Manhattan/max chunk distance)

export type Mesh = {
    id: string;
    vertices: Float32Array;
    indices: Uint32Array | Uint16Array;
}

export default class Model {
    private objects: SceneObject[] = [];
    private cameras: SceneObject[] = [];
    // Map chunkKey -> objects contained
    private chunks: Map<string, SceneObject[]> = new Map();
    private meshes: { [id: string]: Mesh } = {};
    // Cached visible objects for the current camera chunk to avoid repeated recalculation
    private cachedVisibleObjects: SceneObject[] = [];
    private lastCameraChunkKey?: string;

    getMesh(id: string) {
        return this.meshes[id]
    }
    getMeshes() {
        return this.meshes
    }

    constructor() {
        this.meshes["builtin-sphere"] = { id: "builtin-sphere", ...this.generateSphereMesh(5, 5, 1) }
        this.meshes["builtin-cube"] = { id: "builtin-cube", ...this.generateCubeMesh(1) }
    }
    // TODO sphere generation based on triangulation of an octahedron
    private generateSphereMesh(lati: number, longi: number, radius: number) {
        const vertices: number[] = [];
        const indices: number[] = [];

        for (let lat = 0; lat <= lati; lat++) {
            const theta = (lat / lati) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= longi; lon++) {
                const phi = (lon / longi) * 2 * Math.PI;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = radius * sinTheta * cosPhi;
                const y = radius * cosTheta;
                const z = radius * sinTheta * sinPhi;

                vertices.push(x, y, z);
            }
        }

        for (let lat = 0; lat < lati; lat++) {
            for (let lon = 0; lon < longi; lon++) {
                const first = lat * (longi + 1) + lon;
                const second = first + longi + 1;

                indices.push(first, first + 1, second);
                indices.push(second, first + 1, second + 1);
            }
        }
        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
        };
    }

    private generateCubeMesh(size: number) {
        const hs = size / 2;
        const vertices = [
            -hs, -hs, -hs,
            hs, -hs, -hs,
            hs, hs, -hs,
            -hs, hs, -hs,
            -hs, -hs, hs,
            hs, -hs, hs,
            hs, hs, hs,
            -hs, hs, hs,
        ];

        const indices = [
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            4, 1, 5, 4, 0, 1,
            3, 6, 2, 3, 7, 6,
            1, 6, 5, 1, 2, 6,
            4, 3, 0, 4, 7, 3,
        ];

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices),
        };
    }

    addSphere(id: string, radius?: number, position?: Vector4, rotation?: Matrix4x4) {
        const pos = position ?? new Vector4(0, 0, 0, 1);
        const obj: any = {
            id,
            // internal storage of position; expose via getter to make it effectively immutable
            _position: pos,
            get position() { return this._position; },
            rotation: rotation ?? Matrix4x4.identity(),
            scale: radius ? new Vector4(radius, radius, radius, 1) : new Vector4(1, 1, 1, 1), // default scale
            props: { mesh: "builtin-sphere" }
        };
    this.objects.push(obj as SceneObject);
    this.assignToChunk(obj as SceneObject);
    }

    addCube(id: string, size = 1, position?: Vector4, rotation?: Matrix4x4) {
        const pos = position ?? new Vector4(0, 0, 0, 0);
        const obj: any = {
            id,
            _position: pos,
            get position() { return this._position; },
            rotation: rotation ?? Matrix4x4.identity(),
            scale: new Vector4(size, size, size, 1), // default scale
            props: { mesh: "builtin-cube" }
        };
    this.objects.push(obj as SceneObject);
    this.assignToChunk(obj as SceneObject);
    }

    // Returns objects that are within RENDER_DISTANCE (in chunks) from the primary camera ("main-camera").
    // This keeps the view focused only on nearby chunks. If no camera exists, return all objects as fallback.
    getObjects() {
        const camera = this.getCamera('main-camera');
        if (!camera) return this.objects;

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        // if camera hasn't moved between chunks, return cached result
        if (this.lastCameraChunkKey === camChunkKey && this.cachedVisibleObjects.length) {
            return this.cachedVisibleObjects;
        }

        const collected = new Set<SceneObject>();

        // iterate neighboring chunks within render distance
        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
            for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
                for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
                    const key = `${camChunk.x + dx},${camChunk.y + dy},${camChunk.z + dz}`;
                    const objs = this.chunks.get(key);
                    if (objs) objs.forEach(o => collected.add(o));
                }
            }
        }

        this.cachedVisibleObjects = Array.from(collected);
        this.lastCameraChunkKey = camChunkKey;
        return this.cachedVisibleObjects;
    }

    // Public API to move an object. Position is effectively immutable from outside except via this call.
    setObjectPosition(id: string, newPos: Vector4) {
        const obj = this.objects.find(o => o.id === id) as any;
        if (!obj) return false;
        const oldChunk = obj.props.chunkKey;
        obj._position = newPos;
        // update chunk assignment
    this.updateChunkAssignment(obj as SceneObject, oldChunk);
        return true;
    }

    addCamera(id: string, position?: Vector4, rotation?: Matrix4x4) {
        const camera: SceneObject = {
            id,
            position: position ?? new Vector4(0, 0, 4, 1), // default camera position
            rotation: rotation ?? Matrix4x4.identity(), // default camera rotation
            scale: new Vector4(1, 1, 1, 1), // default scale
            props: {}
        };
        this.cameras.push(camera);
    }

    updateCamera(id: string, position: Vector4, rotation: Matrix4x4) {
        const camera = this.cameras.find(cam => cam.id === id);
        if (camera) {
            camera.position = position;
            camera.rotation = rotation;
        } else {
            console.warn(`Camera with id ${id} not found.`);
        }
    }

    getCamera(id: string): SceneObject {
        return this.cameras.find(camera => camera.id === id) || {
            id: 'default-camera',
            position: new Vector4(0, 0, 4, 1),
            rotation: Matrix4x4.identity(),
            scale: new Vector4(1, 1, 1, 1),
            props: {}
        };
    }

    requestInverseRotation(obj: SceneObject): Matrix4x4 {
        let newInverse = obj.props.inverseRotation
        if (obj.props.updateInverseRotation || !newInverse) {
            newInverse = obj.rotation.inverse()
            obj.props.inverseRotation = newInverse
            obj.props.updateInverseRotation = false
        }
        return newInverse
    }

    // --- chunk helpers ---
    private chunkCoordsFromPosition(pos: Vector4) {
        return {
            x: Math.floor(pos.x / CHUNK_SIZE),
            y: Math.floor(pos.y / CHUNK_SIZE),
            z: Math.floor(pos.z / CHUNK_SIZE),
        };
    }

    private assignToChunk(obj: SceneObject) {
        const coords = this.chunkCoordsFromPosition((obj as any)._position ?? (obj.position as Vector4));
        const key = `${coords.x},${coords.y},${coords.z}`;
        let arr = this.chunks.get(key);
        if (!arr) {
            arr = [];
            this.chunks.set(key, arr);
        }
        if (!arr.includes(obj)) arr.push(obj);
        if (!obj.props) obj.props = {} as any;
        obj.props.chunkKey = key;
    }

    private removeFromChunk(obj: SceneObject, key?: string) {
        const k = key ?? obj.props.chunkKey;
        if (!k) return;
        const arr = this.chunks.get(k);
        if (!arr) return;
        const idx = arr.indexOf(obj);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) this.chunks.delete(k);
        delete obj.props.chunkKey;
    }

    private updateChunkAssignment(obj: SceneObject, oldChunkKey?: string) {
        const coords = this.chunkCoordsFromPosition((obj as any)._position ?? (obj.position as Vector4));
        const newKey = `${coords.x},${coords.y},${coords.z}`;
        const prevKey = oldChunkKey ?? obj.props.chunkKey;
        if (prevKey !== newKey) {
            this.removeFromChunk(obj, prevKey);
            let arr = this.chunks.get(newKey);
            if (!arr) { arr = []; this.chunks.set(newKey, arr); }
            arr.push(obj);
            obj.props.chunkKey = newKey;
        }
    }

    update(deltaMs: number) {
        const seconds = deltaMs / 1000;
        const rm = Matrix4x4.rotationalMatrix(new Vector4(0.1 * seconds, 0.1 * seconds, 0, 0));
        this.objects[1].rotation = this.objects[1].rotation.mulMatrix(rm);
    }
}
