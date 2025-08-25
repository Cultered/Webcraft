import View from './View/View';
import Model from './Model/Model';
import { Vector4 } from './misc/Vector4';
import { setupDebugElement } from './misc/setupDebugElement';
import { setUpCanvas } from './misc/setUpCanvas';
import { Matrix4x4 } from './misc/Matrix4x4';
import Controller from './Controller/Controller';

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

    view.uploadMeshes(model.getMeshes())
    await view.initWebGPU(setUpCanvas());
    const debugEl = setupDebugElement()
    view.setDebugElement(debugEl);

    model.addCamera('main-camera', new Vector4(0, 0, 0, 0), Matrix4x4.rotationalMatrix(new Vector4(0, 3, 0, 0)));
    for (let i = 0; i < 30; i++) {
        for (let j = 0; j < 30; j++) {
            for (let k = 0; k < 30; k++) {
                model.addSphere(`obj-${i}-${j}-${k}`, 0.1, new Vector4(i, j, k, 0));
            }
        }
    }



    await view.registerSceneObjects(model.getObjects(), true);
    // create chunk index from all scene objects; choose chunk size (same as View.currentChunkSize default)

    // Camera controller
    const canvasEl = document.querySelector('#webgpu-canvas') as HTMLCanvasElement;
    const controller = new Controller(model, () => renderLoop());
    controller.init(canvasEl, debugEl);
    controller.start();
    const renderLoop = () => {

        // compute camera chunk and only reload visible set if camera moved across chunk boundary
        view.registerSceneObjects(model.getObjects(), false).catch(err => console.error('registerSceneObjects failed', err));
        view.registerCamera(model.getCamera("main-camera"));
        view.render();
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

    };
})();
