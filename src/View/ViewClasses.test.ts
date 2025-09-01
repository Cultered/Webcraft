import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGLView } from './WebGLView';
import { WebGPUView } from './WebGPUView';
import { createView } from './View';

// Mock the ShowWebGPUInstructions function
vi.mock('../misc/misc', () => ({
    ShowWebGPUInstructions: vi.fn()
}));

// Mock WebGL2RenderingContext
const mockWebGL2Context = {
    createShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(),
    getShaderInfoLog: vi.fn(),
    deleteShader: vi.fn(),
    createProgram: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(),
    getProgramInfoLog: vi.fn(),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn(),
    createVertexArray: vi.fn(),
    enable: vi.fn(),
    cullFace: vi.fn(),
    blendFunc: vi.fn(),
    useProgram: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    viewport: vi.fn(),
    createBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindVertexArray: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawElements: vi.fn(),
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    DEPTH_TEST: 5,
    CULL_FACE: 6,
    BACK: 7,
    BLEND: 8,
    ONE: 9,
    ONE_MINUS_SRC_ALPHA: 10,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    TRIANGLES: 4,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
};

// Mock canvas
const mockCanvas = {
    getContext: vi.fn(),
    width: 800,
    height: 600,
} as any;

// Mock scene object
const mockSceneObject = {
    id: 'test-object',
    position: new Float32Array([0, 0, 0, 1]),
    rotation: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]),
    scale: new Float32Array([1, 1, 1, 1]),
    props: { mesh: 'test-mesh' }
};

describe('WebGLView', () => {
    let webglView: WebGLView;

    beforeEach(() => {
        webglView = new WebGLView();
        vi.clearAllMocks();
        
        // Mock window for tests
        Object.defineProperty(globalThis, 'window', {
            value: {
                addEventListener: vi.fn(),
                innerWidth: 800,
                innerHeight: 600
            },
            writable: true
        });
    });

    it('should create WebGLView instance', () => {
        expect(webglView).toBeDefined();
        expect(webglView).toBeInstanceOf(WebGLView);
    });

    it('should handle WebGL initialization', async () => {
        mockCanvas.getContext.mockReturnValue(mockWebGL2Context);
        mockWebGL2Context.createShader.mockReturnValue({});
        mockWebGL2Context.getShaderParameter.mockReturnValue(true);
        mockWebGL2Context.createProgram.mockReturnValue({});
        mockWebGL2Context.getProgramParameter.mockReturnValue(true);
        mockWebGL2Context.getUniformLocation.mockReturnValue({});
        mockWebGL2Context.createVertexArray.mockReturnValue({});

        await webglView.init(mockCanvas);

        expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', {
            antialias: true,
            depth: true,
            alpha: true,
            premultipliedAlpha: true
        });
    });

    it('should register scene objects', async () => {
        mockCanvas.getContext.mockReturnValue(mockWebGL2Context);
        await webglView.init(mockCanvas);
        
        await expect(webglView.registerSceneObjects([mockSceneObject], false)).resolves.not.toThrow();
    });

    it('should register camera', () => {
        expect(() => webglView.registerCamera(mockSceneObject)).not.toThrow();
    });

    it('should upload meshes', () => {
        const meshes = {
            'test-mesh': {
                id: 'test-mesh',
                vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                indices: new Uint32Array([0, 1, 2])
            }
        };

        expect(() => webglView.uploadMeshes(meshes)).not.toThrow();
    });

    it('should upload mesh to GPU', () => {
        const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 1, 2]);

        expect(() => webglView.uploadMeshToGPU('test-mesh', vertices, indices)).not.toThrow();
    });
});

describe('WebGPUView', () => {
    let webgpuView: WebGPUView;

    beforeEach(() => {
        webgpuView = new WebGPUView();
        vi.clearAllMocks();
        
        // Mock window for tests
        Object.defineProperty(globalThis, 'window', {
            value: {
                addEventListener: vi.fn(),
                innerWidth: 800,
                innerHeight: 600
            },
            writable: true
        });
    });

    it('should create WebGPUView instance', () => {
        expect(webgpuView).toBeDefined();
        expect(webgpuView).toBeInstanceOf(WebGPUView);
    });

    it('should handle WebGPU not available gracefully', async () => {
        // Mock navigator.gpu as undefined to simulate WebGPU not being available
        const originalGpu = (globalThis as any).navigator?.gpu;
        if (globalThis.navigator) {
            (globalThis.navigator as any).gpu = undefined;
        }

        const result = await webgpuView.init(mockCanvas);
        expect(result).toBeUndefined();

        // Restore original state
        if (globalThis.navigator && originalGpu) {
            (globalThis.navigator as any).gpu = originalGpu;
        }
    });

    it('should register scene objects without device', async () => {
        await expect(webgpuView.registerSceneObjects([mockSceneObject], false)).rejects.toThrow('WebGPU device not initialized');
    });

    it('should register camera', () => {
        expect(() => webgpuView.registerCamera(mockSceneObject)).not.toThrow();
    });

    it('should upload meshes', () => {
        const meshes = {
            'test-mesh': {
                id: 'test-mesh',
                vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                indices: new Uint32Array([0, 1, 2])
            }
        };

        expect(() => webgpuView.uploadMeshes(meshes)).not.toThrow();
    });
});

describe('View Factory', () => {
    it('should create WebGPUView by default', () => {
        const view = createView();
        expect(view).toBeInstanceOf(WebGPUView);
    });

    it('should create WebGPUView when useWebGPU is true', () => {
        const view = createView(true);
        expect(view).toBeInstanceOf(WebGPUView);
    });

    it('should create WebGLView when useWebGPU is false', () => {
        const view = createView(false);
        expect(view).toBeInstanceOf(WebGLView);
    });
});