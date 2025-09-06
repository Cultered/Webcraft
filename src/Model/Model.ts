import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';
import { Entity } from './Entity';
import MeshComponent from './Components/MeshComponent';
import type { SceneObject } from '../Types/SceneObject';
import { o11s } from '../config/config';



export default class Model {
    private entities: Map<string, Entity> = new Map();
    public updateStatic: boolean = true;
    private cameras: Entity[] = [];
    private chunks: Map<string, string[]> = new Map();
    private cachedVisibleSceneObjects: { static: SceneObject[], nonStatic: SceneObject[] } = { static: [], nonStatic: [] };
    private lastSceneObjectsCameraChunkKey?: string;

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
        this.updateStatic = true;
        return ent;
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
            newInverse = M.mat4Inverse(M.mat4(), obj.rotation)
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

    updateChunkAssignment(ent: Entity, oldChunkKey?: string) {
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

    public getObjectsSeparated(cameraId: string = 'main-camera'): { static: SceneObject[], nonStatic: SceneObject[] } {
        const camera = this.getCamera(cameraId);
        if (!camera) return { static: [], nonStatic: [] };
        if (!o11s.CPU_CHUNKS) {
            // No chunking, return all objects
            const staticObjects: SceneObject[] = [];
            const nonStaticObjects: SceneObject[] = [];
            this.entities.forEach(ent => {
                const sceneObject = this.entityToSceneObject(ent);
                if (ent.isStatic) staticObjects.push(sceneObject);
                else nonStaticObjects.push(sceneObject);
            });
            return { static: staticObjects, nonStatic: nonStaticObjects };
        }

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        let camRotInv: Matrix4x4 = M.mat4Inverse(M.mat4(), camera.rotation);

        // Cache chunk keys within render distance
        const renderDist = o11s.RENDER_DISTANCE;

        // Helper to get all chunk keys within render distance
        function getChunkKeys(center: { x: number, y: number, z: number }, dist: number) {
            const keys = new Set<string>();
            for (let dx = -dist; dx <= dist; dx++) {
                for (let dy = -dist; dy <= dist; dy++) {
                    for (let dz = -dist; dz <= dist; dz++) {
                        //if (dx * dx + dy * dy + dz * dz > dist * dist) continue;
                        keys.add(`${center.x + dx},${center.y + dy},${center.z + dz}`);
                    }
                }
            }
            return keys;
        }

        // Return cached objects if camera chunk did not change
        if (this.lastSceneObjectsCameraChunkKey === camChunkKey && !this.updateStatic) {
            return {
                static: this.cachedVisibleSceneObjects.static.slice(),
                nonStatic: this.cachedVisibleSceneObjects.nonStatic.slice()
            };
        }
        console.log(this.updateStatic)
        // First time or camera jumped far: recalc all
        if (this.updateStatic || !this.lastSceneObjectsCameraChunkKey || Math.abs(camChunk.x - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[0])) > 2 || Math.abs(camChunk.y - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[1])) > 2 || Math.abs(camChunk.z - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[2])) > 2) {
            // Full recalc
            console.log("Full recalculation of chunks, entities:" + this.entities.size);
            const staticObjects: SceneObject[] = [];
            const nonStaticObjects: SceneObject[] = [];
            const chunkKeys = getChunkKeys(camChunk, renderDist);
            chunkKeys.forEach(key => {
                const ids = this.chunks.get(key);
                if (ids) {
                    ids.forEach(id => {
                        const ent = this.getEntityById(id);
                        if (o11s.CPU_LOD) {
                            const mc = ent && ent.getComponent(MeshComponent) as MeshComponent;
                            // LOD logic
                            const [kx, ky, kz] = key.split(',').map(Number);
                            const ddx = kx - camChunk.x, ddy = ky - camChunk.y, ddz = kz - camChunk.z;
                            if (Math.abs(ddx) > o11s.LOD_DISTANCE || Math.abs(ddy) > o11s.LOD_DISTANCE || Math.abs(ddz) > o11s.LOD_DISTANCE) {
                                if (ent && mc) mc.LODReduce(ent);
                            } else if (ent && mc) {
                                mc.restoreMesh(ent);
                            }
                        }
                        if (ent) {
                            const sceneObject = this.entityToSceneObject(ent);
                            if (ent.isStatic) staticObjects.push(sceneObject);
                            else nonStaticObjects.push(sceneObject);
                        }
                    });
                }
            });
            this.cachedVisibleSceneObjects = { static: staticObjects, nonStatic: nonStaticObjects };
            this.lastSceneObjectsCameraChunkKey = camChunkKey;
            return { static: staticObjects, nonStatic: nonStaticObjects };
        }
        console.log('updating chunks');
        // Otherwise, only update edge chunks
        const lastChunk = this.lastSceneObjectsCameraChunkKey.split(',').map(Number);
        //LOD 
        if (o11s.CPU_LOD) {
            const newLod = getChunkKeys(camChunk, o11s.LOD_DISTANCE);
            const oldLod = getChunkKeys({ x: lastChunk[0], y: lastChunk[1], z: lastChunk[2] }, o11s.LOD_DISTANCE);
            const lodRestore = Array.from(newLod).filter((k: string) => !oldLod.has(k));
            const lodReduce = Array.from(oldLod).filter((k: string) => !newLod.has(k));
            lodRestore.forEach(key => {
                const ids = this.chunks.get(key);
                if (ids) {
                    ids.forEach(id => {
                        const ent = this.getEntityById(id);
                        if (ent) {
                            const mc = ent.getComponent(MeshComponent);
                            if (mc) mc.restoreMesh(ent);
                        }
                    });
                }
            });
            lodReduce.forEach(key => {
                const ids = this.chunks.get(key);
                if (ids) {
                    ids.forEach(id => {
                        const ent = this.getEntityById(id);
                        if (ent) {
                            const mc = ent.getComponent(MeshComponent);
                            if (mc) mc.LODReduce(ent);
                        }
                    });
                }
            });
            console.log(`LOD: Restored ${lodRestore.length} chunks, Reduced ${lodReduce.length} chunks.`);
        }
        // Find new and old edge chunks
        const prevKeys = getChunkKeys({ x: lastChunk[0], y: lastChunk[1], z: lastChunk[2] }, renderDist);
        const newKeys = getChunkKeys(camChunk, renderDist);
        // Chunks to add: in newKeys but not in prevKeys
        const addKeys = Array.from(newKeys).filter((k: string) => !prevKeys.has(k));
        // Chunks to remove: in prevKeys but not in newKeys
        const removeKeys = Array.from(prevKeys).filter((k: string) => !newKeys.has(k));

        // Remove objects from chunks now outside render distance
        let staticObjects = this.cachedVisibleSceneObjects.static.filter(obj => {
            return !obj.props.chunkKey || !removeKeys.includes(obj.props.chunkKey as string);
        });
        let nonStaticObjects = this.cachedVisibleSceneObjects.nonStatic.filter(obj => {
            return !obj.props.chunkKey || !removeKeys.includes(obj.props.chunkKey as string);
        });
        console.log(`Removed ${this.cachedVisibleSceneObjects.static.length - staticObjects.length} static and ${this.cachedVisibleSceneObjects.nonStatic.length - nonStaticObjects.length} non-static objects due to chunk removal.`);

        addKeys.forEach(key => {
            const ids = this.chunks.get(key);
            if (ids) {
                ids.forEach(id => {
                    const ent = this.getEntityById(id);
                    if (ent) {
                        const sceneObject = this.entityToSceneObject(ent);
                        if (ent.isStatic) staticObjects.push(sceneObject);
                        else nonStaticObjects.push(sceneObject);
                    }
                });
            }
        });

        this.cachedVisibleSceneObjects = { static: staticObjects, nonStatic: nonStaticObjects };
        this.lastSceneObjectsCameraChunkKey = camChunkKey;
        return { static: staticObjects.slice(), nonStatic: nonStaticObjects.slice() };
    }
}
