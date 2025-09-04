import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGPUView } from '../src/View/WebGPUView';
import type { SceneObject } from '../src/Types/SceneObject';
import type { Mesh } from '../src/Types/MeshType';
import * as V from '../src/misc/vec4';
import * as M from '../src/misc/mat4';

// Mock WebGPU API
const mockDevice = {
    createBuffer: vi.fn(),
    queue: { writeBuffer: vi.fn() },
    createBindGroup: vi.fn()
};

const mockCanvas = {
    getContext: vi.fn(() => null),
    addEventListener: vi.fn(),
    width: 800,
    height: 600
} as unknown as HTMLCanvasElement;

// Mock mesh data
const mockMesh: Mesh = {
    id: 'test-mesh',
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2])
};

const mockMesh2: Mesh = {
    id: 'test-mesh-2',
    vertices: new Float32Array([1, 1, 1, 2, 1, 1, 1, 2, 1]),
    indices: new Uint32Array([0, 1, 2])
};

describe('WebGPUView Buffer Optimization', () => {
    let webgpuView: WebGPUView;

    beforeEach(() => {
        webgpuView = new WebGPUView();
        vi.clearAllMocks();
        
        // Mock WebGPU objects
        (webgpuView as any).device = mockDevice;
        (webgpuView as any).renderPipeline = {
            getBindGroupLayout: vi.fn(() => ({}))
        };
        (webgpuView as any).cameraBuffer = {};
        (webgpuView as any).projectionBuffer = {};
    });

    describe('Static/Non-static Object Separation', () => {
        it('should separate objects by static/non-static status first, then by mesh', () => {
            const staticObjects: SceneObject[] = [
                {
                    id: 'static-1',
                    position: V.vec4(1, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh' }
                },
                {
                    id: 'static-2', 
                    position: V.vec4(2, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh-2' }
                }
            ];

            const nonStaticObjects: SceneObject[] = [
                {
                    id: 'dynamic-1',
                    position: V.vec4(3, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh' }
                },
                {
                    id: 'dynamic-2',
                    position: V.vec4(4, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh-2' }
                }
            ];

            // Test the private buildBatchesAndMatrixBuffer method
            const result = (webgpuView as any).buildBatchesAndMatrixBuffer(staticObjects, nonStaticObjects);
            
            // The result should have static objects first, then non-static objects
            expect(result).toBeInstanceOf(Float32Array);
            expect(result.length).toBe(4 * 16); // 4 objects * 16 floats per matrix

            // Check that meshBatches are organized properly
            const meshBatches = (webgpuView as any).meshBatches;
            const staticMeshBatches = (webgpuView as any).staticMeshBatches;
            const nonStaticMeshBatches = (webgpuView as any).nonStaticMeshBatches;
            
            expect(meshBatches.size).toBe(2); // two meshes
            expect(staticMeshBatches.size).toBe(2); // both meshes have static objects
            expect(nonStaticMeshBatches.size).toBe(2); // both meshes have non-static objects
            expect(meshBatches.has('test-mesh')).toBe(true);
            expect(meshBatches.has('test-mesh-2')).toBe(true);
        });

        it('should only update non-static objects when updateStatic is false', () => {
            const staticObjects: SceneObject[] = [
                {
                    id: 'static-1',
                    position: V.vec4(1, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh' }
                }
            ];

            const nonStaticObjects: SceneObject[] = [
                {
                    id: 'dynamic-1',
                    position: V.vec4(3, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh' }
                }
            ];

            // Initialize storage buffer mock
            (webgpuView as any).objectStorageBuffer = { destroy: vi.fn() };
            (webgpuView as any).maxObjects = 100;
            (webgpuView as any).staticSceneObjects = staticObjects;

            // Set up initial state by calling with updateStatic = true first
            webgpuView.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);
            
            // Clear previous calls
            mockDevice.queue.writeBuffer.mockClear();

            // Call registerSceneObjectsSeparated with updateStatic = false
            webgpuView.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, false);

            // Verify that writeBuffer was called for partial update
            expect(mockDevice.queue.writeBuffer).toHaveBeenCalled();
            
            // Check that the call was for non-static offset (not full buffer)
            const calls = mockDevice.queue.writeBuffer.mock.calls;
            const lastCall = calls[calls.length - 1];
            const offsetBytes = lastCall[1]; // second parameter is offset
            expect(offsetBytes).toBeGreaterThan(0); // Should be non-zero for partial update
        });

        it('should handle mixed mesh scenarios correctly', () => {
            const staticObjects: SceneObject[] = [
                {
                    id: 'static-mesh-a',
                    position: V.vec4(1, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-a' }
                }
            ];

            const nonStaticObjects: SceneObject[] = [
                {
                    id: 'dynamic-mesh-b',
                    position: V.vec4(2, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-b' }
                }
            ];

            const result = (webgpuView as any).buildBatchesAndMatrixBuffer(staticObjects, nonStaticObjects);
            const staticMeshBatches = (webgpuView as any).staticMeshBatches;
            const nonStaticMeshBatches = (webgpuView as any).nonStaticMeshBatches;
            const meshBatches = (webgpuView as any).meshBatches;

            // Verify separate tracking
            expect(staticMeshBatches.has('mesh-a')).toBe(true);
            expect(staticMeshBatches.has('mesh-b')).toBe(false);
            expect(nonStaticMeshBatches.has('mesh-a')).toBe(false);
            expect(nonStaticMeshBatches.has('mesh-b')).toBe(true);
            
            // Verify combined tracking for rendering
            expect(meshBatches.has('mesh-a')).toBe(true);
            expect(meshBatches.has('mesh-b')).toBe(true);
        });
    });

    describe('Buffer Layout Optimization', () => {
        it('should maintain proper buffer layout for efficient rendering', () => {
            const staticObjects: SceneObject[] = [
                {
                    id: 'static-mesh-a',
                    position: V.vec4(1, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-a' }
                },
                {
                    id: 'static-mesh-b',
                    position: V.vec4(2, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-b' }
                }
            ];

            const nonStaticObjects: SceneObject[] = [
                {
                    id: 'dynamic-mesh-a',
                    position: V.vec4(3, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-a' }
                },
                {
                    id: 'dynamic-mesh-b',
                    position: V.vec4(4, 0, 0, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'mesh-b' }
                }
            ];

            const result = (webgpuView as any).buildBatchesAndMatrixBuffer(staticObjects, nonStaticObjects);
            const staticMeshBatches = (webgpuView as any).staticMeshBatches;
            const nonStaticMeshBatches = (webgpuView as any).nonStaticMeshBatches;
            const nonStaticBaseOffset = (webgpuView as any).nonStaticBaseOffset;

            // Verify buffer layout: static objects should come first
            expect(nonStaticBaseOffset).toBe(2); // 2 static objects come before non-static

            // Verify that batches exist for both meshes
            expect(staticMeshBatches.has('mesh-a')).toBe(true);
            expect(staticMeshBatches.has('mesh-b')).toBe(true);
            expect(nonStaticMeshBatches.has('mesh-a')).toBe(true);
            expect(nonStaticMeshBatches.has('mesh-b')).toBe(true);
            
            // The layout should allow for efficient drawIndexed calls per mesh
            for (const [meshId, batch] of staticMeshBatches) {
                expect(batch).toHaveProperty('base');
                expect(batch).toHaveProperty('count');
                expect(typeof batch.base).toBe('number');
                expect(typeof batch.count).toBe('number');
                expect(batch.count).toBeGreaterThan(0);
                expect(batch.base).toBeLessThan(nonStaticBaseOffset); // Static should come before non-static
            }
            
            for (const [meshId, batch] of nonStaticMeshBatches) {
                expect(batch).toHaveProperty('base');
                expect(batch).toHaveProperty('count');
                expect(typeof batch.base).toBe('number');
                expect(typeof batch.count).toBe('number');
                expect(batch.count).toBeGreaterThan(0);
                expect(batch.base).toBeGreaterThanOrEqual(nonStaticBaseOffset); // Non-static should come after static
            }
        });
    });

    describe('Partial Buffer Updates', () => {
        it('should build non-static matrix buffer correctly', () => {
            const nonStaticObjects: SceneObject[] = [
                {
                    id: 'dynamic-1',
                    position: V.vec4(1, 2, 3, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(2, 2, 2, 1),
                    props: { mesh: 'test-mesh' }
                },
                {
                    id: 'dynamic-2',
                    position: V.vec4(4, 5, 6, 1),
                    rotation: M.mat4Identity(),
                    scale: V.vec4(1, 1, 1, 1),
                    props: { mesh: 'test-mesh-2' }
                }
            ];

            const result = (webgpuView as any).buildNonStaticMatrixBuffer(nonStaticObjects);
            
            expect(result).toBeInstanceOf(Float32Array);
            expect(result.length).toBe(2 * 16); // 2 objects * 16 floats per matrix
            
            // Verify that matrices are properly transformed
            // The first matrix should contain the transformation for dynamic-1
            const firstMatrix = result.slice(0, 16);
            expect(firstMatrix).toHaveLength(16);
            
            // Since we're using identity rotation and scale (2,2,2), the translation should be in the matrix
            // The translation components should be in positions 12, 13, 14 (column-major order)
            expect(firstMatrix[12]).toBeCloseTo(1); // x translation
            expect(firstMatrix[13]).toBeCloseTo(2); // y translation  
            expect(firstMatrix[14]).toBeCloseTo(3); // z translation
        });
    });
});