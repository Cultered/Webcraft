import type { Vector4 } from '../Types/Vector4';
import type { Matrix4x4 } from '../Types/Matrix4x4';
import * as M from '../misc/mat4';
import type { Component } from './Components/Component';
import { vec4 } from '../misc/vec4';

// Minimal Entity class for an Entity-Component System
export class Entity {
    id: string;
    position: Vector4;
    rotation: Matrix4x4;
    inverseRotation?: Matrix4x4;
    updateInverseRotation: boolean = true; // if true, inverse rotation will be recalculated on next request
    scale: Vector4;
    isStatic: boolean = false;
    // components keyed by constructor name for fast lookup
    components: Map<string, Component> = new Map();
    chunkKey?: string;
    // Euler angle caching
    private eulerAngles?: [number, number, number];
    private previousRotation?: Matrix4x4;

    constructor(id: string, position?: Vector4, rotation?: Matrix4x4, scale?: Vector4, isStatic: boolean = false) {
        this.id = id;
        this.position = position ?? vec4(0, 0, 0, 1);
        this.rotation = rotation ?? M.mat4Identity();
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
            this.inverseRotation = M.mat4Inverse(M.mat4(), this.rotation);
            this.updateInverseRotation = false;
        }
        return this.inverseRotation ?? M.mat4Identity();
    }

    /**
     * Get Euler angles (in radians) from the entity's rotation matrix.
     * Uses ZYX order. Returns cached values unless rotation has changed.
     * @returns [x, y, z] euler angles in radians
     */
    getEuler(): [number, number, number] {
        // Check if rotation has changed by comparing with previous rotation
        if (!this.eulerAngles || !this.previousRotation || !this.rotationsEqual(this.rotation, this.previousRotation)) {
            // Recalculate Euler angles
            this.eulerAngles = M.mat4GetEulerZYX(this.rotation);
            // Store a copy of current rotation for future comparison
            this.previousRotation = new Float32Array(this.rotation);
        }
        return this.eulerAngles;
    }

    /**
     * Set the entity's rotation from Euler angles (in radians) using ZYX order.
     * @param x rotation around X axis in radians
     * @param y rotation around Y axis in radians
     * @param z rotation around Z axis in radians
     */
    setEuler(x: number, y: number, z: number): void {
        this.rotation = M.mat4Rotation(x, y, z);
        this.updateInverseRotation = true;
        // Update cached values
        this.eulerAngles = [x, y, z];
        this.previousRotation = new Float32Array(this.rotation);
    }

    /**
     * Rotate the entity by the given Euler angles (in radians) using ZYX order.
     * @param x rotation delta around X axis in radians
     * @param y rotation delta around Y axis in radians
     * @param z rotation delta around Z axis in radians
     */
    rotateEuler(x: number, y: number, z: number): void {
        const current = this.getEuler();
        this.setEuler(current[0] + x, current[1] + y, current[2] + z);
    }

    /**
     * Helper method to check if two rotation matrices are equal
     */
    private rotationsEqual(a: Matrix4x4, b: Matrix4x4): boolean {
        for (let i = 0; i < 16; i++) {
            if (Math.abs(a[i] - b[i]) > 1e-9) {
                return false;
            }
        }
        return true;
    }
}

export default Entity;
