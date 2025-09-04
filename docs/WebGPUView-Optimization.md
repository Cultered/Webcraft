# WebGPUView Optimization Guide

## Overview

The WebGPUView has been optimized to handle static and non-static objects efficiently. This optimization reduces GPU memory bandwidth usage and improves rendering performance by minimizing unnecessary buffer updates and state changes.

## Key Features

### 1. Static/Non-static Object Separation

Objects are now categorized into two types:
- **Static Objects**: Objects that don't change after initial setup (terrain, buildings, etc.)
- **Non-static Objects**: Objects that may change frequently (moving characters, animated objects, etc.)

### 2. Optimized Buffer Layout

The GPU buffer is organized as follows:
```
[Static Objects by Mesh A] [Static Objects by Mesh B] ... [Non-static Objects by Mesh A] [Non-static Objects by Mesh B] ...
```

This layout enables:
- Static objects to never be updated once placed in GPU memory
- Partial buffer updates for only the non-static portion
- Efficient batched rendering by mesh type

### 3. Rendering Optimization

The rendering pipeline draws objects in this order:
1. All static objects, grouped by mesh type
2. All non-static objects, grouped by mesh type

This minimizes GPU state changes while maintaining optimal buffer organization.

## API Usage

### Basic Setup

```typescript
const webgpuView = new WebGPUView();
await webgpuView.init(canvas);

// Upload meshes
webgpuView.uploadMeshes({
    'building': buildingMesh,
    'character': characterMesh,
    'tree': treeMesh
});
```

### Registering Objects with Optimization

```typescript
// Define static objects (won't change)
const staticObjects: SceneObject[] = [
    {
        id: 'building-1',
        position: vec4(10, 0, 10, 1),
        rotation: mat4Identity(),
        scale: vec4(1, 1, 1, 1),
        props: { mesh: 'building' }
    },
    {
        id: 'tree-1',
        position: vec4(5, 0, 15, 1),
        rotation: mat4Identity(),
        scale: vec4(1, 1, 1, 1),
        props: { mesh: 'tree' }
    }
];

// Define non-static objects (may change)
const nonStaticObjects: SceneObject[] = [
    {
        id: 'player',
        position: vec4(0, 0, 0, 1),
        rotation: mat4Identity(),
        scale: vec4(1, 1, 1, 1),
        props: { mesh: 'character' }
    }
];

// Initial registration - update both static and non-static
webgpuView.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, true);

// Later updates - only update non-static objects
nonStaticObjects[0].position = vec4(1, 0, 0, 1); // Move player
webgpuView.registerSceneObjectsSeparated(staticObjects, nonStaticObjects, false);
```

### Parameters

- `staticObjects`: Array of objects that won't change position, rotation, or scale
- `nonStaticObjects`: Array of objects that may change
- `updateStatic`: Boolean flag indicating whether to update static objects
  - `true`: Update both static and non-static objects (use for initial setup or when static objects change)
  - `false`: Only update non-static objects (use for regular frame updates)

## Performance Benefits

### Memory Bandwidth Reduction

- Static objects are written to GPU memory once and never updated
- Only non-static objects consume GPU bandwidth for updates
- For scenes with many static objects, this can reduce bandwidth usage by 50-90%

### Rendering Efficiency

- Objects are batched by mesh type, reducing state changes
- Single `drawIndexed` call per mesh group instead of per object
- GPU can process large batches of similar objects efficiently

### CPU Efficiency

- Reduced CPU work for buffer updates
- Only non-static object matrices need recalculation
- Batch tracking optimizes draw call generation

## Example Performance Scenario

Consider a scene with:
- 1000 static buildings (mesh type: 'building')
- 500 static trees (mesh type: 'tree')  
- 10 moving characters (mesh type: 'character')

**Before optimization:**
- 1510 objects updated every frame
- 1510 draw calls (worst case) or mixed batching

**After optimization:**
- 10 objects updated every frame (only characters)
- 6 draw calls total (3 static mesh batches + 3 non-static mesh batches)
- 99.3% reduction in buffer updates
- Significant reduction in draw calls

## Migration from Previous API

If you were using a generic object registration method, update your code as follows:

```typescript
// Old way
webgpuView.registerSceneObjects(allObjects);

// New way - separate static and non-static
const { static: staticObjs, nonStatic: nonStaticObjs } = separateObjects(allObjects);
webgpuView.registerSceneObjectsSeparated(staticObjs, nonStaticObjs, true);
```

## Best Practices

1. **Identify Static Objects**: Mark objects as static if they never move, rotate, or scale during gameplay
2. **Batch Similar Meshes**: Group objects using the same mesh together for better batching
3. **Update Strategy**: Use `updateStatic: false` for most frame updates, only use `true` when static objects actually change
4. **Buffer Size**: The optimization works best with scenes that have a high ratio of static to non-static objects

## Technical Details

### Buffer Organization

The implementation maintains three sets of batch information:
- `staticMeshBatches`: Batches for static objects only
- `nonStaticMeshBatches`: Batches for non-static objects only  
- `meshBatches`: Combined batches for backward compatibility

### Partial Buffer Updates

When `updateStatic: false`, only the non-static portion of the buffer is updated:
```typescript
const offsetBytes = this.nonStaticBaseOffset * 16 * 4; // 16 floats * 4 bytes per float
this.device.queue.writeBuffer(buffer, offsetBytes, nonStaticData.buffer, 0, nonStaticData.byteLength);
```

### Rendering Pipeline

The render method now iterates through batches in a specific order:
1. Static batches first (optimal GPU cache usage)
2. Non-static batches second
3. Each batch uses `drawIndexed` for efficient instanced rendering

This approach maintains the performance benefits of both static optimization and mesh-based batching.