import CustomRenderShader from '../CustomRenderShader';
import { MODEL } from '../../../Controller/Controller';
import { ShaderStage } from '../../../config/webgpu-constants';

// Uniforms for the skybox shader
const u_time = new Float32Array([0.0]);
const cameraPos = new Float32Array([0, 0, 0, 0]);
const sunDir = new Float32Array([0.5, 0.15, -0.85, 0.0]); // Sun direction (normalized in shader)

// Vertex shader for skybox
const vertexShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) worldNormal: vec3f,
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

@group(1) @binding(0) var<uniform> u_time: f32;
@group(1) @binding(1) var<uniform> cameraPos: vec4f;
@group(1) @binding(2) var<uniform> sunDir: vec4f;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    let model = objectMatrices[i_idx];
    output.position = projectionMatrix * view * model * vec4f(in.position, 1.0);
    output.worldNormal = normalize(in.position);
    return output;
}
`;

const fragmentShader = /*wgsl*/`
// Hash function for procedural noise
fn hash(p: vec3f) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Smooth noise
fn noise(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(
            mix(hash(i + vec3f(0.0, 0.0, 0.0)), hash(i + vec3f(1.0, 0.0, 0.0)), u.x),
            mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), u.x),
            u.y
        ),
        mix(
            mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), u.x),
            mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), u.x),
            u.y
        ),
        u.z
    );
}

