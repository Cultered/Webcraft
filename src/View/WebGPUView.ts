import { BaseView } from './BaseView';
import { ShowWebGPUInstructions } from '../misc/misc';
import * as M from '../misc/mat4';
import debug from '../Debug/Debug';
import type Entity from '../Model/Entity';
import MeshComponent from '../Model/Components/MeshComponent';
import CustomRenderShader from '../Model/Components/CustomRenderShader';
import PostProcessingShader from '../Model/Components/PostProcessingShader';
import { TextureHelper } from './textureHelper';
import { PipelineHelper } from './PipelineHelper';
import defaultRenderShader from './shaders/DefaultRenderer';


export class WebGPUView extends BaseView {
    public depthView?: GPUTextureView;

    private device?: GPUDevice;

    getDevice(): GPUDevice | undefined {
        return this.device;
    }

    private context?: GPUCanvasContext;
    private depthTexture?: GPUTexture;
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;
    private globalLightDirectionBuffer?: GPUBuffer;
    private globalLightColorBuffer?: GPUBuffer;
    private globalAmbientColorBuffer?: GPUBuffer;
    private textureSampler?: GPUSampler;
    public bindGroups = new Map<string, GPUBindGroup>();
    public th?: TextureHelper;
    public ph?: PipelineHelper;

    private msaaColorTexture?: GPUTexture;
    public sampleCount = 4;

    // Post-processing support
    private postProcessTextures: GPUTexture[] = [];
    private sceneTexture?: GPUTexture; // Stores original scene for composite passes
    private postProcessSampler?: GPUSampler;
    private postProcessResolutionBuffer?: GPUBuffer;
    private postProcessTimeBuffer?: GPUBuffer;
    private postProcessStartTime: number = 0;
    private postProcessShaders: PostProcessingShader[] = [];

    private customShaderObjects: Entity[] = [];
    private customShaderObjectIndices = new Map<string, number>();

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
            this.ph = new PipelineHelper(this);

            this.ph.createRenderPipeline(defaultRenderShader); // I DONT KNOW WHY IT DOESNT WORK IN CONSTRUCTOR BUT IT DOESNT ALR

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

