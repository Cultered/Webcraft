import type { Component } from './Component';
import type { Mesh } from '../../Types/MeshType';

export class MeshComponent implements Component {
    mesh: Mesh;
    isLOD: boolean=false
    useLOD: boolean
    constructor(mesh: Mesh, useLOD: boolean) { this.mesh = mesh; this.useLOD = useLOD; }

    start() {
        this.isLOD = false;
    }
    restoreMesh() {
        if (this.isLOD) { this.isLOD = false; }
    }
    LODReduce() {
        if (this.useLOD) { this.isLOD = true }
    }
}

export default MeshComponent;
