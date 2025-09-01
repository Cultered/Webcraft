import { describe, it, expect, beforeEach, vi } from 'vitest';
import {createView, WebGLView } from './View';

// Mock WebGL2RenderingContext since it's not available in Node.js test environment
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
};

// Mock canvas
const mockCanvas = {
    getContext: vi.fn(),
    width: 800,
    height: 600,
} as any;

describe('View WebGL Integration', () => {
    let view: WebGLView;
    let webglView: WebGLView;

    beforeEach(() => {
        view = createView(false) as WebGLView; // Create WebGL view
        webglView = new WebGLView();
        vi.clearAllMocks();
    });

    it('should create View instance', () => {
        expect(view).toBeDefined();
    });

    it('should have init method that accepts useWebGPU parameter', () => {
        expect(typeof view.init).toBe('function');
    });

    it('should have render method', () => {
        expect(typeof view.render).toBe('function');
    });

    it('should handle WebGL initialization gracefully when WebGL is not available', () => {
        mockCanvas.getContext.mockReturnValue(null);
        
        // This should not throw an error even if WebGL is not available
        expect(() => {
            webglView.init(mockCanvas);
        }).not.toThrow();
    });

    it('should initialize WebGL context when available', () => {
        mockCanvas.getContext.mockReturnValue(mockWebGL2Context);
        mockWebGL2Context.createShader.mockReturnValue({});
        mockWebGL2Context.getShaderParameter.mockReturnValue(true);
        mockWebGL2Context.createProgram.mockReturnValue({});
        mockWebGL2Context.getProgramParameter.mockReturnValue(true);
        mockWebGL2Context.getUniformLocation.mockReturnValue({});
        mockWebGL2Context.createVertexArray.mockReturnValue({});

        expect(() => {
            webglView.init(mockCanvas);
        }).not.toThrow();

        expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', {
            antialias: true,
            depth: true,
            alpha: true,
            premultipliedAlpha: true
        });
    });
});