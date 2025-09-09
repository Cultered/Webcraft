import { o11s } from './config/config';import { createView } from './View/View';
import Model from './Model/Model';
import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import * as M from './misc/mat4'
import * as V from './misc/vec4';
import Rotator from './Model/Components/Rotator';
// Added: import texture asset (Vite will turn this into a URL)
import exampleTextureUrl from './misc/lex.png';
import { torusTube } from './misc/misc';
import { loadImageData } from './misc/loadFiles';

(async () => {
    const view = await createView(o11s.USE_WEBGPU);
    const model = new Model();
    const controller = new Controller(model, view);
    controller.hello()

    model.addCamera('main-camera', V.vec4(0, 0, 0), M.mat4Rotation(0, Math.PI, 0));
    const mainCam = model.getCamera('main-camera');
    if (mainCam) {
        const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
        const Freecam = (await import('./Model/Components/Freecam')).default;
        mainCam.addComponent(new Freecam(canvasEl));
    }

    // Helper: load Image -> ImageData
    

    // Load & upload example texture (id: 'example-texture')
    try {
        const imageData = await loadImageData(exampleTextureUrl);
        (view as any).uploadTextureFromImageData?.('example-texture', imageData);
    } catch (e) { console.warn('Failed to load example texture', e); }

    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };

    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.normals, sphereMesh.uvs, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.normals, cubeMesh.uvs, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.normals, LOD_MESH.uvs, LOD_MESH.indices);

    // Use texture on all sphere instances
    const sphereComponent = new MeshComponent(sphereMesh, true, 'example-texture');


    // Use common defaults
    const R = 500, r = 70, p = 16, q = 17, Nu = 20, Nv = 1000;
    const tubePoints = torusTube(R, r, p, q, Nu, Nv);
    tubePoints.forEach(([x, y, z], idx) => {
        const id = `torusTubeSphere-${idx}`;
        const ent = new Entity(id, V.vec4(x, y, z), undefined, V.vec4(5, 5, 5, 1), true);
        ent.addComponent(sphereComponent);
        model.addEntity(ent);
    });

    
    // Add a rotating cube in the center
    const cubeEntity = new Entity('rotating-cube', V.vec4(0, 0, 0), undefined, V.vec4(10, 10, 10, 1), false);
    const cubeComponent = new MeshComponent(cubeMesh, true);
    cubeEntity.addComponent(cubeComponent);
    const rotator = new Rotator(1,{x:0,y:1,z:0});
    cubeEntity.addComponent(rotator);
    model.addEntity(cubeEntity);




})();
