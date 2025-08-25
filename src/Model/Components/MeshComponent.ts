import type { Component } from './Component';
import { Entity } from '../Entity';

export class MeshComponent implements Component {
    meshId: string;
    constructor(meshId: string) { this.meshId = meshId }
    run(entity: Entity) { entity.props.mesh = this.meshId; return this.meshId }
}

export default MeshComponent;
