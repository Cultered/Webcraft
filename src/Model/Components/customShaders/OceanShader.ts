import CustomRenderShader from '../CustomRenderShader';
import { MODEL, VIEW } from '../../../Controller/Controller';
import { ShaderStage } from '../../../config/webgpu-constants';
import seaTextureUrl from '../../../misc/seatexture.jpg';
import { loadImageData } from '../../../misc/loadFiles';

// Uniforms for the ocean shader
const u_time = new Float32Array([0.0]);
const cameraPos = new Float32Array([0, 0, 0, 0]);

// Vertex shader with wave displacement
const vertexShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
    @location(3) viewDir: vec3f,
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

// Custom sea texture in group 2
@group(2) @binding(0) var seaTexture: texture_2d<f32>;

// Hash function for vertex noise
fn hashV(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Smooth noise for vertex displacement
fn noiseV(p: vec2f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hashV(i + vec2f(0.0, 0.0)), hashV(i + vec2f(1.0, 0.0)), u.x),
        mix(hashV(i + vec2f(0.0, 1.0)), hashV(i + vec2f(1.0, 1.0)), u.x),
        u.y
    );
}

// FBM for vertex displacement
fn fbmV(p: vec2f, time: f32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var pos = p;
    for (var i = 0; i < 4; i++) {
        value += amplitude * noiseV(pos + time * 0.1 * f32(i + 1));
        pos *= 2.1;
        amplitude *= 0.5;
    }
    return value;
}

