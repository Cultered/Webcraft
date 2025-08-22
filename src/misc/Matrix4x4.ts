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
    static identity(): Matrix4x4{
        return new Matrix4x4(
            new Vector4(1,0,0,0),
            new Vector4(0,1,0,0),
            new Vector4(0,0,1,0),
            new Vector4(0,0,0,1),
        )
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
    static translationMatrix(vec: Vector4): Matrix4x4 {
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
    static rotationalMatrix(angle: Vector4): Matrix4x4 {
        /**Create a rotation matrix around x,y,z; w is ignored */
        let cosX = Math.cos(angle.x);
        let sinX = Math.sin(angle.x);
        let cosY = Math.cos(angle.y);
        let sinY = Math.sin(angle.y);
        let cosZ = Math.cos(angle.z);
        let sinZ = Math.sin(angle.z);

        // Rotation matrix around X axis
        const rotX = new Matrix4x4(
            new Vector4(1, 0, 0, 0),
            new Vector4(0, cosX, -sinX, 0),
            new Vector4(0, sinX, cosX, 0),
            new Vector4(0, 0, 0, 1)
        );
        // Rotation matrix around Y axis
        const rotY = new Matrix4x4(
            new Vector4(cosY, 0, sinY, 0),
            new Vector4(0, 1, 0, 0),
            new Vector4(-sinY, 0, cosY, 0),
            new Vector4(0, 0, 0, 1)
        );
        // Rotation matrix around Z axis
        const rotZ = new Matrix4x4(
            new Vector4(cosZ, -sinZ, 0, 0),
            new Vector4(sinZ, cosZ, 0, 0),
            new Vector4(0, 0, 1, 0),
            new Vector4(0, 0, 0, 1)
        );
        // Combine rotations: Z * Y * X (common convention)
        return rotZ.mulMatrix(rotY).mulMatrix(rotX);
    }
    static scaleMatrix(vec: Vector4): Matrix4x4 {
        if(vec.w != 1){
            console.warn("You are scaling with w, probably not something you want, ", vec)
        }
        return new Matrix4x4(
            new Vector4(vec.x, 0, 0, 0),
            new Vector4(0, vec.y, 0, 0),
            new Vector4(0, 0, vec.z, 0),
            new Vector4(0, 0, 0, vec.w)
        );
    }
    static projectionMatrix(fovY: number, aspect: number, near: number, far: number): Matrix4x4 {
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
    static renderMatrix(scale:Vector4,rotate:Matrix4x4,translate:Vector4, camPos:Vector4,camRotate:Matrix4x4,fovY: number, aspect: number, near: number, far: number): Matrix4x4 {
        /**Example of how to create a render matrix, but you should consider not using this cos like performance */
        let scaleMatrix = this.scaleMatrix(scale);
        let translateMatrix = this.translationMatrix(translate.sub(camPos));
        let projectionMatrix = this.projectionMatrix(fovY, aspect, near, far);

        return projectionMatrix.mulMatrix(camRotate).mulMatrix(translateMatrix).mulMatrix(rotate).mulMatrix(scaleMatrix);// multiply in reverse order
    }
    toFloat32Array(): Float32Array {
        return new Float32Array([
            this.vec1.x, this.vec1.y, this.vec1.z, this.vec1.w,
            this.vec2.x, this.vec2.y, this.vec2.z, this.vec2.w,
            this.vec3.x, this.vec3.y, this.vec3.z, this.vec3.w,
            this.vec4.x, this.vec4.y, this.vec4.z, this.vec4.w
        ]);
    }

    inverse(): Matrix4x4 {
        // Fast inversion for a 4x4 matrix stored in column-major order (this.toFloat32Array())
        const m = this.toFloat32Array();
        const inv = new Float32Array(16);

        inv[0] = m[5]  * m[10] * m[15] -
                 m[5]  * m[11] * m[14] -
                 m[9]  * m[6]  * m[15] +
                 m[9]  * m[7]  * m[14] +
                 m[13] * m[6]  * m[11] -
                 m[13] * m[7]  * m[10];

        inv[4] = -m[4]  * m[10] * m[15] +
                  m[4]  * m[11] * m[14] +
                  m[8]  * m[6]  * m[15] -
                  m[8]  * m[7]  * m[14] -
                  m[12] * m[6]  * m[11] +
                  m[12] * m[7]  * m[10];

        inv[8] = m[4]  * m[9] * m[15] -
                 m[4]  * m[11] * m[13] -
                 m[8]  * m[5] * m[15] +
                 m[8]  * m[7] * m[13] +
                 m[12] * m[5] * m[11] -
                 m[12] * m[7] * m[9];

        inv[12] = -m[4]  * m[9] * m[14] +
                   m[4]  * m[10] * m[13] +
                   m[8]  * m[5] * m[14] -
                   m[8]  * m[6] * m[13] -
                   m[12] * m[5] * m[10] +
                   m[12] * m[6] * m[9];

        inv[1] = -m[1]  * m[10] * m[15] +
                  m[1]  * m[11] * m[14] +
                  m[9]  * m[2] * m[15] -
                  m[9]  * m[3] * m[14] -
                  m[13] * m[2] * m[11] +
                  m[13] * m[3] * m[10];

        inv[5] = m[0]  * m[10] * m[15] -
                 m[0]  * m[11] * m[14] -
                 m[8]  * m[2] * m[15] +
                 m[8]  * m[3] * m[14] +
                 m[12] * m[2] * m[11] -
                 m[12] * m[3] * m[10];

        inv[9] = -m[0]  * m[9] * m[15] +
                  m[0]  * m[11] * m[13] +
                  m[8]  * m[1] * m[15] -
                  m[8]  * m[3] * m[13] -
                  m[12] * m[1] * m[11] +
                  m[12] * m[3] * m[9];

        inv[13] = m[0]  * m[9] * m[14] -
                  m[0]  * m[10] * m[13] -
                  m[8]  * m[1] * m[14] +
                  m[8]  * m[2] * m[13] +
                  m[12] * m[1] * m[10] -
                  m[12] * m[2] * m[9];

        inv[2] = m[1]  * m[6] * m[15] -
                 m[1]  * m[7] * m[14] -
                 m[5]  * m[2] * m[15] +
                 m[5]  * m[3] * m[14] +
                 m[13] * m[2] * m[7] -
                 m[13] * m[3] * m[6];

        inv[6] = -m[0]  * m[6] * m[15] +
                  m[0]  * m[7] * m[14] +
                  m[4]  * m[2] * m[15] -
                  m[4]  * m[3] * m[14] -
                  m[12] * m[2] * m[7] +
                  m[12] * m[3] * m[6];

        inv[10] = m[0]  * m[5] * m[15] -
                  m[0]  * m[7] * m[13] -
                  m[4]  * m[1] * m[15] +
                  m[4]  * m[3] * m[13] +
                  m[12] * m[1] * m[7] -
                  m[12] * m[3] * m[5];

        inv[14] = -m[0]  * m[5] * m[14] +
                   m[0]  * m[6] * m[13] +
                   m[4]  * m[1] * m[14] -
                   m[4]  * m[2] * m[13] -
                   m[12] * m[1] * m[6] +
                   m[12] * m[2] * m[5];

        inv[3] = -m[1] * m[6] * m[11] +
                  m[1] * m[7] * m[10] +
                  m[5] * m[2] * m[11] -
                  m[5] * m[3] * m[10] -
                  m[9] * m[2] * m[7] +
                  m[9] * m[3] * m[6];

        inv[7] = m[0] * m[6] * m[11] -
                 m[0] * m[7] * m[10] -
                 m[4] * m[2] * m[11] +
                 m[4] * m[3] * m[10] +
                 m[8] * m[2] * m[7] -
                 m[8] * m[3] * m[6];

        inv[11] = -m[0] * m[5] * m[11] +
                   m[0] * m[7] * m[9] +
                   m[4] * m[1] * m[11] -
                   m[4] * m[3] * m[9] -
                   m[8] * m[1] * m[7] +
                   m[8] * m[3] * m[5];

        inv[15] = m[0] * m[5] * m[10] -
                  m[0] * m[6] * m[9] -
                  m[4] * m[1] * m[10] +
                  m[4] * m[2] * m[9] +
                  m[8] * m[1] * m[6] -
                  m[8] * m[2] * m[5];

        let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

        if (det === 0) {
            console.warn('Matrix4x4.inverse: matrix is singular, returning identity');
            return Matrix4x4.identity();
        }

        det = 1.0 / det;
        for (let i = 0; i < 16; i++) {
            inv[i] = inv[i] * det;
        }

        // Construct Matrix4x4 from column-major inv[]
        return new Matrix4x4(
            new Vector4(inv[0], inv[1], inv[2], inv[3]),
            new Vector4(inv[4], inv[5], inv[6], inv[7]),
            new Vector4(inv[8], inv[9], inv[10], inv[11]),
            new Vector4(inv[12], inv[13], inv[14], inv[15])
        );
    }

}