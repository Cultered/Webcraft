import { describe, it, expect } from 'vitest';
import Entity from '../src/Model/Entity';
import MeshComponent from '../src/Model/Components/MeshComponent';
import CustomRenderShader from '../src/Model/Components/CustomRenderShader';
import { vec4 } from '../src/misc/vec4';
import { mat4 } from '../src/misc/mat4';

describe('CustomRenderShader Component', () => {
    it('should create a CustomRenderShader component with shader code', () => {
        const vertexShader = `
@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    output.position = vec4f(in.position, 1.0);
    return output;
}`;

        const fragmentShader = `
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0); // Red color
}`;

        const customShader = new CustomRenderShader(
            'test-shader',
            vertexShader,
            fragmentShader
        );

        expect(customShader.id).toBe('test-shader');
        expect(customShader.vertexShader).toBe(vertexShader);
        expect(customShader.fragmentShader).toBe(fragmentShader);
        expect(customShader.bufferSpecs).toEqual([]);
    });

    it('should attach CustomRenderShader to an entity', () => {
        const entity = new Entity(
            'test-entity',
            vec4(0, 0, 0, 1),
            mat4(),
            vec4(1, 1, 1, 1)
        );

        const vertexShader = '@vertex\nfn vertex_main() -> @builtin(position) vec4f { return vec4f(0.0); }';
        const fragmentShader = '@fragment\nfn fragment_main() -> @location(0) vec4f { return vec4f(1.0); }';

        const customShader = new CustomRenderShader(
            'entity-shader',
            vertexShader,
            fragmentShader
        );

        entity.addComponent(customShader);

        const retrieved = entity.getComponent(CustomRenderShader);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe('entity-shader');
    });

    it('should allow custom shader with additional buffers', () => {
        // Create buffer data (WebGPU device will create actual GPU buffers)
        const bufferData = new Float32Array([1.0, 0.5, 0.2, 1.0]);

        const customShader = new CustomRenderShader(
            'shader-with-buffers',
            'vertex code',
            'fragment code',
            [
                {
                    binding: 0,
                    size: bufferData.byteLength,
                    data: bufferData,
                    type: 'uniform',
                    visibility: 0x1 // GPUShaderStage.VERTEX
                }
            ]
        );

        expect(customShader.bufferSpecs).toHaveLength(1);
        expect(customShader.bufferSpecs[0].binding).toBe(0);
        expect(customShader.bufferSpecs[0].type).toBe('uniform');
        expect(customShader.bufferSpecs[0].size).toBe(16);
    });

    it('should work alongside MeshComponent on the same entity', () => {
        const entity = new Entity('test-combo', vec4(0, 0, 0, 1));

        const mesh = {
            id: 'test-mesh',
            vertices: new Float32Array([0, 0, 0]),
            normals: new Float32Array([0, 1, 0]),
            uvs: new Float32Array([0, 0]),
            indices: new Uint32Array([0])
        };

        const meshComponent = new MeshComponent(mesh);
        const customShader = new CustomRenderShader(
            'combo-shader',
            'vertex',
            'fragment'
        );

        entity.addComponent(meshComponent);
        entity.addComponent(customShader);

        expect(entity.getComponent(MeshComponent)).toBeDefined();
        expect(entity.getComponent(CustomRenderShader)).toBeDefined();
    });

    it('should support optional pipeline settings', () => {
        const customShader = new CustomRenderShader(
            'shader-with-settings',
            'vertex code',
            'fragment code',
            [],
            {
                cullMode: 'none',
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
                blend: {
                    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                }
            }
        );

        expect(customShader.pipelineSettings).toBeDefined();
        expect(customShader.pipelineSettings?.cullMode).toBe('none');
        expect(customShader.pipelineSettings?.depthWriteEnabled).toBe(false);
        expect(customShader.pipelineSettings?.depthCompare).toBe('less-equal');
        expect(customShader.pipelineSettings?.blend).toBeDefined();
        expect(customShader.pipelineSettings?.blend?.color.srcFactor).toBe('one');
    });

    it('should work without pipeline settings (use defaults)', () => {
        const customShader = new CustomRenderShader(
            'shader-default-settings',
            'vertex code',
            'fragment code'
        );

        expect(customShader.pipelineSettings).toBeUndefined();
    });

    it('should allow partial pipeline settings', () => {
        const customShader = new CustomRenderShader(
            'shader-partial-settings',
            'vertex code',
            'fragment code',
            [],
            {
                cullMode: 'front',
                depthWriteEnabled: false
                // depthCompare and blend will use defaults
            }
        );

        expect(customShader.pipelineSettings?.cullMode).toBe('front');
        expect(customShader.pipelineSettings?.depthWriteEnabled).toBe(false);
        expect(customShader.pipelineSettings?.depthCompare).toBeUndefined();
        expect(customShader.pipelineSettings?.blend).toBeUndefined();
    });

    it('should support null blend to disable blending (opaque rendering)', () => {
        const customShader = new CustomRenderShader(
            'opaque-shader',
            'vertex code',
            'fragment code',
            [],
            {
                blend: null  // Explicitly disable blending
            }
        );

        expect(customShader.pipelineSettings?.blend).toBeNull();
    });
});
