import { o11s } from './config/config';import { createView } from './View/View';
import Model from './Model/Model';
import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import * as M from './misc/mat4'
import * as V from './misc/vec4';
import Rotator from './Model/Components/Rotator';

(async () => {
    const view = await createView(o11s.USE_WEBGPU);
    const model = new Model();
    const controller = new Controller(model, view);
    controller.hello()

    model.addCamera('main-camera', V.vec4(1000, 1000, 1000), M.mat4Rotation(0, Math.PI, 0));
    const mainCam = model.getCamera('main-camera');
    if (mainCam) {
        mainCam.props.model = model;
        const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
        const Freecam = (await import('./Model/Components/Freecam')).default;
        mainCam.addComponent(new Freecam(canvasEl));
    }

    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };

    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.indices);

    const sphereComponent = new MeshComponent(sphereMesh, true);
    //const cubeComponent = new MeshComponent(cubeMesh, true);

    for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
            for (let k = 0; k < 100; k++) {
                const id = `obj-${i}-${j}-${k}`;
                const ent = new Entity(id, V.vec4(i * 20, j * 20, k * 20), undefined, V.vec4(1, 1, 1, 1));
                ent.addComponent(sphereComponent);

                model.addExistingEntity(ent);
            }
        }
    }

    model.addComponentToEntity('obj-0-0-1', new Rotator(1.0, { x: 1, y: 0, z: -1 }));




})();
