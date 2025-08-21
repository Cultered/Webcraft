import View from './View/View';
import Model from './Model/Model';
import { Vector4 } from './misc/Vector4';
import { setupDebugElement } from './misc/setupDebugElement';
import { setUpCanvas } from './misc/setUpCanvas';
import { Matrix4x4 } from './misc/Matrix4x4';

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

    model.addCamera('main-camera', new Vector4(1, 1, 1, 1), Matrix4x4.prototype.rotationalMatrix(new Vector4(0,4,0,0)));
    for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 50; j++) {
            for (let k = 0; k < 50; k++) {
                model.addCube(`cube-${i}-${j}-${k}`, 0.2, new Vector4(i * i/10, j*3, k*3, 2));
            }
        }
    }



    await view.registerSceneObjects(model.getObjects(), true);

    // Camera control state
    const cam = model.getCamera('main-camera');

    const keys = new Set<string>();
    window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

    // pointer lock + mouse look
    const canvasEl = document.querySelector('#webgpu-canvas') as HTMLCanvasElement;
    canvasEl.addEventListener('click', () => {
        canvasEl.requestPointerLock?.();
    });

    const mouseSensitivity = 0.0025; // radians per pixel
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvasEl) {
            document.addEventListener('mousemove', onMouseMove);
        } else {
            document.removeEventListener('mousemove', onMouseMove);
        }
    });

    function onMouseMove(e: MouseEvent) {
        const dy = e.movementY * mouseSensitivity;//x axis rotation
        const dx = e.movementX * mouseSensitivity;//y axis rotation
        const ry = Matrix4x4.prototype.rotationalMatrix(new Vector4(0, -dx, 0, 0))
        const rx = Matrix4x4.prototype.rotationalMatrix(new Vector4(-dy, 0, 0, 0))
        cam.rotation = (rx.mulMatrix(ry.mulMatrix(cam.rotation)))
        cam.props.updateInverseRotation = true
        model.updateCamera('main-camera', cam.position, cam.rotation);
    }

    let lastModelTime = performance.now();
    const modelLoop = () => {
        const now = performance.now();
        const delta = (now - lastModelTime) / 1000; // seconds
        lastModelTime = now;

        model.update(delta * 1000);

        // movement: WASD for planar movement, space/up for up, ctrl/down for down
        const speedBase = keys.has('shift') ? -20 : -3; // units per second
        const forward = new Vector4(0, 0, speedBase * delta, 0)
        const right = new Vector4(speedBase * delta, 0, 0, 0)
        const up = new Vector4(0, speedBase * delta, 0, 0);

        if (keys.has('w')) {
            cam.position = cam.position.add(model.requestInverseRotation(cam).mul(forward))
        }
        if (keys.has('s')) {
            cam.position = cam.position.sub(model.requestInverseRotation(cam).mul(forward))
        }
        if (keys.has('a')) {
            cam.position = cam.position.add(model.requestInverseRotation(cam).mul(right))
        }
        if (keys.has('d')) {
            cam.position = cam.position.sub(model.requestInverseRotation(cam).mul(right))
        }
        if (keys.has(' ')) {
            cam.position = cam.position.sub(model.requestInverseRotation(cam).mul(up));
        }
        if (keys.has('control')) {
            cam.position = cam.position.add(model.requestInverseRotation(cam).mul(up));
        }
        // push camera update into model
        model.updateCamera('main-camera', cam.position, cam.rotation);
        renderLoop()
    };
    setInterval(modelLoop, 1000 / 60);

    const renderLoop = () => {
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
