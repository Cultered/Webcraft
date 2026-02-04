import PostProcessingShader from '../PostProcessingShader';
import { ShaderStage } from '../../../config/webgpu-constants';

/**
 * Bloom post-processing shader.
 * Extracts bright areas and applies a multi-sample blur to create a glow effect.
 * Uses Kawase blur for better quality bloom with fewer samples.
 */

// Custom uniforms for bloom effect
const u_bloomParams = new Float32Array([
    0.6,   // threshold: brightness threshold for bloom (0-1)
    1.2,   // intensity: bloom glow intensity
    4.0,   // radius: blur sample distance multiplier
    0.0    // padding
]);

const fragmentShader = /*wgsl*/`
// Standard post-process bindings (group 0)
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

// Custom bindings (group 1)
// x: threshold, y: intensity, z: radius
@group(1) @binding(0) var<uniform> u_bloomParams: vec4f;

// Extract luminance from color
fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

// Soft threshold - smoother transition for bloom extraction
fn softThreshold(color: vec3f, threshold: f32, softKnee: f32) -> vec3f {
    let brightness = luminance(color);
    let soft = brightness - threshold + softKnee;
    let soft2 = clamp(soft / (2.0 * softKnee + 0.00001), 0.0, 1.0);
    let contribution = max(soft2 * soft2 * softKnee, brightness - threshold);
    let scale = max(contribution, 0.0) / max(brightness, 0.0001);
    return color * scale;
}

// Kawase blur - efficient blur with good quality
fn kawaseBlur(uv: vec2f, iteration: f32) -> vec3f {
    let texelSize = 1.0 / u_resolution;
    let offset = (iteration + 0.5) * texelSize * u_bloomParams.z;
    
    var color = vec3f(0.0);
    color += textureSample(inputTexture, textureSampler, uv + vec2f(-offset.x, -offset.y)).rgb;
    color += textureSample(inputTexture, textureSampler, uv + vec2f( offset.x, -offset.y)).rgb;
    color += textureSample(inputTexture, textureSampler, uv + vec2f(-offset.x,  offset.y)).rgb;
    color += textureSample(inputTexture, textureSampler, uv + vec2f( offset.x,  offset.y)).rgb;
    
    return color * 0.25;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let threshold = u_bloomParams.x;
    let intensity = u_bloomParams.y;
    
    // Sample original color - this stays unchanged
    let originalColor = textureSample(inputTexture, textureSampler, fragData.uv).rgb;
    
    // Extract bright areas with soft knee for smoother transition
    let softKnee = 0.1;
    let brightExtract = softThreshold(originalColor, threshold, softKnee);
    
    // Multi-iteration Kawase blur for bloom
    // Each iteration samples further out, creating a wide glow
    var bloom = vec3f(0.0);
    
    // Sample at multiple distances to simulate larger blur
    for (var i = 0u; i < 4u; i++) {
        let iterOffset = f32(i) * 2.0 + 1.0;
        let texelSize = 1.0 / u_resolution;
        let offset = iterOffset * texelSize * u_bloomParams.z;
        
        // Sample in 4 diagonal directions
        var iterBloom = vec3f(0.0);
        iterBloom += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(-offset.x, -offset.y)).rgb;
        iterBloom += textureSample(inputTexture, textureSampler, fragData.uv + vec2f( offset.x, -offset.y)).rgb;
        iterBloom += textureSample(inputTexture, textureSampler, fragData.uv + vec2f(-offset.x,  offset.y)).rgb;
        iterBloom += textureSample(inputTexture, textureSampler, fragData.uv + vec2f( offset.x,  offset.y)).rgb;
        iterBloom *= 0.25;
        
        // Extract bright from blurred sample
        let blurBright = softThreshold(iterBloom, threshold, softKnee);
        bloom += blurBright;
    }
    
    // Average and apply intensity
    bloom = bloom * 0.25 * intensity;
    
    // Add bloom to original - purely additive
    let finalColor = originalColor + bloom;
    
    return vec4f(finalColor, 1.0);
}
`;

const bloomShader = new PostProcessingShader(
    'postprocess-bloom',
    fragmentShader,
    [
        {
            binding: 0,
            size: 16, // vec4f
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT,
            data: u_bloomParams
        }
    ],
    {
        enabled: true,
        order: 1 // Render early in post-process chain
    }
);

// Optional: update function for dynamic parameters
bloomShader.update = function() {
    // Can be overridden to animate bloom parameters
};

/**
 * Helper to configure bloom parameters
 * @param threshold - Brightness threshold (0-1), pixels brighter than this will bloom
 * @param intensity - Bloom intensity multiplier
 * @param radius - Blur radius in pixels
 */
export function setBloomParams(
    threshold: number, 
    intensity: number, 
    radius: number
): void {
    u_bloomParams[0] = Math.max(0, Math.min(1, threshold));
    u_bloomParams[1] = Math.max(0, intensity);
    u_bloomParams[2] = Math.max(0, radius);
}

export default bloomShader;
