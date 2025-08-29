export const renderer = /*glsl*/`//its actually wgsl but i want to use syntax highlighting

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
};
struct VertexIn {
  @location(0) position: vec3f
};

struct Matrices { m: array<mat4x4<f32>> }

@group(0) @binding(0)
var<storage, read> objectMatrices: Matrices;
@group(0) @binding(1)
var<storage, read> cameraMatrix: mat4x4<f32>;
@group(0) @binding(2)
var<storage, read> projectionMatrix: mat4x4<f32>;



@vertex
fn vertex_main(in: VertexIn,@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices.m[i_idx];
  let pos4 = vec4f(in.position, 1.0);
  // transform: projection * camera * model * position
  output.position = projectionMatrix * cameraMatrix * model * pos4;
  output.fragPosition = pos4;
  return output;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    // Example: color based on world position (normalized to [0,1])
    let color = vec4f(
        0.5+0.5 * fragData.fragPosition.x,
        0.5+0.5 * fragData.fragPosition.y,
        0.5+0.5 * fragData.fragPosition.z,
        1.0
    );
    return color;
}
`