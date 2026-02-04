# Custom Shaders Usage Guide

This guide demonstrates how to use custom shaders in the WebGPU backend.

## Overview

The custom shader system allows you to create entities with custom WGSL shaders while still utilizing the default rendering infrastructure (camera, projection, object transforms, etc.).

## Basic Usage

### 1. Create a Custom Shader Component

```typescript
import CustomRenderShader from './src/Model/Components/CustomRenderShader';
import { ShaderStage } from './src/config/webgpu-constants';

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
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5) var<uniform> globalLightDirection: vec4f;
@group(0) @binding(6) var<uniform> globalLightColor: vec4f;
@group(0) @binding(7) var<uniform> globalAmbientColor: vec4f;

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
    fragmentShader,
    [],                   // Optional: additional buffers (empty array if none)
    {                     // Optional: pipeline settings
        cullMode: 'back',           // 'none', 'front', or 'back' (default: 'back')
        depthWriteEnabled: true,    // default: true
        depthCompare: 'less',       // default: 'less'
        blend: {                    // default: alpha blending
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
    }
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

Example (/Model/Components/ExampleRenderShader.ts)

```typescript
import CustomRenderShader from './CustomRenderShader';
import { CANVAS } from '../../Controller/Controller';
import { MODEL } from '../../Controller/Controller';
const u_time = new Float32Array([Date.now() / 1000 % 1000]);
let x = 0;
let y = 0;
const u_mouse = new Float32Array([x, y]);
const u_size = new Float32Array([1, 1]);
const cameraPos = new Float32Array([0, 0, 0, 0]);

// Vertex shader with group 1 binding
const vertexShader = /*glsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) fragPosition: vec4f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
    @location(3) worldPosition: vec4f,
};
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;
@group(0) @binding(3)
var textureSampler: sampler;
@group(0) @binding(4)
var diffuseTexture: texture_2d<f32>;
@group(0) @binding(5)
var<uniform> globalLightDirection: vec4f;
@group(0) @binding(6)
var<uniform> globalLightColor: vec4f;
@group(0) @binding(7)
var<uniform> globalAmbientColor: vec4f;


// Custom buffer in group 1
@group(1) @binding(0) var<uniform> u_time: f32;
@group(1) @binding(1) var<uniform> u_mouse: vec2f;
@group(1) @binding(2) var<uniform> u_size: vec2f;
@group(1) @binding(3) var<uniform> cameraPos: vec4f;

@vertex
fn vertex_main(in: VertexIn, @builtin(instance_index) i_idx: u32) -> VertexOut {
  var output: VertexOut;
  let model = objectMatrices[i_idx];
  let wavesPosition = in.position + vec3f(1.0, 0.0, 0.0) * sin(u_time  * 5.0+ in.position.y*5) * 0.1;
  output.position = projectionMatrix * view * model * vec4f(wavesPosition, 1.0);
  output.uv = in.uv;
  output.worldPosition = (model * vec4f(wavesPosition, 1.0));
  output.worldNormal = normalize((model * vec4f(in.normal, 0.0)).xyz);
  return output;
}
`;

const fragmentShader = /*glsl*/`

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
  var stx = (fragData.position.x/2.-u_mouse.x) / u_size.x /fragData.position.w;
  var sty = (fragData.position.y/2.-u_mouse.y) / u_size.y /fragData.position.w;
  var d = 0.0;

  stx = stx;
  sty = sty;

  
    // Global directional light from uniform
    let lightDir = normalize(globalLightDirection.xyz);
    let lightColor = globalLightColor.rgb;
    let ambientColor = globalAmbientColor.rgb;
    
    // Sample texture color
    let textureColor = textureSample(diffuseTexture, textureSampler, fragData.uv).rgb;
    
    // Calculate diffuse lighting using dot product of normal and light direction
    let dotNL = max(dot(fragData.worldNormal, lightDir), 0.0);
    let diffuse = lightColor * dotNL;
    
    // Combine ambient and diffuse lighting with texture color
    let finalColor = textureColor * (ambientColor + diffuse);
    
  d = length( (vec2f(stx, sty)) );

  let relative = fragData.worldPosition.xyz - cameraPos.xyz;
  let lr = length(relative);
  let waves = fract(sqrt(lr)*10-u_time*3);
  let waveEnd = 1-smoothstep(0.0,10.,lr);

  return vec4f(finalColor,waves*waveEnd*smoothstep(5.0,10.0,lr)+smoothstep(2.0,10.0,lr));
}
`;


// Create shader with buffer specification
const exampleRenderShader = new CustomRenderShader(
    'custom-color-shader',
    vertexShader,
    fragmentShader,
    [
        {
            binding: 0,
            size: u_time.byteLength, // Size in bytes
            data: u_time,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 1,
            size: u_mouse.byteLength, // Size in bytes
            data: u_mouse,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 2,
            size: u_size.byteLength, // Size in bytes
            data: u_size,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        },
        {
            binding: 3,
            size: cameraPos.byteLength, // Size in bytes
            data: cameraPos,             // ArrayBuffer or TypedArray
            type: 'uniform',
            visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT
        }
    ]
);

