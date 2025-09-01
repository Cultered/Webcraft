import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/MeshType';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';
import { radians } from '../misc/misc';

/**
 * Base interface/abstract class for rendering views
 * Defines common functionality shared between WebGL and WebGPU implementations
 */
export abstract class BaseView {
    // Common properties
    public maxObjects = 1_000_000;
    protected fov = radians(80);
    protected near = 0.1;
    protected far = 1000;
    protected meshes: { [id: string]: Mesh } = {};
    protected sceneObjects: SceneObject[] = [];
    protected staticSceneObjects: SceneObject[] = [];
    protected nonStaticSceneObjects: SceneObject[] = [];
    protected lastSceneObjectsRef?: SceneObject[];
    protected lastCameraKey?: string;
    protected camera: SceneObject = {
        id: 'viewCamera',
        position: V.vec4(0, 0, 0, 1),
        rotation: M.mat4Identity(),
        scale: V.vec4(1, 1, 1, 1),
        props: {}
    };
    protected debugEl?: HTMLDivElement;
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
    public abstract registerSceneObjectsSeparated(staticObjects: SceneObject[], nonStaticObjects: SceneObject[], updateVertices: boolean): void;

    /**
     * Set the debug element for displaying debug information
     */
    public setDebugElement(el: HTMLDivElement): void {
        this.debugEl = el;
    }

    /**
     * Register a camera for the scene
     */
    public abstract registerCamera(camera: SceneObject): void;

    /**
     * Upload meshes to the GPU
     */
    public abstract uploadMeshes(meshes: { [id: string]: Mesh }): void;

    /**
     * Upload a single mesh to GPU
     */
    public abstract uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array): void;
}