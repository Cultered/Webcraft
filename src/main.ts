import View from './View/View';
import Model from './Model/Model';
import { Vector4 } from './misc/Vector4';

console.log('starting app');

// Ensure an #app container exists
if (!document.querySelector('#app')) {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
}

(async () => {
    const view = new View();

    // create canvas and debug overlay here (keep DOM/GPU separation)
    const canvas = document.createElement('canvas');
    canvas.id = 'webgpu-canvas';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.display = 'block';
    document.querySelector('#app')!.appendChild(canvas);

    const debugEl = document.createElement('div');
    debugEl.style.position = 'fixed';
    debugEl.style.right = '8px';
    debugEl.style.top = '8px';
    debugEl.style.background = 'rgba(0,0,0,0.6)';
    debugEl.style.color = 'white';
    debugEl.style.padding = '8px';
    debugEl.style.fontFamily = 'monospace';
    debugEl.style.zIndex = '9999';
    debugEl.innerText = 'WebGPU: init...';
    document.body.appendChild(debugEl);

    await view.initWebGPU(canvas);
    view.setDebugElement(debugEl);

    // create model and add a sphere + cube
    const model = new Model();
    model.addSphere('sphere-0', 32, 32, 1, undefined, undefined);
    // place cube to the right of the sphere
    model.addCube('cube-0', 1.5, new Vector4(2, 0, 0, 1), undefined);

    // register scene with view
    await view.registerSceneObjects(model.getObjects());

    console.log('WebGPU initialized and scene registered');

    // model update loop (fixed timestep ~60Hz)
    let lastModelTime = performance.now();
    const modelUpdate = () => {
        const now = performance.now();
        const delta = now - lastModelTime;
        lastModelTime = now;
        model.update(delta);
        // debug
        // console.log('model updated, rotation:', model.getObjects().map(o => o.rotation));
        // push object transforms to view's buffers if needed by calling register again
        // simple approach: re-upload object uniforms on each render
    };
    setInterval(modelUpdate, 1000 / 60);

    // render loop
    const renderLoop = () => {
        // view will read model.getObjects() internally if needed; for now re-register to ensure buffers exist
        view.registerSceneObjects(model.getObjects()).catch(err => console.error('registerSceneObjects failed', err));
        view.render();
        requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);
})();
