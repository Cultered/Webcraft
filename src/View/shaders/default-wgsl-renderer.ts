export const renderer = /*glsl*/`//its actually wgsl but i want to use syntax highlighting

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
    @location(1) worldPosition: vec4f,
    @location(2) normal: vec3f,
};
struct VertexIn {
  @location(0) position: vec3f
};

struct Matrices { m: array<mat4x4<f32>> }

struct DirectLight {
    direction: vec4f,
    color: vec4f,
};

struct PointLight {
    position: vec4f,
    color: vec4f,
    radius: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
};

struct LightingConfig {
    numDirectLights: u32,
    numPointLights: u32,
    padding1: u32,
    padding2: u32,
};

@group(0) @binding(0)
var<storage, read> objectMatrices: Matrices;
@group(0) @binding(1)
var<storage, read> cameraMatrix: mat4x4<f32>;
@group(0) @binding(2)
var<storage, read> projectionMatrix: mat4x4<f32>;
@group(0) @binding(3)
var<storage, read> directLights: array<DirectLight>;
@group(0) @binding(4)
var<storage, read> pointLights: array<PointLight>;
@group(0) @binding(5)
var<storage, read> lightingConfig: LightingConfig;

@vertex
fn vertex_main(in: VertexIn,@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices.m[i_idx];
  let pos4 = vec4f(in.position, 1.0);
  let worldPos = model * pos4;
  
  // transform: projection * camera * model * position
  output.position = projectionMatrix * cameraMatrix * worldPos;
  output.fragPosition = pos4;
  output.worldPosition = worldPos;
  
  // Calculate normal using cross product of triangle edges
  // We'll compute this in the fragment shader since we need neighboring vertices
  output.normal = vec3f(0.0, 1.0, 0.0); // placeholder, will be computed in fragment
  
  return output;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    // Calculate normal using derivative functions for flat shading
    let dFdxPos = dpdx(fragData.worldPosition.xyz);
    let dFdyPos = dpdy(fragData.worldPosition.xyz);
    let normal = normalize(cross(dFdxPos, dFdyPos));
    
    // Base material color (slight variation based on position)
    let baseColor = vec3f(0.7, 0.7, 0.8);
    
    // Ambient lighting
    let ambientStrength = 0.3;
    let ambient = ambientStrength * baseColor;
    
    var totalLighting = ambient;
    
    // Process directional lights
    for (var i = 0u; i < lightingConfig.numDirectLights && i < 8u; i++) {
        let light = directLights[i];
        let lightDir = normalize(-light.direction.xyz);
        let diffuse = max(dot(normal, lightDir), 0.0);
        totalLighting += diffuse * light.color.xyz * light.color.w; // w is intensity
    }
    
    // Process point lights
    for (var i = 0u; i < lightingConfig.numPointLights && i < 32u; i++) {
        let light = pointLights[i];
        let lightDir = light.position.xyz - fragData.worldPosition.xyz;
        let distance = length(lightDir);
        
        if (distance < light.radius) {
            let normalizedLightDir = lightDir / distance;
            let diffuse = max(dot(normal, normalizedLightDir), 0.0);
            let attenuation = 1.0 - (distance / light.radius);
            totalLighting += diffuse * light.color.xyz * light.color.w * attenuation;
        }
    }
    
    let finalColor = totalLighting * baseColor;
    return vec4f(finalColor, 1.0);
}
`