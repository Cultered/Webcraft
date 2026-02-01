import CustomRenderShader from '../CustomRenderShader';
import { CANVAS } from '../../../Controller/Controller';
import { MODEL } from '../../../Controller/Controller';
import { ShaderStage } from '../../../config/webgpu-constants';
const u_time = new Float32Array([Date.now() / 1000 % 1000]);
let x = 0;
let y = 0;
const u_mouse = new Float32Array([x, y]);
const u_size = new Float32Array([1, 1]);
const cameraPos = new Float32Array([0, 0, 0, 0]);

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
@group(1) @binding(0) var<uniform> u_time: f32;
@group(1) @binding(1) var<uniform> u_mouse: vec2f;
@group(1) @binding(2) var<uniform> u_size: vec2f;
@group(1) @binding(3) var<uniform> cameraPos: vec4f;

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
  var stx = (fragData.position.x/2.-u_mouse.x) / u_size.x /fragData.position.w;
  var sty = (fragData.position.y/2.-u_mouse.y) / u_size.y /fragData.position.w;
  var d = 0.0;

  stx = stx;
  sty = sty;

  // Add wave distortion based on u_time and UV coordinates
  let waveFrequency = 50.0;
  let waveAmplitude = 0.05;
  let waveX = sin(fragData.uv.y * waveFrequency + u_time) * waveAmplitude;
  let waveY = cos(fragData.uv.x * waveFrequency + u_time) * waveAmplitude;
  
  // Create distorted UV coordinates
  let newFragDataUV = vec2f(
    fragData.uv.x + waveX,
    fragData.uv.y + waveY
  );
  
    // Simple directional light
    let lightDir = normalize(vec3f(0.0, 1.0, 0.0));
    let lightColor = vec3f(1.0, 1.0, 1.0);
    let ambientColor = vec3f(0.26, 0.23, 0.2);
    
    
    // Sample texture color using distorted UV
    let textureColor = textureSample(diffuseTexture, textureSampler, newFragDataUV).rgb;
    
    // Calculate diffuse lighting using dot product of normal and light direction
    let dotNL = max(dot(fragData.worldNormal, lightDir), 0.0);
    let diffuse = lightColor * dotNL;
    
    // Combine ambient and diffuse lighting with texture color
    let finalColor = textureColor * (ambientColor + diffuse);


  return vec4f(finalColor, 1.0);
}
`;

// Create shader with buffer specification
const exampleRenderShader = new CustomRenderShader(
    'custom-color-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: u_time.byteLength, // Size in bytes
            data: u_time,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 1,
            size: u_mouse.byteLength, // Size in bytes
            data: u_mouse,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 2,
            size: u_size.byteLength, // Size in bytes
            data: u_size,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 3,
            size: cameraPos.byteLength, // Size in bytes
            data: cameraPos,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        }
    ]
);

exampleRenderShader.update = () => {
    exampleRenderShader.bufferSpecs[0].data = new Float32Array([Date.now() / 1000 % 1000]);
    const rect = CANVAS.getBoundingClientRect();
    CANVAS.addEventListener('mousemove', (e) => {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    });
    exampleRenderShader.bufferSpecs[1].data = new Float32Array([x, y]);
    exampleRenderShader.bufferSpecs[2].data = new Float32Array([rect.width, rect.height]);
    exampleRenderShader.bufferSpecs[3].data = MODEL.getCamera('main-camera')?.position ? new Float32Array(MODEL.getCamera('main-camera')!.position.slice(0, 4)) : new Float32Array([0, 0, 0, 0]);
}
export default exampleRenderShader;