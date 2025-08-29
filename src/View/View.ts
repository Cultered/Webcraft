import { renderer } from './shaders/renderer';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Vector4 } from '../misc/Vector4';
import type { SceneObject } from '../Model/Model';
import type { Mesh } from '../misc/meshes';

class View {
    private device?: GPUDevice;
    private canvas?: HTMLCanvasElement;
    private context?: GPUCanvasContext;
    private clearValue = { r: 0, g: 0., b: 0., a: 1. };
    private depthTexture?: GPUTexture;
    private renderPipeline?: GPURenderPipeline;
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private bindGroup?: GPUBindGroup;
    private objectStorageBuffer?: GPUBuffer;
    private cameraBuffer?: GPUBuffer;
    private projectionBuffer?: GPUBuffer;
    public maxObjects = 1000000;
    private fov = 30;
    private near = 0.1;
    private far = 1000;
    private meshes: { [id: string]: Mesh } = {};

    private sceneObjects: SceneObject[] = [];
    private lastSceneObjectsRef?: SceneObject[];
    private lastCameraKey?: string;
    private camera: SceneObject = {
        id: 'viewCamera',
        position: new Vector4(0, 0, 0, 1),
        rotation: Matrix4x4.identity(),
        scale: new Vector4(1, 1, 1, 1),
        props: {}
    };

    private debugEl?: HTMLDivElement;

    async initWebGPU(canvas: HTMLCanvasElement) {
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
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });
                this.projectionBuffer = this.device.createBuffer({
                    size: 64,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });

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

    public setDebugElement(el: HTMLDivElement) {
        this.debugEl = el;
    }

    async registerSceneObjects(objects: SceneObject[], updateVertices: boolean) {
        if (!this.device) throw new Error('Device not initialized');
            if (objects === this.lastSceneObjectsRef && !updateVertices) {
                this.updateObjectStorageBufferPartial(objects);
                return;
            }

        this.sceneObjects = objects;
        this.lastSceneObjectsRef = objects;

        this.updateObjectStorageBufferPartial(objects);
    }
    registerCamera(camera: SceneObject) {
        const camKey = `${camera.position.x},${camera.position.y},${camera.position.z}|${JSON.stringify(camera.rotation)}`;
        if (camKey === this.lastCameraKey) {
            this.camera = camera;
            return;
        }
        this.camera = camera;
        this.lastCameraKey = camKey;

        if (this.device && this.cameraBuffer) {
            const negPos = new Vector4(-camera.position.x, -camera.position.y, -camera.position.z, 0);
            const camTransform = camera.rotation.mulMatrix(Matrix4x4.translationMatrix(negPos));
            this.device.queue.writeBuffer(this.cameraBuffer, 0, camTransform.toFloat32Array().buffer);
        }
    }

    uploadMeshes(meshes: { [id: string]: Mesh }): void {
        for (const k of Object.keys(meshes)) this.meshes[k] = meshes[k];
        if (this.device) {
            for (const k of Object.keys(meshes)) this.createBuffersForMesh(k);
        }
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array) {
        this.meshes[meshId] = { id: meshId, vertices, indices };
        if (this.device) this.createBuffersForMesh(meshId);
    }

    private createBuffersForMesh(meshId: string) {
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

    private updateObjectStorageBufferPartial(objects: SceneObject[]) {
        if (!this.device) throw new Error('Device not initialized');
        const objectCount = objects.length;
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