export const renderer = /*glsl*/`//its actually wgsl but i want to use syntax highlighting

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
};
struct ViewUniforms {
    projection: mat4x4<f32>,
};
struct ObjectUniform{
    position: vec4f,
    rotation: mat4x4<f32>,
};

@group(0) @binding(0) // Use next available binding slot
var<uniform> view: ViewUniforms;



@vertex
fn vertex_main(@location(0) position: vec3f) -> VertexOut {
    var output: VertexOut;

    let positionVec4 = vec4f(position, 1.0);
    output.position = view.projection * positionVec4;
    output.fragPosition = positionVec4;
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