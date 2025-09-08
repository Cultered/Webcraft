export const vertexShader = /*glsl*/`#version 300 es
precision mediump float;

// Vertex input
in vec3 position;
in vec3 normal;

uniform mat4 objectMatrix; 
uniform mat4 cameraMatrix;
uniform mat4 projectionMatrix;

// Outputs to fragment shader
out vec4 fragPosition;
out vec3 worldNormal;

void main() {
    vec4 pos4 = vec4(position, 1.0);
    
    // Transform: projection * camera * model * position
    gl_Position = projectionMatrix * cameraMatrix * objectMatrix * pos4;
    fragPosition = pos4;
    
    // Transform normal to world space (assuming uniform scaling)
    // For non-uniform scaling, we would need the inverse transpose of the model matrix
    worldNormal = normalize((objectMatrix * vec4(normal, 0.0)).xyz);
}
`;

export const fragmentShader = /*glsl*/`#version 300 es
precision mediump float;

// Input from vertex shader
in vec4 fragPosition;
in vec3 worldNormal;

// Output color
out vec4 outColor;

void main() {
    // Simple directional light
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 lightColor = vec3(1.0, 1.0, 1.0);
    vec3 ambientColor = vec3(0.2, 0.2, 0.2);
    
    // Basic material color
    vec3 materialColor = vec3(0.7, 0.5, 0.3);
    
    // Calculate diffuse lighting using dot product of normal and light direction
    float dotNL = max(dot(worldNormal, lightDir), 0.0);
    vec3 diffuse = lightColor * dotNL;
    
    // Combine ambient and diffuse lighting
    vec3 finalColor = materialColor * (ambientColor + diffuse);
    
    outColor = vec4(finalColor, 1.0);
}
`;