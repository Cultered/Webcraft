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
        expect(vertexShader).toContain('out vec4 worldPosition');
        expect(vertexShader).toContain('gl_Position = projectionMatrix * cameraMatrix * worldPosition');
    });

    it('should export fragment shader with lighting support', () => {
        expect(fragmentShader).toBeDefined();
        expect(fragmentShader).toContain('#version 300 es');
        expect(fragmentShader).toContain('in vec4 fragPosition');
        expect(fragmentShader).toContain('in vec4 worldPosition');
        expect(fragmentShader).toContain('out vec4 outColor');
        
        // Check for lighting uniforms
        expect(fragmentShader).toContain('uniform int numDirectLights');
        expect(fragmentShader).toContain('uniform int numPointLights');
        expect(fragmentShader).toContain('uniform vec4 directLightDirections');
        expect(fragmentShader).toContain('uniform vec4 pointLightPositions');
    });

    it('should have lighting calculation logic', () => {
        // Verify that the fragment shader calculates lighting
        expect(fragmentShader).toContain('normalize(cross(dFdxPos, dFdyPos))'); // Normal calculation
        expect(fragmentShader).toContain('ambientStrength'); // Ambient lighting
        expect(fragmentShader).toContain('totalLighting'); // Light accumulation
        expect(fragmentShader).toContain('finalColor'); // Final color calculation
        expect(fragmentShader).toContain('outColor = vec4(finalColor, 1.0)');
    });
});