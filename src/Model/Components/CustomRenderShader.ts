import type { Component } from './Component';

/**
 * Component for custom shaders in WebGPU backend.
 * Contains vertex and fragment shader code, additional buffer specifications,
 * and an ID for pipeline caching.
 */
export class CustomRenderShader implements Component {
    /** Unique identifier for this shader, used for pipeline caching */
    id: string;
    
    /** WGSL vertex shader code */
    vertexShader: string;
    
    /** WGSL fragment shader code */
    fragmentShader: string;
    
    /** 
     * Additional buffers to bind in group 1 (group 0 is reserved for default bindings).
     * Each entry specifies the buffer binding configuration.
     */
    additionalBuffers: Array<{
        binding: number;
        buffer: GPUBuffer;
        type: 'uniform' | 'storage' | 'read-only-storage';
        visibility: number; // GPUShaderStage flags
    }>;

    constructor(
        id: string,
        vertexShader: string,
        fragmentShader: string,
        additionalBuffers: Array<{
            binding: number;
            buffer: GPUBuffer;
            type: 'uniform' | 'storage' | 'read-only-storage';
            visibility: number;
        }> = []
    ) {
        this.id = id;
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.additionalBuffers = additionalBuffers;
    }

    // Component interface requires at least start or update
    start() {
        // No initialization needed for shaders
    }
}

export default CustomRenderShader;
