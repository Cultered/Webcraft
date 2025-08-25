import { Entity } from '../Entity';

export interface Component {
    // run is called with the entity and optional delta time (ms)
    run(entity: Entity, deltaMs?: number): any;
}

// note: no default export for a type-only export
