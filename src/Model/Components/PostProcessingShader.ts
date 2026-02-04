import type { Component } from './Component';

/**
 * Specification for an additional buffer to bind in post-processing shaders
 */
export interface PostProcessBufferSpec {
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
 * Optional pipeline settings for post-processing shaders.
 */
export interface PostProcessPipelineSettings {
    /** Whether this post-process is enabled (default: true) */
    enabled?: boolean;
    /** Render order - lower values render first (default: 0) */
    order?: number;
    /** 
     * If true, this shader needs access to the original scene texture (binding 4).
     * Used for composite passes that combine processed result with original.
     */
    needsSceneTexture?: boolean;
}

/**
 * Component for post-processing shaders in WebGPU backend.
 * Post-processing shaders are attached to the camera entity and are applied
 * after the main scene rendering is complete.
 * 
 * The shader receives the rendered scene as a texture input and outputs
 * the processed result. Multiple post-processing shaders can be chained.
 * 
 * Built-in bindings (group 0):
 * - binding 0: sampler for the input texture
 * - binding 1: input texture (previous render pass or scene)
 * - binding 2: u_resolution (vec2f - screen width, height)
 * - binding 3: u_time (f32 - elapsed time in seconds)
 * 
 * Custom bindings (group 1):
 * - User-defined buffers via bufferSpecs
 */
export class PostProcessingShader implements Component {
    /** Unique identifier for this post-processing shader */
    id: string;

    /** WGSL fragment shader code for post-processing */
    fragmentShader: string;

    /** 
     * Additional buffer specifications for group 1 bindings.
     * Users should update the `data` field to change buffer contents.
     */
    public bufferSpecs: PostProcessBufferSpec[];

    /**
     * Optional pipeline settings (enabled, order).
     */
    public pipelineSettings?: PostProcessPipelineSettings;

    constructor(
        id: string,
        fragmentShader: string,
        bufferSpecs: PostProcessBufferSpec[] = [],
        pipelineSettings?: PostProcessPipelineSettings
    ) {
        this.id = id;
        this.fragmentShader = fragmentShader;
        this.bufferSpecs = bufferSpecs;
        this.pipelineSettings = pipelineSettings;
    }

    /** Check if this post-process effect is enabled */
    isEnabled(): boolean {
        return this.pipelineSettings?.enabled !== false;
    }

    /** Get the render order (lower = earlier) */
    getOrder(): number {
        return this.pipelineSettings?.order ?? 0;
    }

    /** Check if this shader needs access to the original scene texture */
    needsSceneTexture(): boolean {
        return this.pipelineSettings?.needsSceneTexture === true;
    }

    // Component interface
    start() {
        // No initialization needed
    }

    update() {
        // Override in subclass if needed for animation
    }
}

/**
 * Default full-screen quad vertex shader for post-processing.
 * This generates a full-screen triangle that covers the viewport.
 */
export const postProcessVertexShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
    var output: VertexOut;
    
    // Generate a full-screen triangle using vertex index
    // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    
    output.position = vec4f(x, y, 0.0, 1.0);
    // UV coordinates: map from clip space to texture space
    output.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    
    return output;
}
`;

export default PostProcessingShader;
