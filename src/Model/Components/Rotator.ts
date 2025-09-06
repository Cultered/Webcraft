import type { Component } from './Component';
import { Entity } from '../Entity';
import * as M from '../../misc/mat4';

export class Rotator implements Component {
    speed: number;
    axis: { x: number; y: number; z: number };
    constructor(speed = 0.1, axis = { x: 0, y: 1, z: 0 }) {
        this.speed = speed;
        this.axis = axis;
    }
    update(entity: Entity, deltaMs?: number) {
        const seconds = (deltaMs ?? 16) / 1000;
        const rot = M.mat4Rotation(this.axis.x * this.speed * seconds, this.axis.y * this.speed * seconds, this.axis.z * this.speed * seconds);
        entity.rotation = M.mat4Mul(M.mat4(), rot, entity.rotation);
        return entity.rotation;
    }
}

export default Rotator;
