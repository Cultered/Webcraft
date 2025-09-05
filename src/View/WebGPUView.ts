import { BaseView } from './BaseView';
import { renderer } from './shaders/default-wgsl-renderer';
import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/MeshType';
import { ShowWebGPUInstructions } from '../misc/misc';
import * as M from '../misc/mat4';
import debug from '../Debug/Debug';

/**
 * WebGPU-based rendering implementation with static/non-static object optimization.
 * 
 * This class provides a modern, efficient implementation using the WebGPU API.
 * It leverages compute shaders, storage buffers, and advanced GPU features
 * for high-performance rendering of large numbers of objects.
 * 
 * Key Optimization Features:
 * - **Static/Non-static Separation**: Objects are sorted first by static/non-static status,
 *   then by mesh type for optimal rendering performance
 * - **Partial Buffer Updates**: Only non-static objects are updated when their transforms change,
 *   while static objects remain untouched in GPU memory
 * - **Batched Rendering**: Objects are rendered in batches by mesh type to minimize state changes
 * 
 * Buffer Layout:
 * ```
 * [Static Objects by Mesh A] [Static Objects by Mesh B] ... [Non-static Objects by Mesh A] [Non-static Objects by Mesh B] ...
 * ```
 * 
 * Features:
 * - WebGPU context initialization with high-performance adapter
 * - Storage buffer-based object matrix management with static optimization
 * - Efficient instanced rendering with mesh-based batching
 * - Automatic resource management and cleanup
 * - Modern shader pipeline with WGSL
 * - Debug information display
 */
export class WebGPUView extends BaseView {
    // WebGPU properties
    private device?: GPUDevice;
    private context?: GPUCanvasContext;
    private depthTexture?: GPUTexture;
    private renderPipeline?: GPURenderPipeline;
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private staticMeshBatches = new Map<string, { base: number; count: number }>();
    private nonStaticMeshBatches = new Map<string, { base: number; count: number }>();
    private nonStaticBaseOffset = 0;
    private bindGroup?: GPUBindGroup;
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;

    // Added MSAA fields
    private msaaColorTexture?: GPUTexture;
    private sampleCount = 4; // or 2/4/8 based on adapter

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

