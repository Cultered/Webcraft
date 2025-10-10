import type { Vector4 } from '../Types/Vector4';
import type { Quaternion } from '../Types/Quaternion';
import * as Q from '../misc/quat';
import type { Component } from './Components/Component';
import { vec4 } from '../misc/vec4';

// Minimal Entity class for an Entity-Component System
export class Entity {
    id: string;
    position: Vector4;
    rotation: Quaternion;
    inverseRotation?: Quaternion;
    updateInverseRotation: boolean = true; // if true, inverse rotation will be recalculated on next request
    scale: Vector4;
    isStatic: boolean = false;
    // components keyed by constructor name for fast lookup
    components: Map<string, Component> = new Map();
    chunkKey?: string;

    constructor(id: string, position?: Vector4, rotation?: Quaternion, scale?: Vector4, isStatic: boolean = false) {
        this.id = id;
        this.position = position ?? vec4(0, 0, 0, 1);
        this.rotation = rotation ?? Q.quatIdentity();
        this.scale = scale ?? vec4(1, 1, 1, 1);
        this.isStatic = isStatic;
    }

    addComponent<T extends Component>(c: T): T {
        const key = (c as any).constructor?.name ?? String(Math.random());
        this.components.set(key, c);
        if (c.start) c.start(this);
        return c;
    }

    getComponent<T extends Component>(ctor: new (...args: any[]) => T): T | undefined {
        const key = (ctor as any).name;
        return this.components.get(key) as T | undefined;
    }

    update() {
        if (this.isStatic) return;
        const out: any[] = [];
        for (const c of this.components.values()) {
            if (c.update) out.push(c.update(this));
            else out.push(null);
        }
        return out;
    }
    requestInverseRotation = () => {
        if (this) {
            this.inverseRotation = Q.quatConjugate(Q.quat(), this.rotation);
            this.updateInverseRotation = false;
        }
        return this.inverseRotation ?? Q.quatIdentity();
    }
}

export default Entity;
