import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';
import { Entity } from './Entity';
import { o11s } from '../config/config';



export default class Model {
    // Unified entities map removed. We now explicitly track static vs non-static sets.
    private staticEntities:  Map<string, Entity> = new Map();
    private nonStaticEntities:  Map<string, Entity> = new Map();
    public updateStatic: boolean = true;
    private cameras: Entity[] = [];
    private chunks: Map<string, string[]> = new Map();
    private cachedVisibleSceneObjects: { static: Entity[], nonStatic: Entity[] } = { static: [], nonStatic: [] };
    private lastSceneObjectsCameraChunkKey?: string;

    constructor() {
    }

    addEntity(ent: Entity) {
        const existing = this.getEntityById(ent.id);
        if (existing) {
            console.warn(`Entity with id ${ent.id} already exists in Model. Skipping add.`);
            return existing;
        }
        if (ent.isStatic) this.staticEntities.set(ent.id, ent); else this.nonStaticEntities.set(ent.id, ent);
        this.assignToChunk(ent);
        this.updateStatic = true;
        return ent;
    }

    addCamera(id: string, position?: Vector4, rotation?: Matrix4x4) {
        const cam = new Entity(id, position ?? V.vec4(0, 0, 0, 0), rotation ?? M.mat4Identity(), V.vec4(1, 1, 1, 1));
        this.cameras.push(cam);
        return cam;
    }


    getCamera(id: string): Entity | undefined {
        return this.cameras.find(camera => camera.id === id);
    }

    requestInverseRotation(ent: Entity): Matrix4x4 {
        let newInverse = ent.inverseRotation
        if (ent.updateInverseRotation || !newInverse) {
            newInverse = M.mat4Inverse(M.mat4(), ent.rotation)
            ent.inverseRotation = newInverse
            ent.updateInverseRotation = false
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
        ent.chunkKey = key;
    }

    private removeFromChunk(ent: Entity, key?: string) {
        const k = key ?? ent.chunkKey;
        if (!k) return;
        const arr = this.chunks.get(k);
        if (!arr) return;
        const idx = arr.indexOf(ent.id);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) this.chunks.delete(k);
        delete ent.chunkKey;
    }

