import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';
import { Entity } from './Entity';
import MeshComponent from './Components/MeshComponent';
import type { Mesh } from '../Types/MeshType';
import type { SceneObject } from '../Types/SceneObject';
import { o11s } from '../config/config';



export default class Model {
    private entities: Map<string, Entity> = new Map();
    public updateStatic: boolean = true;
    private cameras: Entity[] = [];
    private chunks: Map<string, string[]> = new Map();
    private cachedVisibleObjects: string[] = [];
    private lastCameraChunkKey?: string;
    public onSceneObjectsUpdated?: (staticObjects: SceneObject[], nonStaticObjects: SceneObject[], updateVertices: boolean) => void;

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
        this.updateStatic = true;
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
        const allObjects = this.getAllObjectsInternal();
        return allObjects.static.concat(allObjects.nonStatic);
    }

    getObjectsSeparated(): { static: SceneObject[], nonStatic: SceneObject[] } {
        return this.getAllObjectsInternal();
    }

    private getAllObjectsInternal(): { static: SceneObject[], nonStatic: SceneObject[] } {
        const camera = this.getCamera('main-camera');
        const allEntities = !camera || !o11s.CPU_CHUNKS ? 
            Array.from(this.entities.values()) : 
            this.getVisibleEntities(camera);

        const staticObjects: SceneObject[] = [];
        const nonStaticObjects: SceneObject[] = [];

        for (const entity of allEntities) {
            const sceneObject = this.entityToSceneObject(entity);
            if (entity.isStatic) {
                staticObjects.push(sceneObject);
            } else {
                nonStaticObjects.push(sceneObject);
            }
        }

        return { static: staticObjects, nonStatic: nonStaticObjects };
    }

    private getVisibleEntities(camera: Entity): Entity[] {
        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        let camRotInv:Matrix4x4 = M.mat4Inverse(M.mat4(), camera.rotation)
        let cameraForward = M.mat4MulVec4(V.vec4(),camRotInv,V.vec4Neg(V.vec4(),V.forward()));

        if (this.lastCameraChunkKey === camChunkKey && !o11s.CPU_SOFT_FRUSTUM_CULLING) {
            return this.cachedVisibleObjects.map(id => this.entities.get(id)).filter(Boolean) as Entity[];
        }
        this.updateStatic = true;//PLS FIX ME

        const collected = new Set<Entity>();
        for (let dx = -o11s.RENDER_DISTANCE; dx <= o11s.RENDER_DISTANCE; dx++) {
            for (let dy = -o11s.RENDER_DISTANCE; dy <= o11s.RENDER_DISTANCE; dy++) {
                for (let dz = -o11s.RENDER_DISTANCE; dz <= o11s.RENDER_DISTANCE; dz++) {
                    if (dx * dx + dy * dy + dz * dz > o11s.RENDER_DISTANCE * o11s.RENDER_DISTANCE) continue;
                    if (o11s.CPU_SOFT_FRUSTUM_CULLING) {
                        if (V.vec4Dot(cameraForward, V.vec4(dx, dy, dz, 0)) < -1) continue;
                    }
                    const key = `${camChunk.x + dx},${camChunk.y + dy},${camChunk.z + dz}`;
                    const ids = this.chunks.get(key);
                    if (ids) {
                        ids.forEach(id => {
                            const ent = this.getEntityById(id);
                            if (o11s.CPU_LOD) {
                                const mc = ent && ent.getComponent(MeshComponent) as MeshComponent;
                                if (dx * dx + dy * dy + dz * dz > o11s.LOD_DISTANCE * o11s.LOD_DISTANCE) {
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
        return Array.from(collected);
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
        const cam = new Entity(id, position ?? V.vec4(0, 0, 0, 0), rotation ?? M.mat4Identity(), V.vec4(1, 1, 1, 1));
        this.cameras.push(cam);
    }


    getCamera(id: string): Entity | undefined {
        return this.cameras.find(camera => camera.id === id);
    }

    requestInverseRotation(obj: SceneObject): Matrix4x4 {
        let newInverse = obj.props.inverseRotation
        if (obj.props.updateInverseRotation || !newInverse) {
            newInverse = M.mat4Inverse(M.mat4(),obj.rotation)
            console.log("Computed new inverse rotation for ",obj.id,newInverse)
            obj.props.inverseRotation = newInverse
            obj.props.updateInverseRotation = false
        }
        return newInverse
    }

    private chunkCoordsFromPosition(pos: Vector4) {
        return {
            x: Math.floor(pos[0] / o11s.CHUNK_SIZE),
            y: Math.floor(pos[1] / o11s.CHUNK_SIZE),
            z: Math.floor(pos[2] / o11s.CHUNK_SIZE),
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
        for (const cam of this.cameras) {
            cam.update(deltaMs);
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
