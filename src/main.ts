import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import Rotator from './Model/Components/customScripts/Rotator';
import Freecam from './Model/Components/customScripts/Freecam';
import { Entity } from './Model/Entity';
import { loadOBJ } from './Types/MeshUtils';
import { mat4Rotation } from './misc/mat4'
import { vec4 } from './misc/vec4';
import { generatePlaneMesh } from './Types/MeshUtils';
import { loadImageData, loadOBJFile } from './misc/loadFiles';
import exampleRenderShader from './Model/Components/customShaders/ExampleRenderShader';
import exampleTextureShader from './Model/Components/customShaders/ExampleTextureShader';
import exampleTextureUrl from './misc/lex.png';
import { MODEL } from './Controller/Controller';

(async () => {
    const c = new Controller('main-camera');
    await c.init();

    const mainCam = MODEL.addCamera('main-camera', vec4(0, 0, 0), mat4Rotation(0, Math.PI, 0));
    mainCam.addComponent(new Freecam());

    c.view.addTexture('example-texture', await loadImageData(exampleTextureUrl));//TODO make this a controller function

    const monke = new Entity('monke', vec4(10, 0, 50), undefined, vec4(10, 10, 10, 1), false);
    monke.rotateEuler(0, Math.PI, 0);
    const monkeMesh = { id: "monkeMesh", ...loadOBJ(await loadOBJFile('/monke.obj')) };
    monke.addComponent(new MeshComponent(monkeMesh, "example-texture"));
    monke.addComponent(new Rotator(0.1, { x: 1, y: 1, z: 1 }));
    monke.addComponent(exampleRenderShader);
    MODEL.addEntity(monke);


    const depthViewPlane = new Entity('depth-view-plane', vec4(-40, 0, 50), undefined, vec4(50, 50, 50, 1), false);
    depthViewPlane.rotateEuler(-Math.PI / 2, 0, Math.PI);
    const planeMesh = {"id": "depth-plane", ...generatePlaneMesh(1)};
    depthViewPlane.addComponent(new MeshComponent(planeMesh, 'example-texture'));
    depthViewPlane.addComponent(exampleTextureShader);
    MODEL.addEntity(depthViewPlane);
    



})();
