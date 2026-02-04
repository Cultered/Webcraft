import { WebGPUView } from './WebGPUView';
import PostProcessingShader, { postProcessVertexShader, type PostProcessBufferSpec } from '../Model/Components/PostProcessingShader';
import { ShaderStage } from '../config/webgpu-constants';

/**
 * Helper class for creating and managing post-processing pipelines.
 */
export class PostProcessingPipelineHelper {
    private view: WebGPUView;
    public postProcessPipelines = new Map<string, GPURenderPipeline>();
    public postProcessBuffers = new Map<string, Map<number, GPUBuffer>>();

    constructor(view: WebGPUView) {
        this.view = view;
    }

    /**
     * Create render pipelines for post-processing shaders
     */
    public createPostProcessPipelines(shaders: PostProcessingShader[]): void {
        const device = this.view.getDevice();
        if (!device) return;

        for (const shader of shaders) {
            if (this.postProcessPipelines.has(shader.id)) continue;
            this.createPostProcessPipeline(shader);
        }
    }

    /**
     * Create a single post-processing pipeline
     */
    private createPostProcessPipeline(shader: PostProcessingShader): void {
        const device = this.view.getDevice();
        if (!device) throw new Error('WebGPU device not initialized');

        try {
            // Create shader module combining the standard vertex shader with custom fragment shader
            const shaderModule = device.createShaderModule({
                code: `
                ${postProcessVertexShader}
                
                ${shader.fragmentShader}
                `
            });

            // Create bind group layout for group 0 (standard post-process bindings)
            // binding 0: sampler
            // binding 1: input texture
            // binding 2: u_resolution (vec2f)
            // binding 3: u_time (f32)
            // binding 4: scene texture (optional - for composite passes)
            const group0Entries: GPUBindGroupLayoutEntry[] = [
                { binding: 0, visibility: ShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 2, visibility: ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 3, visibility: ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            ];
            
            // Add scene texture binding if shader needs it
            if (shader.needsSceneTexture()) {
                group0Entries.push({ binding: 4, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
            }

            const bindGroupLayout0 = device.createBindGroupLayout({
                label: `PostProcess ${shader.id} Bind Group Layout 0`,
                entries: group0Entries,
            });

            // Create bind group layout for group 1 (custom buffers)
            const group1Entries = shader.bufferSpecs.map(spec => ({
                binding: spec.binding,
                visibility: spec.visibility,
                buffer: { type: spec.type as GPUBufferBindingType }
            }));

            const bindGroupLayout1 = device.createBindGroupLayout({
                label: `PostProcess ${shader.id} Bind Group Layout 1`,
                entries: group1Entries
            });

            // Create pipeline layout
            const pipelineLayout = device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, bindGroupLayout1]
            });

            // Create render pipeline (no vertex buffers needed - using vertex index)
            const pipelineDescriptor: GPURenderPipelineDescriptor = {
                vertex: {
                    module: shaderModule,
                    entryPoint: 'vertex_main',
                    buffers: [] // No vertex buffers - using vertex index for full-screen triangle
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: 'fragment_main',
                    targets: [{
                        format: navigator.gpu.getPreferredCanvasFormat(),
                    }]
                },
                primitive: { topology: 'triangle-list', cullMode: 'none' },
                layout: pipelineLayout,
                multisample: { count: 1 }, // Post-processing doesn't use MSAA
            };

            const pipeline = device.createRenderPipeline(pipelineDescriptor);
            this.postProcessPipelines.set(shader.id, pipeline);

            // Create GPU buffers for custom bindings
            const bufferMap = new Map<number, GPUBuffer>();
            for (const spec of shader.bufferSpecs) {
                const buffer = device.createBuffer({
                    size: spec.size,
                    usage: GPUBufferUsage.COPY_DST | (
                        spec.type === 'uniform' ? GPUBufferUsage.UNIFORM :
                            spec.type === 'storage' ? GPUBufferUsage.STORAGE :
                                GPUBufferUsage.STORAGE
                    )
                });
                this.updatePostProcessBuffer(buffer, spec);
                bufferMap.set(spec.binding, buffer);
            }
            this.postProcessBuffers.set(shader.id, bufferMap);

            console.log(`Post-process pipeline created for shader: ${shader.id}`);
        } catch (error) {
            console.error(`Failed to create post-process pipeline for shader ${shader.id}:`, error);
        }
    }

    /**
     * Update a post-processing buffer with new data
     */
    private updatePostProcessBuffer(buffer: GPUBuffer, spec: PostProcessBufferSpec): void {
        const device = this.view.getDevice();
        if (!device) return;

        let data: ArrayBuffer;
        if (spec.data instanceof ArrayBuffer) {
            data = spec.data;
        } else {
            data = spec.data.buffer.slice(spec.data.byteOffset, spec.data.byteOffset + spec.data.byteLength) as ArrayBuffer;
        }

        device.queue.writeBuffer(buffer, 0, data);
    }

    /**
     * Update all custom buffers for a post-processing shader
     */
    public updatePostProcessBuffers(shader: PostProcessingShader): void {
        const bufferMap = this.postProcessBuffers.get(shader.id);
        if (!bufferMap) return;

        for (const spec of shader.bufferSpecs) {
            const buffer = bufferMap.get(spec.binding);
            if (buffer) {
                this.updatePostProcessBuffer(buffer, spec);
            }
        }
    }

    /**
     * Get the post-processing pipeline for a shader
     */
    public getPostProcessPipeline(shaderId: string): GPURenderPipeline | undefined {
        return this.postProcessPipelines.get(shaderId);
    }

    /**
     * Check if a post-processing pipeline exists
     */
    public hasPostProcessPipeline(shaderId: string): boolean {
        return this.postProcessPipelines.has(shaderId);
    }

    /**
     * Create bind group 0 for post-processing (standard bindings)
     */
    public getPostProcessBindGroup0(
        pipeline: GPURenderPipeline,
        sampler: GPUSampler,
        inputTexture: GPUTextureView,
        resolutionBuffer: GPUBuffer,
        timeBuffer: GPUBuffer,
        sceneTexture?: GPUTextureView
    ): GPUBindGroup {
        const device = this.view.getDevice();
        if (!device) throw new Error('WebGPU device not initialized');

        const entries: GPUBindGroupEntry[] = [
            { binding: 0, resource: sampler },
            { binding: 1, resource: inputTexture },
            { binding: 2, resource: { buffer: resolutionBuffer } },
            { binding: 3, resource: { buffer: timeBuffer } },
        ];

        // Add scene texture if provided
        if (sceneTexture) {
            entries.push({ binding: 4, resource: sceneTexture });
        }

        return device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries
        });
    }

    /**
     * Create bind group 1 for post-processing (custom buffers)
     */
    public getPostProcessBindGroup1(pipeline: GPURenderPipeline, shader: PostProcessingShader): GPUBindGroup {
        const device = this.view.getDevice();
        if (!device) throw new Error('WebGPU device not initialized');

        const bufferMap = this.postProcessBuffers.get(shader.id);

        return device.createBindGroup({
            layout: pipeline.getBindGroupLayout(1),
            entries: shader.bufferSpecs.map(spec => ({
                binding: spec.binding,
                resource: { buffer: bufferMap!.get(spec.binding)! }
            }))
        });
    }
}
