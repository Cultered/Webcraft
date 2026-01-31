import CustomRenderShader from '../CustomRenderShader';

// Vertex shader with group 1 binding
const vertexShader = /*glsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
    @location(3) worldPosition: vec4f,
};
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;
@group(0) @binding(3)
var textureSampler: sampler;
@group(0) @binding(4)
var diffuseTexture: texture_2d<f32>;


// Custom buffer in group 1


@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  output.position = projectionMatrix * view * model * vec4f(in.position, 1.0);
  output.uv = in.uv;
  output.worldPosition = (model * vec4f(in.position, 1.0));
  output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
  return output;
}
`;

const fragmentShader = /*glsl*/`

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
  
  return vec4f(fragData.uv.x, fragData.uv.y, 0.0, 1.0);
}
`;

// Create shader with buffer specification
const exampleTextureShader = new CustomRenderShader(
    'custom-texture-shader',
    vertexShader,
    fragmentShader,
    [],
    {
        cullMode: 'none'
    }
);

export default exampleTextureShader;