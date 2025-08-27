import { renderer } from './shaders/renderer';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Vector4 } from '../misc/Vector4';
import type { Mesh, SceneObject } from '../Model/Model';

class View {
    // GPU related
    private device?: GPUDevice;
    private canvas?: HTMLCanvasElement;
    private context?: GPUCanvasContext;
    private clearValue = { r: 0, g: 0., b: 0., a: 1. };
    private depthTexture?: GPUTexture;
    private renderPipeline?: GPURenderPipeline;
    // per-object buffers are stored in objectBuffers
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private bindGroup?: GPUBindGroup;
    private objectStorageBuffer?: GPUBuffer; // per-object model matrices
    private cameraBuffer?: GPUBuffer; // single camera matrix
    private projectionBuffer?: GPUBuffer; // single projection matrix
    public maxObjects = 1000000; // max objects in scene, dynamic
    private fov = 30; // field of view in degrees
    private near = 0.1; // near plane distance
    private far = 1000; // far plane distance, also used in cpu culling
    private meshes: { [id: string]: Mesh } = {};

    // Scene
    private sceneObjects: SceneObject[] = [];
    // cache last assigned objects reference to avoid reprocessing
    private lastSceneObjectsRef?: SceneObject[];
    // (no id->index mapping needed for full uploads)
    // cache camera key to detect changes
    private lastCameraKey?: string;
    private camera: SceneObject = {
        id: 'viewCamera',
        position: new Vector4(0, 0, 0, 1),
        rotation: Matrix4x4.identity(),
        scale: new Vector4(1, 1, 1, 1),
        props: {}
    };

    // debug
    private debugEl?: HTMLDivElement;

    // model generation moved to Model.ts

