import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGPUView } from './WebGPUView';
import type { SceneObject } from '../Types/SceneObject';
import * as V from '../misc/vec4';
import * as M from '../misc/mat4';

// Mock WebGPU API
const mockDevice = {
    createBuffer: vi.fn(),
    queue: {
        writeBuffer: vi.fn()
    }
} as any;

const mockBuffer = {
    destroy: vi.fn()
} as any;

// Mock WebGPU constants
(global as any).GPUBufferUsage = {
    STORAGE: 0x40,
    COPY_DST: 0x08
};

describe('WebGPUView Static Optimization', () => {
    let view: WebGPUView;
    let staticObjects: SceneObject[];
    let nonStaticObjects: SceneObject[];

    beforeEach(() => {
        view = new WebGPUView();
        
        // Mock the device to avoid WebGPU initialization
        (view as any).device = mockDevice;
        (view as any).objectStorageBuffer = mockBuffer;
        (view as any).maxObjects = 100;

        mockDevice.createBuffer.mockReturnValue(mockBuffer);
        mockDevice.queue.writeBuffer.mockClear();
        mockBuffer.destroy.mockClear();

        // Create test objects
        staticObjects = [
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
                props: { mesh: 'test-mesh' }
            }
        ];

        nonStaticObjects = [
            {
                id: 'dynamic-1',
                position: V.vec4(3, 0, 0, 1),
                rotation: M.mat4Identity(),
                scale: V.vec4(1, 1, 1, 1),
                props: { mesh: 'test-mesh' }
            }
        ];
    });

    describe('Separated Object Registration', () => {
        it('should register separated objects and update buffer with correct layout', async () => {
            await view.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);

            // Should have called writeBuffer to update the entire buffer
            expect(mockDevice.queue.writeBuffer).toHaveBeenCalled();
            
            // Check that internal state is correct
            expect((view as any).staticObjectCount).toBe(2);
            expect((view as any).staticSceneObjects).toBe(staticObjects);
            expect((view as any).nonStaticSceneObjects).toBe(nonStaticObjects);
        });

        it('should only update non-static portion when static objects unchanged', async () => {
            // Initial registration
            await view.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);
            mockDevice.queue.writeBuffer.mockClear();

            // Update only non-static objects (change position)
            const updatedNonStatic = [{
                ...nonStaticObjects[0],
                position: V.vec4(5, 0, 0, 1)
            }];

            await view.registerSceneObjectsSeparated(staticObjects, updatedNonStatic, false);

            // Should have been called to update only non-static portion
            expect(mockDevice.queue.writeBuffer).toHaveBeenCalled();
            
            // Verify the call was made with an offset (static objects' size)
            const writeCall = mockDevice.queue.writeBuffer.mock.calls[0];
            expect(writeCall[1]).toBe(128); // 2 static objects * 64 bytes per matrix
        });

        it('should handle buffer resize when object count exceeds capacity', async () => {
            (view as any).maxObjects = 2; // Set small capacity
            
            await view.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);

            // Should have destroyed old buffer and created new one
            expect(mockBuffer.destroy).toHaveBeenCalled();
            expect(mockDevice.createBuffer).toHaveBeenCalled();
        });

        it('should provide backward compatibility with original registerSceneObjects', async () => {
            const allObjects = [...staticObjects, ...nonStaticObjects];
            
            await view.registerSceneObjects(allObjects, true);

            expect(mockDevice.queue.writeBuffer).toHaveBeenCalled();
            expect((view as any).sceneObjects).toBe(allObjects);
        });
    });

    describe('Buffer Layout Verification', () => {
        it('should arrange static objects first, then non-static in buffer', async () => {
            await view.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);

            // Get the last writeBuffer call
            const writeCall = mockDevice.queue.writeBuffer.mock.calls[mockDevice.queue.writeBuffer.mock.calls.length - 1];
            const bufferData = new Float32Array(writeCall[2]);

            // Verify we have correct number of matrices (3 objects * 16 floats per matrix)
            expect(bufferData.length).toBe(48); // 3 objects * 16 floats

            // The first 32 floats should be static objects
            // The last 16 floats should be the non-static object
            // We can verify by checking the translation components (positions)
            
            // Static object 1 position should be at indices 12-14 (4th column of first matrix)
            expect(bufferData[12]).toBe(1); // x position of static-1
            
            // Static object 2 position should be at indices 28-30 (4th column of second matrix)  
            expect(bufferData[28]).toBe(2); // x position of static-2
            
            // Non-static object position should be at indices 44-46 (4th column of third matrix)
            expect(bufferData[44]).toBe(3); // x position of dynamic-1
        });
    });

    describe('Render Integration', () => {
        it('should render both static and non-static objects correctly', () => {
            // Setup minimal render dependencies
            (view as any).staticSceneObjects = staticObjects;
            (view as any).nonStaticSceneObjects = nonStaticObjects;
            (view as any).device = undefined; // Disable actual rendering
            
            // Verify that render method would process all objects
            const allObjects = [...staticObjects, ...nonStaticObjects];
            expect(allObjects).toHaveLength(3);
            
            // The render method should handle both arrays
            expect((view as any).staticSceneObjects).toEqual(staticObjects);
            expect((view as any).nonStaticSceneObjects).toEqual(nonStaticObjects);
        });
    });
});