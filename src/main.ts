import { o11s } from './config/config';import { createView } from './View/View';
import Model from './Model/Model';
import Controller from './Controller/Controller';
import MeshComponent from './Model/Components/MeshComponent';
import { Entity } from './Model/Entity';
import { generateSphereMesh, generateCubeMesh, LOD_MESH } from './Types/MeshUtils';
import * as M from './misc/mat4'
import * as V from './misc/vec4';
import Rotator from './Model/Components/Rotator';

(async () => {
    const view = await createView(o11s.USE_WEBGPU);
    const model = new Model();
    const controller = new Controller(model, view);
    controller.hello()

    model.addCamera('main-camera', V.vec4(0, 0, 0), M.mat4Rotation(0, Math.PI, 0));
    const mainCam = model.getCamera('main-camera');
    if (mainCam) {
        const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
        const Freecam = (await import('./Model/Components/Freecam')).default;
        mainCam.addComponent(new Freecam(canvasEl));
    }

    const sphereMesh = { id: 'builtin-sphere', ...generateSphereMesh(3, 1) };
    const cubeMesh = { id: 'builtin-cube', ...generateCubeMesh(1) };

    view.uploadMeshToGPU(sphereMesh.id, sphereMesh.vertices, sphereMesh.indices);
    view.uploadMeshToGPU(cubeMesh.id, cubeMesh.vertices, cubeMesh.indices);
    view.uploadMeshToGPU(LOD_MESH.id, LOD_MESH.vertices, LOD_MESH.indices);
                const sphereComponent = new MeshComponent(sphereMesh, true);

    // Torus tube algorithm (translated from Python)
    function torusTube(R: number,R1:number, p: number, q: number, Nu: number, Nv: number): [number, number, number][] {
        const points: [number, number, number][] = [];
        let pk: number[] | null = null;
        for (let j = -1; j <= Nv; j++) {
            const v = 2 * Math.PI * j / (Nv + 1);
            const r = Math.cos(q * v) + 2;
            const old_pk = pk;
            pk = [
                R * r * Math.cos(p * v),
                -R * Math.sin(q * v),
                R * r * Math.sin(p * v)
            ];
            if (!old_pk) continue;
            // nv = pk - old_pk
            let nv = pk.map((val, idx) => val - old_pk[idx]);
            const nvLen = Math.sqrt(nv.reduce((acc, val) => acc + val * val, 0));
            nv = nv.map(val => val / nvLen);
            // iv: random orthogonal vector
            let iv = [Math.random(), Math.random(), Math.random()];
            const dot = iv[0]*nv[0] + iv[1]*nv[1] + iv[2]*nv[2];
            iv = iv.map((val, idx) => val - dot * nv[idx]);
            const ivLen = Math.sqrt(iv.reduce((acc, val) => acc + val * val, 0));
            iv = iv.map(val => val / ivLen);
            // jv = cross(nv, iv)
            let jv = [
                nv[1]*iv[2] - nv[2]*iv[1],
                nv[2]*iv[0] - nv[0]*iv[2],
                nv[0]*iv[1] - nv[1]*iv[0]
            ];
            const jvLen = Math.sqrt(jv.reduce((acc, val) => acc + val * val, 0));
            jv = jv.map(val => val / jvLen);
            for (let i = 0; i <= Nu; i++) {
                const u = -Math.PI + 2 * Math.PI * i / (Nu + 1);
                const ea = [
                    R1 * (Math.cos(u) * iv[0] + Math.sin(u) * jv[0]),
                    R1 * (Math.cos(u) * iv[1] + Math.sin(u) * jv[1]),
                    R1 * (Math.cos(u) * iv[2] + Math.sin(u) * jv[2])
                ];
                const x = ea[0] + pk[0];
                const y = ea[1] + pk[1];
                const z = ea[2] + pk[2];
                // Avoid duplicates
                if (!points.some(pt => pt[0] === x && pt[1] === y && pt[2] === z)) {
                    points.push([x, y, z]);
                }
            }
        }
        return points;
    }

    // Use common defaults
    const R = 100, r = 15, p = 16, q = 17, Nu = 20, Nv = 1000;
    const tubePoints = torusTube(R, r, p, q, Nu, Nv);
    tubePoints.forEach(([x, y, z], idx) => {
        const id = `torusTubeSphere-${idx}`;
        const ent = new Entity(id, V.vec4(x, y, z), undefined, V.vec4(1, 1, 1, 1), true);
        ent.addComponent(sphereComponent);
        model.addEntity(ent);
    });

    
    // Add a rotating cube in the center
    const cubeEntity = new Entity('rotating-cube', V.vec4(0, 0, 0), undefined, V.vec4(10, 10, 10, 1), false);
    const cubeComponent = new MeshComponent(cubeMesh, true);
    cubeEntity.addComponent(cubeComponent);
    const rotator = new Rotator(1,{x:0,y:1,z:0});
    cubeEntity.addComponent(rotator);
    model.addEntity(cubeEntity);




})();
