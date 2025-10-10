import type { Component } from './Component';
import { Entity } from '../Entity';
import * as Q from '../../misc/quat';
import { DELTA_TIME } from '../../Controller/Controller';

export class Rotator implements Component {
    speed: number;
    axis: { x: number; y: number; z: number };
    constructor(speed = 0.1, axis = { x: 0, y: 1, z: 0 }) {
        this.speed = speed;
        this.axis = axis;
    }
    update(entity: Entity) {
        const seconds = (DELTA_TIME ?? 16) / 1000;
        const rot = Q.quatFromEuler(this.axis.x * this.speed * seconds, this.axis.y * this.speed * seconds, this.axis.z * this.speed * seconds);
        entity.rotation = Q.quatMul(Q.quat(), rot, entity.rotation);
        entity.updateInverseRotation = true;
        return entity.rotation;
    }
}

export default Rotator;
