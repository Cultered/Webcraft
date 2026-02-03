import type { Component } from './Component';
import type { Mesh } from '../../Types/MeshType';
import type Entity from '../Entity';
import defaultRenderShader from '../../View/shaders/DefaultRenderer';
import CustomRenderShader from './CustomRenderShader';

export class MeshComponent implements Component {
    mesh: Mesh;
    texture: string;
    constructor(mesh: Mesh, texture: string = 'primitive') { 
        this.mesh = mesh; 
        this.texture = texture;
    }

    start(entity: Entity): Mesh {
        // Ensure entity has a render shader (use default if none)
        if (!entity.getComponent(CustomRenderShader)) {
            entity.addComponent(defaultRenderShader);
        }
        return this.mesh;
    }
}

export default MeshComponent;