exampleRenderShader.update = () => {
    exampleRenderShader.bufferSpecs[0].data = new Float32Array([Date.now() / 1000 % 1000]);
    const rect = CANVAS.getBoundingClientRect();
    CANVAS.addEventListener('mousemove', (e) => {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    });
    exampleRenderShader.bufferSpecs[1].data = new Float32Array([x, y]);
    exampleRenderShader.bufferSpecs[2].data = new Float32Array([rect.width, rect.height]);
    exampleRenderShader.bufferSpecs[3].data = MODEL.getCamera('main-camera')?.position ? new Float32Array(MODEL.getCamera('main-camera')!.position.slice(0, 4)) : new Float32Array([0, 0, 0, 0]);
}
export default exampleRenderShader;
```
## Important Notes

### Group 0 Bindings (Always Available)

The following bindings are automatically provided in group 0:

```wgsl
@group(0) @binding(0) var<storage, read> objectMatrices: array<mat4x4<f32>>;  // Model matrices for instancing
@group(0) @binding(1) var<uniform> view: mat4x4<f32>;                         // Camera view matrix
@group(0) @binding(2) var<uniform> projectionMatrix: mat4x4<f32>;             // Projection matrix
@group(0) @binding(3) var textureSampler: sampler;                            // Texture sampler
@group(0) @binding(4) var diffuseTexture: texture_2d<f32>;                    // Diffuse texture
@group(0) @binding(5) var<uniform> globalLightDirection: vec4f;               // Sun/light direction (xyz=dir, w=intensity)
@group(0) @binding(6) var<uniform> globalLightColor: vec4f;                   // Directional light color (rgb=color, a=intensity)
@group(0) @binding(7) var<uniform> globalAmbientColor: vec4f;                 // Ambient light color (rgb=color, a=intensity)
```

**Lighting uniforms** are automatically animated by the SkyboxShader for day/night cycles:
- `globalLightDirection`: Sun position cycling through the sky
- `globalLightColor`: White during day, orange at sunset, near-black at night
- `globalAmbientColor`: Warm ambient during day, cool/dark ambient at night

You can also manually control these via `VIEW.globalLightDirection`, `VIEW.globalLightColor`, and `VIEW.globalAmbientColor`.

### Vertex Input Format

Your vertex shader must use the standard vertex input format: !!MIGHT CHANGE WITH ADDITION OF ANIMATION KEYFRAMES

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

## Performance Considerations

- Custom shader objects are rendered individually (not batched)
- Use the same shader ID for multiple objects to share pipelines
- Keep the number of unique custom shaders reasonable
- Consider using regular batched rendering for objects that don't need custom shaders

## Pipeline Settings

You can customize the rendering pipeline behavior using the optional `pipelineSettings` parameter:

```typescript
const customShader = new CustomRenderShader(
    'my-shader',
    vertexShader,
    fragmentShader,
    [],  // buffer specs
    {    // pipeline settings
        cullMode: 'none',           // Disable backface culling
        depthWriteEnabled: false,   // Disable depth writes (useful for transparent objects)
        depthCompare: 'less-equal', // Change depth comparison
        blend: null                 // Disable blending (opaque rendering)
    }
);
```

### Available Pipeline Settings

- **cullMode** (optional): Controls triangle culling
  - `'none'`: No culling, render both sides
  - `'front'`: Cull front-facing triangles (counter-clockwise when viewed from camera)
  - `'back'`: Cull back-facing triangles (clockwise when viewed from camera) (default)

- **depthWriteEnabled** (optional): Whether to write to the depth buffer
  - `true`: Enable depth writes (default)
  - `false`: Disable depth writes (useful for transparent objects rendered after opaque ones)

- **depthCompare** (optional): Depth comparison function
  - `'less'`: Pass if fragment is closer (default)
  - `'less-equal'`: Pass if fragment is closer or equal
  - `'greater'`: Pass if fragment is farther
  - `'greater-equal'`: Pass if fragment is farther or equal
  - `'equal'`: Pass if fragment is at same depth
  - `'not-equal'`: Pass if fragment is at different depth
  - `'always'`: Always pass
  - `'never'`: Never pass

- **blend** (optional): Blending configuration for transparency
  - Omitted/undefined: Uses default alpha blending (`src-alpha`, `one-minus-src-alpha`)
  - `null`: Disables blending for opaque rendering
  - Custom blend state: Specify your own `GPUBlendState` for custom blending behavior

### Example: Transparent Shader

```typescript
const transparentShader = new CustomRenderShader(
    'transparent-shader',
    vertexShader,
    fragmentShader,
    [],
    {
        cullMode: 'none',           // Render both sides
        depthWriteEnabled: false,   // Don't write to depth buffer
        depthCompare: 'less'        // Still respect existing depth
    }
);
```

### Example: Opaque Shader (No Blending)

```typescript
const opaqueShader = new CustomRenderShader(
    'opaque-shader',
    vertexShader,
    fragmentShader,
    [],
    {
        cullMode: 'back',
        depthWriteEnabled: true,
        depthCompare: 'less',
        blend: null  // Disable blending for opaque objects
    }
);
```

## P.S

- Static objects can have custom shaders, but as they do not receive updates, any kind of additional buffers will not either, unless another non-static object also has the shader as one of the components.
- All pipeline settings are optional. If not specified, sensible defaults are used (cullMode='back', alpha blending enabled, depthWriteEnabled=true, depthCompare='less').

---

# Post-Processing Shaders

Post-processing shaders are applied after the main scene rendering is complete. They are attached to the camera entity and can be chained to create complex visual effects.

## Overview

Post-processing effects work by:
1. Rendering the scene to an intermediate texture
2. Applying each post-process shader in order (using ping-pong buffers)
3. Outputting the final result to the screen

## Basic Usage

### 1. Create a Post-Processing Shader

```typescript
import PostProcessingShader from './src/Model/Components/PostProcessingShader';
import { ShaderStage } from './src/config/webgpu-constants';

