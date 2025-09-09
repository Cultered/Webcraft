import type { Component } from './Component';
import type { Mesh } from '../../Types/MeshType';

export class MeshComponent implements Component {
    mesh: Mesh;
    texture: string;
    constructor(mesh: Mesh, texture: string = 'primitive') { 
        this.mesh = mesh; 
        this.texture = texture;
    }

    start() : Mesh {
        return this.mesh;
    }
}

export default MeshComponent;
