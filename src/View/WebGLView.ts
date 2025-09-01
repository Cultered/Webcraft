import { BaseView } from './BaseView';
import { vertexShader, fragmentShader } from './shaders/default-glsl-renderer';
import type { SceneObject } from '../Types/SceneObject';
import type { Mesh } from '../Types/MeshType';
import * as M from '../misc/mat4';

/**
 * WebGL-based rendering implementation.
 * 
 * This class provides a clean, focused implementation for WebGL 2.0 rendering.
 * It handles shader compilation, buffer management, and rendering operations
 * specific to the WebGL API.
 * 
 * Features:
 * - WebGL 2.0 context initialization with optimal settings
 * - Efficient batch rendering with minimal state changes
 * - Automatic mesh buffer management
 * - Per-object matrix transformations
 * - Debug information display
 */
export class WebGLView extends BaseView {
    // WebGL properties
    private gl?: WebGL2RenderingContext;
    private glProgram?: WebGLProgram | null;
    private glVertexBuffers = new Map<string, { vertexBuffer: WebGLBuffer; indexBuffer: WebGLBuffer; indices: Uint32Array | Uint16Array }>();
    private glUniforms: {
        objectMatrix?: WebGLUniformLocation | null;
        cameraMatrix?: WebGLUniformLocation | null;
        projectionMatrix?: WebGLUniformLocation | null;
    } = {};
    private glVertexArray?: WebGLVertexArrayObject;

    /**
     * Initialize WebGL 2.0 context and set up rendering pipeline.
     * 
     * @param canvas - HTML canvas element to render to
     */
    public async init(canvas: HTMLCanvasElement): Promise<void> {
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


    public async registerSceneObjectsSeparated(staticObjects: SceneObject[], nonStaticObjects: SceneObject[], _updateVertices: boolean): Promise<void> {
        if (!this.gl) throw new Error('WebGL context not initialized');
        
        this.staticSceneObjects = staticObjects;
        this.nonStaticSceneObjects = nonStaticObjects;
        // For WebGL, we don't need to pre-upload matrices as we update them per draw call
        // The optimization here is that we know which objects are static vs dynamic for batching/sorting
    }

    public registerCamera(camera: SceneObject): void {
        const camKey = `${camera.position[0]},${camera.position[1]},${camera.position[2]}|${JSON.stringify(camera.rotation)}`;
        if (camKey === this.lastCameraKey) {
            this.camera = camera;
            return;
        }
        this.camera = camera;
        this.lastCameraKey = camKey;
    }

    public uploadMeshes(meshes: { [id: string]: Mesh }): void {
        for (const k of Object.keys(meshes)) this.meshes[k] = meshes[k];
        if (this.gl) {
            for (const k of Object.keys(meshes)) this.createWebGLBuffersForMesh(k);
        }
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array): void {
        this.meshes[meshId] = { id: meshId, vertices, indices };
        if (this.gl) this.createWebGLBuffersForMesh(meshId);
    }

    /**
     * Render the current scene using WebGL.
     * 
     * This method performs batched rendering, grouping objects by mesh to minimize
     * state changes while updating per-object transforms for each draw call.
     */
    public render(): void {
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

            // Use separated objects if available, otherwise fall back to combined sceneObjects
            const allObjects = this.staticSceneObjects.length > 0 || this.nonStaticSceneObjects.length > 0
                ? [...this.staticSceneObjects, ...this.nonStaticSceneObjects]
                : this.sceneObjects;

            for (const obj of allObjects) {
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
                const staticCount = this.staticSceneObjects.length;
                const nonStaticCount = this.nonStaticSceneObjects.length;
                this.debugEl.innerText = `WebGL ready\nObjects: ${objIndex} (${staticCount} static, ${nonStaticCount} non-static)\nBuffers: ${this.glVertexBuffers.size}`;
                this.debugEl.innerText += `\nCamera: x${this.camera.position[0].toFixed(2)} y${this.camera.position[1].toFixed(2)} z${this.camera.position[2].toFixed(2)}`;
            }
        } catch (e) {
            console.error('WebGL render error:', e);
            if (this.debugEl) this.debugEl.innerText += 'WebGL render error: ' + (e as Error).message;
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

    private createWebGLBuffersForMesh(meshId: string): void {
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
}