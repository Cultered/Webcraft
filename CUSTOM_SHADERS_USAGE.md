# Custom Shaders Usage Guide

This guide demonstrates how to use custom shaders in the WebGPU backend.

## Overview

The custom shader system allows you to create entities with custom WGSL shaders while still utilizing the default rendering infrastructure (camera, projection, object transforms, etc.).

## Basic Usage

### 1. Create a Custom Shader Component

```typescript
import CustomRenderShader from './src/Model/Components/CustomRenderShader';

// Define your custom vertex shader (WGSL)
const vertexShader = `
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
};
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

// Group 0 bindings are provided by the default system
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  output.position = projectionMatrix * view * model * vec4f(in.position, 1.0);
  output.fragPosition = vec4f(in.position, 1.0);
  output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
  output.uv = in.uv;
  return output;
}
`;

// Define your custom fragment shader (WGSL)
const fragmentShader = `
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    // Custom color based on normal
    let color = (fragData.worldNormal + vec3f(1.0)) * 0.5;
    return vec4f(color, 1.0);
}
`;

// Create the shader component
const customShader = new CustomRenderShader(
    'normal-visualizer',  // Unique shader ID
    vertexShader,
    fragmentShader
);
```

### 2. Add the Component to an Entity

```typescript
import Entity from './src/Model/Entity';
import MeshComponent from './src/Model/Components/MeshComponent';
import { vec4 } from './src/misc/vec4';

// Create an entity with a mesh
const entity = new Entity('custom-object', vec4(0, 0, 0, 1));

// Add a mesh component (required)
const mesh = {
    id: 'my-mesh',
    vertices: new Float32Array([/* ... */]),
    normals: new Float32Array([/* ... */]),
    uvs: new Float32Array([/* ... */]),
    indices: new Uint32Array([/* ... */])
};
entity.addComponent(new MeshComponent(mesh));

// Add the custom shader component
entity.addComponent(customShader);

// Add to model
model.addEntity(entity);
```

### 3. Render

The WebGPU view will automatically:
- Detect objects with CustomRenderShader component
- Create and cache custom pipelines for each unique shader ID
- Render custom shader objects individually after normal batches
- Apply proper transforms from the object storage buffer

## Advanced: Using Additional Buffers (Group 1)

You can bind additional buffers to group 1 for custom data. The WebGPU view handles buffer creation and updates automatically - you only need to provide the data:

```typescript
// Create buffer data - NO need to call device.createBuffer() or device.queue.writeBuffer()
const customData = new Float32Array([1.0, 0.5, 0.2, 1.0]);

// Vertex shader with group 1 binding
const vertexShader = `
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;

// Custom buffer in group 1
@group(1) @binding(0) var<uniform> customColor: vec4f;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  output.position = projectionMatrix * view * model * vec4f(in.position, 1.0);
  output.color = customColor; // Pass custom color to fragment shader
  return output;
}
`;

const fragmentShader = `
@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    return fragData.color;
}
`;

// Create shader with buffer specification
const customShader = new CustomRenderShader(
    'custom-color-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: customData.byteLength, // Size in bytes
            data: customData,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
        }
    ]
);

// To update the buffer data later, just modify the data field:
customShader.bufferSpecs[0].data = new Float32Array([0.5, 1.0, 0.3, 1.0]);
// The WebGPU view will automatically sync this to the GPU buffer
```

## Important Notes

### Group 0 Bindings (Always Available)

The following bindings are automatically provided in group 0:

```wgsl
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
```

### Vertex Input Format

Your vertex shader must use the standard vertex input format:

```wgsl
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};
```

### Shader Entry Points

- Vertex shader entry point must be named `vertex_main`
- Fragment shader entry point must be named `fragment_main`

### Pipeline Caching

Pipelines are cached by shader ID. Multiple objects can share the same shader ID to reuse the same pipeline, improving performance.

## Example Use Cases

1. **Normal Visualization**: Render objects with colors based on their normals
2. **Wireframe Rendering**: Custom fragment shader for wireframe effects
3. **Custom Lighting**: Implement different lighting models
4. **Procedural Effects**: Generate patterns or effects in the shader
5. **Post-processing**: Apply effects to individual objects

## Performance Considerations

- Custom shader objects are rendered individually (not batched)
- Use the same shader ID for multiple objects to share pipelines
- Keep the number of unique custom shaders reasonable
- Consider using regular batched rendering for objects that don't need custom shaders
