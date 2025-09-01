import { renderer } from './shaders/default-wgsl-renderer';
import { vertexShader, fragmentShader } from './shaders/default-glsl-renderer';
import type { Vector4 } from '../misc/Vector4';
import * as M from '../misc/Matrix4x4';
import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/Mesh';
import type { LightingData } from '../Types/Light';

class View {
    // WebGPU properties
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
    private directLightsBuffer?: GPUBuffer;
    private pointLightsBuffer?: GPUBuffer;
    private lightingConfigBuffer?: GPUBuffer;
    
    // WebGL properties
    private gl?: WebGL2RenderingContext;
    private glProgram?: WebGLProgram | null;
    private glVertexBuffers = new Map<string, { vertexBuffer: WebGLBuffer; indexBuffer: WebGLBuffer; indices: Uint32Array | Uint16Array }>();
    private glUniforms: {
        objectMatrix?: WebGLUniformLocation | null;
        cameraMatrix?: WebGLUniformLocation | null;
        projectionMatrix?: WebGLUniformLocation | null;
        // Lighting uniforms
        numDirectLights?: WebGLUniformLocation | null;
        numPointLights?: WebGLUniformLocation | null;
        directLightDirections?: WebGLUniformLocation | null;
        directLightColors?: WebGLUniformLocation | null;
        pointLightPositions?: WebGLUniformLocation | null;
        pointLightColors?: WebGLUniformLocation | null;
        pointLightRadii?: WebGLUniformLocation | null;
    } = {};
    private glVertexArray?: WebGLVertexArrayObject;
    
    // Common properties
    public maxObjects = 1000000;
    private fov = 30;
    private near = 0.1;
    private far = 1000;
    private meshes: { [id: string]: Mesh } = {};
    private WebGPUBackend = false;
    private sceneObjects: SceneObject[] = [];
    private lastSceneObjectsRef?: SceneObject[];
    private lastCameraKey?: string;
    
    // Lighting
    private currentLightingData: LightingData = { directLights: [], pointLights: [] };
    public maxDirectLights = 8;
    public maxPointLights = 32;
    private camera: SceneObject = {
        id: 'viewCamera',
        position: new Float32Array([0, 0, 0, 1]) as Vector4,
        rotation: M.mat4Identity(),
        scale: new Float32Array([1, 1, 1, 1]) as Vector4,
        props: {}
    };

    public async init(canvas: HTMLCanvasElement, useWebGPU: boolean = true) {
        this.setWebGPUBackend(useWebGPU);
        if (useWebGPU) {
            try {
                return await this.initWebGPU(canvas);
            } catch (error) {
                console.warn('WebGPU initialization failed, falling back to WebGL:', error);
                this.setWebGPUBackend(false);
                return this.initWebGL(canvas);
            }
        } else {
            return this.initWebGL(canvas);
        }
    }

    public setWebGPUBackend(enabled: boolean) {
        this.WebGPUBackend = enabled;
    }

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

                // Create lighting buffers
                // DirectLight: vec4 direction, vec4 color (8 vec4s = 8 * 16 = 128 bytes per light)
                this.directLightsBuffer = this.device.createBuffer({
                    size: this.maxDirectLights * 32, // direction(16) + color(16) per light
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });

                // PointLight: vec4 position, vec4 color, float radius + padding (3 vec4s = 48 bytes per light)  
                this.pointLightsBuffer = this.device.createBuffer({
                    size: this.maxPointLights * 48, // position(16) + color(16) + radius+padding(16) per light
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });

