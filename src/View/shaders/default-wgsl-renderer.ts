export const renderer = /*glsl*/`//its actually wgsl but i want to use syntax highlighting

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
    @location(1) worldNormal: vec3f,
};
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f
};



@group(0) @binding(0)
var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1)
var<uniform> view: mat4x4<f32>;
@group(0) @binding(2)
var<uniform> projectionMatrix: mat4x4<f32>;



@vertex
fn vertex_main(in: VertexIn,@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  let pos4 = vec4f(in.position, 1.0);
  // transform: projection * camera * model * position
  output.position = projectionMatrix * view * model * pos4;
  output.fragPosition = pos4;
  
  // Transform normal to world space (assuming uniform scaling)
  // For non-uniform scaling, we would need the inverse transpose of the model matrix
  output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
  
  return output;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    // Simple directional light
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let lightColor = vec3f(1.0, 1.0, 1.0);
    let ambientColor = vec3f(0.2, 0.2, 0.2);
    
    // Basic material color
    let materialColor = vec3f(0.7, 0.5, 0.3);
    
    // Calculate diffuse lighting using dot product of normal and light direction
    let dotNL = max(dot(fragData.worldNormal, lightDir), 0.0);
    let diffuse = lightColor * dotNL;
    
    // Combine ambient and diffuse lighting
    let finalColor = materialColor * (ambientColor + diffuse);
    
    return vec4f(finalColor, 1.0);
}
`