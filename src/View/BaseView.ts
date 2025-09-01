import type { Vector4 } from '../misc/Vector4';
import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/Mesh';
import * as M from '../misc/Matrix4x4';

/**
 * Base interface/abstract class for rendering views
 * Defines common functionality shared between WebGL and WebGPU implementations
 */
export abstract class BaseView {
    // Common properties
    public maxObjects = 1000000;
    protected fov = 30;
    protected near = 0.1;
    protected far = 1000;
    protected meshes: { [id: string]: Mesh } = {};
    protected sceneObjects: SceneObject[] = [];
    protected lastSceneObjectsRef?: SceneObject[];
    protected lastCameraKey?: string;
    protected camera: SceneObject = {
        id: 'viewCamera',
        position: new Float32Array([0, 0, 0, 1]) as Vector4,
        rotation: M.mat4Identity(),
        scale: new Float32Array([1, 1, 1, 1]) as Vector4,
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
    public abstract registerSceneObjects(objects: SceneObject[], updateVertices: boolean): Promise<void>;

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