import { Vector4 } from '../misc/Vector4';
import { Matrix4x4 } from '../misc/Matrix4x4';
import type { Component } from './Components/Component';

// Minimal Entity class for an Entity-Component System
export class Entity {
    id: string;
    position: Vector4;
    rotation: Matrix4x4;
    scale: Vector4;
    components: Component[] = [];
    // keep props for backwards-compatibility with existing View code
    props: any = {};

    constructor(id: string, position?: Vector4, rotation?: Matrix4x4, scale?: Vector4) {
        this.id = id;
        this.position = position ?? new Vector4(0, 0, 0, 1);
        this.rotation = rotation ?? Matrix4x4.identity();
        this.scale = scale ?? new Vector4(1, 1, 1, 1);
        
    }

    addComponent<T extends Component>(c: T): T {
        this.components.push(c);
        c.start(this)
        return c;
    }

    getComponent<T extends Component>(ctor: new (...args: any[]) => T): T | undefined {
        return this.components.find(c => c instanceof ctor) as T | undefined;
    }
    update(deltaMs?: number) {
        return this.components.map(c => c.update?(c.update(this, deltaMs)) : null);
    }
}

export default Entity;