// Gerstner wave function - more realistic ocean waves
fn gerstnerWave(pos: vec2f, time: f32, direction: vec2f, steepness: f32, wavelength: f32) -> vec3f {
    let k = 2.0 * 3.14159265 / wavelength;
    let c = sqrt(9.8 / k);  // Wave speed based on wavelength (deep water approximation)
    let d = normalize(direction);
    let f = k * (dot(d, pos) - c * time);
    let a = steepness / k;
    
    return vec3f(
        d.x * a * cos(f),
        a * sin(f),
        d.y * a * cos(f)
    );
}

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
    var output: VertexOut;
    let model = objectMatrices[i_idx];
    
    var pos = in.position;
    let worldPos2D = (model * vec4f(pos, 1.0)).xz;
    
    // Combine multiple Gerstner waves for more complex motion
    var wave = vec3f(0.0);
    
    // Primary wave - large rolling waves
    wave += gerstnerWave(worldPos2D, u_time, vec2f(1.0, 0.3), 0.25, 60.0);
    // Secondary wave - crossing pattern
    wave += gerstnerWave(worldPos2D, u_time, vec2f(-0.7, 0.7), 0.15, 35.0);
    // Tertiary wave - smaller ripples
    wave += gerstnerWave(worldPos2D, u_time, vec2f(0.2, 1.0), 0.1, 20.0);
    // Detail waves - more variety
    wave += gerstnerWave(worldPos2D, u_time * 1.2, vec2f(0.8, -0.6), 0.08, 12.0);
    wave += gerstnerWave(worldPos2D, u_time * 1.5, vec2f(-0.4, -0.9), 0.05, 7.0);
    // Extra detail waves for less repetition
    wave += gerstnerWave(worldPos2D, u_time * 0.8, vec2f(0.5, 0.85), 0.06, 17.0);
    wave += gerstnerWave(worldPos2D, u_time * 1.1, vec2f(-0.9, 0.4), 0.04, 9.0);
    wave += gerstnerWave(worldPos2D, u_time * 1.7, vec2f(0.3, -0.95), 0.03, 5.0);
    
    // Add procedural noise for organic randomness
    let noiseDisplacement = fbmV(worldPos2D * 0.03, u_time) * 2.0 - 1.0;
    wave.y += noiseDisplacement * 0.8;
    
    pos.x += wave.x;
    pos.y += wave.y;
    pos.z += wave.z;
    
    // Calculate wave normal through partial derivatives
    let eps = 0.5;
    let waveL = gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time, vec2f(1.0, 0.3), 0.25, 60.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time, vec2f(-0.7, 0.7), 0.15, 35.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time, vec2f(0.2, 1.0), 0.1, 20.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time * 1.2, vec2f(0.8, -0.6), 0.08, 12.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time * 1.5, vec2f(-0.4, -0.9), 0.05, 7.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time * 0.8, vec2f(0.5, 0.85), 0.06, 17.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time * 1.1, vec2f(-0.9, 0.4), 0.04, 9.0)
              + gerstnerWave(worldPos2D + vec2f(-eps, 0.0), u_time * 1.7, vec2f(0.3, -0.95), 0.03, 5.0);
    let waveR = gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time, vec2f(1.0, 0.3), 0.25, 60.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time, vec2f(-0.7, 0.7), 0.15, 35.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time, vec2f(0.2, 1.0), 0.1, 20.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time * 1.2, vec2f(0.8, -0.6), 0.08, 12.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time * 1.5, vec2f(-0.4, -0.9), 0.05, 7.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time * 0.8, vec2f(0.5, 0.85), 0.06, 17.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time * 1.1, vec2f(-0.9, 0.4), 0.04, 9.0)
              + gerstnerWave(worldPos2D + vec2f(eps, 0.0), u_time * 1.7, vec2f(0.3, -0.95), 0.03, 5.0);
    let waveD = gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time, vec2f(1.0, 0.3), 0.25, 60.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time, vec2f(-0.7, 0.7), 0.15, 35.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time, vec2f(0.2, 1.0), 0.1, 20.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time * 1.2, vec2f(0.8, -0.6), 0.08, 12.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time * 1.5, vec2f(-0.4, -0.9), 0.05, 7.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time * 0.8, vec2f(0.5, 0.85), 0.06, 17.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time * 1.1, vec2f(-0.9, 0.4), 0.04, 9.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, -eps), u_time * 1.7, vec2f(0.3, -0.95), 0.03, 5.0);
    let waveU = gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time, vec2f(1.0, 0.3), 0.25, 60.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time, vec2f(-0.7, 0.7), 0.15, 35.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time, vec2f(0.2, 1.0), 0.1, 20.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time * 1.2, vec2f(0.8, -0.6), 0.08, 12.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time * 1.5, vec2f(-0.4, -0.9), 0.05, 7.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time * 0.8, vec2f(0.5, 0.85), 0.06, 17.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time * 1.1, vec2f(-0.9, 0.4), 0.04, 9.0)
              + gerstnerWave(worldPos2D + vec2f(0.0, eps), u_time * 1.7, vec2f(0.3, -0.95), 0.03, 5.0);
    
    // Add noise displacement to normal calculation
    let noiseL = fbmV((worldPos2D + vec2f(-eps, 0.0)) * 0.03, u_time) * 2.0 - 1.0;
    let noiseR = fbmV((worldPos2D + vec2f(eps, 0.0)) * 0.03, u_time) * 2.0 - 1.0;
    let noiseD = fbmV((worldPos2D + vec2f(0.0, -eps)) * 0.03, u_time) * 2.0 - 1.0;
    let noiseU = fbmV((worldPos2D + vec2f(0.0, eps)) * 0.03, u_time) * 2.0 - 1.0;
    
    let tangentX = vec3f(2.0 * eps + waveR.x - waveL.x, waveR.y - waveL.y + (noiseR - noiseL) * 0.4, waveR.z - waveL.z);
    let tangentZ = vec3f(waveU.x - waveD.x, waveU.y - waveD.y + (noiseU - noiseD) * 0.4, 2.0 * eps + waveU.z - waveD.z);
    let normal = normalize(cross(tangentZ, tangentX));
    
    let worldPosition = model * vec4f(pos, 1.0);
    output.position = projectionMatrix * view * worldPosition;
    output.worldPosition = worldPosition.xyz;
    output.worldNormal = normal;
    output.uv = in.uv;
    output.viewDir = normalize(cameraPos.xyz - worldPosition.xyz);
    
    return output;
}
`;

const fragmentShader = /*wgsl*/`
// Hash for procedural noise
fn hash(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// 2D noise
fn noise2D(p: vec2f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(hash(i + vec2f(0.0, 0.0)), hash(i + vec2f(1.0, 0.0)), u.x),
        mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
        u.y
    );
}

