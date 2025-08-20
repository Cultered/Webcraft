import View from './View/View';
import Model from './Model/Model';
import { Vector4 } from './misc/Vector4';
import { setupDebugElement } from './misc/setupDebugElement';
import { setUpCanvas } from './misc/setUpCanvas';

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
    view.setDebugElement(setupDebugElement());


    model.addSphere('sphere-0', 32, 32, 1, undefined, undefined);
    model.addCube('cube-0', 1.5, new Vector4(2, 0, 0, 1), undefined);

    await view.registerSceneObjects(model.getObjects());


    let lastModelTime = performance.now();
    const modelLoop = () => {
        const now = performance.now();
        const delta = now - lastModelTime;
        lastModelTime = now;
        model.update(delta);
    };
    setInterval(modelLoop, 1000 / 60);

    const renderLoop = () => {
        //TODO move registerSceneObjects and registerCamera somewhere else for optimization
        view.registerSceneObjects(model.getObjects()).catch(err => console.error('registerSceneObjects failed', err));
        view.registerCamera(model.getCamera());
        view.render();
        requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);
})();
