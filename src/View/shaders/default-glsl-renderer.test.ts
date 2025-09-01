import { describe, it, expect } from 'vitest';
import { vertexShader, fragmentShader } from './default-glsl-renderer';

describe('GLSL Shader Tests', () => {
    it('should export vertex shader with correct structure', () => {
        expect(vertexShader).toBeDefined();
        expect(vertexShader).toContain('#version 300 es');
        expect(vertexShader).toContain('in vec3 position');
        expect(vertexShader).toContain('uniform mat4 objectMatrix');
        expect(vertexShader).toContain('uniform mat4 cameraMatrix');
        expect(vertexShader).toContain('uniform mat4 projectionMatrix');
        expect(vertexShader).toContain('out vec4 fragPosition');
        expect(vertexShader).toContain('gl_Position = projectionMatrix * cameraMatrix * objectMatrix * pos4');
    });

    it('should export fragment shader with correct structure', () => {
        expect(fragmentShader).toBeDefined();
        expect(fragmentShader).toContain('#version 300 es');
        expect(fragmentShader).toContain('in vec4 fragPosition');
        expect(fragmentShader).toContain('out vec4 outColor');
        expect(fragmentShader).toContain('0.5 + 0.5 * fragPosition.x');
        expect(fragmentShader).toContain('0.5 + 0.5 * fragPosition.y');
        expect(fragmentShader).toContain('0.5 + 0.5 * fragPosition.z');
    });

    it('should have similar coloring logic to WGSL version', () => {
        // Verify that the fragment shader produces colors based on world position
        // This ensures feature parity with the WGSL shader
        expect(fragmentShader).toContain('vec4 color = vec4(');
        expect(fragmentShader).toContain('0.5 + 0.5 * fragPosition');
        expect(fragmentShader).toContain('outColor = color');
    });
});