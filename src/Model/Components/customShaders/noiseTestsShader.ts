import CustomRenderShader from '../CustomRenderShader';
import { webgpu_utils } from '../../../misc/le_personal_wgpu_utils';
import { ShaderStage } from '../../../config/webgpu-constants';
const u_time = new Float32Array([Date.now() / 1000 % 1000]);
// Vertex shader with group 1 binding
const vertexShader = /*wgsl*/`
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
@group(0) @binding(5)
var<uniform> globalLightDirection: vec4f;
@group(0) @binding(6)
var<uniform> globalLightColor: vec4f;
@group(0) @binding(7)
var<uniform> globalAmbientColor: vec4f;


// Custom buffer in group 1
@group(1) @binding(0) var<uniform> u_time: f32;

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

const fragmentShader = /*wgsl*/`
${webgpu_utils}
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let uv = fragData.uv;
    let waveUv = uv + vec2f(u_time*0.01, u_time*0.01);
    let fbmf = fbm(uv * 3.0 + vec2f(-u_time*0.03, u_time*0.03));
    let fbmwaveUv = waveUv + fbmf/2+0.5;
    let outx = sin(dot(fbmwaveUv*100,vec2f(1,1)));
    let outy = cos(dot(fbmwaveUv*100,vec2f(1,1)));
    

  return vec4f(outx, fbmf, outy, 1.0);
}
`;

// Create shader with buffer specification
const noiseTestsShader = new CustomRenderShader(
    'noise-test-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: u_time.byteLength, // Size in bytes
            data: u_time,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        }
    ]
);

noiseTestsShader.update = () => {
    noiseTestsShader.bufferSpecs[0].data = new Float32Array([Date.now() / 1000 % 1000]);
}
export default noiseTestsShader;