// Fractal Brownian Motion for foam and surface detail
fn fbm(p: vec2f) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var pos = p;
    
    for (var i = 0; i < 6; i++) {
        value += amplitude * noise2D(pos);
        pos *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// Fresnel effect (Schlick approximation)
fn fresnel(viewDir: vec3f, normal: vec3f, F0: f32) -> f32 {
    let cosTheta = max(dot(viewDir, normal), 0.0);
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let V = normalize(fragData.viewDir);
    let N = normalize(fragData.worldNormal);
    let L = normalize(globalLightDirection.xyz);
    
    // Calculate light intensity and color influence
    let lightIntensity = length(globalLightColor.rgb);
    let lightColorNorm = globalLightColor.rgb / max(lightIntensity, 0.001);
    // How much the sun is above the horizon (affects overall brightness)
    let sunHeight = max(L.y, 0.0);
    let dayBrightness = smoothstep(-0.1, 0.3, L.y);
    
    // Blend between ambient color (night) and sun color (day)
    let ambientColorNorm = globalAmbientColor.rgb / max(length(globalAmbientColor.rgb), 0.001);
    let effectiveLightColor = mix(ambientColorNorm, lightColorNorm, dayBrightness);
    
    // Sample sea texture with animated UV coordinates for flowing effect
    let textureScale = 0.008; // Scale texture tiling (smaller = bigger texture)
    let flowSpeed = 0.03;
    
    // Create two layers of texture with different flow directions for more natural look
    let uv1 = fragData.worldPosition.xz * textureScale + vec2f(u_time * flowSpeed, u_time * flowSpeed * 0.7);
    let uv2 = fragData.worldPosition.xz * textureScale * 0.6 + vec2f(-u_time * flowSpeed * 0.5, u_time * flowSpeed * 0.3);
    let uv3 = fragData.worldPosition.xz * textureScale * 1.2 + vec2f(u_time * flowSpeed * 0.2, -u_time * flowSpeed * 0.4);
    
    // Sample texture at different scales and blend
    let texColor1 = textureSample(seaTexture, textureSampler, uv1).rgb;
    let texColor2 = textureSample(seaTexture, textureSampler, uv2).rgb;
    let texColor3 = textureSample(seaTexture, textureSampler, uv3).rgb;
    
    // Blend texture layers
    let seaTexColor = (texColor1 * 0.5 + texColor2 * 0.3 + texColor3 * 0.2);
    
    // Deep ocean color palette - adjusted by light color and intensity
    let deepColorBase = vec3f(0.01, 0.03, 0.08);
    let shallowColorBase = vec3f(0.06, 0.22, 0.35);
    let surfaceColorBase = vec3f(0.12, 0.35, 0.45);
    
    // Tint ocean colors by effective light color (ambient at night, sun during day)
    let deepColor = deepColorBase * mix(vec3f(0.3), effectiveLightColor, 0.5) * (0.5 + dayBrightness * 0.5);
    let shallowColor = shallowColorBase * mix(vec3f(0.6), effectiveLightColor, 0.4) * (0.4 + dayBrightness * 0.6);
    let surfaceColor = surfaceColorBase * mix(vec3f(0.8), effectiveLightColor, 0.3) * (0.3 + dayBrightness * 0.7);
    
    // Calculate depth-based color (using normal y to simulate depth perception)
    let depthFactor = pow(max(N.y, 0.0), 0.5);
    var waterColor = mix(deepColor, shallowColor, depthFactor);
    waterColor = mix(waterColor, surfaceColor, pow(depthFactor, 2.0));
    
    // Blend procedural water color with sea texture (also tinted by effective light)
    // Use texture more in shallow/surface areas, less in deep areas
    let textureBlend = 0.55 + depthFactor * 0.2;
    let tintedTexColor = seaTexColor * vec3f(0.5, 0.7, 0.8) * mix(vec3f(0.7), effectiveLightColor, 0.3) * (0.4 + dayBrightness * 0.6);
    waterColor = mix(waterColor, tintedTexColor, textureBlend);
    
    // Fresnel reflection - water is more reflective at grazing angles
    let fresnelFactor = fresnel(V, N, 0.02);
    
    // Sky reflection color (adjusted by light color for sunset/sunrise)
    let R = reflect(-V, N);
    let skyReflectY = max(R.y, 0.0);
    let horizonColorBase = vec3f(0.55, 0.70, 0.90);
    let zenithColorBase = vec3f(0.15, 0.35, 0.65);
    // Tint sky reflection by effective light color
    let horizonColor = horizonColorBase * mix(vec3f(0.8), effectiveLightColor, 0.4) * (0.3 + dayBrightness * 0.7);
    let zenithColor = zenithColorBase * mix(vec3f(0.6), effectiveLightColor, 0.3) * (0.2 + dayBrightness * 0.8);
    let skyColor = mix(horizonColor, zenithColor, pow(skyReflectY, 0.5));
    
    // Sun reflection (specular highlight) - colored by light
    let sunDir = L;
    let sunReflect = reflect(-sunDir, N);
    let sunSpec = pow(max(dot(V, sunReflect), 0.0), 512.0);
    let sunGlitter = pow(max(dot(V, sunReflect), 0.0), 64.0);
    
    // Add sparkle/glitter effect on wave peaks
    let glitterNoise = fbm(fragData.worldPosition.xz * 2.0 + u_time * 0.5);
    let sparkle = smoothstep(0.6, 0.8, glitterNoise) * pow(max(dot(V, sunReflect), 0.0), 32.0);
    
    // Sun color based on directional light color
    let sunColor = globalLightColor.rgb * vec3f(1.0, 0.98, 0.95);
    let sunReflection = sunColor * (sunSpec * 3.0 + sunGlitter * 0.8 + sparkle * 0.5);
    
    // Sun path on water (elongated reflection)
    let sunPathFactor = smoothstep(0.7, 1.0, dot(normalize(vec3f(sunDir.x, 0.0, sunDir.z)), 
                                                   normalize(vec3f(R.x, 0.0, R.z))));
    let sunPath = sunColor * sunPathFactor * 0.15 * (1.0 - abs(N.y));
    
    // Subsurface scattering simulation (light passing through waves) - tinted by light
    let waveHeight = (N.y - 0.5) * 2.0; // Normalized wave height
    let sssAmount = pow(max(dot(V, -L), 0.0), 2.0) * max(1.0 - N.y, 0.0);
    let sssColor = vec3f(0.1, 0.4, 0.35) * lightColorNorm * sssAmount * 0.3 * dayBrightness;
    
    // Foam on wave crests (subtle) - tinted by effective light
    let foamNoise = fbm(fragData.worldPosition.xz * 0.3 + u_time * vec2f(0.1, 0.05));
    let foamThreshold = smoothstep(0.65, 0.85, foamNoise) * smoothstep(0.5, 0.9, N.y);
    let foamColor = vec3f(0.9, 0.95, 1.0) * mix(vec3f(0.8), effectiveLightColor, 0.2) * (0.5 + dayBrightness * 0.5);
    
    // Combine all lighting components
    var finalColor = waterColor;
    
    // Add sky reflection based on Fresnel
    finalColor = mix(finalColor, skyColor, fresnelFactor * 0.6);
    
    // Add sun reflection and glitter
    finalColor += sunReflection;
    finalColor += sunPath;
    
    // Add subsurface scattering
    finalColor += sssColor;
    
    // Apply diffuse lighting from sun
    let diffuse = max(dot(N, L), 0.0) * 0.2;
    finalColor += globalLightColor.rgb * diffuse * waterColor;
    
    // Add foam
    finalColor = mix(finalColor, foamColor, foamThreshold * 0.25);
    
    // Add ambient lighting
    finalColor += globalAmbientColor.rgb * waterColor * 0.3;
    
    // Distance fog for realism (fade to horizon color at distance)
    let dist = length(fragData.worldPosition - cameraPos.xyz);
    let fogFactor = 1.0 - exp(-dist * 0.001);
    let fogColor = mix(horizonColor, vec3f(0.7, 0.8, 0.9) * effectiveLightColor * (0.3 + dayBrightness * 0.7), 0.5);
    finalColor = mix(finalColor, fogColor, fogFactor * 0.5);
    
    // Slight transparency for shallow areas
    let alpha = mix(0.85, 0.95, 1.0 - depthFactor);
    
    return vec4f(finalColor, alpha);
}
`;

// Create the ocean shader with buffer specifications
const oceanShader = new CustomRenderShader(
    'ocean-water-shader',
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
    // Texture buffer specs - sea texture
    [
        {
            binding: 0,
            visibility: ShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
            textureId: 'seaTexture'
        }
    ],
    {
        cullMode: 'none', // Render both sides of the water surface
        blend: {
            color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
            },
            alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
            }
        },
        depthWriteEnabled: true,
        depthCompare: 'less'
    }
);

// Load and register the sea texture
const seaImageData = await loadImageData(seaTextureUrl);

oceanShader.start = async function() {
    VIEW.th!.addTexture('seaTexture', seaImageData);
};

// Update function to sync uniforms
oceanShader.update = () => {
    // Update time
    oceanShader.bufferSpecs[0].data = new Float32Array([Date.now() / 1000 % 10000]);
    
    // Update camera position
    const cam = MODEL.getCamera('main-camera');
    if (cam?.position) {
        oceanShader.bufferSpecs[1].data = new Float32Array(cam.position.slice(0, 4));
    }
};

export default oceanShader;
