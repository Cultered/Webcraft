import {createView} from './View/View';
import Model from './Model/Model';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import type { Vector4 } from './Types/Vector4';
import { setupDebugElement } from './misc/setupDebugElement';
import { setUpCanvas } from './misc/setUpCanvas';
import * as M from './misc/mat4';
import Controller from './Controller/Controller';
import Rotator from './Model/Components/Rotator';
import { o11s } from './Model/Model';

console.log('starting app');

if (!document.querySelector('#app')) {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
}

(async () => {
    const view = createView(o11s.USE_WEBGPU);
    const model = new Model();



    await view.init(setUpCanvas());

    const debugEl = setupDebugElement()
    view.setDebugElement(debugEl);

    model.addCamera('main-camera', new Float32Array([0, 0, 0, 0]) as Vector4, M.mat4Rotation(0, Math.PI, 0));
    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };
    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.indices);

    const sphereComponent = new MeshComponent(sphereMesh, true);

    for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 50; j++) {
            for (let k = 0; k < 50; k++) {
                const id = `obj-${i}-${j}-${k}`;
                const ent = new Entity(id, new Float32Array([i * 2, j * 2, k * 2, 0]) as Vector4, undefined, new Float32Array([0.1, 0.1, 0.1, 1]) as Vector4);
                ent.addComponent(sphereComponent);
                model.addExistingEntity(ent);
            }
        }
    }

    model.addComponentToEntity('obj-0-0-1', new Rotator(1.0, { x: 0, y: 1, z: 0 }));

    await view.registerSceneObjects(model.getObjects(), true);

    const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
    const controller = new Controller(model, () => renderLoop());
    controller.init(canvasEl, debugEl);
    controller.start();
    const renderLoop = () => {

        const times: { [k: string]: number } = {};

        const t0 = performance.now();
        view.registerSceneObjects(model.getObjects(), false).catch(err => console.error('registerSceneObjects failed', err));
        times['registerSceneObjects'] = performance.now() - t0;

        const t1 = performance.now();
        const mainCam = model.getCamera("main-camera");
        if (!mainCam) { console.error("No main camera"); return }
        view.registerCamera(mainCam);
        times['registerCamera'] = performance.now() - t1;

        const t2 = performance.now();
        view.render();
        times['view.render'] = performance.now() - t2;

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

        const total = Object.values(times).reduce((s, v) => s + v, 0);
        let out = `\nRender loop total: ${total.toFixed(2)} ms`;
        for (const k of Object.keys(times)) {
            out += `\n${k}: ${times[k].toFixed(2)} ms`;
        }
        debugEl.innerText += out + `\n`;

    };
})();