                    // Create post-processing textures (ping-pong buffers)
                    for (const tex of this.postProcessTextures) {
                        tex.destroy();
                    }
                    this.sceneTexture?.destroy();
                    this.postProcessTextures = [];
                    // We need 2 textures for ping-pong rendering
                    for (let i = 0; i < 2; i++) {
                        this.postProcessTextures.push(this.device!.createTexture({
                            size: { width: w, height: h, depthOrArrayLayers: 1 },
                            sampleCount: 1, // Post-processing uses non-MSAA textures
                            format: navigator.gpu.getPreferredCanvasFormat(),
                            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
                        }));
                    }
                    // Scene texture to preserve original for composite passes
                    this.sceneTexture = this.device!.createTexture({
                        size: { width: w, height: h, depthOrArrayLayers: 1 },
                        sampleCount: 1,
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
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

                // Post-processing sampler and buffers
                this.postProcessSampler = device.createSampler({
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                    magFilter: 'linear',
                    minFilter: 'linear',
                });
                this.postProcessResolutionBuffer = device.createBuffer({
                    size: 8, // vec2f = 2 floats * 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.postProcessTimeBuffer = device.createBuffer({
                    size: 4, // f32 = 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.postProcessStartTime = performance.now() / 1000;


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
            this.ph!.createPipelinesForEntities(this.customShaderObjects);
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

    /**
     * Register post-processing shaders to be applied after rendering
     */
    public registerPostProcessShaders(shaders: PostProcessingShader[]): void {
        // Only update if shaders changed
        const shaderIds = shaders.map(s => s.id).join(',');
        const currentIds = this.postProcessShaders.map(s => s.id).join(',');
        
        if (shaderIds !== currentIds) {
            this.postProcessShaders = shaders;
            // Create pipelines for new post-processing shaders
            if (this.postProcessShaders.length > 0 && this.ph) {
                this.ph.createPostProcessPipelines(this.postProcessShaders);
            }
        } else {
            this.postProcessShaders = shaders;
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

        // Update post-processing uniforms
        if (this.postProcessResolutionBuffer && this.canvas) {
            this.device.queue.writeBuffer(
                this.postProcessResolutionBuffer,
                0,
                new Float32Array([this.canvas.width, this.canvas.height])
            );
        }
        if (this.postProcessTimeBuffer) {
            const currentTime = performance.now() / 1000 - this.postProcessStartTime;
            this.device.queue.writeBuffer(this.postProcessTimeBuffer, 0, new Float32Array([currentTime]));
        }

        // Get enabled post-processing shaders
        const enabledPostProcessShaders = this.postProcessShaders.filter(pp => pp.isEnabled());
        const hasPostProcess = enabledPostProcessShaders.length > 0 && this.postProcessTextures.length >= 2;

        // Determine resolve target for main render pass
        const swapView = this.context.getCurrentTexture().createView();
        const msaaView = this.msaaColorTexture!.createView();

        // If we have post-processing, resolve to first ping-pong texture instead of swap chain
        const mainResolveTarget = hasPostProcess 
            ? this.postProcessTextures[0].createView() 
            : swapView;

        this.depthView = this.depthTexture!.createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: msaaView,
                resolveTarget: mainResolveTarget,
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

            // Sort objects by priority (higher first), then render
            const sortedObjects = [...this.customShaderObjects].sort((a, b) => {
                const shaderA = a.getComponent(CustomRenderShader);
                const shaderB = b.getComponent(CustomRenderShader);
                const priorityA = shaderA?.pipelineSettings?.priority ?? 0;
                const priorityB = shaderB?.pipelineSettings?.priority ?? 0;
                return priorityB - priorityA; // Higher priority first
            });

            // Render all objects (all have CustomRenderShader now)
            let currentPipelineId: string | null = null;
            for (const entity of sortedObjects) {
                const customShader = entity.getComponent(CustomRenderShader);
                const meshComponent = entity.getComponent(MeshComponent);

                if (!customShader || !meshComponent) continue;

                const pipeline = this.ph!.getPipeline(customShader.id);
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

                // Bind group 1 (custom additional buffers)
                const bindGroup1 = this.ph!.getBindGroupForCustomShaderBuffers(customShader);
                passEncoder.setBindGroup(1, bindGroup1);

                // Bind group 2 (custom additional textures)
                const bindGroup2 = this.ph!.getBindGroupForCustomShaderTextures(pipeline, customShader);
                passEncoder.setBindGroup(2, bindGroup2);

                // Set vertex and index buffers
                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);

                // Draw this single object with the correct instance index
                passEncoder.drawIndexed(buf.indices.length, 1, 0, 0, instanceIndex);
                objIndex++;
            }

            passEncoder.end();

            // Apply post-processing passes
            if (hasPostProcess) {
                // Copy the original scene to sceneTexture for composite passes
                if (this.sceneTexture) {
                    commandEncoder.copyTextureToTexture(
                        { texture: this.postProcessTextures[0] },
                        { texture: this.sceneTexture },
                        { width: this.canvas!.width, height: this.canvas!.height, depthOrArrayLayers: 1 }
                    );
                }
                this.renderPostProcessPasses(commandEncoder, enabledPostProcessShaders, swapView);
            }

            this.device.queue.submit([commandEncoder.finish()]);
        } catch (e) {
            console.error('Render error:', e);
        }
        debug.log(`WebGPUView rendered ${this.customShaderObjects.length} objects.`);
    }

    /** Get the scene texture for composite passes */
    public getSceneTexture(): GPUTexture | undefined {
        return this.sceneTexture;
    }

    /**
     * Render post-processing passes using ping-pong buffers
     */
    private renderPostProcessPasses(
        commandEncoder: GPUCommandEncoder,
        shaders: PostProcessingShader[],
        finalTarget: GPUTextureView
    ): void {
        if (!this.device || !this.ph || !this.postProcessSampler) return;

        let inputTextureIndex = 0; // Start with the scene rendered to postProcessTextures[0]

        for (let i = 0; i < shaders.length; i++) {
            const shader = shaders[i];
            const isLast = i === shaders.length - 1;

            // Input is current ping-pong texture
            const inputTexture = this.postProcessTextures[inputTextureIndex];

            // Output is either the next ping-pong texture or the final swap chain
            const outputTarget = isLast 
                ? finalTarget 
                : this.postProcessTextures[1 - inputTextureIndex].createView();

            const pipeline = this.ph.getPostProcessPipeline(shader.id);
            if (!pipeline) {
                console.warn(`Post-process pipeline not found for shader: ${shader.id}`);
                continue;
            }

            // Update custom buffers for this shader
            this.ph.updatePostProcessBuffers(shader);

            // Create bind group for this pass (include scene texture if needed)
            const sceneTextureView = shader.needsSceneTexture() && this.sceneTexture 
                ? this.sceneTexture.createView() 
                : undefined;

            const bindGroup0 = this.ph.getPostProcessBindGroup0(
                pipeline,
                this.postProcessSampler,
                inputTexture.createView(),
                this.postProcessResolutionBuffer!,
                this.postProcessTimeBuffer!,
                sceneTextureView
            );

            const bindGroup1 = this.ph.getPostProcessBindGroup1(pipeline, shader);

            // Create render pass for post-processing
            const postPassDescriptor: GPURenderPassDescriptor = {
                colorAttachments: [{
                    view: outputTarget,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            };

            const postPassEncoder = commandEncoder.beginRenderPass(postPassDescriptor);
            postPassEncoder.setPipeline(pipeline);
            postPassEncoder.setBindGroup(0, bindGroup0);
            postPassEncoder.setBindGroup(1, bindGroup1);
            // Draw full-screen triangle (3 vertices, no vertex buffers needed)
            postPassEncoder.draw(3, 1, 0, 0);
            postPassEncoder.end();

            // Swap ping-pong index for next pass (only if not last)
            if (!isLast) {
                inputTextureIndex = 1 - inputTextureIndex;
            }
        }
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

    private updateCustomShaderBuffers(): void {
        if (!this.device || !this.ph) return;

        for (const entity of this.customShaderObjects) {
            const customShader = entity.getComponent(CustomRenderShader);
            if (!customShader) continue;

            const bufferMap = this.ph.customShaderBuffers.get(customShader.id);
            if (!bufferMap) continue;

            // Update each buffer from its spec's data
            for (const spec of customShader.bufferSpecs) {
                const buffer = bufferMap.get(spec.binding);
                if (buffer) {
                    this.ph.updateCustomBuffer(buffer, spec);
                }
            }
        }
    }

    private getBindGroupForDefaultTexture(textureId: string): GPUBindGroup {
        if (!this.device || !this.ph?.getPipeline('default')) {
            throw new Error('WebGPU device or pipeline not initialized,'+this.device+','+this.ph?.getPipeline('default') + textureId);
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
        const bindGroupLayout = this.ph.getPipeline('default')!.getBindGroupLayout(0);

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
}