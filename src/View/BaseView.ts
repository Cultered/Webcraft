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
    protected clearValue = { r: 0, g: 0., b: 0., a: 1. };

    /**
     * Initialize the rendering context
     */
    public abstract init(canvas: HTMLCanvasElement): Promise<any> | void;

    /**
     * Render the current scene
     */
    public abstract render(): void;

    /**
     * Register scene objects for rendering
     */

    /**
     * Register scene objects separately for static/non-static optimization
     */
    public abstract registerSceneObjectsSeparated(staticObjects: Entity[], nonStaticObjects: Entity[], updateVertices: boolean): void;

    /**
     * Register a camera for the scene
     */
    public abstract registerCamera(camera: Entity): void;

    /**
     * Upload meshes to the GPU
     */
    public abstract uploadMeshes(meshes: { [id: string]: Mesh }): void;

    /**
     * Upload a single mesh to GPU
     */
    public abstract uploadMeshToGPU(meshId: string, vertices: Float32Array, normals: Float32Array, indices: Uint32Array | Uint16Array): void;
}