import type { Component } from './Component';
import { Entity } from '../Entity';
import type { Mesh } from '../../misc/meshes';

export class MeshComponent implements Component {
    mesh: Mesh;
    useLOD: boolean
    constructor(mesh: Mesh, useLOD: boolean) { this.mesh = mesh; this.useLOD = useLOD }
    start(entity: Entity) {
        entity.props.mesh = this.mesh.id
    }
    LODReduce(entity: Entity) {
        if (this.useLOD) { entity.props.mesh = 'builtin-lod-mesh' }
    }
}

export default MeshComponent;
