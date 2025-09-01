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
out vec4 worldPosition;

void main() {
    vec4 pos4 = vec4(position, 1.0);
    worldPosition = objectMatrix * pos4;
    
    // Transform: projection * camera * model * position
    gl_Position = projectionMatrix * cameraMatrix * worldPosition;
    fragPosition = pos4;
}
`;

export const fragmentShader = `#version 300 es
precision mediump float;

// Input from vertex shader
in vec4 fragPosition;
in vec4 worldPosition;

// Output color
out vec4 outColor;

// Lighting uniforms (simplified for now - we'll add these gradually)
uniform int numDirectLights;
uniform int numPointLights;

// Maximum lights supported (matching our buffer sizes)
const int MAX_DIRECT_LIGHTS = 8;
const int MAX_POINT_LIGHTS = 32;

// Light data arrays (these will be set via uniforms)
uniform vec4 directLightDirections[MAX_DIRECT_LIGHTS];
uniform vec4 directLightColors[MAX_DIRECT_LIGHTS];
uniform vec4 pointLightPositions[MAX_POINT_LIGHTS];
uniform vec4 pointLightColors[MAX_POINT_LIGHTS];
uniform float pointLightRadii[MAX_POINT_LIGHTS];

void main() {
    // Calculate normal using derivative functions
    vec3 dFdxPos = dFdx(worldPosition.xyz);
    vec3 dFdyPos = dFdy(worldPosition.xyz);
    vec3 normal = normalize(cross(dFdxPos, dFdyPos));
    
    // Base material color
    vec3 baseColor = vec3(0.7, 0.7, 0.8);
    
    // Ambient lighting
    float ambientStrength = 0.3;
    vec3 ambient = ambientStrength * baseColor;
    
    vec3 totalLighting = ambient;
    
    // Process directional lights
    for (int i = 0; i < numDirectLights && i < MAX_DIRECT_LIGHTS; i++) {
        vec3 lightDir = normalize(-directLightDirections[i].xyz);
        float diffuse = max(dot(normal, lightDir), 0.0);
        totalLighting += diffuse * directLightColors[i].xyz * directLightColors[i].w;
    }
    
    // Process point lights
    for (int i = 0; i < numPointLights && i < MAX_POINT_LIGHTS; i++) {
        vec3 lightDir = pointLightPositions[i].xyz - worldPosition.xyz;
        float distance = length(lightDir);
        
        if (distance < pointLightRadii[i]) {
            vec3 normalizedLightDir = lightDir / distance;
            float diffuse = max(dot(normal, normalizedLightDir), 0.0);
            float attenuation = 1.0 - (distance / pointLightRadii[i]);
            totalLighting += diffuse * pointLightColors[i].xyz * pointLightColors[i].w * attenuation;
        }
    }
    
    vec3 finalColor = totalLighting * baseColor;
    outColor = vec4(finalColor, 1.0);
}
`;