                // Lighting config: numDirectLights, numPointLights + padding (16 bytes)
                this.lightingConfigBuffer = this.device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                });

                const initialProj = M.mat4Projection(this.fov, (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), this.near, this.far);
                this.device.queue.writeBuffer(this.projectionBuffer, 0, (initialProj).buffer);

                const bindGroupLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
                        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
                        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
                        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
                    ],
                });
                this.bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [
                    { binding: 0, resource: { buffer: this.objectStorageBuffer! } },
                    { binding: 1, resource: { buffer: this.cameraBuffer! } },
                    { binding: 2, resource: { buffer: this.projectionBuffer! } },
                    { binding: 3, resource: { buffer: this.directLightsBuffer! } },
                    { binding: 4, resource: { buffer: this.pointLightsBuffer! } },
                    { binding: 5, resource: { buffer: this.lightingConfigBuffer! } },
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
            // Don't show instructions here, let the init method handle fallback
            throw error;
        }
    }

    async initWebGL(canvas: HTMLCanvasElement) {
        try {
            const gl = canvas.getContext('webgl2', { 
                antialias: true, 
                depth: true, 
                alpha: true, 
                premultipliedAlpha: true 
            });
            if (!gl) throw new Error('WebGL2 not supported');

            this.gl = gl;
            this.canvas = canvas;

            // Create shader program
            const vertexShaderObj = this.createShader(gl, gl.VERTEX_SHADER, vertexShader);
            const fragmentShaderObj = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
            
            if (!vertexShaderObj || !fragmentShaderObj) {
                throw new Error('Failed to create shaders');
            }

            this.glProgram = this.createProgram(gl, vertexShaderObj, fragmentShaderObj);
            if (!this.glProgram) {
                throw new Error('Failed to create shader program');
            }

            // Get uniform locations
            this.glUniforms.objectMatrix = gl.getUniformLocation(this.glProgram, 'objectMatrix');
            this.glUniforms.cameraMatrix = gl.getUniformLocation(this.glProgram, 'cameraMatrix');
            this.glUniforms.projectionMatrix = gl.getUniformLocation(this.glProgram, 'projectionMatrix');
            
            // Get lighting uniform locations
            this.glUniforms.numDirectLights = gl.getUniformLocation(this.glProgram, 'numDirectLights');
            this.glUniforms.numPointLights = gl.getUniformLocation(this.glProgram, 'numPointLights');
            this.glUniforms.directLightDirections = gl.getUniformLocation(this.glProgram, 'directLightDirections');
            this.glUniforms.directLightColors = gl.getUniformLocation(this.glProgram, 'directLightColors');
            this.glUniforms.pointLightPositions = gl.getUniformLocation(this.glProgram, 'pointLightPositions');
            this.glUniforms.pointLightColors = gl.getUniformLocation(this.glProgram, 'pointLightColors');
            this.glUniforms.pointLightRadii = gl.getUniformLocation(this.glProgram, 'pointLightRadii');

            // Create vertex array object
            this.glVertexArray = gl.createVertexArray();
            if (!this.glVertexArray) {
                throw new Error('Failed to create vertex array object');
            }

            // Set up WebGL state
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            // Set initial projection matrix
            const initialProj = M.mat4Projection(this.fov, 
                (canvas.width || window.innerWidth) / (canvas.height || window.innerHeight), 
                this.near, this.far);
            
            gl.useProgram(this.glProgram);
            if (this.glUniforms.projectionMatrix) {
                gl.uniformMatrix4fv(this.glUniforms.projectionMatrix, false, M.mat4Transpose(initialProj));
            }

            // Handle resize
            const resizeCanvas = () => {
                if (!this.canvas || !this.gl) return;
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                
                if (this.glProgram && this.glUniforms.projectionMatrix) {
                    const proj = M.mat4Projection(this.fov, this.canvas.width / this.canvas.height, this.near, this.far);
                    this.gl.useProgram(this.glProgram);
                    this.gl.uniformMatrix4fv(this.glUniforms.projectionMatrix, false, M.mat4Transpose(proj));
                }
            };

            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();

            console.log('WebGL initialized successfully');
            if (this.debugEl) this.debugEl.innerText += 'WebGL: ready';

        } catch (error) {
            console.error('Failed to initialize WebGL:', error);
            if (this.debugEl) this.debugEl.innerText += 'WebGL init error: ' + (error as Error).message;
        }
    }

    private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) return null;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    private createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
        const program = gl.createProgram();
        if (!program) return null;

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    public setDebugElement(el: HTMLDivElement) {
        this.debugEl = el;
    }

    async registerSceneObjects(objects: SceneObject[], updateVertices: boolean) {
        if (!this.device && !this.gl) throw new Error('Neither WebGPU device nor WebGL context initialized');
            if (objects === this.lastSceneObjectsRef && !updateVertices) {
                if (this.device) {
                    this.updateObjectStorageBufferPartial(objects);
                }
                return;
            }

        this.sceneObjects = objects;
        this.lastSceneObjectsRef = objects;

        if (this.device) {
            this.updateObjectStorageBufferPartial(objects);
        }
        // For WebGL, we don't need to pre-upload matrices as we update them per draw call
    }
    registerCamera(camera: SceneObject) {
        const camKey = `${camera.position[0]},${camera.position[1]},${camera.position[2]}|${JSON.stringify(camera.rotation)}`;
        if (camKey === this.lastCameraKey) {
            this.camera = camera;
            return;
        }
        this.camera = camera;
        this.lastCameraKey = camKey;

        if (this.device && this.cameraBuffer) {
            const camTransform = M.mat4Mul(new Float32Array(16),camera.rotation,M.mat4Translation(-camera.position[0],-camera.position[1],-camera.position[2]));
            this.device.queue.writeBuffer(this.cameraBuffer, 0, M.mat4Transpose(camTransform).buffer);
        }
    }

    uploadMeshes(meshes: { [id: string]: Mesh }): void {
        for (const k of Object.keys(meshes)) this.meshes[k] = meshes[k];
        if (this.device) {
            for (const k of Object.keys(meshes)) this.createBuffersForMesh(k);
        }
        if (this.gl) {
            for (const k of Object.keys(meshes)) this.createWebGLBuffersForMesh(k);
        }
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array) {
        this.meshes[meshId] = { id: meshId, vertices, indices };
        if (this.device) this.createBuffersForMesh(meshId);
        if (this.gl) this.createWebGLBuffersForMesh(meshId);
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

    private createWebGLBuffersForMesh(meshId: string) {
        if (!this.gl) return;
        if (this.glVertexBuffers.has(meshId)) return;
        const mesh = this.meshes[meshId];
        if (!mesh) return;

        const gl = this.gl;
        const v = mesh.vertices;
        const i = mesh.indices;

        // Create vertex buffer
        const vertexBuffer = gl.createBuffer();
        if (!vertexBuffer) return;
        
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);

        // Create index buffer
        const indexBuffer = gl.createBuffer();
        if (!indexBuffer) return;
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);

        this.glVertexBuffers.set(meshId, { vertexBuffer, indexBuffer, indices: i });
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
            const translation = [obj.position[0], obj.position[1], obj.position[2]];
            const scale = [obj.scale[0], obj.scale[1], obj.scale[2]];
            const matrix = M.mat4Transpose(M.mat4TRS(translation,obj.rotation,scale));
            allObjectMatricesBuffer.set(matrix, i * 16);
        }
        this.device.queue.writeBuffer(this.objectStorageBuffer!, 0, allObjectMatricesBuffer .buffer, 0, objectCount * 16 * 4);
    }
    render(): void {
        if(this.WebGPUBackend){
            this.renderWGPU();
        } else {
            this.renderGL();
        }
    }

    renderWGPU(): void {
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
                this.debugEl.innerText += `\nCamerar: x${this.camera.position[0].toFixed(2)} y${this.camera.position[1].toFixed(2)} z${this.camera.position[2].toFixed(2)}`;
            }
        } catch (e) {
            console.error('Render error:', e);
            if (this.debugEl) this.debugEl.innerText += 'Render error: ' + (e as Error).message;
        }
    }

    renderGL(): void {
        if (!this.gl || !this.glProgram || !this.glVertexArray) {
            console.warn('WebGL render skipped: context/program not ready');
            if (this.debugEl) this.debugEl.innerText += 'WebGL render skipped: context/program not ready';
            return;
        }

        const gl = this.gl;

        // Clear the canvas
        gl.clearColor(this.clearValue.r, this.clearValue.g, this.clearValue.b, this.clearValue.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        try {
            gl.useProgram(this.glProgram);

            // Set camera matrix (once per frame)
            if (this.glUniforms.cameraMatrix) {
                const camTransform = M.mat4Mul(new Float32Array(16), this.camera.rotation, 
                    M.mat4Translation(-this.camera.position[0], -this.camera.position[1], -this.camera.position[2]));
                gl.uniformMatrix4fv(this.glUniforms.cameraMatrix, false, M.mat4Transpose(camTransform));
            }

            gl.bindVertexArray(this.glVertexArray);

            // Render objects grouped by mesh, but update object matrix per object
            let currentMeshId = "empty";
            let objIndex = 0;
            let buf;

            for (const obj of this.sceneObjects) {
                objIndex++;
                
                // Switch mesh if needed
                if (obj.props.mesh !== currentMeshId) {
                    currentMeshId = obj.props.mesh!;
                    buf = this.glVertexBuffers.get(currentMeshId);
                    if (!buf) continue;

                    // Bind vertex buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER, buf.vertexBuffer);
                    gl.enableVertexAttribArray(0);
                    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

                    // Bind index buffer
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.indexBuffer);
                }
                
                if (!buf) continue;

                // Set object matrix for this specific object
                if (this.glUniforms.objectMatrix) {
                    const translation = [obj.position[0], obj.position[1], obj.position[2]];
                    const scale = [obj.scale[0], obj.scale[1], obj.scale[2]];
                    const matrix = M.mat4Transpose(M.mat4TRS(translation, obj.rotation, scale));
                    gl.uniformMatrix4fv(this.glUniforms.objectMatrix, false, matrix);
                }

                // Draw this object
                const indexType = (buf.indices instanceof Uint16Array) ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
                gl.drawElements(gl.TRIANGLES, buf.indices.length, indexType, 0);
            }

            if (this.debugEl) {
                this.debugEl.innerText = `WebGL ready\nObjects: ${objIndex}\nBuffers: ${this.glVertexBuffers.size}`;
                this.debugEl.innerText += `\nCamera: x${this.camera.position[0].toFixed(2)} y${this.camera.position[1].toFixed(2)} z${this.camera.position[2].toFixed(2)}`;
            }
        } catch (e) {
            console.error('WebGL render error:', e);
            if (this.debugEl) this.debugEl.innerText += 'WebGL render error: ' + (e as Error).message;
        }
    }

    // Update lighting data for the view
    updateLighting(lightingData: LightingData): void {
        this.currentLightingData = lightingData;
        
        if (this.WebGPUBackend && this.device) {
            this.updateWebGPULighting();
        } else if (this.gl && this.glProgram) {
            this.updateWebGLLighting();
        }
    }

    private updateWebGPULighting(): void {
        if (!this.device || !this.directLightsBuffer || !this.pointLightsBuffer || !this.lightingConfigBuffer) return;

        // Update direct lights buffer
        const directLightData = new Float32Array(this.maxDirectLights * 8); // 8 floats per light (2 vec4s)
        for (let i = 0; i < Math.min(this.currentLightingData.directLights.length, this.maxDirectLights); i++) {
            const light = this.currentLightingData.directLights[i];
            const offset = i * 8;
            // Direction vec4
            directLightData[offset + 0] = light.direction[0];
            directLightData[offset + 1] = light.direction[1];
            directLightData[offset + 2] = light.direction[2];
            directLightData[offset + 3] = 0; // padding
            // Color vec4 
            directLightData[offset + 4] = light.color[0];
            directLightData[offset + 5] = light.color[1];
            directLightData[offset + 6] = light.color[2];
            directLightData[offset + 7] = light.color[3]; // intensity
        }
        this.device.queue.writeBuffer(this.directLightsBuffer, 0, directLightData);

        // Update point lights buffer
        const pointLightData = new Float32Array(this.maxPointLights * 12); // 12 floats per light (3 vec4s)
        for (let i = 0; i < Math.min(this.currentLightingData.pointLights.length, this.maxPointLights); i++) {
            const light = this.currentLightingData.pointLights[i];
            const offset = i * 12;
            // Position vec4
            pointLightData[offset + 0] = light.position[0];
            pointLightData[offset + 1] = light.position[1];
            pointLightData[offset + 2] = light.position[2];
            pointLightData[offset + 3] = 1; // w component
            // Color vec4
            pointLightData[offset + 4] = light.color[0];
            pointLightData[offset + 5] = light.color[1];
            pointLightData[offset + 6] = light.color[2];
            pointLightData[offset + 7] = light.color[3]; // intensity
            // Radius + padding
            pointLightData[offset + 8] = light.radius;
            pointLightData[offset + 9] = 0; // padding
            pointLightData[offset + 10] = 0; // padding
            pointLightData[offset + 11] = 0; // padding
        }
        this.device.queue.writeBuffer(this.pointLightsBuffer, 0, pointLightData);

        // Update lighting config buffer
        const configData = new Uint32Array(4); // 4 uint32s (16 bytes)
        configData[0] = this.currentLightingData.directLights.length;
        configData[1] = this.currentLightingData.pointLights.length;
        configData[2] = 0; // padding
        configData[3] = 0; // padding
        this.device.queue.writeBuffer(this.lightingConfigBuffer, 0, configData);
    }

    private updateWebGLLighting(): void {
        if (!this.gl || !this.glProgram) return;
        
        this.gl.useProgram(this.glProgram);
        
        // Set number of lights
        if (this.glUniforms.numDirectLights) {
            this.gl.uniform1i(this.glUniforms.numDirectLights, this.currentLightingData.directLights.length);
        }
        if (this.glUniforms.numPointLights) {
            this.gl.uniform1i(this.glUniforms.numPointLights, this.currentLightingData.pointLights.length);
        }
        
        // Set directional light data
        const maxDirectLights = 8;
        const directDirections = new Float32Array(maxDirectLights * 4);
        const directColors = new Float32Array(maxDirectLights * 4);
        
        for (let i = 0; i < Math.min(this.currentLightingData.directLights.length, maxDirectLights); i++) {
            const light = this.currentLightingData.directLights[i];
            const offset = i * 4;
            
            directDirections[offset + 0] = light.direction[0];
            directDirections[offset + 1] = light.direction[1];
            directDirections[offset + 2] = light.direction[2];
            directDirections[offset + 3] = 0;
            
            directColors[offset + 0] = light.color[0];
            directColors[offset + 1] = light.color[1];
            directColors[offset + 2] = light.color[2];
            directColors[offset + 3] = light.color[3];
        }
        
        if (this.glUniforms.directLightDirections) {
            this.gl.uniform4fv(this.glUniforms.directLightDirections, directDirections);
        }
        if (this.glUniforms.directLightColors) {
            this.gl.uniform4fv(this.glUniforms.directLightColors, directColors);
        }
        
        // Set point light data
        const maxPointLights = 32;
        const pointPositions = new Float32Array(maxPointLights * 4);
        const pointColors = new Float32Array(maxPointLights * 4);
        const pointRadii = new Float32Array(maxPointLights);
        
        for (let i = 0; i < Math.min(this.currentLightingData.pointLights.length, maxPointLights); i++) {
            const light = this.currentLightingData.pointLights[i];
            const offset = i * 4;
            
            pointPositions[offset + 0] = light.position[0];
            pointPositions[offset + 1] = light.position[1];
            pointPositions[offset + 2] = light.position[2];
            pointPositions[offset + 3] = 1;
            
            pointColors[offset + 0] = light.color[0];
            pointColors[offset + 1] = light.color[1];
            pointColors[offset + 2] = light.color[2];
            pointColors[offset + 3] = light.color[3];
            
            pointRadii[i] = light.radius;
        }
        
        if (this.glUniforms.pointLightPositions) {
            this.gl.uniform4fv(this.glUniforms.pointLightPositions, pointPositions);
        }
        if (this.glUniforms.pointLightColors) {
            this.gl.uniform4fv(this.glUniforms.pointLightColors, pointColors);
        }
        if (this.glUniforms.pointLightRadii) {
            this.gl.uniform1fv(this.glUniforms.pointLightRadii, pointRadii);
        }
    }
}

export default View;