    getChunkKeys(center: { x: number, y: number, z: number }, dist: number) {
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

    updateChunkAssignment(ent: Entity, oldChunkKey?: string) {
        const coords = this.chunkCoordsFromPosition(ent.position);
        const newKey = `${coords.x},${coords.y},${coords.z}`;
        const prevKey = oldChunkKey ?? ent.chunkKey;
        if (prevKey !== newKey) {
            this.removeFromChunk(ent, prevKey);
            let arr = this.chunks.get(newKey);
            if (!arr) { arr = []; this.chunks.set(newKey, arr); }
            if (!arr.includes(ent.id)) arr.push(ent.id);
            ent.chunkKey = newKey;
        }
    }

    update() {
        // Only update non-static entities (static ones are guaranteed immobile/unchanging)
        for (const e of this.nonStaticEntities.values()) {
            e.update();
            if (o11s.CPU_CHUNKS) this.updateChunkAssignment(e);
        }
        for (const cam of this.cameras) {
            cam.update();
        }
    }

    addComponentToEntity(id: string, component: any) {
        const ent = this.getEntityById(id);
        if (!ent) return false;
        ent.addComponent(component);
        // If a previously non-static entity becomes effectively static we won't migrate it; assumption given requirement.
        return true;
    }

    getEntityById(id: string) {
        return this.staticEntities.get(id) ?? this.nonStaticEntities.get(id);
    }

    public getObjectsSeparated(cameraId: string = 'main-camera'): { static: Entity[], nonStatic: Entity[] } {
        const camera = this.getCamera(cameraId);
        if (!camera) return { static: [], nonStatic: [] };
        if (!o11s.CPU_CHUNKS) {
            // No chunking, return all objects from the two maps directly
            return { static: Array.from(this.staticEntities.values()), nonStatic: Array.from(this.nonStaticEntities.values()) };
        }

        const camPos = camera.position;
        const camChunk = this.chunkCoordsFromPosition(camPos);
        const camChunkKey = `${camChunk.x},${camChunk.y},${camChunk.z}`;

        // Cache chunk keys within render distance
        const renderDist = o11s.RENDER_DISTANCE;

        // Helper to get all chunk keys within render distance


        // Return cached objects if camera chunk did not change
        if (this.lastSceneObjectsCameraChunkKey === camChunkKey && !this.updateStatic) {
            return {
                static: this.cachedVisibleSceneObjects.static.slice(),
                nonStatic: this.cachedVisibleSceneObjects.nonStatic.slice()
            };
        }
        // First time or camera jumped far: recalc all
        if (this.updateStatic || !this.lastSceneObjectsCameraChunkKey || Math.abs(camChunk.x - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[0])) > 2 || Math.abs(camChunk.y - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[1])) > 2 || Math.abs(camChunk.z - parseInt(this.lastSceneObjectsCameraChunkKey.split(',')[2])) > 2) {
            // Full recalc
            console.log("Full recalculation of chunks, entities:" + (this.staticEntities.size + this.nonStaticEntities.size));
            const staticEntites: Entity[] = [];
            const nonStaticEntities: Entity[] = [];
            const chunkKeys = this.getChunkKeys(camChunk, renderDist);
            chunkKeys.forEach(key => {
                const ids = this.chunks.get(key);
                if (ids) {
                    ids.forEach(id => {
                        const ent = this.getEntityById(id);
                        if (ent) {
                            if (ent.isStatic) staticEntites.push(ent);
                            else nonStaticEntities.push(ent);
                        }
                    });
                }
            });
            this.cachedVisibleSceneObjects = { static: staticEntites, nonStatic: nonStaticEntities };
            this.lastSceneObjectsCameraChunkKey = camChunkKey;
            return { static: staticEntites, nonStatic: nonStaticEntities };
        }
        console.log('updating chunks');
        // Otherwise, only update edge chunks
        const lastChunk = this.lastSceneObjectsCameraChunkKey.split(',').map(Number);
        // Find new and old edge chunks
        const prevKeys = this.getChunkKeys({ x: lastChunk[0], y: lastChunk[1], z: lastChunk[2] }, renderDist);
        const newKeys = this.getChunkKeys(camChunk, renderDist);
        // Chunks to add: in newKeys but not in prevKeys
        const addKeys = Array.from(newKeys).filter((k: string) => !prevKeys.has(k));
        // Chunks to remove: in prevKeys but not in newKeys
        const removeKeys = Array.from(prevKeys).filter((k: string) => !newKeys.has(k));

        // Remove objects from chunks now outside render distance
        let staticVisibleEntities = this.cachedVisibleSceneObjects.static.filter(obj => {
            return !obj.chunkKey || !removeKeys.includes(obj.chunkKey as string);
        });
        let nonStaticVisibleEntities = this.cachedVisibleSceneObjects.nonStatic.filter(obj => {
            return !obj.chunkKey || !removeKeys.includes(obj.chunkKey as string);
        });
        this.updateStatic = true
        addKeys.forEach(key => {
            const ids = this.chunks.get(key);
            if (ids) {
                ids.forEach(id => {
                    const ent = this.getEntityById(id);
                    if (ent) {
                        if (ent.isStatic) staticVisibleEntities.push(ent);
                        else nonStaticVisibleEntities.push(ent);
                    }
                });
            }
        });

        this.cachedVisibleSceneObjects = { static: staticVisibleEntities, nonStatic: nonStaticVisibleEntities };
        this.lastSceneObjectsCameraChunkKey = camChunkKey;
        return { static: staticVisibleEntities.slice(), nonStatic: nonStaticVisibleEntities.slice() };
    }
}
