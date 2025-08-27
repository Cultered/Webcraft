# Webcraft — Architecture & API Documentation

This document describes the project structure, architecture, and public APIs for the Webcraft project. It is intended to help new contributors understand the codebase and find the main components quickly.

## Project overview

Webcraft is a lightweight TypeScript&WebGPU 3D engine that organizes application logic into Model, View, and Controller-like pieces. It provides an entity-component-style model, update/render loop, and WebGPU shader rendering utilities.

The project is TypeScript-based and built to run in the browser (see `index.html` and `src/main.ts`). Use the npm scripts in `package.json` to start the dev server and build.

## High-level architecture

- Model: owns game/data state and components. Located under `src/Model`.
- View: rendering layer and shader code. Located under `src/View`.
- Controller: input and higher-level orchestration. Located under `src/Controller`.
- Misc: math helpers and utilities (vectors, matrices, canvas setup, debug UI).

The engine uses an entity-component approach: an `Entity` contains Components that implement update/render behaviors. The main loop updates components and forwards render objects to the renderer.

## Folder map and responsibilities

- `src/main.ts` — application bootstrap. Creates canvas, sets up the scene, and starts the main loop.
- `src/Controller/Controller.ts` — application controller(s). Handles input, scene setup, and coordination between model and view.
- `src/misc/Matrix4x4.ts` — 4x4 matrix math utilities used by transforms or shader uniforms.
- `src/misc/Vector4.ts` — vector math utilities.
- `src/misc/setUpCanvas.ts` — helper to create and configure the HTML canvas.
- `src/misc/setupDebugElement.ts` — helper that wires debug UI elements for development.
- `src/misc/misc.ts` — miscellaneous helpers (utility functions) used across the codebase.
- `src/Model/Model.ts` — central model manager that tracks entities and orchestrates component updates.
- `src/Model/Entity.ts` — entity definition containing components and transform/state.
- `src/Model/Components/Component.ts` — base component interface/class.
- `src/Model/Components/MeshComponent.ts` — component that represents a renderable mesh (geometry, material, shader references).
- `src/Model/Components/Rotator.ts` — example component that modifies an entity's rotation each frame.
- `src/View/View.ts` — contains the renderer bridge that converts model data into render objects and submits them to the WebGPU program(s).
- `src/View/shaders/renderer.ts` — shader and renderer utilities; builds shader programs and executes draw calls.
- `src/View/types` — types for render objects and update objects. Key files:
  - `RenderObject.ts` — the shape used by the renderer to draw a mesh (positions, indices, material uniforms, transform).

## Public APIs (summary)

Below are the main usable classes/functions and how to interact with them.

### `src/main.ts`
- Purpose: Application entry point. Creates canvas, controller, model, and starts the loop.
- Typical usage: open `index.html` or run the dev server and navigate to the page.

### `Controller.Controller` (src/Controller/Controller.ts)
- Purpose: Bootstraps the application, creates entities, wires components, and starts scene.
- Key methods (naming inferred):
  - `start()` — initialize scene and start update loop.
  - `update(dt, time)` — called each frame to update model and view.
- Interactions: Calls model to add entities, registers event listeners on canvas, forwards input state into update objects.

### `Model.Model` (src/Model/Model.ts)
- Purpose: Manage entities and dispatch updates.
- API:
  - `addEntity(entity: Entity)` — registers an entity with the model.
  - `removeEntity(entityId: string | number)` — removes entity and detaches components.
  - `update(dt: number, ctx: UpdateObject)` — calls update on each entity's components.
  - `getEntities()` — returns list of live entities.

### `Model.Entity` (src/Model/Entity.ts)
- Purpose: Lightweight container for components and transform.
- API:
  - `addComponent(component: Component)`
  - `removeComponent(componentType: string | typeof Component)`
  - `getComponent<T extends Component>(type: string | typeof Component): T | null`
  - `setTransform(...)` / `getTransform()`

### Components
- `Component` (base): implement lifecycle callbacks (`onAttach`, `onDetach`, `update`, `getRenderObject`).
- `MeshComponent`: holds mesh geometry and material; provides `getRenderObject()` for the renderer.
- `Rotator`: example component that updates entity rotation by a speed parameter.

## Lifecycle and update loop

1. Boot: `main.ts` sets up canvas, gl context, Controller, Model, and View.
2. Scene setup: Controller constructs entities and attaches components.
3. Main loop (requestAnimationFrame):
   - Compute delta and time
   - Build `UpdateObject` containing delta, time and input
   - Call `model.update(dt, updateObject)` which calls `component.update` on each component
   - Gather `RenderObject`s from components that can render
   - Call `view.render(renderObjects, camera, time)` to draw the frame

## Rendering pipeline overview

- MeshComponents provide raw vertex/index buffers and uniforms.
- `View` prepares shader programs via `renderer.ts` and caches compiled programs.
- For each `RenderObject`, the renderer binds appropriate program, VAO/buffers, sets uniforms (including transform matrix), and issues draw calls.
- The renderer may support multiple materials/shaders and will batch by program where possible.
