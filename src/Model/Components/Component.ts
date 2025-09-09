import { Entity } from '../Entity';

export interface Component {
    start?(entity:Entity):any;
    update?(entity: Entity): any;
}

// note: no default export for a type-only export
