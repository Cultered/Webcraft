import { BaseView } from './BaseView';
import { ShowWebGPUInstructions } from '../misc/misc';
import * as M from '../misc/mat4';
import debug from '../Debug/Debug';
import type Entity from '../Model/Entity';
import MeshComponent from '../Model/Components/MeshComponent';
import CustomRenderShader, { type CustomBufferSpec } from '../Model/Components/CustomRenderShader';
import { TextureHelper } from './textureHelper';
import { ShaderStage } from '../config/webgpu-constants';


export class WebGPUView extends BaseView {
    public depthView?: GPUTextureView;

    private device?: GPUDevice;

    getDevice(): GPUDevice | undefined {
        return this.device;
    }

    private context?: GPUCanvasContext;
    private depthTexture?: GPUTexture;
    private renderPipelines = new Map<string, GPURenderPipeline>();
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;
    private globalLightDirectionBuffer?: GPUBuffer;
    private globalLightColorBuffer?: GPUBuffer;
    private globalAmbientColorBuffer?: GPUBuffer;
    private textureSampler?: GPUSampler;
    private bindGroups = new Map<string, GPUBindGroup>();
    public th?: TextureHelper;

    private msaaColorTexture?: GPUTexture;
    private sampleCount = 4;


    private customShaderObjects: Entity[] = [];
    private customShaderBindGroups = new Map<string, GPUBindGroup[]>();
    private customShaderObjectIndices = new Map<string, number>();
    private customShaderBuffers = new Map<string, Map<number, GPUBuffer>>();

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
            this.th = new TextureHelper(this);

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
                this.globalLightDirectionBuffer = this.device.createBuffer({
                    size: 16, // vec4f = 4 floats * 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.globalLightColorBuffer = this.device.createBuffer({
                    size: 16, // vec4f = 4 floats * 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.globalAmbientColorBuffer = this.device.createBuffer({
                    size: 16, // vec4f = 4 floats * 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });

                // Initialize global light direction, color, and ambient
                this.device.queue.writeBuffer(this.globalLightDirectionBuffer, 0, new Float32Array(this.globalLightDirection));
                this.device.queue.writeBuffer(this.globalLightColorBuffer, 0, new Float32Array(this.globalLightColor));
                this.device.queue.writeBuffer(this.globalAmbientColorBuffer, 0, new Float32Array(this.globalAmbientColor));

                // ensure projection is transposed before upload
                const initialProj = M.mat4Projection(this.fov, (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), this.near, this.far);
                this.device.queue.writeBuffer(this.projectionBuffer, 0, M.mat4Transpose(initialProj).buffer);

                this.textureSampler = device.createSampler({
                    addressModeU: 'repeat',
                    addressModeV: 'repeat',
                    magFilter: 'linear',
                    minFilter: 'linear',
                });


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

    public registerSceneObjectsSeparated(staticObjects: Entity[], nonStaticObjects: Entity[], _updateStatic: boolean): void {
        if (!this.device) throw new Error('WebGPU device not initialized');

        // Combine all objects
        const allObjects = [...staticObjects, ...nonStaticObjects];

        // All objects are treated uniformly (MeshComponent.start() ensures they have a shader)
        this.sceneObjects = allObjects;
        this.customShaderObjects = allObjects.filter(e => e.getComponent(CustomRenderShader));

        // Create pipelines for each unique shader
        if (this.customShaderObjects.length > 0) {
            this.createCustomPipelines(this.customShaderObjects);
        }

        // Ensure all meshes have GPU buffers created
        const ensureMeshUploaded = (e: Entity) => {
            const mc = e.getComponent(MeshComponent);
            if (!mc) return;
            const m = mc.mesh;
            // Only create GPU buffers if we don't already have them
            if (!this.objectBuffers.has(m.id)) {
                this.uploadMeshToGPU(m.id, m.vertices, m.normals, m.uvs, m.indices);
            }
        };
        for (const e of this.customShaderObjects) ensureMeshUploaded(e);
        
        // Update object storage buffer
        this.updateObjectStorageBuffer();
    }

    private createPipeline(shader: CustomRenderShader): void {
        if (!this.device) return;
        // Check if pipeline and bind groups already exist
        if (this.renderPipelines.has(`${shader.id}`) && this.customShaderBindGroups.has(shader.id)) return;
        try {
            // Create shader module with custom vertex and fragment shaders
            const shaderModule = this.device.createShaderModule({
                code: `
                ${shader.vertexShader}

                ${shader.fragmentShader}
                    `
            });
            // Create bind group layout for group 0 (same as default pipeline)
            const bindGroupLayout0 = this.device.createBindGroupLayout({
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

            const bindGroupLayout1 = this.device.createBindGroupLayout({
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

            const bindGroupLayout2 = this.device.createBindGroupLayout({
                label: 'Custom Shader Texture Bind Group Layout',
                entries: group2Entries
            });

            bindGroupLayouts.push(bindGroupLayout2);
            const descriptor = {
                bindGroupLayouts: bindGroupLayouts

            }
            console.log(descriptor);

            // Create pipeline layout with all bind groups
            const pipelineLayout = this.device.createPipelineLayout(descriptor);

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
                multisample: { count: this.sampleCount },
                depthStencil: {
                    format: 'depth24plus',
                    depthWriteEnabled: depthWriteEnabled,
                    depthCompare: depthCompare
                },
            };

            const pipeline = this.device.createRenderPipeline(pipelineDescriptor);

            this.renderPipelines.set(`${shader.id}`, pipeline);


            // Create GPU buffers and bind group for group 1 (even if empty, Firefox requires it)
            const bufferMap = new Map<number, GPUBuffer>();

            // Create GPU buffers for each buffer spec
            for (const spec of shader.bufferSpecs) {
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
            this.customShaderBuffers.set(shader.id, bufferMap);

            // Create bind group with the created buffers (or empty bind group if no specs)
            // Use pipeline.getBindGroupLayout(1) to ensure we use the exact same layout - Firefox is strict about this
            const bindGroup1 = this.device.createBindGroup({
                layout: pipeline.getBindGroupLayout(1),
                entries: shader.bufferSpecs.map(spec => ({
                    binding: spec.binding,
                    resource: { buffer: bufferMap.get(spec.binding)! }
                }))
            });

            this.customShaderBindGroups.set(shader.id, [bindGroup1]);
            console.log(`Bind group 1 created for shader: ${shader.id}, entries: ${shader.bufferSpecs.length}`);




            console.log(`Pipeline created for shader: ${shader.id}`);
        }
        catch (error) {
            console.error(`Failed to create pipeline for shader ${shader.id}:`, error);
        }
    }

    private createCustomPipelines(customShaderObjects: Entity[]): void {
        if (!this.device) return;

        // Get unique shader IDs
        const processedShaders = new Set<string>();

        for (const entity of customShaderObjects) {
            const customShader = entity.getComponent(CustomRenderShader);
            if (!customShader || processedShaders.has(customShader.id)) continue;
            this.createPipeline(customShader);
            processedShaders.add(customShader.id);

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
        if (!this.device || !this.context || !this.depthTexture || !this.msaaColorTexture) {
            console.warn('Render skipped: device/context not ready');
            return;
        }

        // Update global light direction and color buffers
        if (this.globalLightDirectionBuffer) {
            this.device.queue.writeBuffer(this.globalLightDirectionBuffer, 0, new Float32Array(this.globalLightDirection));
        }
        if (this.globalLightColorBuffer) {
            this.device.queue.writeBuffer(this.globalLightColorBuffer, 0, new Float32Array(this.globalLightColor));
        }
        if (this.globalAmbientColorBuffer) {
            this.device.queue.writeBuffer(this.globalAmbientColorBuffer, 0, new Float32Array(this.globalAmbientColor));
        }

        // use MSAA color texture as the attachment and resolve into swapchain view
        const swapView = this.context.getCurrentTexture().createView();
        const msaaView = this.msaaColorTexture!.createView();


        this.depthView = this.depthTexture!.createView();


        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: msaaView,
                resolveTarget: swapView,
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthView,
                depthLoadOp: 'clear',
                depthClearValue: 1.0,
                depthStoreOp: 'store',
            },
        };

        try {
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

            let objIndex = 0;

            // Render all objects (all have CustomRenderShader now)
            let currentPipelineId: string | null = null;
            for (const entity of this.customShaderObjects) {
                const customShader = entity.getComponent(CustomRenderShader);
                const meshComponent = entity.getComponent(MeshComponent);

                if (!customShader || !meshComponent) continue;

                const pipeline = this.renderPipelines.get(`${customShader.id}`);
                if (!pipeline) {
                    console.warn(`Pipeline not found for shader: ${customShader.id}`);
                    continue;
                }

                const buf = this.objectBuffers.get(meshComponent.mesh.id);
                if (!buf) continue;

                // Get the storage buffer index for this entity
                const instanceIndex = this.customShaderObjectIndices.get(entity.id);
                if (instanceIndex === undefined) {
                    console.warn(`No storage buffer index found for entity: ${entity.id}`);
                    continue;
                }

                // Only switch pipeline if different from current
                if (currentPipelineId !== customShader.id) {
                    passEncoder.setPipeline(pipeline);
                    currentPipelineId = customShader.id;
                }

                // Bind group 0 (default bindings: camera, projection, texture, etc.)
                const bindGroup0 = this.getBindGroupForDefaultTexture(meshComponent.texture);
                passEncoder.setBindGroup(0, bindGroup0);

                // Bind group 1 (custom additional buffers - always set, even if empty)
                const customBindGroups = this.customShaderBindGroups.get(customShader.id);
                if (customBindGroups && customBindGroups[0]) {
                    passEncoder.setBindGroup(1, customBindGroups[0]);
                } else {
                    console.warn(`Missing bind group 1 for shader: ${customShader.id}, skipping draw`);
                    continue;
                }

                // Bind group 2 (custom additional textures)
                const bindGroup2 = this.getBindingGroupForCustomShaderTextures(pipeline, customShader);
                passEncoder.setBindGroup(2, bindGroup2);

                // Bind group 3 (custom additional samplers)
                if (customBindGroups && customBindGroups[2]) {
                    passEncoder.setBindGroup(3, customBindGroups[2]);
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
        debug.log(`WebGPUView rendered ${this.customShaderObjects.length} objects.`);
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

    private updateObjectStorageBuffer(): void {
        if (!this.device) throw new Error('Device not initialized');
        // All objects are now in customShaderObjects
        const totalObjectCount = this.customShaderObjects.length;
        // Ensure storage buffer is large enough
        if (totalObjectCount > this.maxObjects || !this.objectStorageBuffer) {
            this.maxObjects = Math.max(totalObjectCount, this.maxObjects);
            this.objectStorageBuffer?.destroy();
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        }

        // Update all object transforms
        this.updateCustomShaderObjectTransforms(0);
        this.updateCustomShaderBuffers();
    }

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

    private getBindGroupForDefaultTexture(textureId: string): GPUBindGroup {
        if (!this.device || !this.renderPipelines.get('default')) {
            throw new Error('WebGPU device or pipeline not initialized');
        }
        // Check if we already have a bind group for this texture
        if (this.bindGroups.has(textureId)) {
            return this.bindGroups.get(textureId)!;
        }

        // Get the texture (use primitive texture as fallback)
        const texture = this.th!.textures.get(textureId) || this.th!.primitiveTexture;
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
                { binding: 5, resource: { buffer: this.globalLightDirectionBuffer! } },
                { binding: 6, resource: { buffer: this.globalLightColorBuffer! } },
                { binding: 7, resource: { buffer: this.globalAmbientColorBuffer! } },
            ]
        });

        // Cache the bind group
        this.bindGroups.set(textureId, bindGroup);
        return bindGroup;
    }

    private getBindingGroupForCustomShaderTextures(customRenderPipeline: GPURenderPipeline, customShader: CustomRenderShader): GPUBindGroup {
        if (!this.device) {
            throw new Error('WebGPU device not initialized');
        }
        // Get the bind group layout for group 2
        const bindGroupLayout = customRenderPipeline.getBindGroupLayout(2);
        const bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: customShader.textureBufferSpecs.map((spec, index) => {
                const texture = this.th!.textures.get(spec.textureId) || this.th!.primitiveTexture;
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
}