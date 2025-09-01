# View Module

The View module provides rendering capabilities for the Webcraft engine, supporting both WebGL and WebGPU backends.

## Architecture

The module is structured with clean separation of concerns:

```
View/
├── BaseView.ts        # Abstract base class with common functionality
├── WebGLView.ts       # WebGL 2.0 implementation
├── WebGPUView.ts      # WebGPU implementation
├── View.ts            # Factory function and legacy compatibility wrapper
└── shaders/           # Shader implementations
```

## Usage

### New Code (Recommended)

For new code, use the factory function or direct instantiation:

```typescript
import { createView, WebGLView, WebGPUView } from './View/View';

// Using factory function
const view = createView(true);  // WebGPU
const view = createView(false); // WebGL

// Direct instantiation
const webglView = new WebGLView();
const webgpuView = new WebGPUView();
```

### Legacy Code (Backward Compatible)

Existing code continues to work without changes:

```typescript
import View from './View/View';

const view = new View();
await view.init(canvas, true); // WebGPU
// or
await view.init(canvas, false); // WebGL
```

## Benefits of the Refactoring

1. **Separation of Concerns**: WebGL and WebGPU code are cleanly separated
2. **Maintainability**: Each implementation can be modified independently
3. **Type Safety**: Better TypeScript support with specific interfaces
4. **Testability**: Each renderer can be tested in isolation
5. **Performance**: No branching overhead in render loops
6. **Extensibility**: Easy to add new rendering backends

## WebGL Implementation

The `WebGLView` class provides:
- WebGL 2.0 context initialization
- Efficient batch rendering with minimal state changes
- Automatic mesh buffer management
- Per-object matrix transformations

## WebGPU Implementation

The `WebGPUView` class provides:
- Modern WebGPU API with compute capabilities
- Storage buffer-based object matrix management
- Efficient instanced rendering
- Advanced GPU resource management

## Testing

Both implementations are thoroughly tested:
- Unit tests for individual methods
- Integration tests for rendering pipeline
- Mock-based testing for browser APIs
- Backward compatibility verification