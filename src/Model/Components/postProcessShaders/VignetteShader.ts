import PostProcessingShader from '../PostProcessingShader';
import { ShaderStage } from '../../../config/webgpu-constants';

/**
 * Example vignette post-processing shader.
 * Adds a vignette effect (darkening towards edges) with configurable parameters.
 */

// Custom uniforms for vignette effect
const u_vignetteParams = new Float32Array([
    0.5,  // intensity: how dark the vignette gets (0-1)
    0.5,  // radius: where the vignette starts (0 = center, 1 = edge)
    0.5,  // softness: how gradual the transition is
    0.0   // padding for alignment
]);

const fragmentShader = /*wgsl*/`
// Standard post-process bindings (group 0)
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

// Custom bindings (group 1)
// x: intensity, y: radius, z: softness
@group(1) @binding(0) var<uniform> u_vignetteParams: vec4f;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let color = textureSample(inputTexture, textureSampler, fragData.uv);
    
    // Calculate distance from center (accounting for aspect ratio)
    let aspectRatio = u_resolution.x / u_resolution.y;
    var centeredUV = fragData.uv - 0.5;
    centeredUV.x *= aspectRatio;
    let dist = length(centeredUV);
    
    // Calculate vignette factor
    let intensity = u_vignetteParams.x;
    let radius = u_vignetteParams.y;
    let softness = u_vignetteParams.z;
    
    // Smooth vignette falloff
    let vignette = smoothstep(radius, radius - softness, dist);
    let vignetteFactor = mix(1.0 - intensity, 1.0, vignette);
    
    let finalColor = color.rgb * vignetteFactor;
    
    return vec4f(finalColor, color.a);
}
`;

const vignetteShader = new PostProcessingShader(
    'postprocess-vignette',
    fragmentShader,
    [
        {
            binding: 0,
            size: 16, // vec4f
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT,
            data: u_vignetteParams
        }
    ],
    {
        enabled: true,
        order: 10 // Render after other effects
    }
);

/**
 * Helper to configure vignette parameters
 */
export function setVignetteParams(
    intensity: number, 
    radius: number, 
    softness: number
): void {
    u_vignetteParams[0] = Math.max(0, Math.min(1, intensity));
    u_vignetteParams[1] = Math.max(0, Math.min(1, radius));
    u_vignetteParams[2] = Math.max(0, Math.min(1, softness));
}

export default vignetteShader;
