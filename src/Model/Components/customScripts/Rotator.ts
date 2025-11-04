import type { Component } from '../Component';
import { Entity } from '../../Entity';
import * as M from '../../../misc/mat4';
import { DELTA_TIME } from '../../../Controller/Controller';

export class Rotator implements Component {
    speed: number;
    axis: { x: number; y: number; z: number };
    constructor(speed = 0.1, axis = { x: 0, y: 1, z: 0 }) {
        this.speed = speed;
        this.axis = axis;
    }
    update(entity: Entity) {
        const seconds = (DELTA_TIME ?? 16) / 1000;
        const rot = M.mat4Rotation(this.axis.x * Math.cos(Date.now() * 0.001) * this.speed * seconds, this.axis.y * Math.sin(Date.now() * 0.001) * this.speed * seconds, this.axis.z * Math.sin(Date.now() * 0.0005) * this.speed * seconds);
        entity.rotation = M.mat4Mul(M.mat4(), rot, entity.rotation);
        return entity.rotation;
    }
}

export default Rotator;
