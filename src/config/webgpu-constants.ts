/**
 * WebGPU shader stage visibility flags.
 * These constants are used instead of GPUShaderStage enum for Firefox compatibility,
 * as Firefox's WebGPU implementation doesn't expose GPUShaderStage globally.
 * 
 * Values match the WebGPU specification:
 * https://www.w3.org/TR/webgpu/#typedefdef-gpushaderstageflags
 */
export const ShaderStage = {
    VERTEX: 0x1,
    FRAGMENT: 0x2,
    COMPUTE: 0x4,
} as const;

export type ShaderStageFlags = number;
