export const vertexShader = `#version 300 es
precision mediump float;

// Vertex input
in vec3 position;

// Uniforms - we'll update these per draw call rather than using large arrays
uniform mat4 objectMatrix; // Single model matrix per draw call
uniform mat4 cameraMatrix;
uniform mat4 projectionMatrix;

// Outputs to fragment shader
out vec4 fragPosition;

void main() {
    vec4 pos4 = vec4(position, 1.0);
    
    // Transform: projection * camera * model * position
    gl_Position = projectionMatrix * cameraMatrix * objectMatrix * pos4;
    fragPosition = pos4;
}
`;

export const fragmentShader = `#version 300 es
precision mediump float;

// Input from vertex shader
in vec4 fragPosition;

// Output color
out vec4 outColor;

void main() {
    // Example: color based on world position (normalized to [0,1])
    vec4 color = vec4(
        0.5 + 0.5 * fragPosition.x,
        0.5 + 0.5 * fragPosition.y,
        0.5 + 0.5 * fragPosition.z,
        1.0
    );
    outColor = color;
}
`;