// Define your fragment shader (WGSL)
// The vertex shader is provided automatically (full-screen triangle)
const fragmentShader = /*wgsl*/`
struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

// Standard post-process bindings (group 0) - provided automatically
@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u_resolution: vec2f;
@group(0) @binding(3) var<uniform> u_time: f32;

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    let color = textureSample(inputTexture, textureSampler, fragData.uv);
    // Apply your effect here
    return color;
}
`;

// Create the shader
const postProcess = new PostProcessingShader(
    'my-effect',        // Unique ID
    fragmentShader,
    [],                 // Optional: custom buffers for group 1
    {
        enabled: true,  // Can be toggled at runtime
        order: 0        // Lower values render first
    }
);
```

### 2. Attach to Camera Entity

```typescript
// Get or create your camera entity
const camera = new Entity('camera', vec4(0, 5, 10, 1));

// Add post-processing shader as a component
camera.addComponent(postProcess);

// Register the camera with the view
view.registerCamera(camera);
```

### 3. Multiple Effects

You can chain multiple post-processing effects:

```typescript
import { createGrayscaleShader } from './src/Model/Components/postProcessShaders/GrayscaleShader';
import { createVignetteShader } from './src/Model/Components/postProcessShaders/VignetteShader';
import { createChromaticAberrationShader } from './src/Model/Components/postProcessShaders/ChromaticAberrationShader';

// Add multiple effects (order determines render sequence)
camera.addComponent(createGrayscaleShader());           // order: 0
camera.addComponent(createChromaticAberrationShader()); // order: 5
camera.addComponent(createVignetteShader());            // order: 10
```

## Custom Uniforms (Group 1)

Add custom uniforms to your post-processing shaders:

```typescript
const u_blurRadius = new Float32Array([5.0]);

const blurShader = new PostProcessingShader(
    'blur-effect',
    blurFragmentShader,
    [
        {
            binding: 0,
            size: 4,  // f32 = 4 bytes
            type: 'uniform',
            visibility: ShaderStage.FRAGMENT,
            data: u_blurRadius
        }
    ]
);

// Update the uniform at runtime
function setBlurRadius(radius: number) {
    u_blurRadius[0] = radius;
    // Buffer will be automatically updated on next frame
}
```

## Built-in Bindings (Group 0)

The following bindings are automatically provided to all post-processing shaders:

| Binding | Type | Description |
|---------|------|-------------|
| 0 | sampler | Texture sampler for the input |
| 1 | texture_2d<f32> | Input texture (previous pass or scene) |
| 2 | vec2f | Screen resolution (width, height) |
| 3 | f32 | Elapsed time in seconds |

## Enable/Disable at Runtime

```typescript
// Toggle effect
postProcess.pipelineSettings!.enabled = false;

// Or use helper
if (postProcess.isEnabled()) {
    postProcess.pipelineSettings!.enabled = false;
}
```

## Example Shaders

Several example post-processing shaders are provided:

- **GrayscaleShader**: Converts scene to grayscale with adjustable intensity
- **VignetteShader**: Adds edge darkening effect
- **ChromaticAberrationShader**: Color fringing effect at screen edges

```typescript
import { createGrayscaleShader, setGrayscaleIntensity } from './src/Model/Components/postProcessShaders/GrayscaleShader';
import { createVignetteShader, setVignetteParams } from './src/Model/Components/postProcessShaders/VignetteShader';

const grayscale = createGrayscaleShader();
setGrayscaleIntensity(grayscale, 0.5); // 50% grayscale

const vignette = createVignetteShader();
setVignetteParams(vignette, 0.7, 0.4, 0.5); // intensity, radius, softness
```

## Notes

- Post-processing uses non-MSAA textures (resolve happens before post-process)
- Effects are applied in order based on the `order` setting (lower = earlier)
- Multiple effects use ping-pong buffers to chain efficiently
- The vertex shader generates a full-screen triangle using vertex index (no vertex buffers needed)
- Disabled effects are skipped entirely (no performance cost)