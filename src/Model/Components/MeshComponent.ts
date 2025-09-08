import type { Component } from './Component';
import type { Mesh } from '../../Types/MeshType';

export class MeshComponent implements Component {
    mesh: Mesh;
    texture: string;
    isLOD: boolean=false
    useLOD: boolean
    constructor(mesh: Mesh, useLOD: boolean, texture: string = 'primitive') { 
        this.mesh = mesh; 
        this.useLOD = useLOD;
        this.texture = texture;
    }

    start() : Mesh {
        return this.mesh;
    }
    restoreMesh() {
        if (this.isLOD) { this.isLOD = false; }
    }
    LODReduce() {
        if (this.useLOD) { this.isLOD = true }
    }
}

export default MeshComponent;
