import { WebGPUView } from './WebGPUView';
import CustomRenderShader, { type CustomBufferSpec } from '../Model/Components/CustomRenderShader';
import PostProcessingShader, { postProcessVertexShader, type PostProcessBufferSpec } from '../Model/Components/PostProcessingShader';
import { ShaderStage } from '../config/webgpu-constants';
import type Entity from '../Model/Entity';

export class PipelineHelper {
    private view: WebGPUView;
    public renderPipelines = new Map<string, GPURenderPipeline>();
    public customShaderBuffers = new Map<string, Map<number, GPUBuffer>>();
    public customShaderBindGroups = new Map<string, GPUBindGroup>();

    // Post-processing support
    public postProcessPipelines = new Map<string, GPURenderPipeline>();
    public postProcessBuffers = new Map<string, Map<number, GPUBuffer>>();

    constructor(view: WebGPUView) {

        this.view = view;
    }

    public createRenderPipeline(shader: CustomRenderShader): void {
        const device = this.view.getDevice();
        if (!device) throw new Error('WebGPU device not initialized');
        // Check if pipeline already exists
        if (this.renderPipelines.has(shader.id)) return;
        try {
            // Create shader module with custom vertex and fragment shaders
            const shaderModule = device.createShaderModule({
                code: `
                ${shader.vertexShader}

                ${shader.fragmentShader}
                    `
            });
            // Create bind group layout for group 0 (same as default pipeline)
            const bindGroupLayout0 = device.createBindGroupLayout({
                label: 'Default Bind Group Layout',
                entries: [
                    { binding: 0, visibility: ShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                    { binding: 1, visibility: ShaderStage.VERTEX, buffer: { type: 'uniform' } },
                    { binding: 2, visibility: ShaderStage.VERTEX, buffer: { type: 'uniform' } },
                    { binding: 3, visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT, sampler: {} },
                    { binding: 4, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                    { binding: 5, visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 6, visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 7, visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                ],
            });
            const bindGroupLayouts: GPUBindGroupLayout[] = [bindGroupLayout0];
            // Create bind group layout for group 1 (additional custom buffers)
            const group1Entries = shader.bufferSpecs.map(spec => ({
                binding: spec.binding,
                visibility: spec.visibility,
                buffer: {
                    type: spec.type as GPUBufferBindingType
                }
            }));

            const bindGroupLayout1 = device.createBindGroupLayout({
                label: 'Custom Shader Buffer Bind Group Layout',
                entries: group1Entries
            });
            bindGroupLayouts.push(bindGroupLayout1);

            // Create bind group layout for group 2 (additional custom textures)
            const group2Entries = shader.textureBufferSpecs.map(spec => ({
                binding: spec.binding,
                visibility: spec.visibility,
                texture: spec.texture
            }));

            const bindGroupLayout2 = device.createBindGroupLayout({
                label: 'Custom Shader Texture Bind Group Layout',
                entries: group2Entries
            });

            bindGroupLayouts.push(bindGroupLayout2);
            const descriptor = {
                bindGroupLayouts: bindGroupLayouts
            };

            // Create pipeline layout with all bind groups
            const pipelineLayout = device.createPipelineLayout(descriptor);

            // Define vertex buffers (same format as default pipeline)
            const vertexBuffers = [
                {
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
                        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
                        { shaderLocation: 2, offset: 24, format: 'float32x2' }  // uv
                    ],
                    arrayStride: 32,
                    stepMode: 'vertex'
                }
            ] as GPUVertexBufferLayout[];

            // Default alpha blending configuration
            const defaultBlend: GPUBlendState = {
                color: {
                    srcFactor: 'src-alpha' as GPUBlendFactor,
                    dstFactor: 'one-minus-src-alpha' as GPUBlendFactor,
                    operation: 'add' as GPUBlendOperation
                },
                alpha: {
                    srcFactor: 'src-alpha' as GPUBlendFactor,
                    dstFactor: 'one-minus-src-alpha' as GPUBlendFactor,
                    operation: 'add' as GPUBlendOperation
                }
            };

            // Get pipeline settings from shader or use defaults
            const cullMode = shader.pipelineSettings?.cullMode ?? 'back';
            // Handle blend: undefined = default alpha blending, null = no blending, otherwise use provided value
            const blendSetting = shader.pipelineSettings?.blend;
            const blend = blendSetting === undefined ? defaultBlend : (blendSetting === null ? undefined : blendSetting);
            const depthWriteEnabled = shader.pipelineSettings?.depthWriteEnabled ?? true;
            const depthCompare = shader.pipelineSettings?.depthCompare ?? 'less';

            // Create custom render pipeline
            const pipelineDescriptor: GPURenderPipelineDescriptor = {
                vertex: {
                    module: shaderModule,
                    entryPoint: 'vertex_main',
                    buffers: vertexBuffers
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: 'fragment_main',
                    targets: [{
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        blend: blend
                    }]
                },
                primitive: { topology: 'triangle-list', cullMode: cullMode },
                layout: pipelineLayout,
                multisample: { count: this.view.sampleCount },
                depthStencil: {
                    format: 'depth24plus',
                    depthWriteEnabled: depthWriteEnabled,
                    depthCompare: depthCompare
                },
            };

            const pipeline = device.createRenderPipeline(pipelineDescriptor);

            this.renderPipelines.set(shader.id, pipeline);

            // Create GPU buffers for group 1 (bind group will be created lazily)
            const bufferMap = new Map<number, GPUBuffer>();

            // Create GPU buffers for each buffer spec
            for (const spec of shader.bufferSpecs) {
                const buffer = device.createBuffer({
                    size: spec.size,
                    usage: GPUBufferUsage.COPY_DST | (
                        spec.type === 'uniform' ? GPUBufferUsage.UNIFORM :
                            spec.type === 'storage' ? GPUBufferUsage.STORAGE :
                                GPUBufferUsage.STORAGE // read-only-storage also uses STORAGE
                    )
                });

                // Initialize buffer with data
                this.updateCustomBuffer(buffer, spec);

                bufferMap.set(spec.binding, buffer);
            }

            // Store buffer map for this shader
            this.customShaderBuffers.set(shader.id, bufferMap);

            console.log(`Pipeline created for shader: ${shader.id}`);
        }
        catch (error) {
            console.error(`Failed to create pipeline for shader ${shader.id}:`, error);
        }
    }

    public updateCustomBuffer(buffer: GPUBuffer, spec: CustomBufferSpec): void {
        const device = this.view.getDevice();
        if (!device) return;

        // Convert data to ArrayBuffer if needed
        let data: ArrayBuffer;
        if (spec.data instanceof ArrayBuffer) {
            data = spec.data;
        } else {
            data = spec.data.buffer.slice(spec.data.byteOffset, spec.data.byteOffset + spec.data.byteLength) as ArrayBuffer;
        }

        device.queue.writeBuffer(buffer, 0, data);
    }

    public getBindGroupForCustomShaderBuffers(shader: CustomRenderShader): GPUBindGroup {
        const device = this.view.getDevice();
        if (!device) {
            throw new Error('WebGPU device not initialized');
        }

        // Check if we already have a bind group for this shader
        if (this.customShaderBindGroups.has(shader.id)) {
            return this.customShaderBindGroups.get(shader.id)!;
        }

        const pipeline = this.renderPipelines.get(shader.id);
        if (!pipeline) {
            throw new Error(`Pipeline not found for shader: ${shader.id}`);
        }

        const bufferMap = this.customShaderBuffers.get(shader.id);
        if (!bufferMap) {
            throw new Error(`Buffer map not found for shader: ${shader.id}`);
        }

        // Create bind group with the buffers (or empty bind group if no specs)
        // Use pipeline.getBindGroupLayout(1) to ensure we use the exact same layout - Firefox is strict about this
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(1),
            entries: shader.bufferSpecs.map(spec => ({
                binding: spec.binding,
                resource: { buffer: bufferMap.get(spec.binding)! }
            }))
        });

        // Cache the bind group
        this.customShaderBindGroups.set(shader.id, bindGroup);
        return bindGroup;
    }

