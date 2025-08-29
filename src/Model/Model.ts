import { Vector4 } from '../misc/Vector4';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Entity } from './Entity';
import MeshComponent from './Components/MeshComponent';
import type { Mesh } from '../misc/meshes';

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

export const CHUNK_SIZE = 10;
export let RENDER_DISTANCE = 8;
export let LOD_DISTANCE = 5;
export const CPU_SOFT_FRUSTUM_CULLING = true
export const CPU_LOD = true

export default class Model {
    private entities: Map<string, Entity> = new Map();
    private cameras: Entity[] = [];
    private chunks: Map<string, string[]> = new Map();
    private cachedVisibleObjects: string[] = [];
    private lastCameraChunkKey?: string;
    public onSceneObjectsUpdated?: (objects: SceneObject[], updateVertices: boolean) => void;

    getMesh(id: string) {
    for (const e of this.entities.values()) {
            const mc = e.getComponent(MeshComponent) as MeshComponent | undefined;
            if (mc && mc.mesh && mc.mesh.id === id) return mc.mesh;
        }
        return undefined;
    }
    getMeshes(): { [id: string]: Mesh } {
        const out: { [id: string]: Mesh } = {};
    for (const e of this.entities.values()) {
            const mc = e.getComponent(MeshComponent) as MeshComponent | undefined;
            if (mc && mc.mesh) {
                out[mc.mesh.id] = mc.mesh;
            }
        }
        return out;
    }

    constructor() {
    }

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

    addExistingEntity(ent: Entity) {
        if (this.getEntityById(ent.id)) {
            console.warn(`Entity with id ${ent.id} already exists in Model. Skipping add.`);
            return this.getEntityById(ent.id);
        }
    this.entities.set(ent.id, ent);
        this.assignToChunk(ent);
        return ent;
    }

    getObjects() {
        const camera = this.getCamera('main-camera');
    if (!camera) return Array.from(this.entities.values()).map(e => this.entityToSceneObject(e));

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        const cameraForward: Vector4 = camera.rotation.inverse().mul(Vector4.forward().neg());

        if (this.lastCameraChunkKey === camChunkKey && !CPU_SOFT_FRUSTUM_CULLING) {
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

        this.cachedVisibleObjects = Array.from(collected).map(e => e.id);
        this.lastCameraChunkKey = camChunkKey;
        return Array.from(collected).map(e => this.entityToSceneObject(e));
    }

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
    for (const e of this.entities.values()) {
            (e as Entity).update(deltaMs);
        }
    }

    private entityToSceneObject(e: Entity): SceneObject {
        return {
            id: e.id,
            position: e.position,
            rotation: e.rotation,
            scale: e.scale,
            props: e.props || {}
        };
    }

    addComponentToEntity(id: string, component: any) {
    const ent = this.entities.get(id);
        if (!ent) return false;
        ent.addComponent(component);
        return true;
    }

    getEntityById(id: string) {
    return this.entities.get(id);
    }
}
