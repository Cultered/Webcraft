import { Vector4 } from './Vector4';
import { radians } from './misc';
export class Matrix4x4 {
    vec1: Vector4
    vec2: Vector4
    vec3: Vector4
    vec4: Vector4
    constructor(vec1: Vector4, vec2: Vector4, vec3: Vector4, vec4: Vector4) {// columns
        this.vec1 = vec1; // vec4<f32>
        this.vec2 = vec2; // vec4<f32>
        this.vec3 = vec3; // vec4<f32>
        this.vec4 = vec4; // vec4<f32>
    }
    mul(other: Vector4): Vector4 {
        return new Vector4(
            this.vec1.x * other.x + this.vec2.x * other.y + this.vec3.x * other.z + this.vec4.x * other.w,
            this.vec1.y * other.x + this.vec2.y * other.y + this.vec3.y * other.z + this.vec4.y * other.w,
            this.vec1.z * other.x + this.vec2.z * other.y + this.vec3.z * other.z + this.vec4.z * other.w,
            this.vec1.w * other.x + this.vec2.w * other.y + this.vec3.w * other.z + this.vec4.w * other.w
        );
    }
    mulMatrix(other: Matrix4x4): Matrix4x4 {
        return new Matrix4x4(
            this.mul(other.vec1),
            this.mul(other.vec2),
            this.mul(other.vec3),
            this.mul(other.vec4)
        );
    }
    translationMatrix(vec: Vector4): Matrix4x4 {
        /**Create a translate matrix, w component should be 1, otherwise it will be converted to 1 implicitly */
        if (vec.w !== 1) {
            console.warn("Matrix4x4.transposeMatrix: w component of vector should be 1, got", vec.w);
            vec = new Vector4(vec.x, vec.y, vec.z, 1); // normalize w to 1
        }
        return new Matrix4x4(
            new Vector4(1, 0, 0, 0),
            new Vector4(0, 1, 0, 0),
            new Vector4(0, 0, 1, 0),
            new Vector4(vec.x, vec.y, vec.z, vec.w)
        )
    }
    rotationalMatrix(angle: Vector4): Matrix4x4 {
        /**Create a rotation matrix around x,y,z; w is ignored */
        let cosX = Math.cos(angle.x);
        let sinX = Math.sin(angle.x);
        let cosY = Math.cos(angle.y);
        let sinY = Math.sin(angle.y);
        let cosZ = Math.cos(angle.z);
        let sinZ = Math.sin(angle.z);

        return new Matrix4x4(
            new Vector4(cosY * cosZ, -cosY * sinZ, sinY, 0.0),
            new Vector4(sinX * sinY * cosZ + cosX * sinZ, -sinX * sinY * sinZ + cosX * cosZ, -sinX * cosY, 0.0),
            new Vector4(-cosX * sinY * cosZ + sinX * sinZ, cosX * sinY * sinZ + sinX * cosZ, cosX * cosY, 0.0),
            new Vector4(0.0, 0.0, 0.0, 1.0)
        );
    }
    scaleMatrix(vec: Vector4): Matrix4x4 {
        return new Matrix4x4(
            new Vector4(vec.x, 0, 0, 0),
            new Vector4(0, vec.y, 0, 0),
            new Vector4(0, 0, vec.z, 0),
            new Vector4(0, 0, 0, vec.w)
        );
    }
    projectionMatrix(fovY: number, aspect: number, near: number, far: number): Matrix4x4 {
        /**WGSL projection matrix (dont use with GLSL etc) */
        let f = 1.0 / Math.tan(radians(fovY) * 0.5);
        let nf = 1.0 / (near - far);
        let proj = new Matrix4x4(
            new Vector4(f / aspect, 0.0, 0.0, 0.0),
            new Vector4(0.0, f, 0.0, 0.0),
            new Vector4(0.0, 0.0, (far + near) * nf, -1.0),
            new Vector4(0.0, 0.0, 2.0 * far * near * nf, 0.0)
        );
        return proj;
    }
    renderMatrix(scale:Vector4,rotate:Vector4,translate:Vector4, camPos:Vector4,camRotate:Vector4,fovY: number, aspect: number, near: number, far: number): Matrix4x4 {
        /**Example of how to create a render matrix, but you should consider not using this cos like performance */
        let scaleMatrix = this.scaleMatrix(scale);
        let rotateMatrix = this.rotationalMatrix(rotate);
        let translateMatrix = this.translationMatrix(translate.sub(camPos));
        let camRotateMatrix = this.rotationalMatrix(camRotate)
        let projectionMatrix = this.projectionMatrix(fovY, aspect, near, far);

        return projectionMatrix.mulMatrix(camRotateMatrix).mulMatrix(translateMatrix).mulMatrix(rotateMatrix).mulMatrix(scaleMatrix);// multiply in reverse order
    }

}