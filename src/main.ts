import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import Rotator from './Model/Components/customScripts/Rotator';
import Freecam from './Model/Components/customScripts/Freecam';
import UprightCam from './Model/Components/customScripts/UprightCam';
import Skybox from './Model/Components/customScripts/Skybox';
import { Entity } from './Model/Entity';
import { loadOBJ, generateUVTextureFromOBJ, generateSphereMesh, generateCubeMesh } from './Types/MeshUtils';
import { mat4Rotation } from './misc/mat4'
import { vec4 } from './misc/vec4';
import { generateHDPlaneMesh } from './Types/MeshUtils';
import { loadImageData, loadOBJFile } from './misc/loadFiles';
import exampleRenderShader from './Model/Components/customShaders/ExampleRenderShader';
import exampleTextureShader from './Model/Components/customShaders/ExampleTextureShader';
import skyboxShader from './Model/Components/customShaders/SkyboxShader';
import exampleTextureUrl from './misc/rcokwall.jpg';
import { MODEL } from './Controller/Controller';
import lexTextureUrl from './misc/lex.png';

(async () => {
    const c = new Controller('main-camera');
    await c.init();

    const mainCam = MODEL.addCamera('main-camera', vec4(0, 20, 50), mat4Rotation(0, 0, 0));
    mainCam.addComponent(new UprightCam());

    c.view.th!.addTexture('example-texture', await loadImageData(exampleTextureUrl));//TODO make this a controller function
    c.view.th!.addTexture('lex-texture', await loadImageData(lexTextureUrl));

    // Create sphere mesh (reused for all spheres)
    const cubeMesh = { id: "cubeMesh", ...generateSphereMesh(3,5) };

    // First sphere: Static (no custom shader)
    const cube1 = new Entity('cube1', vec4(-15, 0, 0), undefined, vec4(1, 1, 1, 1), false);
    cube1.addComponent(new MeshComponent(cubeMesh, "example-texture"));
    MODEL.addEntity(cube1);

    // Second sphere: With exampleRenderShader
    const cube2 = new Entity('cube2', vec4(15, 0, 0), undefined, vec4(1, 1, 1, 1), false);
    cube2.addComponent(new MeshComponent(cubeMesh, "example-texture"));
    cube2.addComponent(exampleRenderShader);
    MODEL.addEntity(cube2);

    // Third sphere: With exampleTextureShader
    const cube3 = new Entity('cube3', vec4(0, 0, 0), undefined, vec4(1, 1, 1, 1), false);
    cube3.addComponent(new MeshComponent(cubeMesh, "example-texture"));
    cube3.addComponent(exampleTextureShader);
    MODEL.addEntity(cube3);

    // Skybox: Giant cube that follows the camera
    const skyboxMesh = { id: "skyboxMesh", ...generateCubeMesh(5000) };
    const skybox = new Entity('skybox', vec4(0, 0, 0), undefined, vec4(1, 1, 1, 1), false);
    skybox.addComponent(new MeshComponent(skyboxMesh, "example-texture"));
    skybox.addComponent(new Skybox('main-camera'));
    skybox.addComponent(skyboxShader);
    MODEL.addEntity(skybox);

})();
