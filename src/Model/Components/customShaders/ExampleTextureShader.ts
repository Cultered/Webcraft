import CustomRenderShader from '../CustomRenderShader';
import { VIEW } from '../../../Controller/Controller';
import normalMap from '../../../misc/normalMapTexture.jpg'
import { loadImageData } from '../../../misc/loadFiles';
import { DELTA_TIME } from '../../../Controller/Controller';
import { ShaderStage } from '../../../config/webgpu-constants';

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

// Custom texture in group 2
@group(2) @binding(0)
var normalMapTexture: texture_2d<f32>;


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
    // Simple directional light
    let lightDir = normalize(vec3f(0.0, 3.0, 1.0));
    let lightColor = vec3f(1.0, 1.0, 1.0);
    let ambientColor = vec3f(0.2, 0.2, 0.2);
    
    // Sample texture color
    let textureColor = textureSample(diffuseTexture, textureSampler, fragData.uv).rgb;
    let normalMapColor = textureSample(normalMapTexture, textureSampler, fragData.uv).rgb;
    
    // Convert normal map from [0,1] to [-1,1] range
    let tangentNormal = normalize(normalMapColor * 2.0 - 1.0);
    
    // Use the perturbed normal for lighting (simplified - mixing with world normal)
    let perturbedNormal = normalize(fragData.worldNormal + tangentNormal * 0.5);
    
    // Calculate diffuse lighting using dot product of perturbed normal and light direction
    let dotNL = max(dot(perturbedNormal, lightDir), 0.0);
    let diffuse = lightColor * dotNL;
    
    // Combine ambient and diffuse lighting with texture color
    let finalColor = textureColor * (ambientColor + diffuse);
    
    return vec4f(finalColor, 1.0);
}
`;

// Create shader with buffer specification
const exampleTextureShader = new CustomRenderShader(
    'custom-texture-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: 4, // Size in bytes
            data: new Float32Array([0]),             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
    ],
    //texture buffer specs
    [
        {
            binding: 0,
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
            textureId: 'normalMapTexture'
        }
    ],
    {
        cullMode: 'none'
    }
);

const imageData = await loadImageData(normalMap);
let texture:GPUTexture;
exampleTextureShader.start = async function () {
    // Load texture data
    texture = VIEW.th!.addTexture('normalMapTexture', imageData);
    // Create GPU texture
    }

export default exampleTextureShader;