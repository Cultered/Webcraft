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

    c.view.th.addTexture('example-texture', await loadImageData(exampleTextureUrl));//TODO make this a controller function

    // Load the OBJ file
    const monkeObjContent = await loadOBJFile('/monke.obj');
    const LogoBlueprints = await loadOBJFile('/LogoBlueprints.obj');
    
    // Generate UV texture from the OBJ file
    const uvTexture = generateUVTextureFromOBJ(LogoBlueprints, 1024);
    c.view.th.addTexture('monke-uv-texture', uvTexture);

    const monke = new Entity('monke', vec4(0, 0, 50), undefined, vec4(10, 10, 10, 1), false);
    monke.rotateEuler(0, Math.PI, 0);
    const monkeMesh = { id: "monkeMesh", ...loadOBJ(monkeObjContent) };
    monke.addComponent(new MeshComponent(monkeMesh, "example-texture"));
    MODEL.addEntity(monke);

    const groundPlane = new Entity('groundPlane', vec4(0, -10, 0), undefined, vec4(100, 1, 100, 1), false);
    groundPlane.addComponent(new MeshComponent({id:'planeMesh', ...generatePlaneMesh(1)}, 'monke-uv-texture'));
    groundPlane.addComponent(exampleTextureShader);
    MODEL.addEntity(groundPlane);





})();
