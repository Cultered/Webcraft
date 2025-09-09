import { o11s } from './config/config';
import { createView } from './View/View';
import Model from './Model/Model';
import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import {mat4Rotation} from './misc/mat4'
import {vec4} from './misc/vec4';
import Rotator from './Model/Components/Rotator';
import exampleTextureUrl from './misc/lex.png';
import { sphere3 } from './misc/misc';
import { loadImageData } from './misc/loadFiles';

(async () => {
    const view = await createView(o11s.USE_WEBGPU);
    const model = new Model();
    const controller = new Controller(model, view);
    controller.hello()

    model.addCamera('main-camera', vec4(0, 0, 0), mat4Rotation(0, Math.PI, 0));
    const mainCam = model.getCamera('main-camera');
    if (mainCam) {
        const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
        const Freecam = (await import('./Model/Components/Freecam')).default;
        mainCam.addComponent(new Freecam(canvasEl));
    }

    

    try {
        const imageData = await loadImageData(exampleTextureUrl);
        (view as any).uploadTextureFromImageData?.('example-texture', imageData);
    } catch (e) { console.warn('Failed to load example texture', e); }

    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };

    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.normals, sphereMesh.uvs, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.normals, cubeMesh.uvs, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.normals, LOD_MESH.uvs, LOD_MESH.indices);

    const sphereComponent = new MeshComponent(sphereMesh, true, 'example-texture');


    const points = sphere3(20, 6, 7);
    points.forEach(([x, y, z], idx) => {
        const id = `torusTubeSphere-${idx}`;
        const ent = new Entity(id, vec4(x, y, z), undefined, vec4(3, 3, 3, 1), true);
        ent.addComponent(sphereComponent);
        model.addEntity(ent);
    });

    
    const cubeEntity = new Entity('rotating-cube', vec4(0, 0, 0), undefined, vec4(10, 10, 10, 1), false);
    const cubeComponent = new MeshComponent(cubeMesh, true,"example-texture");
    cubeEntity.addComponent(cubeComponent);
    const rotator = new Rotator(1,{x:0,y:1,z:0});
    cubeEntity.addComponent(rotator);
    model.addEntity(cubeEntity);




})();
