import PostProcessingShader from '../PostProcessingShader';
import { ShaderStage } from '../../../config/webgpu-constants';

/**
 * Multi-pass Bloom Effect
 * 
 * This bloom implementation uses 4 separate passes for high quality:
 * 1. bloomExtractShader - Extracts bright pixels above threshold
 * 2. bloomBlurHShader - Horizontal Gaussian blur
 * 3. bloomBlurVShader - Vertical Gaussian blur  
 * 4. bloomCompositeShader - Combines blurred bloom with original scene
 * 
 * Usage:
 *   MODEL.addPostProcessShader(bloomExtractShader);
 *   MODEL.addPostProcessShader(bloomBlurHShader);
 *   MODEL.addPostProcessShader(bloomBlurVShader);
 *   MODEL.addPostProcessShader(bloomCompositeShader);
 */

// Shared bloom parameters
export const bloomParams = new Float32Array([
    0.7,   // threshold: brightness threshold for bloom (0-1)
    1.5,   // intensity: bloom glow intensity  
    1.0,   // blur radius multiplier
    0.0    // padding
]);

// ============================================
// Pass 1: Extract bright pixels
// ============================================
const extractFragmentShader = /*wgsl*/`
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

@group(1) @binding(0) var<uniform> u_bloomParams: vec4f;

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let threshold = u_bloomParams.x;
    let color = textureSample(inputTexture, textureSampler, fragData.uv).rgb;
    
    // Soft threshold extraction with wider knee for smoother falloff
    let brightness = luminance(color);
    let knee = 0.5; // Wider soft knee for smoother transition
    let soft = brightness - threshold + knee;
    let contribution = clamp(soft / (2.0 * knee + 0.0001), 0.0, 1.0);
    // Smoother curve (less harsh cutoff)
    let bloomContribution = contribution * contribution * (3.0 - 2.0 * contribution);
    
    // Extract bright pixels with smooth falloff
    let extracted = color * bloomContribution;
    
    return vec4f(extracted, 1.0);
}
`;

export const bloomExtractShader = new PostProcessingShader(
    'bloom-extract',
    extractFragmentShader,
    [{
        binding: 0,
        size: 16,
        type: 'uniform',
        visibility: ShaderStage.FRAGMENT,
        data: bloomParams
    }],
    { enabled: true, order: 0 }
);

// ============================================
// Pass 2: Horizontal Gaussian blur
// ============================================
const blurHFragmentShader = /*wgsl*/`
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

@group(1) @binding(0) var<uniform> u_bloomParams: vec4f;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let radius = u_bloomParams.z;
    let texelSize = 1.0 / u_resolution.x;
    
    // 13-tap Gaussian blur (sigma ~= 3.5) for wider, smoother blur
    // Weights calculated for sigma=3.5, normalized to sum to 1.0
    let w0 = 0.1176;
    let w1 = 0.1106;
    let w2 = 0.0923;
    let w3 = 0.0685;
    let w4 = 0.0451;
    let w5 = 0.0263;
    let w6 = 0.0136;
    
    var color = textureSample(inputTexture, textureSampler, fragData.uv).rgb * w0;
    
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(1.0 * radius * texelSize, 0.0)).rgb * w1;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(1.0 * radius * texelSize, 0.0)).rgb * w1;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(2.0 * radius * texelSize, 0.0)).rgb * w2;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(2.0 * radius * texelSize, 0.0)).rgb * w2;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(3.0 * radius * texelSize, 0.0)).rgb * w3;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(3.0 * radius * texelSize, 0.0)).rgb * w3;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(4.0 * radius * texelSize, 0.0)).rgb * w4;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(4.0 * radius * texelSize, 0.0)).rgb * w4;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(5.0 * radius * texelSize, 0.0)).rgb * w5;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(5.0 * radius * texelSize, 0.0)).rgb * w5;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(6.0 * radius * texelSize, 0.0)).rgb * w6;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(6.0 * radius * texelSize, 0.0)).rgb * w6;
    
    return vec4f(color, 1.0);
}
`;

export const bloomBlurHShader = new PostProcessingShader(
    'bloom-blur-h',
    blurHFragmentShader,
    [{
        binding: 0,
        size: 16,
        type: 'uniform',
        visibility: ShaderStage.FRAGMENT,
        data: bloomParams
    }],
    { enabled: true, order: 1 }
);

