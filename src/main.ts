import {createView} from './View/View';
import Model from './Model/Model';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import { setupDebugElement } from './misc/setupDebugElement';
import * as M from './misc/mat4'
import * as V from './misc/vec4';
import Controller from './Controller/Controller';
import Rotator from './Model/Components/Rotator';
import { o11s } from './config/config';

console.log('starting app');

if (!document.querySelector('#app')) {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
}

(async () => {
    const view = await createView(o11s.USE_WEBGPU);
    const model = new Model();




    const debugEl = setupDebugElement()
    view.setDebugElement(debugEl);

    model.addCamera('main-camera', V.vec4(0,0,0), M.mat4Rotation(0, Math.PI, 0));
    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };
    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.indices);

    const sphereComponent = new MeshComponent(sphereMesh, true);

    for (let i = 0; i < 30; i++) {
        for (let j = 0; j < 30; j++) {
            for (let k = 0; k < 30; k++) {
                const id = `obj-${i}-${j}-${k}`;
                const ent = new Entity(id, V.vec4(i * 2, j * 2, k * 2), undefined, V.vec4(0.1, 0.1, 0.1, 1));
                ent.addComponent(sphereComponent);
                model.addExistingEntity(ent);
            }
        }
    }

    model.addComponentToEntity('obj-0-0-1', new Rotator(1.0, { x: 0, y: 1, z: 0 }));

    const separatedObjects = model.getObjectsSeparated();
    await view.registerSceneObjectsSeparated(separatedObjects.static, separatedObjects.nonStatic, true);


    const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
    const controller = new Controller(model, view);
    controller.init(canvasEl, debugEl);
    controller.start();
    
})();
