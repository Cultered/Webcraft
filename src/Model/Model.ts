import { Vector4 } from '../misc/Vector4';

export type SceneObject = {
    id: string;
    position: Vector4;
    rotation: Vector4;
    scale: Vector4;
    props: {
        vertices: Float32Array;
        indices: Uint32Array | Uint16Array;
    };
};

export default class Model {
    private objects: SceneObject[] = [];
    private cameras: SceneObject[] = [];

    constructor() { }
    // TODO sphere generation based on triangulation of an octahedron
    private generateIndexedSphere(lati: number, longi: number, radius: number) {
        const vertices: number[] = [];
        const indices: number[] = [];

        for (let lat = 0; lat <= lati; lat++) {
            const theta = (lat / lati) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= longi; lon++) {
                const phi = (lon / longi) * 2 * Math.PI;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = radius * sinTheta * cosPhi;
                const y = radius * cosTheta;
                const z = radius * sinTheta * sinPhi;

                vertices.push(x, y, z);
            }
        }

        for (let lat = 0; lat < lati; lat++) {
            for (let lon = 0; lon < longi; lon++) {
                const first = lat * (longi + 1) + lon;
                const second = first + longi + 1;

                indices.push(first, first + 1, second);
                indices.push(second, first + 1, second + 1);
            }
        }
        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
        };
    }

    private generateCube(size: number) {
        const hs = size / 2;
        const vertices = [
            -hs, -hs, -hs,
            hs, -hs, -hs,
            hs, hs, -hs,
            -hs, hs, -hs,
            -hs, -hs, hs,
            hs, -hs, hs,
            hs, hs, hs,
            -hs, hs, hs,
        ];

        const indices = [
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            4, 1, 5, 4, 0, 1,
            3, 6, 2, 3, 7, 6,
            1, 6, 5, 1, 2, 6,
            4, 3, 0, 4, 7, 3,
        ];

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices),
        };
    }

    addSphere(id: string, lati = 32, longi = 32, radius = 1, position?: Vector4, rotation?: Vector4) {
        const { vertices, indices } = this.generateIndexedSphere(lati, longi, radius);
        this.objects.push({
            id,
            position: position ?? new Vector4(0, 0, 0, 1),
            rotation: rotation ?? new Vector4(0, 0, 0, 0),
            scale: new Vector4(1, 1, 1, 1), // default scale
            props: { vertices, indices }
        });
    }

    addCube(id: string, size = 1, position?: Vector4, rotation?: Vector4) {
        const { vertices, indices } = this.generateCube(size);
        this.objects.push({
            id,
            position: position ?? new Vector4(0, 0, 0, 1),
            rotation: rotation ?? new Vector4(0, 0, 0, 0),
            scale: new Vector4(1, 1, 1, 1), // default scale
            props: { vertices, indices }
        });
    }

    getObjects() {
        return this.objects;
    }

    addCamera(id: string, position?: Vector4, rotation?: Vector4) {
        const camera: SceneObject = {
            id,
            position: position ?? new Vector4(0, 0, 4, 1), // default camera position
            rotation: rotation ?? new Vector4(0, 0, 0, 0), // default camera rotation
            scale: new Vector4(1, 1, 1, 1), // default scale
            props: {
                vertices: new Float32Array([]), // no vertices for camera
                indices: new Uint32Array([]) // no indices for camera
            }
        };
        this.cameras.push(camera);
    }

    updateCamera(id: string, position: Vector4, rotation: Vector4) {
        const camera = this.cameras.find(cam => cam.id === id);
        if (camera) {
            camera.position = position;
            camera.rotation = rotation;
        } else {
            console.warn(`Camera with id ${id} not found.`);
        }
    }

    getCamera(id: string): SceneObject {
        return this.cameras.find(camera => camera.id === id) || {
            id: 'default-camera',
            position: new Vector4(0, 0, 4, 1),
            rotation: new Vector4(0, 0, 0, 0),
            scale: new Vector4(1, 1, 1, 1),
            props: { vertices: new Float32Array([]), indices: new Uint32Array([]) }
        };
    }

    update(deltaMs: number) {
        // simple rotation update for all objects
        for (const obj of this.objects) {
            obj.rotation.x += 0.001 * deltaMs;
            obj.rotation.y += 0.001 * deltaMs;
        }
    }
}
