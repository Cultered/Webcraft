import PostProcessingShader from '../PostProcessingShader';
import { ShaderStage } from '../../../config/webgpu-constants';

/**
 * Example grayscale post-processing shader.
 * Converts the scene to grayscale with adjustable intensity.
 */

// Custom buffer for grayscale intensity
const u_intensity = new Float32Array([1.0]); // 0.0 = original colors, 1.0 = full grayscale

const fragmentShader = /*wgsl*/`
// Standard post-process bindings (group 0)
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

// Custom bindings (group 1)
@group(1) @binding(0) var<uniform> u_intensity: f32;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let color = textureSample(inputTexture, textureSampler, fragData.uv);
    
    // Calculate grayscale using luminance weights
    let luminance = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
    let grayscale = vec3f(luminance);
    
    // Mix between original and grayscale based on intensity
    let finalColor = mix(color.rgb, grayscale, u_intensity);
    
    return vec4f(finalColor, color.a);
}
`;

const grayscaleShader = new PostProcessingShader(
    'postprocess-grayscale',
    fragmentShader,
    [
        {
            binding: 0,
            size: 4, // f32
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT,
            data: u_intensity
        }
    ],
    {
        enabled: true,
        order: 0
    }
);

/**
 * Helper to set grayscale intensity
 */
export function setGrayscaleIntensity(intensity: number): void {
    u_intensity[0] = Math.max(0, Math.min(1, intensity));
}

export default grayscaleShader;
