import { BaseView } from './BaseView';
import { renderer } from './shaders/default-wgsl-renderer';
import { ShowWebGPUInstructions } from '../misc/misc';
import * as M from '../misc/mat4';
import debug from '../Debug/Debug';
import type Entity from '../Model/Entity';
import MeshComponent from '../Model/Components/MeshComponent';
import CustomRenderShader, { type CustomBufferSpec } from '../Model/Components/CustomRenderShader';


export class WebGPUView extends BaseView {
    private device?: GPUDevice;
    private context?: GPUCanvasContext;
    private depthTexture?: GPUTexture;
    private renderPipelines = new Map<string, GPURenderPipeline>();
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private staticMeshBatches = new Map<string, { base: number; count: number; meshId: string; textureId: string }>();
    private nonStaticMeshBatches = new Map<string, { base: number; count: number; meshId: string; textureId: string }>();
    private nonStaticBaseOffset = 0;
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;
    private textureSampler?: GPUSampler;
    private primitiveTexture?: GPUTexture;
    private textures = new Map<string, GPUTexture>();
    private bindGroups = new Map<string, GPUBindGroup>();

    // Added MSAA fields
    private msaaColorTexture?: GPUTexture;
    private sampleCount = 4; // or 2/4/8 based on adapter

    // Custom shader support
    private customShaderObjects: Entity[] = [];
    private customShaderBindGroups = new Map<string, GPUBindGroup[]>();
    private customShaderObjectIndices = new Map<string, number>(); // Maps entity ID to storage buffer index
    private customShaderBuffers = new Map<string, Map<number, GPUBuffer>>(); // Maps shader ID -> binding -> GPUBuffer

    /**
     * Initialize WebGPU context and set up rendering pipeline.
     * 
     * @param canvas - HTML canvas element to render to
     * @returns Promise that resolves to WebGPU initialization objects or undefined if WebGPU is unavailable
     */
    public async init(canvas: HTMLCanvasElement): Promise<readonly [GPUAdapter, GPUDevice, HTMLCanvasElement, GPUCanvasContext, GPUTextureFormat] | undefined> {
        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) throw new Error('No adapter found');
            const device = await adapter.requestDevice();
            const context = canvas.getContext('webgpu')!;
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

            this.device = device;
            this.canvas = canvas;
            this.context = context;

            try {
                // Create helper to (re)create MSAA color + depth attachments sized to the canvas
                const makeAttachments = () => {
                    const w = this.canvas!.width || window.innerWidth;
                    const h = this.canvas!.height || window.innerHeight;

                    this.depthTexture?.destroy();
                    this.msaaColorTexture?.destroy();

                    this.depthTexture = this.device!.createTexture({
                        size: { width: w, height: h, depthOrArrayLayers: 1 },
                        sampleCount: this.sampleCount,
                        format: 'depth24plus',
                        usage: GPUTextureUsage.RENDER_ATTACHMENT,
                    });

                    this.msaaColorTexture = this.device!.createTexture({
                        size: { width: w, height: h, depthOrArrayLayers: 1 },
                        sampleCount: this.sampleCount,
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        usage: GPUTextureUsage.RENDER_ATTACHMENT,
                    });
                };

                makeAttachments();

                const shader = renderer;
                const shaderModule = device.createShaderModule({ code: shader });

                this.objectStorageBuffer = this.device.createBuffer({
                    size: 64 * this.maxObjects,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });
                this.cameraBuffer = this.device.createBuffer({
                    size: 64,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.projectionBuffer = this.device.createBuffer({
                    size: 64,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });

                // ensure projection is transposed before upload
                const initialProj = M.mat4Projection(this.fov, (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), this.near, this.far);
                this.device.queue.writeBuffer(this.projectionBuffer, 0, M.mat4Transpose(initialProj).buffer);

                // Create primitive texture and sampler
                this.createPrimitiveTexture();
                this.textureSampler = device.createSampler({
                    addressModeU: 'repeat',
                    addressModeV: 'repeat',
                    magFilter: 'nearest',
                    minFilter: 'nearest',
                });

                const bindGroupLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                    ],
                });

