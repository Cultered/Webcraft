import type { Component } from './Component';

/**
 * Specification for an additional buffer to bind in group 1
 */
export interface CustomBufferSpec {
    binding: number;
    size: number;
    type: 'uniform' | 'storage' | 'read-only-storage';
    visibility: number; // GPUShaderStage flags
    /** 
     * Buffer data. Update this field to change the buffer contents.
     * The WebGPU view will automatically sync this to the GPU buffer.
     */
    data: ArrayBuffer | ArrayBufferView;
}

/**
 * Component for custom shaders in WebGPU backend.
 * Contains vertex and fragment shader code, additional buffer specifications,
 * and an ID for pipeline caching.
 * 
 * WebGPU-specific operations (buffer creation, updates) are handled internally
 * by the WebGPUView. Users only need to update the `data` field of buffers.
 */
export class CustomRenderShader implements Component {
    /** Unique identifier for this shader, used for pipeline caching */
    id: string;

    /** WGSL vertex shader code */
    vertexShader: string;

    /** WGSL fragment shader code */
    fragmentShader: string;

    /** 
     * Additional buffer specifications for group 1 bindings.
     * Users should update the `data` field to change buffer contents.
     * The WebGPU view handles buffer creation and GPU updates automatically.
     */
    public bufferSpecs: CustomBufferSpec[];

    constructor(
        id: string,
        vertexShader: string,
        fragmentShader: string,
        bufferSpecs: CustomBufferSpec[] = []
    ) {
        this.id = id;
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.bufferSpecs = bufferSpecs;
    }

    // Component interface requires at least start or update
    start() {
        // No initialization needed for shaders
    }
    update() {
        // should be overridden by user if needed
    }
}

export default CustomRenderShader;
