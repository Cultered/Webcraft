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
import noiseTestsShader from './Model/Components/customShaders/noiseTestsShader';
import nebulaShader from './Model/Components/customShaders/NebulaShader';
import CustomRenderShader from './Model/Components/CustomRenderShader';
import forceFieldShader from './Model/Components/customShaders/ForceFieldShader';
import chromaticAberrationShader from './Model/Components/postProcessShaders/ChromaticAberrationShader';
import { 
    bloomShaders, 
    setBloomParams 
} from './Model/Components/postProcessShaders/BloomMultipass';

(async () => {
    const c = new Controller('main-camera');
    await c.init();
    
    const mainCam = MODEL.addCamera('main-camera', vec4(-40,0,20), undefined);
    mainCam.addComponent(new UprightCam(undefined, -Math.PI / 5, Math.PI / 2));
    
    // Add multi-pass bloom (4 passes: extract → horizontal blur → vertical blur → composite)
    MODEL.addPostProcessShader(chromaticAberrationShader)
    for (const shader of bloomShaders) {
        MODEL.addPostProcessShader(shader);
    }
    // Configure bloom: threshold, intensity, blur radius
    setBloomParams(0.96, 5, 5.0);
    
    //MODEL.addPostProcessShader(chromaticAberrationShader);

    c.view.th!.addTexture('example-texture', await loadImageData(exampleTextureUrl));
    c.view.th!.addTexture('lex-texture', await loadImageData(lexTextureUrl));

    const skyboxMesh = { id: "skyboxMesh", ...generateCubeMesh(5000) };
    const skybox = new Entity('skybox', vec4(0, 0, 0), undefined, vec4(1, 1, 1, 1), false);
    skybox.addComponent(new MeshComponent(skyboxMesh, "example-texture"));
    skybox.addComponent(new Skybox('main-camera'));
    skybox.addComponent(skyboxShader);
    MODEL.addEntity(skybox);



    const platformSphereMesh = { id: "platformSphereMesh", ...generateSphereMesh(5, 8) };
    const platformSphere = new Entity('platform-sphere', vec4(0, -4, 0), undefined, vec4(20, .5, 20, 1), false);
    platformSphere.addComponent(new MeshComponent(platformSphereMesh, "lex-texture"));
    MODEL.addEntity(platformSphere);

    const manObj = await loadOBJFile('/manlyman.obj');
    const manMesh = { id: "manMesh", ...loadOBJ(manObj) };
    const man = new Entity('man', vec4(0, 0, 0), mat4Rotation(0,Math.PI/2, 0), vec4(1, 1, 1, 1), false);
    man.addComponent(new MeshComponent(manMesh, "lex-texture"));
    MODEL.addEntity(man);

    // Array of men with different shaders facing the original man (in positive x direction)
    const shaders = [
        exampleRenderShader,
        exampleTextureShader,
    ];
    

    // Giant man behind them all (even further and even bigger)
    const giantMan = new Entity(
        'giant-man', 
        vec4(2000, -1000, 500), 
        mat4Rotation(0, -Math.PI/2, 0), // facing the original man
        vec4(250, 250, 250, 1), // even more giant scale
        false
    );
    giantMan.addComponent(new MeshComponent(manMesh, "lex-texture"));
    giantMan.addComponent(nebulaShader);
    MODEL.addEntity(giantMan);

    // plane right in front of the camera with noiseTestsShader
    
    // const planeMesh = { id: "planeMesh", ...generateHDPlaneMesh(10, 1) };
    // const plane = new Entity('plane', vec4(0, 20, 43), mat4Rotation(Math.PI/2, 0, 0), vec4(1, 1, 1, 1), false);
    // plane.addComponent(new MeshComponent(planeMesh, "example-texture"));
    // plane.addComponent(noiseTestsShader);
    // MODEL.addEntity(plane);
    

})();
