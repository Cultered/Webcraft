import type { Mesh } from '../Types/MeshType';
import type { Vector4 } from '../Types/Vector4';
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
    /** Global directional light direction (xyz = direction, w = intensity) */
    public globalLightDirection: Vector4 = V.vec4(0.0, 1.0, 0.0, 1.0);
    /** Global directional light color (rgb = color, a = intensity) */
    public globalLightColor: Vector4 = V.vec4(1.0, 1.0, 1.0, 1.0);
    /** Global ambient light color (rgb = color, a = intensity) */
    public globalAmbientColor: Vector4 = V.vec4(0.26, 0.23, 0.2, 1.0);
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