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

export interface CustomTextureBufferSpec {
    binding: number;
    visibility: number; // GPUShaderStage flags 
    texture: GPUTextureBindingLayout;
    textureId: string; // ID of the texture in TextureHelper
}


/**
 * Optional pipeline settings for custom render shaders.
 * Uses WebGPU types (GPUCullMode, GPUBlendState, GPUCompareFunction) which are
 * globally available via @webgpu/types package.
 */
export interface PipelineSettings {
    /** Cull mode for triangle culling (default: 'back') */
    cullMode?: GPUCullMode;
    /** 
     * Blending configuration. 
     * - undefined/omitted: uses default alpha blending
     * - null: disables blending (opaque rendering)
     * - GPUBlendState: custom blend configuration
     */
    blend?: GPUBlendState | null;
    /** Whether depth writes are enabled (default: true) */
    depthWriteEnabled?: boolean;
    /** Depth comparison function (default: 'less') */
    depthCompare?: GPUCompareFunction;
}

/**
 * Component for custom shaders in WebGPU backend.
 * Contains vertex and fragment shader code, additional buffer specifications,
 * optional pipeline settings, and an ID for pipeline caching.
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

    public textureBufferSpecs: CustomTextureBufferSpec[];

    /**
     * Optional pipeline settings (cullMode, blend, depthWriteEnabled, depthCompare).
     * If not specified, defaults are used: cullMode='back', blend=alpha blending,
     * depthWriteEnabled=true, depthCompare='less'.
     */
    public pipelineSettings?: PipelineSettings;

    constructor(
        id: string,
        vertexShader: string,
        fragmentShader: string,
        bufferSpecs: CustomBufferSpec[] = [],
        textureBufferSpecs: CustomTextureBufferSpec[] = [],
        pipelineSettings?: PipelineSettings
    ) {
        this.id = id;
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.bufferSpecs = bufferSpecs;
        this.textureBufferSpecs = textureBufferSpecs;
        this.pipelineSettings = pipelineSettings;
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