// Fractal Brownian Motion for clouds
fn fbm(p: vec3f) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var pos = p;
    
    for (var i = 0; i < 5; i++) {
        value += amplitude * noise(pos);
        pos *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let V = normalize(fragData.worldNormal);
    let L = normalize(sunDir.xyz);
    
    // Sky gradient based on view direction
    let sunHeight = L.y;
    let viewHeight = V.y;
    
    // Atmospheric scattering approximation
    let cosGamma = dot(V, L);
    let gamma = acos(clamp(cosGamma, -1.0, 1.0));
    
    // Base sky colors - interpolate based on sun position
    // Zenith color (looking straight up)
    let dayZenith = vec3f(0.15, 0.35, 0.65);
    let sunsetZenith = vec3f(0.15, 0.20, 0.45);
    let nightZenith = vec3f(0.02, 0.03, 0.08);
    
    // Horizon color
    let dayHorizon = vec3f(0.55, 0.70, 0.90);
    let sunsetHorizon = vec3f(0.95, 0.30, 0.25);
    let nightHorizon = vec3f(0.05, 0.08, 0.15);
    
    // Time of day factor based on sun height
    let dayFactor = smoothstep(-0.1, 0.3, sunHeight);
    let sunsetFactor = smoothstep(-0.1, 0.0, sunHeight) * smoothstep(0.3, 0.0, sunHeight);
    
    // Interpolate sky colors
    var zenithColor = mix(nightZenith, dayZenith, dayFactor);
    zenithColor = mix(zenithColor, sunsetZenith, sunsetFactor * 0.8);
    
    var horizonColor = mix(nightHorizon, dayHorizon, dayFactor);
    horizonColor = mix(horizonColor, sunsetHorizon, sunsetFactor);
    
    // Vertical gradient from horizon to zenith
    let heightGradient = pow(max(viewHeight, 0.0), 0.5);
    var skyColor = mix(horizonColor, zenithColor, heightGradient);
    
    // Mie scattering (glow around sun)
    let miePhase = pow(max(cosGamma, 0.0), 8.0);
    let mieColor = mix(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 0.95, 0.8), dayFactor);
    let mieIntensity = mix(0.0, 1.0, dayFactor);
    skyColor = skyColor + mieColor * miePhase*5.5* mieIntensity * (0.2 + sunsetFactor * 0.5);
    
    // Rayleigh scattering (blue tint away from sun)
    let rayleighPhase = 0.75 * (1.0 + cosGamma * cosGamma);
    let rayleighColor = vec3f(0.3, 0.5, 1.0) * rayleighPhase * 0.05 * dayFactor;
    skyColor = skyColor + rayleighColor;

    let sunCore = smoothstep(0.999, 1.0, cosGamma);
    var sunColor = vec3f(1.0, 0.98, 0.9);
    sunColor = vec3f(1.0, 1.0, 0.95) * sunCore * 2.0;

    // Sun color changes at sunset
    let sunTint = mix(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 1.0, 0.95), dayFactor);
    sunColor = sunColor * sunTint;
    skyColor = skyColor + sunColor * 3.0;
    
    // Subtle clouds using noise
    let cloudPos = V * 3.0 + vec3f(u_time * 0.01, 0.0, u_time * 0.005);
    let cloudNoise = fbm(cloudPos);
    let cloudDensity = smoothstep(0.4, 0.7, cloudNoise);
    
    // Cloud color based on time of day
    let cloudLit = max(0.0, dot(normalize(vec3f(V.x, 0.0, V.z)), L));
    var cloudColor = mix(vec3f(0.8, 0.85, 0.95), vec3f(1.0, 0.95, 0.85), cloudLit);
    cloudColor = mix(cloudColor * 0.0, cloudColor, dayFactor);
    cloudColor = mix(cloudColor, vec3f(1.0, 0.7, 0.5), sunsetFactor * cloudLit);
    
    // Only show clouds above horizon
    let cloudMask = smoothstep(0.0, 0.2, viewHeight) * (1.0 - smoothstep(0.5, 0.9, viewHeight));
    skyColor = mix(skyColor, cloudColor, cloudDensity * cloudMask * 0.6);
    
    // Stars at night (only visible when sun is below horizon)
    let nightBlend = smoothstep(0.1, -0.7, sunHeight);
    if (nightBlend > 0.01) {
        let starPos = floor(V * 200.0);
        let star = hash(starPos);
        let starBrightness = step(0.995, star) * nightBlend;
        
        skyColor = skyColor + vec3f(1.0, 1.0, 0.95) * starBrightness;
    }
    
    // Ground color (below horizon)
    let groundBlend = smoothstep(0.0, -0.05, viewHeight);
    let groundColor = mix(vec3f(0.15, 0.12, 0.10), vec3f(0.25, 0.22, 0.18), dayFactor);
    skyColor = mix(skyColor, groundColor, groundBlend);
    
    // Tone mapping (simple Reinhard)
    skyColor = skyColor / (skyColor + vec3f(1.0));
    
    // Gamma correction
    skyColor = pow(skyColor, vec3f(1.0 / 2.2));
    
    return vec4f(skyColor, 1.0);
}
`;

// Create shader with front culling (we're inside the skybox sphere)
const skyboxShader = new CustomRenderShader(
    'skybox-shader',
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
        },
        {
            binding: 2,
            size: sunDir.byteLength,
            data: sunDir,
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        }
    ],
    [],
    {
        cullMode: 'front', // Inside the skybox sphere
        depthWriteEnabled: false // Skybox should not write to depth buffer
    }
);

// Update function to animate the skybox
skyboxShader.update = () => {
    // Update time
    skyboxShader.bufferSpecs[0].data = new Float32Array([Date.now() / 1000 % 10000]);
    
    // Update camera position (for potential parallax effects)
    const camera = MODEL.getCamera('main-camera');
    if (camera?.position) {
        skyboxShader.bufferSpecs[1].data = new Float32Array(camera.position.slice(0, 4));
    }

    // Sun direction - animate slowly for day/night cycle
    // Or keep static for a fixed time of day
    const sunAngle = Date.now() / 10000; // Very slow rotation
    const sunX = Math.cos(sunAngle) * 0.8;
    const sunY = Math.sin(sunAngle) * 0.3 + 0.2; // Keep sun relatively high
    const sunZ = Math.sin(sunAngle) * 0.5;
    const len = Math.sqrt(sunX * sunX + sunY * sunY + sunZ * sunZ);
    skyboxShader.bufferSpecs[2].data = new Float32Array([sunX / len, sunY / len, sunZ / len, 0.0]);
};

export default skyboxShader;