    /**
     * Initialize WebGPU using an externally created canvas element.
     * The caller is responsible for creating/appending the canvas to the DOM.
     */
    async initWebGPU(canvas: HTMLCanvasElement) {
        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) throw new Error('No adapter found');
            const device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: 600000000 } });
            const context = canvas.getContext('webgpu')!;
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

            // store
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

                // create three storage buffers: objects (array of mat4), camera (single mat4), projection (single mat4)
                this.objectStorageBuffer = this.device.createBuffer({
                    size: 64 * this.maxObjects, // 16 floats (64 bytes) per matrix
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });
                this.cameraBuffer = this.device.createBuffer({
                    size: 64,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });
                this.projectionBuffer = this.device.createBuffer({
                    size: 64,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });

                // write initial projection matrix
                const initialProj = Matrix4x4.projectionMatrix(this.fov, (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), this.near, this.far);
                this.device.queue.writeBuffer(this.projectionBuffer, 0, initialProj.toFloat32Array().buffer);

                const bindGroupLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                    ],
                });
                this.bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [
                    { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                    { binding: 1, resource: { buffer: this.cameraBuffer! } },
                    { binding: 2, resource: { buffer: this.projectionBuffer! } },
                ] });

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
                    // update projection matrix buffer on resize
                    if (this.projectionBuffer) {
                        const proj = Matrix4x4.projectionMatrix(this.fov, this.canvas.width / this.canvas.height, this.near, this.far);
                        this.device.queue.writeBuffer(this.projectionBuffer, 0, proj.toFloat32Array().buffer);
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
            console.error('WebGPU API unavailable or initialization failed:', error);

            // Add instructions to the DOM
            const instructions = document.createElement('div');
            instructions.style.position = 'absolute';
            instructions.style.top = '0';
            instructions.style.left = '0';
            instructions.style.width = '100%';
            instructions.style.backgroundColor = '#ffcccc';
            instructions.style.color = '#000';
            instructions.style.padding = '10px';
            instructions.style.fontFamily = 'Arial, sans-serif';
            instructions.style.zIndex = '1000';
            instructions.innerHTML = `
                <strong>WebGPU is not supported or enabled in your browser.</strong><br>
                To enable WebGPU, follow these instructions:<br>
                <ul>
                    <li><strong>Chrome:</strong> Go to <code>chrome://flags/#enable-unsafe-webgpu</code> and enable it.</li>
                    <li><strong>Edge:</strong> Go to <code>edge://flags#enable-unsafe-webgpu</code> and enable it.</li>
                    <li><strong>Firefox:</strong> Go to <code>about:config</code>, search for "dom.webgpu.enabled", and enable it.</li>
                    <li><strong>Safari:</strong> Enable the "WebGPU" experimental feature in Safari's Develop menu.</li>
                </ul>
            `;
            document.body.appendChild(instructions);
        }
    }

    // allow external debug overlay to be provided by caller (main.ts)
    public setDebugElement(el: HTMLDivElement) {
        this.debugEl = el;
    }



    // Register scene objects (from Model) so View can upload buffers and draw
    async registerSceneObjects(objects: SceneObject[], updateVertices: boolean) {
        if (!this.device) throw new Error('Device not initialized');
        // If the exact same array reference was provided and no vertex update is requested,
        // skip heavy work. Model returns a cached array reference per camera chunk, so this
        // avoids recomputing when camera hasn't moved between chunks.
            if (objects === this.lastSceneObjectsRef && !updateVertices) {
                // same array reference: avoid re-uploading meshes, but object transforms may have changed
                // so still update the object storage buffer (full upload)
                this.updateObjectStorageBufferPartial(objects);
                return;
            }

        this.sceneObjects = objects;
    // update last reference
    this.lastSceneObjectsRef = objects;

        if (updateVertices) {
            await this.uploadMeshBuffers();
        }

    // update storage buffer for objects (full upload each time)
    this.updateObjectStorageBufferPartial(objects);
    }
    registerCamera(camera: SceneObject) {
        // Build a simple camera key from position and rotation to detect changes.
        const camKey = `${camera.position.x},${camera.position.y},${camera.position.z}|${JSON.stringify(camera.rotation)}`;
        if (camKey === this.lastCameraKey) {
            this.camera = camera;
            return;
        }
        this.camera = camera;
        this.lastCameraKey = camKey;

        // update camera buffer: camera transform = camera.rotation * translation(-camera.position)
        if (this.device && this.cameraBuffer) {
            const negPos = new Vector4(-camera.position.x, -camera.position.y, -camera.position.z, 0);
            const camTransform = camera.rotation.mulMatrix(Matrix4x4.translationMatrix(negPos));
            this.device.queue.writeBuffer(this.cameraBuffer, 0, camTransform.toFloat32Array().buffer);
        }

    // camera transform written above; object model matrices do not depend on camera so we avoid recomputing them here
    }

    uploadMeshes(meshes: { [id: string]: Mesh }): void {
        this.meshes = meshes
    }
    private async uploadMeshBuffers() {
        if (!this.device) return;
        for (const obj of this.sceneObjects) {
            if (this.objectBuffers.get(obj.props.mesh!)) continue;
            const v = this.meshes[obj.props.mesh!].vertices;
            const i = this.meshes[obj.props.mesh!].indices;
            const vertexBuffer = this.device.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            this.device.queue.writeBuffer(vertexBuffer, 0, v.buffer as ArrayBuffer, v.byteOffset, v.byteLength);
            const indexBuffer = this.device.createBuffer({ size: i.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
            this.device.queue.writeBuffer(indexBuffer, 0, i.buffer as ArrayBuffer, i.byteOffset, i.byteLength);
            this.objectBuffers.set(obj.props.mesh!, { vertexBuffer, indexBuffer, indices: i });
        }
    }

    // Update object storage buffer but only upload changed object matrices when possible.
    private updateObjectStorageBufferPartial(objects: SceneObject[]) {
        if (!this.device) throw new Error('Device not initialized');
        // Simplified behavior: always upload all object matrices each call.
        const objectCount = objects.length;
        // resize buffer if needed
        if (objectCount > this.maxObjects || !this.objectStorageBuffer) {
            this.maxObjects = Math.max(objectCount, this.maxObjects);
            this.objectStorageBuffer?.destroy();
            this.objectStorageBuffer = this.device.createBuffer({ size: 64 * this.maxObjects, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        }

        const allObjectMatricesBuffer = new Float32Array(objectCount * 16);
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            const matrix = Matrix4x4.translationMatrix(obj.position).mulMatrix(obj.rotation).mulMatrix(Matrix4x4.scaleMatrix(obj.scale));
            allObjectMatricesBuffer.set(matrix.toFloat32Array(), i * 16);
        }
        // write full region that contains active objects
        this.device.queue.writeBuffer(this.objectStorageBuffer!, 0, allObjectMatricesBuffer.buffer, 0, objectCount * 16 * 4);
    }


    render(): void {
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

            // draw each registered object
            let currentMeshId: string = "empty";
            let instanceIndex = 0;
            let objIndex = 0;
            let buf;
            for (const obj of this.sceneObjects) {
                objIndex++;
                if (obj.props.mesh !== currentMeshId) {
                    buf = this.objectBuffers.get(obj.props.mesh!);
                    instanceIndex++;
                    if (!buf) continue;

                    passEncoder.setVertexBuffer(0, buf.vertexBuffer);

                    const indexFormat: GPUIndexFormat = (buf.indices instanceof Uint16Array) ? 'uint16' : 'uint32';
                    passEncoder.setIndexBuffer(buf.indexBuffer, indexFormat);

                    passEncoder.setBindGroup(0, this.bindGroup);
                }
                if (!buf) continue;

                passEncoder.drawIndexed(buf.indices.length, 1, 0, 0, instanceIndex);
            }

            passEncoder.end();
            this.device.queue.submit([commandEncoder.finish()]);

            // debug
            if (this.debugEl) {

                this.debugEl.innerText += `WebGPU ready\nObjects: ${objIndex}\nBuffers: ${this.objectBuffers.size}`;
                this.debugEl.innerText += `\nCamerar: x${this.camera.position.x} y${this.camera.position.y} z${this.camera.position.z}`;
            }
        } catch (e) {
            console.error('Render error:', e);
            if (this.debugEl) this.debugEl.innerText += 'Render error: ' + (e as Error).message;
        }
    }
}

export default View;