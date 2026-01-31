import type { Mesh } from '../Types/MeshType';
import { radians } from '../misc/misc';
import Entity from '../Model/Entity';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';

/**
 * Base interface/abstract class for rendering views
 * Defines common functionality shared between WebGL and WebGPU implementations
 */
export abstract class BaseView {
    // Common properties
    public maxObjects = 1_000_000;
    protected fov = radians(80);
    protected near = 0.1;
    protected far = 10000;
    protected meshes: { [id: string]: Mesh } = {};
    protected sceneObjects: Entity[] = [];
    protected staticSceneObjects: Entity[] = [];
    protected nonStaticSceneObjects: Entity[] = [];
    protected lastSceneObjectsRef?: Entity[];
    protected lastCameraKey?: string;
    protected camera: Entity = new Entity('default-camera', V.vec4(), M.mat4(), V.vec4(1, 1, 1, 1));
    protected canvas?: HTMLCanvasElement;
}