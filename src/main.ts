import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import Rotator from './Model/Components/Rotator';
import Freecam from './Model/Components/Freecam';
import { Entity } from './Model/Entity';
import { generateSphereMesh } from './Types/MeshUtils';
import { loadOBJ } from './Types/MeshUtils';
import { mat4Rotation } from './misc/mat4'
import { vec4 } from './misc/vec4';
import { sphere3 } from './misc/misc';
import { loadImageData, loadOBJFile } from './misc/loadFiles';
import exampleTextureUrl from './misc/lex.png';

(async () => {
    const c = new Controller('main-camera');
    await c.init();

    const mainCam = c.model.addCamera('main-camera', vec4(0, 0, 0), mat4Rotation(0, Math.PI, 0));
    mainCam.addComponent(new Freecam());

    c.view.addTexture('example-texture', await loadImageData(exampleTextureUrl));

    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };

    const sphereComponent = new MeshComponent(sphereMesh, 'example-texture');


    const points = sphere3(20, 6, 7);
    points.forEach(([x, y, z], idx) => {
        const id = `sphere-${idx}`;
        const ent = new Entity(id, vec4(x, y, z), undefined, vec4(3, 3, 3, 1), true);
        ent.addComponent(sphereComponent);
        c.model.addEntity(ent);
    });


    const monke = new Entity('monke', vec4(0, 0, 0), undefined, vec4(10, 10, 10, 1), false);
    const monkeMesh = { id: "monkeMesh", ...loadOBJ(await loadOBJFile('/monke.obj')) };
    monke.addComponent(new MeshComponent(monkeMesh, "example-texture"));
    monke.addComponent(new Rotator(1, { x: 0, y: 1, z: 0 }));
    c.model.addEntity(monke);




})();
