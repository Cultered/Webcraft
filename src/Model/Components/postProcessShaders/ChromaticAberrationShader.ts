import PostProcessingShader from '../PostProcessingShader';
import { ShaderStage } from '../../../config/webgpu-constants';

/**
 * Example chromatic aberration post-processing shader.
 * Creates a color fringing effect at the edges of the screen.
 */

// Custom uniforms for chromatic aberration
const u_chromaticParams = new Float32Array([
    0.005,  // offset: how much to offset color channels
    2.0,    // falloff: power for edge-based intensity
    0.0,    // padding
    0.0     // padding
]);

const fragmentShader = /*wgsl*/`
// Standard post-process bindings (group 0)
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

// Custom bindings (group 1)
// x: offset amount, y: falloff power
@group(1) @binding(0) var<uniform> u_chromaticParams: vec4f;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let offset = u_chromaticParams.x;
    let falloff = u_chromaticParams.y;
    
    // Calculate direction from center
    let centeredUV = fragData.uv - 0.5;
    let dist = length(centeredUV);
    
    // Intensity increases towards edges
    let intensity = pow(dist * 2.0, falloff);
    let direction = normalize(centeredUV + 0.0001); // Avoid division by zero
    
    // Sample each color channel with different offsets
    let offsetAmount = direction * offset * intensity;
    
    let r = textureSample(inputTexture, textureSampler, fragData.uv + offsetAmount).r;
    let g = textureSample(inputTexture, textureSampler, fragData.uv).g;
    let b = textureSample(inputTexture, textureSampler, fragData.uv - offsetAmount).b;
    let a = textureSample(inputTexture, textureSampler, fragData.uv).a;
    
    return vec4f(r, g, b, a);
}
`;

const chromaticAberrationShader = new PostProcessingShader(
    'postprocess-chromatic-aberration',
    fragmentShader,
    [
        {
            binding: 0,
            size: 16, // vec4f
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT,
            data: u_chromaticParams
        }
    ],
    {
        enabled: true,
        order: 5
    }
);

/**
 * Helper to configure chromatic aberration parameters
 */
export function setChromaticAberrationParams(
    offset: number, 
    falloff: number
): void {
    u_chromaticParams[0] = Math.max(0, offset);
    u_chromaticParams[1] = Math.max(0.1, falloff);
}

export default chromaticAberrationShader;
