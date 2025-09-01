import View from '../View/View';
import { generateCubeMesh } from '../Types/MeshUtils';
import * as M from '../misc/Matrix4x4';
import type { Vector4 } from '../Types/Vector4';
import type { SceneObject } from '../Types/SceneObject';

// Simple test to verify WebGL rendering works
export async function testWebGLRendering(): Promise<boolean> {
    try {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        
        // Create view and initialize WebGL
        const view = new View();
        view.init(canvas, false); // Use WebGL instead of WebGPU
        
        // Create a simple cube mesh
        const cubeMesh = { id: 'test-cube', ...generateCubeMesh(1) };
        view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
        
        // Create a simple scene object
        const testObject: SceneObject = {
            id: 'test-object',
            position: new Float32Array([0, 0, -5, 1]) as Vector4,
            rotation: M.mat4Identity(),
            scale: new Float32Array([1, 1, 1, 1]) as Vector4,
            props: { mesh: cubeMesh.id }
        };
        
        // Create a camera
        const camera: SceneObject = {
            id: 'test-camera',
            position: new Float32Array([0, 0, 0, 1]) as Vector4,
            rotation: M.mat4Identity(),
            scale: new Float32Array([1, 1, 1, 1]) as Vector4,
            props: {}
        };
        
        // Register scene objects and camera
        await view.registerSceneObjects([testObject], true);
        view.registerCamera(camera);
        
        // Try to render
        view.render();
        
        console.log('WebGL rendering test completed successfully');
        return true;
        
    } catch (error) {
        console.error('WebGL rendering test failed:', error);
        return false;
    }
}

// Export for potential use in tests or demos
export { testWebGLRendering as default };