                const bindGroupLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                    ],
                });
                this.bindGroup = device.createBindGroup({
                    layout: bindGroupLayout, entries: [
                        { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                        { binding: 1, resource: { buffer: this.cameraBuffer! } },
                        { binding: 2, resource: { buffer: this.projectionBuffer! } },
                    ]
                });

                const vertexBuffers = [{ attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }], arrayStride: 12, stepMode: 'vertex' }];

                const pipelineDescriptor = {
                    vertex: { module: shaderModule, entryPoint: 'vertex_main', buffers: vertexBuffers },
                    fragment: { module: shaderModule, entryPoint: 'fragment_main', targets: [{ format: navigator.gpu.getPreferredCanvasFormat(), blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
                    primitive: { topology: 'triangle-list', cullMode: 'back' },
                    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
                    multisample: { count: this.sampleCount },
                    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                } as GPURenderPipelineDescriptor;

                this.renderPipeline = device.createRenderPipeline(pipelineDescriptor);
                console.log('render pipeline created');

                const resizeCanvasAndDepthTexture = () => {
                    if (!this.canvas || !this.device) return;
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
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
    public registerSceneObjectsSeparated(staticObjects: SceneObject[], nonStaticObjects: SceneObject[], updateStatic: boolean): void {
        if (!this.device) throw new Error('WebGPU device not initialized');

        this.staticSceneObjects = staticObjects;
        this.nonStaticSceneObjects = nonStaticObjects;

        if (updateStatic) {
            // Update entire buffer including static objects
            this.updateObjectStorageBufferWithSeparation(staticObjects, nonStaticObjects);
        } else {
            // Only update non-static portion
            this.updateNonStaticObjectsOnly(nonStaticObjects);
        }
    }

    public registerCamera(camera: SceneObject): void {
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

    public uploadMeshes(meshes: { [id: string]: Mesh }): void {
        for (const k of Object.keys(meshes)) this.meshes[k] = meshes[k];
        if (this.device) {
            for (const k of Object.keys(meshes)) this.createBuffersForMesh(k);
        }
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array): void {
        this.meshes[meshId] = { id: meshId, vertices, indices };
        if (this.device) this.createBuffersForMesh(meshId);
    }

    public render(): void {
        if (!this.device || !this.context || !this.renderPipeline || !this.depthTexture || !this.bindGroup || !this.msaaColorTexture) {
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
                clearValue: this.clearValue as GPUColor,
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
            passEncoder.setPipeline(this.renderPipeline);

            // Optimized rendering: draw static objects first, then non-static objects, grouped by mesh
            passEncoder.setBindGroup(0, this.bindGroup!);
            let objIndex = 0;
            
            // First, draw all static objects grouped by mesh
            for (const [meshId, batch] of this.staticMeshBatches) {
                const buf = this.objectBuffers.get(meshId);
                if (!buf) continue;
                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);
                passEncoder.drawIndexed(buf.indices.length, batch.count, 0, 0, batch.base);
                objIndex += batch.count;
            }
            
            // Then, draw all non-static objects grouped by mesh
            for (const [meshId, batch] of this.nonStaticMeshBatches) {
                const buf = this.objectBuffers.get(meshId);
                if (!buf) continue;
                passEncoder.setVertexBuffer(0, buf.vertexBuffer);
                const indexFormat: GPUIndexFormat = buf.indices instanceof Uint16Array ? 'uint16' : 'uint32';
                passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);
                passEncoder.drawIndexed(buf.indices.length, batch.count, 0, 0, batch.base);
                objIndex += batch.count;
            }

            passEncoder.end();
            this.device.queue.submit([commandEncoder.finish()]);
        } catch (e) {
            console.error('Render error:', e);
        }
        debug.log(`WebGPUView rendered ${this.staticSceneObjects.length} static objects; ${this.nonStaticSceneObjects.length} non-static objects.`);
    }

    private createBuffersForMesh(meshId: string): void {
        if (!this.device) return;
        if (this.objectBuffers.has(meshId)) return;
        const mesh = this.meshes[meshId];
        if (!mesh) return;
        const v = mesh.vertices;
        const i = mesh.indices;
        const vertexBuffer = this.device.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(vertexBuffer, 0, v.buffer as ArrayBuffer, v.byteOffset, v.byteLength);
        const indexBuffer = this.device.createBuffer({ size: i.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(indexBuffer, 0, i.buffer as ArrayBuffer, i.byteOffset, i.byteLength);
        this.objectBuffers.set(meshId, { vertexBuffer, indexBuffer, indices: i });
    }


    private updateObjectStorageBufferWithSeparation(staticObjects: SceneObject[], nonStaticObjects: SceneObject[]): void {
        if (!this.device) throw new Error('Device not initialized');
        const totalObjectCount = staticObjects.length + nonStaticObjects.length;
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

        if (recreated) {
            // rebuild bind group to reference the new buffer
            const bindGroupLayout = this.renderPipeline!.getBindGroupLayout(0);
            this.bindGroup = this.device.createBindGroup({ layout: bindGroupLayout, entries: [
                { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                { binding: 1, resource: { buffer: this.cameraBuffer! } },
                { binding: 2, resource: { buffer: this.projectionBuffer! } },
            ] });
        }
    }

    private updateNonStaticObjectsOnly(nonStaticObjects: SceneObject[]): void {
        if (!this.device) throw new Error('Device not initialized');

        if (!this.objectStorageBuffer) {
            // If no buffer exists, create it and write all data
            const all = this.buildBatchesAndMatrixBuffer(this.staticSceneObjects, nonStaticObjects);
            this.maxObjects = Math.max(this.maxObjects, (this.staticSceneObjects.length + nonStaticObjects.length));
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            // rebuild bind group
            const bindGroupLayout = this.renderPipeline!.getBindGroupLayout(0);
            this.bindGroup = this.device.createBindGroup({ layout: bindGroupLayout, entries: [
                { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                { binding: 1, resource: { buffer: this.cameraBuffer! } },
                { binding: 2, resource: { buffer: this.projectionBuffer! } },
            ] });
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
    }

    private buildBatchesAndMatrixBuffer(staticObjs: SceneObject[], nonStaticObjs: SceneObject[]) {
        // Group objects by mesh, keeping static and non-static separate
        const staticGroups = new Map<string, SceneObject[]>();
        const nonStaticGroups = new Map<string, SceneObject[]>();
        
        const pushStatic = (o: SceneObject) => {
            const id = o.props.mesh!;
            if (!staticGroups.has(id)) staticGroups.set(id, []);
            staticGroups.get(id)!.push(o);
        };
        
        const pushNonStatic = (o: SceneObject) => {
            const id = o.props.mesh!;
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
        
        // First, add all static objects grouped by mesh
        for (const [meshId, arr] of staticGroups) {
            const batch = { base: cursor, count: arr.length };
            this.staticMeshBatches.set(meshId, batch);
            
            for (let i = 0; i < arr.length; i++) {
                const o = arr[i];
                const t = [o.position[0], o.position[1], o.position[2]];
                const s = [o.scale[0], o.scale[1], o.scale[2]];
                const m = M.mat4Transpose(M.mat4TRS(t, o.rotation, s));
                out.set(m, (cursor + i) * 16);
            }
            cursor += arr.length;
        }
        
        // Then, add all non-static objects grouped by mesh
        this.nonStaticBaseOffset = cursor;
        for (const [meshId, arr] of nonStaticGroups) {
            const batch = { base: cursor, count: arr.length };
            this.nonStaticMeshBatches.set(meshId, batch);
            
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

    private buildNonStaticMatrixBuffer(nonStaticObjs: SceneObject[]): Float32Array {
        // Group non-static objects by mesh
        const nonStaticGroups = new Map<string, SceneObject[]>();
        
        const pushNonStatic = (o: SceneObject) => {
            const id = o.props.mesh!;
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

    private updateNonStaticBatches(nonStaticObjs: SceneObject[]): void {
        // Group non-static objects by mesh and update batch information
        const nonStaticGroups = new Map<string, SceneObject[]>();
        
        const pushNonStatic = (o: SceneObject) => {
            const id = o.props.mesh!;
            if (!nonStaticGroups.has(id)) nonStaticGroups.set(id, []);
            nonStaticGroups.get(id)!.push(o);
        };
        
        nonStaticObjs.forEach(pushNonStatic);
        
        this.nonStaticMeshBatches.clear();
        let cursor = this.nonStaticBaseOffset;
        
        for (const [meshId, arr] of nonStaticGroups) {
            this.nonStaticMeshBatches.set(meshId, { base: cursor, count: arr.length });
            cursor += arr.length;
        }
        
    }
}