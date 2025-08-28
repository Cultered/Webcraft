import View from './View/View';
import Model from './Model/Model';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './misc/meshes';
import { Vector4 } from './misc/Vector4';
import { setupDebugElement } from './misc/setupDebugElement';
import { setUpCanvas } from './misc/setUpCanvas';
import { Matrix4x4 } from './misc/Matrix4x4';
import Controller from './Controller/Controller';
import Rotator from './Model/Components/Rotator';

console.log('starting app');

// Ensure an #app container exists
if (!document.querySelector('#app')) {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
}

(async () => {
    const view = new View();
    const model = new Model();
    await view.initWebGPU(setUpCanvas());
    const debugEl = setupDebugElement()
    view.setDebugElement(debugEl);

    model.addCamera('main-camera', new Vector4(0, 0, 0, 0), Matrix4x4.rotationalMatrix(new Vector4(0, 3, 0, 0)));
    // create builtin meshes and upload them to the view; attach MeshComponents to entities as they are created
    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };
    // upload meshes to GPU via view
    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.indices);

    // create reusable MeshComponent instances
    const sphereComponent = new MeshComponent(sphereMesh, true);

    for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
            for (let k = 0; k < 100; k++) {
                const id = `obj-${i}-${j}-${k}`;
                // create Entity instance first
                const ent = new Entity(id, new Vector4(i * 2, j * 2, k * 2, 0), undefined, new Vector4(0.1, 0.1, 0.1, 1));
                // attach components before registering with the model
                ent.addComponent(sphereComponent);
                // now add the fully-constructed entity to the model
                model.addExistingEntity(ent);
            }
        }
    }

    // add rotator to the second created sphere (obj-0-0-1)
    model.addComponentToEntity('obj-0-0-1', new Rotator(1.0, { x: 0, y: 1, z: 0 }));



    await view.registerSceneObjects(model.getObjects(), true);
    // create chunk index from all scene objects; choose chunk size (same as View.currentChunkSize default)

    // Camera controller
    const canvasEl = document.querySelector('#webgpu-canvas') as HTMLCanvasElement;
    const controller = new Controller(model, () => renderLoop());
    controller.init(canvasEl, debugEl);
    controller.start();
    const renderLoop = () => {

        // timing for render steps
        const times: { [k: string]: number } = {};

        const t0 = performance.now();
        // Model updates are driven by Controller; Model will call onSceneObjectsUpdated when it updates.
        view.registerSceneObjects(model.getObjects(), false).catch(err => console.error('registerSceneObjects failed', err));
        times['registerSceneObjects'] = performance.now() - t0;

        const t1 = performance.now();
        view.registerCamera(model.getCamera("main-camera"));
        times['registerCamera'] = performance.now() - t1;

        const t2 = performance.now();
        view.render();
        times['view.render'] = performance.now() - t2;

        // FPS calculation
        if (!renderLoop.hasOwnProperty('lastTime')) {
            (renderLoop as any).lastTime = performance.now();
            (renderLoop as any).frameCount = 0;
            (renderLoop as any).fps = 0;
        }
        (renderLoop as any).frameCount++;
        const now = performance.now();
        const lastTime = (renderLoop as any).lastTime;
        if (now - lastTime >= 1000) {
            (renderLoop as any).fps = (renderLoop as any).frameCount;
            (renderLoop as any).frameCount = 0;
            (renderLoop as any).lastTime = now;
        }
        const fps = (renderLoop as any).fps;
        debugEl.innerText += `\nFPS: ${fps}`;

        // append timing breakdown
        const total = Object.values(times).reduce((s, v) => s + v, 0);
        let out = `\nRender loop total: ${total.toFixed(2)} ms`;
        for (const k of Object.keys(times)) {
            out += `\n${k}: ${times[k].toFixed(2)} ms`;
        }
        debugEl.innerText += out + `\n`;

    };
})();
