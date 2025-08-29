import type { Vector4 } from '../misc/Vector4';
import type { Matrix4x4 } from '../misc/Matrix4x4';
export type SceneObject = {
    id: string;
    position: Vector4;
    rotation: Matrix4x4;
    scale: Vector4;
    props: {
        mesh?: string
        inverseRotation?: Matrix4x4
        updateInverseRotation?: boolean
        chunkKey?: string
    };
};