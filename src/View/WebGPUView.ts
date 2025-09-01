import { BaseView } from './BaseView';
import { renderer } from './shaders/default-wgsl-renderer';
import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/MeshType';
import { ShowWebGPUInstructions } from '../misc/misc';
import * as M from '../misc/mat4';

/**
 * WebGPU-based rendering implementation.
 * 
 * This class provides a modern, efficient implementation using the WebGPU API.
 * It leverages compute shaders, storage buffers, and advanced GPU features
 * for high-performance rendering of large numbers of objects.
 * 
 * Features:
 * - WebGPU context initialization with high-performance adapter
 * - Storage buffer-based object matrix management
 * - Efficient instanced rendering
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
    private meshBatches = new Map<string, { base: number; count: number }>();
    private bindGroup?: GPUBindGroup;
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;

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
            const device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: 600000000 } });
            const context = canvas.getContext('webgpu')!;
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

            this.device = device;
            this.canvas = canvas;
            this.context = context;

            try {
                const sampleCount = 1;
                this.depthTexture = device.createTexture({
                    size: { width: canvas.width || window.innerWidth, height: canvas.height || window.innerHeight, depthOrArrayLayers: 1 },
                    sampleCount,
                    format: 'depth24plus',
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                });

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

                const initialProj = M.mat4Projection(this.fov, (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), this.near, this.far);
                this.device.queue.writeBuffer(this.projectionBuffer, 0, (initialProj).buffer);

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
                    multisample: { count: sampleCount },
                    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                } as GPURenderPipelineDescriptor;

                this.renderPipeline = device.createRenderPipeline(pipelineDescriptor);
                console.log('render pipeline created');
                if (this.debugEl) this.debugEl.innerText += 'WebGPU: ready';

                const resizeCanvasAndDepthTexture = () => {
                    if (!this.canvas || !this.device) return;
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
                    if (this.depthTexture) this.depthTexture.destroy();
                    this.depthTexture = this.device!.createTexture({ size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 }, sampleCount, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
                    if (this.projectionBuffer) {
                        const proj = M.mat4Projection(this.fov, this.canvas.width / this.canvas.height, this.near, this.far);
                        this.device.queue.writeBuffer(this.projectionBuffer, 0, M.mat4Transpose(proj).buffer);
                    }
                };

                window.addEventListener('resize', resizeCanvasAndDepthTexture);
                resizeCanvasAndDepthTexture();
            } catch (error) {
                console.error('Failed to initialize WebGPU:', error);
                if (this.debugEl) this.debugEl.innerText += 'WebGPU init error: ' + (error as Error).message;
            }

            return [adapter, device, canvas, context, format] as const;
        } catch (error) {
            ShowWebGPUInstructions()
        }
    }

    // removed staticObjectCount; batches track ordering


    public async registerSceneObjectsSeparated(staticObjects: SceneObject[], nonStaticObjects: SceneObject[], updateStatic: boolean): Promise<void> {
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
            const camTransform = M.mat4Mul(new Float32Array(16), camera.rotation, M.mat4Translation(-camera.position[0], -camera.position[1], -camera.position[2]));
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

    /**
     * Render the current scene using WebGPU.
     * 
     * This method uses modern WebGPU features including storage buffers for object
     * matrices and efficient command buffer recording for high-performance rendering.
     */
    public render(): void {
        if (!this.device || !this.context || !this.renderPipeline || !this.depthTexture || !this.bindGroup) {
            console.warn('Render skipped: device/context/pipeline not ready');
            if (this.debugEl) this.debugEl.innerText += 'Render skipped: device/context/pipeline not ready';
            return;
        }

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: this.clearValue as GPUColor,
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthLoadOp: 'clear',
                depthClearValue: 1.0,
                depthStoreOp: 'store',
            },
        };

        try {
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.setPipeline(this.renderPipeline);

            // Real instancing: bind once and draw per-mesh using firstInstance + instanceCount
            passEncoder.setBindGroup(0, this.bindGroup!);
            let objIndex = 0;
            for (const [meshId, batch] of this.meshBatches) {
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

            if (this.debugEl) {
                const staticCount = this.staticSceneObjects.length;
                const nonStaticCount = this.nonStaticSceneObjects.length;
                this.debugEl.innerText += `WebGPU ready\nObjects: ${objIndex} (${staticCount} static, ${nonStaticCount} non-static)\nBuffers: ${this.objectBuffers.size}`;
                this.debugEl.innerText += `\nCamerar: x${this.camera.position[0].toFixed(2)} y${this.camera.position[1].toFixed(2)} z${this.camera.position[2].toFixed(2)}`;
            }
        } catch (e) {
            console.error('Render error:', e);
            if (this.debugEl) this.debugEl.innerText += 'Render error: ' + (e as Error).message;
        }
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

        // Rebuild full buffer since batches depend on mesh ids and ordering
        const all = this.buildBatchesAndMatrixBuffer(this.staticSceneObjects, nonStaticObjects);
        if (!this.objectStorageBuffer) {
            this.maxObjects = Math.max(this.maxObjects, (this.staticSceneObjects.length + nonStaticObjects.length));
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            // rebuild bind group
            const bindGroupLayout = this.renderPipeline!.getBindGroupLayout(0);
            this.bindGroup = this.device.createBindGroup({ layout: bindGroupLayout, entries: [
                { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                { binding: 1, resource: { buffer: this.cameraBuffer! } },
                { binding: 2, resource: { buffer: this.projectionBuffer! } },
            ] });
        }
        this.device.queue.writeBuffer(this.objectStorageBuffer!, 0, all.buffer, 0, all.byteLength);
    }

    private buildBatchesAndMatrixBuffer(staticObjs: SceneObject[], nonStaticObjs: SceneObject[]) {
        const groups = new Map<string, SceneObject[]>();
        const push = (o: SceneObject) => {
            const id = o.props.mesh!;
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id)!.push(o);
        };
        staticObjs.forEach(push);
        nonStaticObjs.forEach(push);

        const total = staticObjs.length + nonStaticObjs.length;
        const out = new Float32Array(total * 16);
        this.meshBatches.clear();

        let cursor = 0;
        for (const [meshId, arr] of groups) {
            this.meshBatches.set(meshId, { base: cursor, count: arr.length });
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
}