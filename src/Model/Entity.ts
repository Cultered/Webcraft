import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';
import * as M from '../misc/Matrix4x4';
import type { Component } from './Components/Component';

// Minimal Entity class for an Entity-Component System
export class Entity {
    id: string;
    position: Vector4;
    rotation: Matrix4x4;
    scale: Vector4;
    isStatic: boolean = true;
    // components keyed by constructor name for fast lookup
    components: Map<string, Component> = new Map();
    // keep props for backwards-compatibility with existing View code
    props: any = {};

    constructor(id: string, position?: Vector4, rotation?: Matrix4x4, scale?: Vector4) {
        this.id = id;
        this.position = position ?? new Float32Array([0, 0, 0, 1]);
        this.rotation = rotation ?? M.mat4Identity();
        this.scale = scale ?? new Float32Array([1, 1, 1, 1]);
        
    }

    addComponent<T extends Component>(c: T): T {
        if(c.update) this.isStatic = false;
        const key = (c as any).constructor?.name ?? String(Math.random());
        this.components.set(key, c);
        c.start(this);
        return c;
    }

    getComponent<T extends Component>(ctor: new (...args: any[]) => T): T | undefined {
        const key = (ctor as any).name;
        return this.components.get(key) as T | undefined;
    }

    update(deltaMs?: number) {
        if (this.isStatic) return;
        const out: any[] = [];
        for (const c of this.components.values()) {
            if (c.update) out.push(c.update(this, deltaMs));
            else out.push(null);
        }
        return out;
    }
}

export default Entity;