    public getBindGroupForCustomShaderTextures(pipeline: GPURenderPipeline, shader: CustomRenderShader): GPUBindGroup {
        const device = this.view.getDevice();
        if (!device) {
            throw new Error('WebGPU device not initialized');
        }
        // Get the bind group layout for group 2
        const bindGroupLayout = pipeline.getBindGroupLayout(2);
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: shader.textureBufferSpecs.map((spec, index) => {
                const texture = this.view.th!.textures.get(spec.textureId) || this.view.th!.primitiveTexture;
                if (!texture) {
                    throw new Error(`Texture '${spec.binding}' not found and no primitive texture available`);
                }
                return {
                    binding: index,
                    resource: texture.createView()
                };
            })
        });
        return bindGroup;
    }

    public createPipelinesForEntities(entities: Entity[]): void {
        const device = this.view.getDevice();
        if (!device) return;

        // Get unique shader IDs
        const processedShaders = new Set<string>();

        for (const entity of entities) {
            const customShader = entity.getComponent(CustomRenderShader);
            if (!customShader || processedShaders.has(customShader.id)) continue;
            this.createRenderPipeline(customShader);
            processedShaders.add(customShader.id);
        }
    }

    public getPipeline(shaderId: string): GPURenderPipeline | undefined {
        return this.renderPipelines.get(shaderId);
    }

    public hasPipeline(shaderId: string): boolean {
        return this.renderPipelines.has(shaderId);
    }

    // =====================
    // Post-Processing Pipeline Support
    // =====================

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
