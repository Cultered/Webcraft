import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import Rotator from './Model/Components/customScripts/Rotator';
import Freecam from './Model/Components/customScripts/Freecam';
import { Entity } from './Model/Entity';
import { loadOBJ, generateUVTextureFromOBJ } from './Types/MeshUtils';
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

    // Load the OBJ file
    const monkeObjContent = await loadOBJFile('/monke.obj');
    const LogoBlueprints = await loadOBJFile('/LogoBlueprints.obj');
    
    // Generate UV texture from the OBJ file
    const uvTexture = generateUVTextureFromOBJ(LogoBlueprints, 1024);
    c.view.addTexture('monke-uv-texture', uvTexture);

    const monke = new Entity('monke', vec4(10, 20, 50), undefined, vec4(10, 10, 10, 1), false);
    monke.rotateEuler(0, Math.PI, 0);
    const monkeMesh = { id: "monkeMesh", ...loadOBJ(LogoBlueprints) };
    monke.addComponent(new MeshComponent(monkeMesh, "example-texture"));
    MODEL.addEntity(monke);


    const depthViewPlane = new Entity('depth-view-plane', vec4(-40, 0, 50), undefined, vec4(50, 50, 50, 1), false);
    depthViewPlane.rotateEuler(-Math.PI / 2, 0, Math.PI);
    const planeMesh = {"id": "depth-plane", ...generatePlaneMesh(1)};
    depthViewPlane.addComponent(new MeshComponent(planeMesh, 'example-texture'));
    depthViewPlane.addComponent(exampleTextureShader);
    MODEL.addEntity(depthViewPlane);
    
    // Create a plane to display the UV texture
    const uvViewPlane = new Entity('uv-view-plane', vec4(40, 0, 50), undefined, vec4(50, 50, 50, 1), false);
    uvViewPlane.rotateEuler(-Math.PI / 2, 0, 0);
    const uvPlaneMesh = {"id": "uv-plane", ...generatePlaneMesh(1)};
    uvViewPlane.addComponent(new MeshComponent(uvPlaneMesh, 'monke-uv-texture'));
    MODEL.addEntity(uvViewPlane);



})();
