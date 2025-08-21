import { renderer } from './shaders/renderer';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Vector4 } from '../misc/Vector4';
import type { SceneObject } from '../Model/Model';

class View {
    // GPU related
    private device?: GPUDevice;
    private canvas?: HTMLCanvasElement;
    private context?: GPUCanvasContext;
    private depthTexture?: GPUTexture;
    private renderPipeline?: GPURenderPipeline;
    // per-object buffers are stored in objectBuffers
    private objectBuffers = new Map<string, { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indices: Uint32Array | Uint16Array }>();
    private bindGroup?: GPUBindGroup;
    private storageBuffer?: GPUBuffer; // view/projection
    public maxObjects = 1000000; // max objects in scene, dynamic
    private fov = 30; // field of view in degrees
    private near = 0.1; // near plane distance
    private far = 1000; // far plane distance

    // Scene
    private sceneObjects: SceneObject[] = [];
    private camera: SceneObject = {
        id: 'viewCamera',
        position: new Vector4(0, 0, 0, 1),
        rotation: Matrix4x4.prototype.identity(),
        scale: new Vector4(1, 1, 1, 1),
        props: {}
    };

    // Helper matrix instance for creating projection/rotation matrices
    private matrixHelper = new Matrix4x4(new Vector4(1, 0, 0, 0), new Vector4(0, 1, 0, 0), new Vector4(0, 0, 1, 0), new Vector4(0, 0, 0, 1));
    // debug
    private debugEl?: HTMLDivElement;

    // model generation moved to Model.ts

    /**
     * Initialize WebGPU using an externally created canvas element.
     * The caller is responsible for creating/appending the canvas to the DOM.
     */
    async initWebGPU(canvas: HTMLCanvasElement) {
        if (!navigator.gpu) {
            console.error('WebGPU API unavailable');
            return;
        }
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

            // storage buffer for view/projection matrices each object
            this.storageBuffer = this.device.createBuffer({
                size: 64 * this.maxObjects,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });

            const bindGroupLayout = device.createBindGroupLayout({
                entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
            });
            this.bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [{ binding: 0, resource: { buffer: this.storageBuffer! } }] });

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
            if (this.debugEl) this.debugEl.innerText = 'WebGPU: ready';

            const resizeCanvasAndDepthTexture = () => {
                if (!this.canvas || !this.device) return;
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                if (this.depthTexture) this.depthTexture.destroy();
                this.depthTexture = this.device!.createTexture({ size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 }, sampleCount, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
            };

            window.addEventListener('resize', resizeCanvasAndDepthTexture);
            resizeCanvasAndDepthTexture();
        } catch (error) {
            console.error('Failed to initialize WebGPU:', error);
            if (this.debugEl) this.debugEl.innerText = 'WebGPU init error: ' + (error as Error).message;
        }

        return [adapter, device, canvas, context, format] as const;
    }

    // allow external debug overlay to be provided by caller (main.ts)
    public setDebugElement(el: HTMLDivElement) {
        this.debugEl = el;
    }



    // Register scene objects (from Model) so View can upload buffers and draw
    async registerSceneObjects(objects: SceneObject[], updateVertices: boolean) {
        if (!this.device) throw new Error('Device not initialized');
        this.sceneObjects = objects;
        if (updateVertices) {
            await this.uploadMeshBuffers();
        }
        this.updateObjectStorageBuffer(objects);
    }
    registerCamera(camera: SceneObject) {
        this.camera = camera;
    }

    private async uploadMeshBuffers() {
        if (!this.device) return;
        for (const obj of this.sceneObjects) {
            if (this.objectBuffers.has(obj.props.mesh!.id)) continue;
            const v = obj.props.mesh!.vertices;
            const i = obj.props.mesh!.indices;
            const vertexBuffer = this.device.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            this.device.queue.writeBuffer(vertexBuffer, 0, v.buffer as ArrayBuffer, v.byteOffset, v.byteLength);
            const indexBuffer = this.device.createBuffer({ size: i.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
            this.device.queue.writeBuffer(indexBuffer, 0, i.buffer as ArrayBuffer, i.byteOffset, i.byteLength);
            this.objectBuffers.set(obj.props.mesh!.id, { vertexBuffer, indexBuffer, indices: i });
        }
    }

    private updateObjectStorageBuffer(objects: SceneObject[]) {
        if (!this.device) throw new Error('Device not initialized');
        this.sceneObjects = objects;
        const objectCount = objects.length;
        if (objectCount > this.maxObjects) {
            console.warn(`Object count ${objectCount} exceeds maxObjects ${this.maxObjects}, resizing storage buffer`);
            this.maxObjects = objectCount; // update maxObjects
            this.storageBuffer?.destroy(); // destroy old buffer
            this.storageBuffer = this.device.createBuffer({
                size: 64 * this.maxObjects, // 16 bytes per matrix (4x4)
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
        }
        const allObjectMatricesBuffer = new Float32Array(objectCount * 16); // 4x4 matrix for each object
        // update object uniform (position + rotation matrix or similar) into uniform1Buffer
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            const offset = i * 16; // 4x4 matrix
            const matrix = this.matrixHelper.renderMatrix(
                obj.scale, obj.rotation, obj.position,
                this.camera.position, this.camera.rotation,
                this.fov, (this.canvas!.width) / (this.canvas!.height), this.near, this.far
            );
            allObjectMatricesBuffer.set(matrix.toFloat32Array(), offset);
        }
        this.device.queue.writeBuffer(this.storageBuffer!, 0, allObjectMatricesBuffer);

    }

    render(): void {
        if (!this.device || !this.context || !this.renderPipeline || !this.depthTexture || !this.bindGroup) {
            console.warn('Render skipped: device/context/pipeline not ready');
            if (this.debugEl) this.debugEl.innerText = 'Render skipped: device/context/pipeline not ready';
            return;
        }

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 1, g: 1., b: 1., a: 1. } as GPUColor,
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
            let buf;
            for (const obj of this.sceneObjects) {
                if (obj.props.mesh!.id !== currentMeshId) {
                    buf = this.objectBuffers.get(obj.props.mesh!.id);
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
                this.debugEl.innerText = `WebGPU ready\nObjects: ${this.sceneObjects.length}\nBuffers: ${this.objectBuffers.size}`;
                this.debugEl.innerText += `\nCamerar: x${this.camera.position.x} y${this.camera.position.y} z${this.camera.position.z}`;
            }
        } catch (e) {
            console.error('Render error:', e);
            if (this.debugEl) this.debugEl.innerText = 'Render error: ' + (e as Error).message;
        }
    }
}

export default View;