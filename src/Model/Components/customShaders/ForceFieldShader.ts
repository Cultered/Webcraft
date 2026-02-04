import { ShaderStage } from '../../../config/webgpu-constants';
import { CustomRenderShader } from '../CustomRenderShader';
import { MODEL } from '../../../Controller/Controller';





// Uniforms for the skybox shader
const u_time = new Float32Array([0.0]);
const cameraPos = new Float32Array([0, 0, 0, 0]);



// Vertex shader with group 1 binding
const vertexShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) worldPosition: vec4f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
    @location(3) viewDir: vec3f,
};
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};



@group(0) @binding(0)
var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1)
var<uniform> view: mat4x4<f32>;
@group(0) @binding(2)
var<uniform> projectionMatrix: mat4x4<f32>;
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


@group(1) @binding(0) var<uniform> u_time: f32;
@group(1) @binding(1) var<uniform> cameraPos: vec4f;


@vertex
fn vertex_main(in: VertexIn,@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  let pos4 = vec4f(in.position, 1.0);
  output.position = projectionMatrix * view * model * pos4;
  let worldPosition = model * pos4;
  output.worldPosition = worldPosition;
  
  output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
  
  output.viewDir = normalize(cameraPos.xyz - worldPosition.xyz);
  output.uv = in.uv;
  
  return output;
}
`;

const fragmentShader = /*wgsl*/`
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let lightDir = normalize(globalLightDirection.xyz);
    let lightColor = globalLightColor.rgb;
    let ambientColor = globalAmbientColor.rgb;
    
    let textureColor = textureSample(diffuseTexture, textureSampler, fragData.uv).rgb;
    
    let dotNL = max(dot(fragData.worldNormal, lightDir), 0.0);
    let diffuse = lightColor * dotNL;
    
    let finalColor = textureColor * (ambientColor + diffuse);


    let forcefieldIntensity = 1.-abs(dot(fragData.worldNormal, fragData.viewDir) );
    
    return vec4f(finalColor, forcefieldIntensity);
}
`;

// Create shader with front culling (we're inside the skybox sphere)
const forceFieldShader = new CustomRenderShader(
  'forcefield-shader',
  vertexShader,
  fragmentShader,
  [
    {
      binding: 0,
      size: u_time.byteLength,
      data: u_time,
      type: 'uniform',
      visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
    },
    {
      binding: 1,
      size: cameraPos.byteLength,
      data: cameraPos,
      type: 'uniform',
      visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
    }
  ],
  [],
  {
    cullMode: 'back', 
    depthWriteEnabled: false,
    priority: -1, // Render after default opaque objects
  }
);

forceFieldShader.update = function () {
  u_time[0] += 0.016; // Assuming ~60 FPS, increment time
  this.bufferSpecs[0].data = u_time;
  const cam = MODEL.getCamera('main-camera');
  if (cam) {
    const pos = cam.position;
    cameraPos[0] = pos[0];
    cameraPos[1] = pos[1];
    cameraPos[2] = pos[2];
    cameraPos[3] = 1.0;
    this.bufferSpecs[1].data = cameraPos;
  }
}

export default forceFieldShader;