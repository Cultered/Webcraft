import type { Component } from './Component';
import { Entity } from '../Entity';
import { Matrix4x4 } from '../../misc/Matrix4x4';
import { Vector4 } from '../../misc/Vector4';

export class Rotator implements Component {
    speed: number;
    axis: { x: number; y: number; z: number };
    constructor(speed = 0.1, axis = { x: 0, y: 1, z: 0 }) {
        this.speed = speed;
        this.axis = axis;
    }
    run(entity: Entity, deltaMs?: number) {
        const seconds = (deltaMs ?? 16) / 1000;
        const rot = Matrix4x4.rotationalMatrix(new Vector4(this.axis.x * this.speed * seconds, this.axis.y * this.speed * seconds, this.axis.z * this.speed * seconds, 0));
        entity.rotation = entity.rotation.mulMatrix(rot);
        return entity.rotation;
    }
}

export default Rotator;
