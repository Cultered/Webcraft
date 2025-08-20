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
    const debugEl =setupDebugElement()
    view.setDebugElement(debugEl);

    model.addCamera('main-camera', new Vector4(0, 0, 10, 1), new Vector4(0, 0, 0, 1));
    for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 10; j++) {
            for (let k = 0; k < 10; k++) {
                model.addSphere(`sphere-${i}-${j}-${k}`, 10, 5, 0.5, new Vector4(i * 2, j * 2, k * 2, 2));
            }
        }
    }
    

    await view.registerSceneObjects(model.getObjects(),true);


    // Camera control state
    const cam = model.getCamera('main-camera');
    let camPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    let yaw = cam.rotation.y || 0; // horizontal
    let pitch = cam.rotation.x || 0; // vertical

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
        yaw -= e.movementX * mouseSensitivity;
        pitch -= e.movementY * mouseSensitivity;
        const maxPitch = Math.PI / 2 - 0.01;
        pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    }

    let lastModelTime = performance.now();
    const modelLoop = () => {
        const now = performance.now();
        const delta = (now - lastModelTime) / 1000; // seconds
        lastModelTime = now;

        model.update(delta * 1000);

        // movement: WASD for planar movement, space/up for up, ctrl/down for down
        const speedBase = keys.has('shift') ? 10 : 3; // units per second
        const forward = {
            x: Math.sin(yaw),
            y: 0,
            z: Math.cos(yaw),
        };
        const right = {
            x: Math.cos(yaw),
            y: 0,
            z: -Math.sin(yaw),
        };
        if (keys.has('w')) {
            camPos.x += forward.x * speedBase * delta;
            camPos.z += forward.z * speedBase * delta;
        }
        if (keys.has('s')) {
            camPos.x -= forward.x * speedBase * delta;
            camPos.z -= forward.z * speedBase * delta;
        }
        if (keys.has('a')) {
            camPos.x -= right.x * speedBase * delta;
            camPos.z -= right.z * speedBase * delta;
        }
        if (keys.has('d')) {
            camPos.x += right.x * speedBase * delta;
            camPos.z += right.z * speedBase * delta;
        }
        if (keys.has(' ')) { // space
            camPos.y += speedBase * delta;
        }
        if (keys.has('control') || keys.has('ctrl')) {
            camPos.y -= speedBase * delta;
        }

        // push camera update into model
        model.updateCamera('main-camera', new Vector4(camPos.x, camPos.y, camPos.z, 1), new Vector4(pitch, yaw, 0, 0));
    };
    setInterval(modelLoop, 1000 / 60);

    const renderLoop = () => {
        view.registerSceneObjects(model.getObjects(),false).catch(err => console.error('registerSceneObjects failed', err));
        view.registerCamera(model.getCamera("main-camera"));
        view.render();
        requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);
})();
