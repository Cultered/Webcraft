import CustomRenderShader from '../CustomRenderShader';
import { webgpu_utils } from '../../../misc/le_personal_wgpu_utils';
import { ShaderStage } from '../../../config/webgpu-constants';
import { MODEL } from '../../../Controller/Controller';

const u_time = new Float32Array([0.0]);
const cameraPos = new Float32Array([0, 0, 0, 0]);

const vertexShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) viewDir: vec3f,
    @location(2) worldNormal: vec3f,
};

struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
};

@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5) var<uniform> globalLightDirection: vec4f;
@group(0) @binding(6) var<uniform> globalLightColor: vec4f;
@group(0) @binding(7) var<uniform> globalAmbientColor: vec4f;

@group(1) @binding(0) var<uniform> u_time: f32;
@group(1) @binding(1) var<uniform> cameraPos: vec4f;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    let model = objectMatrices[i_idx];
    let worldPos4 = model * vec4f(in.position, 1.0);
    output.worldPos = worldPos4.xyz;
    // Calculate view direction from camera to this vertex
    output.viewDir = normalize(worldPos4.xyz - cameraPos.xyz);
    // Pass world normal for fresnel edge detection
    output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
    output.position = projectionMatrix * view * worldPos4;
    return output;
}
`;

const fragmentShader = /*wgsl*/`
${webgpu_utils}


@fragment
fn fragment_main(fragData:VertexOut) -> @location(0) vec4f {

    let modelScale = 100.;
    
    let edges = pow(1.-abs(dot(fragData.worldNormal, fragData.viewDir) ),5.0);
    let p = fragData.worldPos / modelScale;
    let q = vec3f(fbm3D(p + vec3f(0.0, 0.0, u_time * 0.1)),
                    fbm3D(p + vec3f(5.2, 1.3, u_time * 0.1)),
                    fbm3D(p + vec3f(8.5, 2.8, u_time * 0.1)));
    let r = vec3f(fbm3D(p + q + vec3f(1.7, 9.2, u_time * 0.1)),
                    fbm3D(p + q + vec3f(8.3, 2.8, u_time * 0.1)),
                    fbm3D(p + q + vec3f(2.5, 4.7, u_time * 0.1)));
    let color1 = vec3f(1.0, 0.5, 1.0);
    let color2 = vec3f(0.3, 1.0, 1.0);
    let color3 = vec3f(0.0, 0.0, 1.);
    let color4 = vec3f(0.0, 0.0, 0.0);
    let color5 = vec3f(0.2, 0.8, 0.4);

    let texture1 = mix(color4, color3, smoothstep(0.2, 0.5, r.x));
    let texture2 = mix(color2, color1, smoothstep(0.4, 0.7, r.y));
    let texture3 = mix(color5, texture2, smoothstep(0.3, 0.6, r.z));
    let texture = texture1 + texture3;

    let color = edges * vec3f(0.3, 1.0, 1.) + texture * vec3f(1.0, 0.5, 1.0);
    
    
    return vec4f(color, 1.0);
}
`;

const nebulaShader = new CustomRenderShader(
    'nebula-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: 4,
            data: u_time,
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT
        },
        {
            binding: 1,
            size: 16,
            data: cameraPos,
            type: 'uniform',
            visibility: ShaderStage.VERTEX
        },
    ],
    [],
    {
        cullMode: 'back',
        blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
    }
);

nebulaShader.update = function () {
    u_time[0] = (Date.now() / 1000) % 1000;
    
    // Get camera position
    const cam = MODEL.getCamera('main-camera');
    if (cam) {
        cameraPos[0] = cam.position[0];
        cameraPos[1] = cam.position[1];
        cameraPos[2] = cam.position[2];
        cameraPos[3] = 1;
    }
};

export default nebulaShader;
