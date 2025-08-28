import { Vector4 } from '../misc/Vector4';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Entity } from './Entity';
import MeshComponent from './Components/MeshComponent';
import type { Mesh } from '../misc/meshes';

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
export let LOD_DISTANCE = 5; // in chunks (Manhattan/max chunk distance)
export const CPU_SOFT_FRUSTUM_CULLING = true // removes 50% of unrendered objects, strain on cpu
export const CPU_LOD = true // removes a lot of vertices, strain on cpu

// Mesh is imported from misc/meshes

export default class Model {
    // store entities in a Map keyed by id for O(1) lookup and iteration via values()
    private entities: Map<string, Entity> = new Map();
    private cameras: Entity[] = [];
    // Map chunkKey -> entity ids contained
    private chunks: Map<string, string[]> = new Map();
    // meshComponents are created externally (main) and attached to entities
    // Cached visible object ids for the current camera chunk to avoid repeated recalculation
    private cachedVisibleObjects: string[] = [];
    private lastCameraChunkKey?: string;
    // (no direct view reference) Mesh components are expected to be created and attached externally
    // Callback invoked when visible scene objects may have changed. Assign from caller (e.g., main) to re-register in View.
    public onSceneObjectsUpdated?: (objects: SceneObject[], updateVertices: boolean) => void;

    getMesh(id: string) {
        // search entities for a MeshComponent with the requested mesh id
    for (const e of this.entities.values()) {
            const mc = e.getComponent(MeshComponent) as MeshComponent | undefined;
            if (mc && mc.mesh && mc.mesh.id === id) return mc.mesh;
        }
        return undefined;
    }
    getMeshes(): { [id: string]: Mesh } {
        const out: { [id: string]: Mesh } = {};
        // iterate entities and collect unique meshes from attached MeshComponents
    for (const e of this.entities.values()) {
            const mc = e.getComponent(MeshComponent) as MeshComponent | undefined;
            if (mc && mc.mesh) {
                out[mc.mesh.id] = mc.mesh;
            }
        }
        return out;
    }

    constructor() {
        // Mesh components are created locally; uploading to the GPU is the responsibility of the caller (main)
    }


    // Generic entity creation helper. Caller may provide an optional meshKey (a key into this.meshComponents)
    // or an array of components to attach to the entity. If meshKey is provided, the corresponding
    // MeshComponent is attached and ent.props.mesh is set so View can render it.
    addEntity(id: string, opts: {
        position?: Vector4,
        rotation?: Matrix4x4,
        scale?: Vector4,
        components?: any[]
    } = {}) {
    const ent = new Entity(id, opts.position, opts.rotation, opts.scale);
        if (opts.components) {
            for (const c of opts.components) ent.addComponent(c);
        }
    this.entities.set(ent.id, ent);
    this.assignToChunk(ent);
        return ent;
    }

    // Accept an externally-created Entity instance and register it with the model.
    // This allows callers to construct an Entity, add components, then add it to the model.
    addExistingEntity(ent: Entity) {
        if (this.getEntityById(ent.id)) {
            console.warn(`Entity with id ${ent.id} already exists in Model. Skipping add.`);
            return this.getEntityById(ent.id);
        }
    this.entities.set(ent.id, ent);
        this.assignToChunk(ent);
        return ent;
    }

    // Mesh components are expected to be created and attached externally (e.g., in main).

    // Returns objects that are within RENDER_DISTANCE (in chunks) from the primary camera ("main-camera").
    // This keeps the view focused only on nearby chunks. If no camera exists, return all objects as fallback.
    // Return SceneObject[] shaped view for compatibility with View.ts
    getObjects() {
        const camera = this.getCamera('main-camera');
    if (!camera) return Array.from(this.entities.values()).map(e => this.entityToSceneObject(e));

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        const cameraForward: Vector4 = camera.rotation.inverse().mul(Vector4.forward().neg());

        if (this.lastCameraChunkKey === camChunkKey && !CPU_SOFT_FRUSTUM_CULLING) {
            // map cached ids back to SceneObject view
            return this.cachedVisibleObjects.map(id => this.entities.get(id)).filter(Boolean).map(e => this.entityToSceneObject(e!));
        }
        const collected = new Set<Entity>();
        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
            for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
                for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
                    if (dx * dx + dy * dy + dz * dz > RENDER_DISTANCE * RENDER_DISTANCE) continue;
                    if (CPU_SOFT_FRUSTUM_CULLING) {
                        if (cameraForward.mul(new Vector4(dx, dy, dz, 0)) < -1) continue;
                    }
                    const key = `${camChunk.x + dx},${camChunk.y + dy},${camChunk.z + dz}`;
                    const ids = this.chunks.get(key);
                    if (ids) {
                        ids.forEach(id => {
                            const ent = this.getEntityById(id);
                            if (CPU_LOD) {
                                const mc = ent && ent.getComponent(MeshComponent) as MeshComponent;
                                if (dx * dx + dy * dy + dz * dz > LOD_DISTANCE * LOD_DISTANCE) {
                                    if (ent && mc) {
                                        mc.LODReduce(ent);
                                    }

                                }
                                else if (ent && mc) {
                                    mc?.restoreMesh(ent)
                                };
                            }
                            if (ent) collected.add(ent);
                        });
                    }
                }
            }
        }

        // store cached visible ids; map back to SceneObject when returning
        this.cachedVisibleObjects = Array.from(collected).map(e => e.id);
        this.lastCameraChunkKey = camChunkKey;
        return Array.from(collected).map(e => this.entityToSceneObject(e));
    }

    // Public API to move an object. Position is effectively immutable from outside except via this call.
    setObjectPosition(id: string, newPos: Vector4) {
    const ent = this.entities.get(id);
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
    for (const e of this.entities.values()) {
            // iterator result depends on Set vs Array; using values() for Set
            (e as Entity).update(deltaMs);
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
    const ent = this.entities.get(id);
        if (!ent) return false;
        ent.addComponent(component);
        return true;
    }

    // Helper to find an entity by id when entities are stored in a Set
    getEntityById(id: string) {
    return this.entities.get(id);
    }
}