                const vertexBuffers = [
                    {
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
                            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal (12 bytes after position)
                            { shaderLocation: 2, offset: 24, format: 'float32x2' }  // uv (24 bytes after position + normal)
                        ],
                        arrayStride: 32,  // 8 floats * 4 bytes = 32 bytes per vertex (position + normal + uv)
                        stepMode: 'vertex'
                    }
                ];

                const pipelineDescriptor = {
                    vertex: { module: shaderModule, entryPoint: 'vertex_main', buffers: vertexBuffers },
                    fragment: { module: shaderModule, entryPoint: 'fragment_main', targets: [{ format: navigator.gpu.getPreferredCanvasFormat(), blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
                    primitive: { topology: 'triangle-list', cullMode: 'back' },
                    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
                    multisample: { count: this.sampleCount },
                    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                } as GPURenderPipelineDescriptor;

                this.renderPipelines.set('default', device.createRenderPipeline(pipelineDescriptor));
                console.log('render pipeline created');

                const resizeCanvasAndDepthTexture = () => {
                    if (!this.canvas || !this.device) return;
                    const dpr = window.devicePixelRatio || 1;
                    this.canvas.width = Math.floor((this.canvas.clientWidth || window.innerWidth) * dpr);
                    this.canvas.height = Math.floor((this.canvas.clientHeight || window.innerHeight) * dpr);

                    // recreate msaa and depth attachments sized to the new canvas
                    makeAttachments();
                    if (this.projectionBuffer) {
                        const proj = M.mat4Projection(this.fov, this.canvas.width / this.canvas.height, this.near, this.far);
                        this.device.queue.writeBuffer(this.projectionBuffer, 0, M.mat4Transpose(proj).buffer);
                    }
                };

                window.addEventListener('resize', resizeCanvasAndDepthTexture);
                resizeCanvasAndDepthTexture();
            } catch (error) {
                console.error('Failed to initialize WebGPU:', error);
            }

            return [adapter, device, canvas, context, format] as const;
        } catch (error) {
            ShowWebGPUInstructions()
        }
    }

    /**
     * Register scene objects with static/non-static optimization.
     * 
     * This method allows efficient handling of static and non-static objects by:
     * - Organizing objects in the buffer with static objects first, then non-static
     * - Only updating the non-static portion when updateStatic is false
     * - Maintaining separate batch tracking for optimal rendering
     * 
     * @param staticObjects - Objects that don't change and can be cached in GPU memory
     * @param nonStaticObjects - Objects that may change and need regular updates
     * @param updateStatic - Whether to update static objects (use true for initial setup or when static objects change)
     */
    public registerSceneObjectsSeparated(staticObjects: Entity[], nonStaticObjects: Entity[], updateStatic: boolean): void {
        if (!this.device) throw new Error('WebGPU device not initialized');

        // Separate custom shader objects from regular objects
        const regularStaticObjects: Entity[] = [];
        const regularNonStaticObjects: Entity[] = [];
        const customShaderObjects: Entity[] = [];

        for (const e of staticObjects) {
            if (e.getComponent(CustomRenderShader)) {
                customShaderObjects.push(e);
            } else {
                regularStaticObjects.push(e);
            }
        }

        for (const e of nonStaticObjects) {
            if (e.getComponent(CustomRenderShader)) {
                customShaderObjects.push(e);
            } else {
                regularNonStaticObjects.push(e);
            }
        }

        this.staticSceneObjects = regularStaticObjects;
        this.nonStaticSceneObjects = regularNonStaticObjects;
        this.customShaderObjects = customShaderObjects;

        // Create custom pipelines for each unique shader
        if (customShaderObjects.length > 0) {
            this.createCustomPipelines(customShaderObjects);
        }

        if (updateStatic) {
            // When static data is refreshed, make sure all meshes referenced by either
            // static or non-static entities have GPU buffers created. This avoids
            // rendering stalls later if a mesh appears first in a static rebuild.
            const ensureMeshUploaded = (e: Entity) => {
                const mc = e.getComponent(MeshComponent);
                if (!mc) return;
                const m = mc.mesh;
                // Only create GPU buffers if we don't already have them
                if (!this.objectBuffers.has(m.id)) {
                    this.uploadMeshToGPU(m.id, m.vertices, m.normals, m.uvs, m.indices);
                }
            };
            for (const e of regularStaticObjects) ensureMeshUploaded(e);
            for (const e of regularNonStaticObjects) ensureMeshUploaded(e);
            for (const e of customShaderObjects) ensureMeshUploaded(e);
            // Update entire buffer including static objects
            this.updateObjectStorageBufferWithSeparation(regularStaticObjects, regularNonStaticObjects);
        } else {
            // Only update non-static portion
            this.updateNonStaticObjectsOnly(regularNonStaticObjects);
        }
    }

    /**
     * Create custom render pipelines for objects with CustomRenderShader component
     */
    private createCustomPipelines(customShaderObjects: Entity[]): void {
        if (!this.device) return;

        // Get unique shader IDs
        const processedShaders = new Set<string>();

        for (const entity of customShaderObjects) {
            const customShader = entity.getComponent(CustomRenderShader);
            if (!customShader || processedShaders.has(customShader.id)) continue;

            processedShaders.add(customShader.id);

            // Check if pipeline already exists
            if (this.renderPipelines.has(`custom-${customShader.id}`)) continue;

            try {
                // Create shader module with custom vertex and fragment shaders
                const shaderModule = this.device.createShaderModule({
                    code: `
${customShader.vertexShader}

${customShader.fragmentShader}
                    `
                });

                // Create bind group layout for group 0 (same as default pipeline)
                const bindGroupLayout0 = this.device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                    ],
                });

                // Create bind group layout for group 1 (additional custom buffers)
                const group1Entries = customShader.bufferSpecs.map(spec => ({
                    binding: spec.binding,
                    visibility: spec.visibility,
                    buffer: {
                        type: spec.type as GPUBufferBindingType
                    }
                }));

                const bindGroupLayout1 = this.device.createBindGroupLayout({
                    entries: group1Entries
                });

                // Create pipeline layout with both bind groups
                const pipelineLayout = this.device.createPipelineLayout({
                    bindGroupLayouts: group1Entries.length > 0
                        ? [bindGroupLayout0, bindGroupLayout1]
                        : [bindGroupLayout0]
                });

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
                const cullMode = customShader.pipelineSettings?.cullMode ?? 'back';
                // Handle blend: undefined = default alpha blending, null = no blending, otherwise use provided value
                const blendSetting = customShader.pipelineSettings?.blend;
                const blend = blendSetting === undefined ? defaultBlend : (blendSetting === null ? undefined : blendSetting);
                const depthWriteEnabled = customShader.pipelineSettings?.depthWriteEnabled ?? true;
                const depthCompare = customShader.pipelineSettings?.depthCompare ?? 'less';

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
                    multisample: { count: this.sampleCount },
                    depthStencil: {
                        format: 'depth24plus',
                        depthWriteEnabled: depthWriteEnabled,
                        depthCompare: depthCompare
                    },
                };

                const pipeline = this.device.createRenderPipeline(pipelineDescriptor);
                this.renderPipelines.set(`custom-${customShader.id}`, pipeline);

                // Create GPU buffers and bind group for group 1 if there are buffer specs
                if (group1Entries.length > 0) {
                    const bufferMap = new Map<number, GPUBuffer>();

                    // Create GPU buffers for each buffer spec
                    for (const spec of customShader.bufferSpecs) {
                        const buffer = this.device.createBuffer({
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
                    this.customShaderBuffers.set(customShader.id, bufferMap);

                    // Create bind group with the created buffers
                    const bindGroup1 = this.device.createBindGroup({
                        layout: bindGroupLayout1,
                        entries: customShader.bufferSpecs.map(spec => ({
                            binding: spec.binding,
                            resource: { buffer: bufferMap.get(spec.binding)! }
                        }))
                    });

                    this.customShaderBindGroups.set(customShader.id, [bindGroup1]);
                }

                console.log(`Custom pipeline created for shader: ${customShader.id}`);
            } catch (error) {
                console.error(`Failed to create custom pipeline for shader ${customShader.id}:`, error);
            }
        }
    }

    public registerCamera(camera: Entity): void {
        const camKey = `${camera.position[0]},${camera.position[1]},${camera.position[2]}|${JSON.stringify(camera.rotation)}`;
        if (camKey === this.lastCameraKey) {
            this.camera = camera;
            return;
        }
        this.camera = camera;
        this.lastCameraKey = camKey;

        if (this.device && this.cameraBuffer) {
            const camTransform = M.mat4Mul(M.mat4(), camera.rotation, M.mat4Translation(-camera.position[0], -camera.position[1], -camera.position[2]));
            this.device.queue.writeBuffer(this.cameraBuffer, 0, M.mat4Transpose(camTransform).buffer);
        }
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array | Uint16Array): void {
        this.meshes[meshId] = { id: meshId, vertices, normals, uvs, indices };
        if (this.device) this.createBuffersForMesh(meshId);
    }

    public render(): void {
        if (!this.device || !this.context || !this.renderPipelines.get('default') || !this.depthTexture || !this.msaaColorTexture) {
            console.warn('Render skipped: device/context/pipeline not ready');
            return;
        }

        // use MSAA color texture as the attachment and resolve into swapchain view
        const swapView = this.context.getCurrentTexture().createView();
        const msaaView = this.msaaColorTexture!.createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: msaaView,
                resolveTarget: swapView,
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture!.createView(),
                depthLoadOp: 'clear',
                depthClearValue: 1.0,
                depthStoreOp: 'store',
            },
        };

        try {
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.setPipeline(this.renderPipelines.get('default')!);

            // Optimized rendering: draw static objects first, then non-static objects, grouped by mesh+texture
            let objIndex = 0;
            // First, draw all static objects grouped by mesh+texture
            for (const [_, batch] of this.staticMeshBatches) {
                const buf = this.objectBuffers.get(batch.meshId);
                if (!buf) continue;

                // Get the appropriate bind group for this texture
                const bindGroup = this.getBindGroupForTexture(batch.textureId);
                passEncoder.setBindGroup(0, bindGroup);

                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);
                passEncoder.drawIndexed(buf.indices.length, batch.count, 0, 0, batch.base);
                objIndex += batch.count;
            }

            // Then, draw all non-static objects grouped by mesh+texture
            for (const [_, batch] of this.nonStaticMeshBatches) {
                const buf = this.objectBuffers.get(batch.meshId);
                if (!buf) continue;

                // Get the appropriate bind group for this texture
                const bindGroup = this.getBindGroupForTexture(batch.textureId);
                passEncoder.setBindGroup(0, bindGroup);

                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);
                passEncoder.drawIndexed(buf.indices.length, batch.count, 0, 0, batch.base);
                objIndex += batch.count;
            }
            debug.log(`Drawn ${objIndex} objects in total.`);

            // Render custom shader objects individually after normal batches
            for (const entity of this.customShaderObjects) {
                const customShader = entity.getComponent(CustomRenderShader);
                const meshComponent = entity.getComponent(MeshComponent);

                if (!customShader || !meshComponent) continue;

                const pipeline = this.renderPipelines.get(`custom-${customShader.id}`);
                if (!pipeline) {
                    console.warn(`Custom pipeline not found for shader: ${customShader.id}`);
                    continue;
                }

                const buf = this.objectBuffers.get(meshComponent.mesh.id);
                if (!buf) continue;

                // Get the storage buffer index for this entity
                const instanceIndex = this.customShaderObjectIndices.get(entity.id);
                if (instanceIndex === undefined) {
                    console.warn(`No storage buffer index found for custom shader entity: ${entity.id}`);
                    continue;
                }

                // Switch to custom pipeline
                passEncoder.setPipeline(pipeline);

                // Bind group 0 (default bindings: camera, projection, texture, etc.)
                const bindGroup0 = this.getBindGroupForTexture(meshComponent.texture);
                passEncoder.setBindGroup(0, bindGroup0);

                // Bind group 1 (custom additional buffers)
                const bindGroups1 = this.customShaderBindGroups.get(customShader.id);
                if (bindGroups1 && bindGroups1.length > 0) {
                    passEncoder.setBindGroup(1, bindGroups1[0]);
                }

                // Set vertex and index buffers
                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);

                // Draw this single object with the correct instance index
                passEncoder.drawIndexed(buf.indices.length, 1, 0, 0, instanceIndex);
                objIndex++;
            }

            passEncoder.end();
            this.device.queue.submit([commandEncoder.finish()]);
        } catch (e) {
            console.error('Render error:', e);
        }
        debug.log(`WebGPUView rendered ${this.staticSceneObjects.length} static objects; ${this.nonStaticSceneObjects.length} non-static objects; ${this.customShaderObjects.length} custom shader objects.`);
    }

    private createBuffersForMesh(meshId: string): void {
        if (!this.device) return;
        if (this.objectBuffers.has(meshId)) return;
        const mesh = this.meshes[meshId];
        if (!mesh) return;

        const vertices = mesh.vertices;
        const normals = mesh.normals;
        const uvs = mesh.uvs;
        const indices = mesh.indices;

        // Interleave vertices, normals, and UVs: [x, y, z, nx, ny, nz, u, v, x, y, z, nx, ny, nz, u, v, ...]
        const vertexCount = vertices.length / 3;
        const interleavedData = new Float32Array(vertexCount * 8); // 3 for position + 3 for normal + 2 for UV

        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 8;
            const vertIdx = i * 3;
            const uvIdx = i * 2;

            // Copy position
            interleavedData[baseIdx + 0] = vertices[vertIdx + 0];
            interleavedData[baseIdx + 1] = vertices[vertIdx + 1];
            interleavedData[baseIdx + 2] = vertices[vertIdx + 2];

            // Copy normal
            interleavedData[baseIdx + 3] = normals[vertIdx + 0];
            interleavedData[baseIdx + 4] = normals[vertIdx + 1];
            interleavedData[baseIdx + 5] = normals[vertIdx + 2];

            // Copy UV
            interleavedData[baseIdx + 6] = uvs[uvIdx + 0];
            interleavedData[baseIdx + 7] = uvs[uvIdx + 1];
        }

        const vertexBuffer = this.device.createBuffer({
            size: interleavedData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, interleavedData.buffer);

        const indexBuffer = this.device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(indexBuffer, 0, indices.buffer as ArrayBuffer, indices.byteOffset, indices.byteLength);

        this.objectBuffers.set(meshId, { vertexBuffer, indexBuffer, indices });
    }


    private updateObjectStorageBufferWithSeparation(staticObjects: Entity[], nonStaticObjects: Entity[]): void {
        if (!this.device) throw new Error('Device not initialized');
        const totalObjectCount = staticObjects.length + nonStaticObjects.length + this.customShaderObjects.length;
        // Ensure storage buffer is large enough; if we recreated it we must also rebuild the bind group
        let recreated = false;
        if (totalObjectCount > this.maxObjects || !this.objectStorageBuffer) {
            this.maxObjects = Math.max(totalObjectCount, this.maxObjects);
            this.objectStorageBuffer?.destroy();
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            recreated = true;
        }

        const all = this.buildBatchesAndMatrixBuffer(staticObjects, nonStaticObjects);
        this.device.queue.writeBuffer(this.objectStorageBuffer!, 0, all.buffer, 0, all.byteLength);

        // Add custom shader object transforms after the regular objects
        const customShaderBaseIndex = this.getCustomShaderBaseIndex(staticObjects, nonStaticObjects);
        this.updateCustomShaderObjectTransforms(customShaderBaseIndex);

        if (recreated) {
            // Note: Bind groups are now created dynamically in render() based on texture
        }
    }

    private updateNonStaticObjectsOnly(nonStaticObjects: Entity[]): void {
        if (!this.device) throw new Error('Device not initialized');

        if (!this.objectStorageBuffer) {
            // If no buffer exists, create it and write all data
            const all = this.buildBatchesAndMatrixBuffer(this.staticSceneObjects, nonStaticObjects);
            this.maxObjects = Math.max(this.maxObjects, (this.staticSceneObjects.length + nonStaticObjects.length));
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            // Note: Bind groups are now created dynamically in render() based on texture
            this.device.queue.writeBuffer(this.objectStorageBuffer!, 0, all.buffer, 0, all.byteLength);
            return;
        }

        // Only update the non-static portion of the buffer
        const nonStaticMatrixBuffer = this.buildNonStaticMatrixBuffer(nonStaticObjects);
        if (nonStaticMatrixBuffer.length > 0) {
            const offsetBytes = this.nonStaticBaseOffset * 16 * 4; // offset in bytes (16 floats * 4 bytes per float)
            this.device.queue.writeBuffer(this.objectStorageBuffer!, offsetBytes, nonStaticMatrixBuffer.buffer, 0, nonStaticMatrixBuffer.byteLength);
        }

        // Update batch information for non-static objects
        this.updateNonStaticBatches(nonStaticObjects);

        // Update custom shader object transforms
        const customShaderBaseIndex = this.getCustomShaderBaseIndex(this.staticSceneObjects, nonStaticObjects);
        this.updateCustomShaderObjectTransforms(customShaderBaseIndex);

        // Update custom shader buffers
        this.updateCustomShaderBuffers();
    }

    /**
     * Calculate the base index for custom shader objects in the storage buffer
     */
    private getCustomShaderBaseIndex(staticObjects: Entity[], nonStaticObjects: Entity[]): number {
        return staticObjects.length + nonStaticObjects.length;
    }

    private buildBatchesAndMatrixBuffer(staticObjs: Entity[], nonStaticObjs: Entity[]) {
        // Group objects by mesh+texture, keeping static and non-static separate
        const staticGroups = new Map<string, Entity[]>();
        const nonStaticGroups = new Map<string, Entity[]>();

        const pushStatic = (o: Entity) => {
            const meshComponent = o.getComponent(MeshComponent);
            if (!meshComponent) return;
            const id = `${meshComponent.mesh.id}-${meshComponent.texture}`;
            if (!staticGroups.has(id)) staticGroups.set(id, []);
            staticGroups.get(id)!.push(o);
        };

        const pushNonStatic = (o: Entity) => {
            const meshComponent = o.getComponent(MeshComponent);
            if (!meshComponent) return;
            const id = `${meshComponent.mesh.id}-${meshComponent.texture}`;
            if (!nonStaticGroups.has(id)) nonStaticGroups.set(id, []);
            nonStaticGroups.get(id)!.push(o);
        };

        staticObjs.forEach(pushStatic);
        nonStaticObjs.forEach(pushNonStatic);

        const total = staticObjs.length + nonStaticObjs.length;
        const out = new Float32Array(total * 16);
        this.staticMeshBatches.clear();
        this.nonStaticMeshBatches.clear();

        let cursor = 0;

        // First, add all static objects grouped by mesh+texture
        for (const [meshTextureId, arr] of staticGroups) {
            const firstMC = arr[0].getComponent(MeshComponent)!;
            const batch = { base: cursor, count: arr.length, meshId: firstMC.mesh.id, textureId: firstMC.texture };
            this.staticMeshBatches.set(meshTextureId, batch);

            for (let i = 0; i < arr.length; i++) {
                const o = arr[i];
                const t = [o.position[0], o.position[1], o.position[2]];
                const s = [o.scale[0], o.scale[1], o.scale[2]];
                const m = M.mat4Transpose(M.mat4TRS(t, o.rotation, s));
                out.set(m, (cursor + i) * 16);
            }
            cursor += arr.length;
        }

        // Then, add all non-static objects grouped by mesh+texture
        this.nonStaticBaseOffset = cursor;
        for (const [meshTextureId, arr] of nonStaticGroups) {
            const firstMC = arr[0].getComponent(MeshComponent)!;
            const batch = { base: cursor, count: arr.length, meshId: firstMC.mesh.id, textureId: firstMC.texture };
            this.nonStaticMeshBatches.set(meshTextureId, batch);

            for (let i = 0; i < arr.length; i++) {
                const o = arr[i];
                const t = [o.position[0], o.position[1], o.position[2]];
                const s = [o.scale[0], o.scale[1], o.scale[2]];
                const m = M.mat4Transpose(M.mat4TRS(t, o.rotation, s));
                out.set(m, (cursor + i) * 16);
            }
            cursor += arr.length;
        }


        return out;
    }

    private buildNonStaticMatrixBuffer(nonStaticObjs: Entity[]): Float32Array {
        // Group non-static objects by mesh+texture
        const nonStaticGroups = new Map<string, Entity[]>();

        const pushNonStatic = (o: Entity) => {
            const meshComponent = o.getComponent(MeshComponent);
            if (!meshComponent) return;
            const id = `${meshComponent.mesh.id}-${meshComponent.texture}`;
            if (!nonStaticGroups.has(id)) nonStaticGroups.set(id, []);
            nonStaticGroups.get(id)!.push(o);
        };

        nonStaticObjs.forEach(pushNonStatic);

        const out = new Float32Array(nonStaticObjs.length * 16);
        let cursor = 0;

        // Process in same order as buildBatchesAndMatrixBuffer
        for (const [, arr] of nonStaticGroups) {
            for (let i = 0; i < arr.length; i++) {
                const o = arr[i];
                const t = [o.position[0], o.position[1], o.position[2]];
                const s = [o.scale[0], o.scale[1], o.scale[2]];
                const m = M.mat4Transpose(M.mat4TRS(t, o.rotation, s));
                out.set(m, (cursor + i) * 16);
            }
            cursor += arr.length;
        }

        return out;
    }

    private updateNonStaticBatches(nonStaticObjs: Entity[]): void {
        // Group non-static objects by mesh+texture and update batch information
        const nonStaticGroups = new Map<string, Entity[]>();

        const pushNonStatic = (o: Entity) => {
            const meshComponent = o.getComponent(MeshComponent);
            if (!meshComponent) return;
            const id = `${meshComponent.mesh.id}-${meshComponent.texture}`;
            if (!nonStaticGroups.has(id)) nonStaticGroups.set(id, []);
            nonStaticGroups.get(id)!.push(o);
        };

        nonStaticObjs.forEach(pushNonStatic);

        this.nonStaticMeshBatches.clear();
        let cursor = this.nonStaticBaseOffset;

        for (const [meshTextureId, arr] of nonStaticGroups) {
            const firstMC = arr[0].getComponent(MeshComponent)!;
            this.nonStaticMeshBatches.set(meshTextureId, { base: cursor, count: arr.length, meshId: firstMC.mesh.id, textureId: firstMC.texture });
            cursor += arr.length;
        }

    }

    /**
     * Update transform matrices for custom shader objects in the storage buffer
     */
    private updateCustomShaderObjectTransforms(baseIndex: number): void {
        if (!this.device || !this.objectStorageBuffer) return;

        this.customShaderObjectIndices.clear();

        for (let i = 0; i < this.customShaderObjects.length; i++) {
            const entity = this.customShaderObjects[i];
            const storageIndex = baseIndex + i;

            // Store the index for this entity
            this.customShaderObjectIndices.set(entity.id, storageIndex);

            // Compute transform matrix
            const t = [entity.position[0], entity.position[1], entity.position[2]];
            const s = [entity.scale[0], entity.scale[1], entity.scale[2]];
            const matrix = M.mat4Transpose(M.mat4TRS(t, entity.rotation, s));

            // Write matrix to buffer at the correct offset
            const offsetBytes = storageIndex * 16 * 4; // 16 floats * 4 bytes per float
            this.device.queue.writeBuffer(this.objectStorageBuffer, offsetBytes, matrix.buffer, 0, matrix.byteLength);
        }
    }

    /**
     * Helper method to update a GPU buffer from a buffer spec's data
     */
    private updateCustomBuffer(buffer: GPUBuffer, spec: CustomBufferSpec): void {
        if (!this.device) return;

        // Convert data to ArrayBuffer if needed
        let data: ArrayBuffer;
        if (spec.data instanceof ArrayBuffer) {
            data = spec.data;
        } else {
            data = spec.data.buffer.slice(spec.data.byteOffset, spec.data.byteOffset + spec.data.byteLength) as ArrayBuffer;
        }

        this.device.queue.writeBuffer(buffer, 0, data);
    }

    /**
     * Update all custom shader buffers from their buffer specs
     * Called during updateNonStaticObjectsOnly to sync user changes
     */
    private updateCustomShaderBuffers(): void {
        if (!this.device) return;

        for (const entity of this.customShaderObjects) {
            const customShader = entity.getComponent(CustomRenderShader);
            if (!customShader) continue;

            const bufferMap = this.customShaderBuffers.get(customShader.id);
            if (!bufferMap) continue;

            // Update each buffer from its spec's data
            for (const spec of customShader.bufferSpecs) {
                const buffer = bufferMap.get(spec.binding);
                if (buffer) {
                    this.updateCustomBuffer(buffer, spec);
                }
            }
        }
    }

    /**
     * Get or create a bind group for the specified texture
     * @param textureId - The texture identifier
     * @returns GPUBindGroup for the texture
     */
    private getBindGroupForTexture(textureId: string): GPUBindGroup {
        if (!this.device || !this.renderPipelines.get('default')) {
            throw new Error('WebGPU device or pipeline not initialized');
        }

        // Check if we already have a bind group for this texture
        if (this.bindGroups.has(textureId)) {
            return this.bindGroups.get(textureId)!;
        }

        // Get the texture (use primitive texture as fallback)
        const texture = this.textures.get(textureId) || this.primitiveTexture;
        if (!texture) {
            throw new Error(`Texture '${textureId}' not found and no primitive texture available`);
        }

        // Create bind group layout
        const bindGroupLayout = this.renderPipelines.get('default')!.getBindGroupLayout(0);

        // Create new bind group for this texture
        const bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                { binding: 1, resource: { buffer: this.cameraBuffer! } },
                { binding: 2, resource: { buffer: this.projectionBuffer! } },
                { binding: 3, resource: this.textureSampler! },
                { binding: 4, resource: texture.createView() },
            ]
        });

        // Cache the bind group
        this.bindGroups.set(textureId, bindGroup);
        return bindGroup;
    }

    /**
     * Create primitive texture for testing
     */
    private createPrimitiveTexture(): void {
        if (!this.device) return;

        // Create a simple 2x2 texture
        const textureData = new Uint8Array([
            // Top row: white, red
            255, 255, 255, 255, 255, 0, 0, 255,
            // Bottom row: green, blue  
            0, 255, 0, 255, 0, 0, 255, 255
        ]);

        this.primitiveTexture = this.device.createTexture({
            size: { width: 2, height: 2 },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: this.primitiveTexture },
            textureData,
            { bytesPerRow: 8, rowsPerImage: 2 },
            { width: 2, height: 2 }
        );
    }

    /**
     * Upload texture from ImageData
     * @param textureId - Unique identifier for the texture
     * @param imageData - ImageData object containing the texture data
     */
    public addTexture(textureId: string, imageData: ImageData): void {
        if (!this.device) throw new Error('WebGPU device not initialized');

        // Create texture with the dimensions from ImageData
        const texture = this.device.createTexture({
            size: { width: imageData.width, height: imageData.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Write the ImageData to the texture
        this.device.queue.writeTexture(
            { texture },
            imageData.data,
            { bytesPerRow: imageData.width * 4, rowsPerImage: imageData.height },
            { width: imageData.width, height: imageData.height }
        );

        // Store the texture
        this.textures.set(textureId, texture);
    }
}