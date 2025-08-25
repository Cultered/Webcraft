import { Vector4 } from '../misc/Vector4';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Entity } from './Entity';

// keep old SceneObject shape for compatibility with View
export type SceneObject = {
    id: string;
    position: Vector4;
    rotation: Matrix4x4;
    scale: Vector4;
    props: {
        mesh?: string
        inverseRotation?: Matrix4x4
        updateInverseRotation?: boolean
        chunkKey?: string
    };
};

// Chunking constants (tuneable)
export const CHUNK_SIZE = 10; // world units per chunk
export let RENDER_DISTANCE = 8; // in chunks (Manhattan/max chunk distance)
export const CPU_SOFT_FRUSTUM_CULLING = true // removes 50% of unrendered objects, dont use with high render distance

export type Mesh = {
    id: string;
    vertices: Float32Array;
    indices: Uint32Array | Uint16Array;
}

export default class Model {
    private entities: Entity[] = [];
    private entityMap: Map<string, Entity> = new Map();
    private cameras: Entity[] = [];
    // Map chunkKey -> entity ids contained
    private chunks: Map<string, string[]> = new Map();
    private meshes: { [id: string]: Mesh } = {};
    // Cached visible object ids for the current camera chunk to avoid repeated recalculation
    private cachedVisibleObjects: string[] = [];
    private lastCameraChunkKey?: string;
    // Callback invoked when visible scene objects may have changed. Assign from caller (e.g., main) to re-register in View.
    public onSceneObjectsUpdated?: (objects: SceneObject[], updateVertices: boolean) => void;

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
        const ent = new Entity(id, position, rotation, radius ? new Vector4(radius, radius, radius, 1) : undefined);
        ent.props.mesh = 'builtin-sphere';
        // internal use stores position directly; keep getter semantics via the Entity.position field
    this.entities.push(ent);
    this.entityMap.set(ent.id, ent);
    this.assignToChunk(ent);
    }

    addCube(id: string, size = 1, position?: Vector4, rotation?: Matrix4x4) {
        const ent = new Entity(id, position, rotation, new Vector4(size, size, size, 1));
        ent.props.mesh = 'builtin-cube';
    this.entities.push(ent);
    this.entityMap.set(ent.id, ent);
    this.assignToChunk(ent);
    }

    // Returns objects that are within RENDER_DISTANCE (in chunks) from the primary camera ("main-camera").
    // This keeps the view focused only on nearby chunks. If no camera exists, return all objects as fallback.
    // Return SceneObject[] shaped view for compatibility with View.ts
    getObjects() {
        const camera = this.getCamera('main-camera');
        if (!camera) return this.entities.map(e => this.entityToSceneObject(e));

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        const cameraForward: Vector4 = camera.rotation.inverse().mul(Vector4.forward().neg());

        if (this.lastCameraChunkKey === camChunkKey && !CPU_SOFT_FRUSTUM_CULLING) {
            // map cached ids back to SceneObject view
            return this.cachedVisibleObjects.map(id => this.entityMap.get(id)).filter(Boolean).map(e => this.entityToSceneObject(e!));
        }

    const collected = new Set<string>();
        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
            for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
                for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
                    if (dx * dx + dy * dy + dz * dz > RENDER_DISTANCE * RENDER_DISTANCE) continue;
                    if (CPU_SOFT_FRUSTUM_CULLING) {
                        if (cameraForward.mul(new Vector4(dx, dy, dz, 0)) < 0) continue;
                    }
                    const key = `${camChunk.x + dx},${camChunk.y + dy},${camChunk.z + dz}`;
                    const ids = this.chunks.get(key);
                    if (ids) ids.forEach(id => collected.add(id));
                }
            }
        }

    // store cached visible ids; map back to SceneObject when returning
    this.cachedVisibleObjects = Array.from(collected);
        this.lastCameraChunkKey = camChunkKey;
    return this.cachedVisibleObjects.map(id => this.entityMap.get(id)).filter(Boolean).map(e => this.entityToSceneObject(e!));
    }

    // Public API to move an object. Position is effectively immutable from outside except via this call.
    setObjectPosition(id: string, newPos: Vector4) {
    const ent = this.entityMap.get(id) ?? this.entities.find(o => o.id === id);
        if (!ent) return false;
        const oldChunk = ent.props.chunkKey;
        ent.position = newPos;
        this.updateChunkAssignment(ent, oldChunk);
        return true;
    }

    addCamera(id: string, position?: Vector4, rotation?: Matrix4x4) {
        const cam = new Entity(id, position ?? new Vector4(0, 0, 4, 1), rotation ?? Matrix4x4.identity(), new Vector4(1, 1, 1, 1));
        this.cameras.push(cam);
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

    getCamera(id: string): Entity {
        return this.cameras.find(camera => camera.id === id) || new Entity('default-camera', new Vector4(0, 0, 4, 1), Matrix4x4.identity(), new Vector4(1, 1, 1, 1));
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

    private assignToChunk(ent: Entity) {
        const coords = this.chunkCoordsFromPosition(ent.position);
        const key = `${coords.x},${coords.y},${coords.z}`;
    let arr = this.chunks.get(key);
    if (!arr) { arr = []; this.chunks.set(key, arr); }
    if (!arr.includes(ent.id)) arr.push(ent.id);
    if (!ent.props) ent.props = {} as any;
    ent.props.chunkKey = key;
    }

    private removeFromChunk(ent: Entity, key?: string) {
        const k = key ?? ent.props.chunkKey;
        if (!k) return;
        const arr = this.chunks.get(k);
        if (!arr) return;
        const idx = arr.indexOf(ent.id);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) this.chunks.delete(k);
        delete ent.props.chunkKey;
    }

    private updateChunkAssignment(ent: Entity, oldChunkKey?: string) {
        const coords = this.chunkCoordsFromPosition(ent.position);
        const newKey = `${coords.x},${coords.y},${coords.z}`;
        const prevKey = oldChunkKey ?? ent.props.chunkKey;
        if (prevKey !== newKey) {
            this.removeFromChunk(ent, prevKey);
            let arr = this.chunks.get(newKey);
            if (!arr) { arr = []; this.chunks.set(newKey, arr); }
            if (!arr.includes(ent.id)) arr.push(ent.id);
            ent.props.chunkKey = newKey;
        }
    }

    update(deltaMs: number) {
        // Run entity components
        for (const e of this.entities) {
            e.runComponents(deltaMs);
        }
    }

    // Helper to convert Entity -> SceneObject shape for compatibility with View
    private entityToSceneObject(e: Entity): SceneObject {
        return {
            id: e.id,
            position: e.position,
            rotation: e.rotation,
            scale: e.scale,
            props: e.props || {}
        };
    }

    // Add a component instance to an entity by id
    addComponentToEntity(id: string, component: any) {
        const ent = this.entities.find(e => e.id === id);
        if (!ent) return false;
        ent.addComponent(component);
        return true;
    }
}