// ============================================
// Pass 3: Vertical Gaussian blur
// ============================================
const blurVFragmentShader = /*wgsl*/`
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

@group(1) @binding(0) var<uniform> u_bloomParams: vec4f;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let radius = u_bloomParams.z;
    let texelSize = 1.0 / u_resolution.y;
    
    // 13-tap Gaussian blur (sigma ~= 3.5) for wider, smoother blur
    let w0 = 0.1176;
    let w1 = 0.1106;
    let w2 = 0.0923;
    let w3 = 0.0685;
    let w4 = 0.0451;
    let w5 = 0.0263;
    let w6 = 0.0136;
    
    var color = textureSample(inputTexture, textureSampler, fragData.uv).rgb * w0;
    
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 1.0 * radius * texelSize)).rgb * w1;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 1.0 * radius * texelSize)).rgb * w1;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 2.0 * radius * texelSize)).rgb * w2;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 2.0 * radius * texelSize)).rgb * w2;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 3.0 * radius * texelSize)).rgb * w3;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 3.0 * radius * texelSize)).rgb * w3;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 4.0 * radius * texelSize)).rgb * w4;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 4.0 * radius * texelSize)).rgb * w4;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 5.0 * radius * texelSize)).rgb * w5;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 5.0 * radius * texelSize)).rgb * w5;
    color += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(0.0, 6.0 * radius * texelSize)).rgb * w6;
    color += textureSample(inputTexture, textureSampler, fragData.uv - vec2f(0.0, 6.0 * radius * texelSize)).rgb * w6;
    
    return vec4f(color, 1.0);
}
`;

export const bloomBlurVShader = new PostProcessingShader(
    'bloom-blur-v',
    blurVFragmentShader,
    [{
        binding: 0,
        size: 16,
        type: 'uniform',
        visibility: ShaderStage.FRAGMENT,
        data: bloomParams
    }],
    { enabled: true, order: 2 }
);

// ============================================
// Pass 4: Composite bloom with original scene
// ============================================
const compositeFragmentShader = /*wgsl*/`
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;  // Blurred bloom
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;
@group(0) @binding(4) var sceneTexture: texture_2d<f32>;  // Original scene

@group(1) @binding(0) var<uniform> u_bloomParams: vec4f;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let intensity = u_bloomParams.y;
    
    // Sample original scene
    let sceneColor = textureSample(sceneTexture, textureSampler, fragData.uv).rgb;
    
    // Sample blurred bloom
    let bloomColor = textureSample(inputTexture, textureSampler, fragData.uv).rgb;
    
    // Additive blend
    let finalColor = sceneColor + bloomColor * intensity;
    
    return vec4f(finalColor, 1.0);
}
`;

export const bloomCompositeShader = new PostProcessingShader(
    'bloom-composite',
    compositeFragmentShader,
    [{
        binding: 0,
        size: 16,
        type: 'uniform',
        visibility: ShaderStage.FRAGMENT,
        data: bloomParams
    }],
    { 
        enabled: true, 
        order: 3,
        needsSceneTexture: true  // This shader needs access to original scene
    }
);

/**
 * Helper to configure bloom parameters for all passes
 * @param threshold - Brightness threshold (0-1), pixels brighter than this will bloom
 * @param intensity - Bloom intensity multiplier
 * @param radius - Blur radius multiplier (default 1.0)
 */
export function setBloomParams(
    threshold: number, 
    intensity: number, 
    radius: number = 1.0
): void {
    bloomParams[0] = Math.max(0, Math.min(1, threshold));
    bloomParams[1] = Math.max(0, intensity);
    bloomParams[2] = Math.max(0.1, radius);
}

/**
 * Enable or disable the entire bloom effect
 */
export function setBloomEnabled(enabled: boolean): void {
    bloomExtractShader.pipelineSettings!.enabled = enabled;
    bloomBlurHShader.pipelineSettings!.enabled = enabled;
    bloomBlurVShader.pipelineSettings!.enabled = enabled;
    bloomCompositeShader.pipelineSettings!.enabled = enabled;
}

// Export all shaders as an array for convenience
export const bloomShaders = [
    bloomExtractShader,
    bloomBlurHShader,
    bloomBlurVShader,
    bloomCompositeShader
];

export default bloomShaders;
