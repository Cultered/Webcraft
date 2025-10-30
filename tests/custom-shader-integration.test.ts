import { describe, it, expect } from 'vitest';
import Model from '../src/Model/Model';
import Entity from '../src/Model/Entity';
import MeshComponent from '../src/Model/Components/MeshComponent';
import CustomRenderShader from '../src/Model/Components/CustomRenderShader';
import { vec4 } from '../src/misc/vec4';

describe('CustomRenderShader Integration', () => {
    it('should separate custom shader objects from regular objects in Model', () => {
        const model = new Model();

        // Add a camera
        model.addCamera('main-camera', vec4(0, 0, 10, 1));

        // Create a regular static object
        const regularEntity = new Entity('regular', vec4(0, 0, 0, 1), undefined, undefined, true);
        const regularMesh = {
            id: 'regular-mesh',
            vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
            uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
            indices: new Uint32Array([0, 1, 2])
        };
        regularEntity.addComponent(new MeshComponent(regularMesh));
        model.addEntity(regularEntity);

        // Create a custom shader object
        const customEntity = new Entity('custom', vec4(5, 0, 0, 1), undefined, undefined, false);
        const customMesh = {
            id: 'custom-mesh',
            vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
            uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
            indices: new Uint32Array([0, 1, 2])
        };
        customEntity.addComponent(new MeshComponent(customMesh));

        const vertexShader = `
@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    let model = objectMatrices[i_idx];
    output.position = projectionMatrix * view * model * vec4f(in.position, 1.0);
    return output;
}`;

        const fragmentShader = `
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 1.0, 1.0); // Magenta
}`;

        const customShader = new CustomRenderShader('magenta-shader', vertexShader, fragmentShader);
        customEntity.addComponent(customShader);
        model.addEntity(customEntity);

        // Get objects separated
        const { static: staticObjects, nonStatic: nonStaticObjects } = model.getObjectsSeparated('main-camera');

        // The regular entity should be in static objects
        expect(staticObjects.length).toBe(1);
        expect(staticObjects[0].id).toBe('regular');

        // The custom shader entity should be in non-static objects
        expect(nonStaticObjects.length).toBe(1);
        expect(nonStaticObjects[0].id).toBe('custom');
    });

    it('should handle multiple custom shader objects with the same shader', () => {
        const vertexShader = `
@vertex
fn vertex_main() -> @builtin(position) vec4f {
    return vec4f(0.0);
}`;

        const fragmentShader = `
@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4f(1.0, 1.0, 0.0, 1.0); // Yellow
}`;

        const shader = new CustomRenderShader('shared-shader', vertexShader, fragmentShader);

        const entity1 = new Entity('custom1', vec4(0, 0, 0, 1));
        const entity2 = new Entity('custom2', vec4(1, 0, 0, 1));

        const mesh = {
            id: 'shared-mesh',
            vertices: new Float32Array([0, 0, 0]),
            normals: new Float32Array([0, 1, 0]),
            uvs: new Float32Array([0, 0]),
            indices: new Uint32Array([0])
        };

        entity1.addComponent(new MeshComponent(mesh));
        entity1.addComponent(shader);

        entity2.addComponent(new MeshComponent(mesh));
        // Create new shader component with same ID (pipeline should be reused)
        entity2.addComponent(new CustomRenderShader('shared-shader', vertexShader, fragmentShader));

        // Both entities should have the custom shader component
        expect(entity1.getComponent(CustomRenderShader)?.id).toBe('shared-shader');
        expect(entity2.getComponent(CustomRenderShader)?.id).toBe('shared-shader');
    });

    it('should handle custom shaders with additional buffers', () => {
        const vertexShader = `
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(1) @binding(0) var<uniform> customData: vec4f;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    let model = objectMatrices[i_idx];
    output.position = model * vec4f(in.position, 1.0) + customData;
    return output;
}`;

        const fragmentShader = `
@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4f(1.0, 0.5, 0.0, 1.0); // Orange
}`;

        // Create buffer data - WebGPU view will handle buffer creation
        const customData = new Float32Array([1.0, 0.5, 0.2, 1.0]);

        const customShader = new CustomRenderShader(
            'shader-with-buffer',
            vertexShader,
            fragmentShader,
            [
                {
                    binding: 0,
                    size: customData.byteLength,
                    data: customData,
                    type: 'uniform',
                    visibility: 0x1 // GPUShaderStage.VERTEX
                }
            ]
        );

        const entity = new Entity('buffered', vec4(0, 0, 0, 1));
        const mesh = {
            id: 'test-mesh',
            vertices: new Float32Array([0, 0, 0]),
            normals: new Float32Array([0, 1, 0]),
            uvs: new Float32Array([0, 0]),
            indices: new Uint32Array([0])
        };

        entity.addComponent(new MeshComponent(mesh));
        entity.addComponent(customShader);

        const shader = entity.getComponent(CustomRenderShader);
        expect(shader?.bufferSpecs.length).toBe(1);
        expect(shader?.bufferSpecs[0].binding).toBe(0);
        expect(shader?.bufferSpecs[0].type).toBe('uniform');
    });
});
