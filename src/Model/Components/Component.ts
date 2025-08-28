import { Entity } from '../Entity';

export interface Component {
    start(entity:Entity):any;
    update?(entity: Entity, deltaMs?: number): any;
}

// note: no default export for a type-only export
