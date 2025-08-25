export class Vector4 {
    x:number
    y:number
    z:number
    w:number
    constructor(x:number, y:number, z:number, w:number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
    static up():Vector4{
        return new Vector4(0,1,0,0)
    }
    static right():Vector4{
        return new Vector4(1,0,0,0)
    }
    static forward():Vector4{
        return new Vector4(0,0,1,0)
    }
    neg():Vector4{
        return new Vector4(-this.x,-this.y,-this.z,-this.w)
    }
    add(other:Vector4):Vector4{
        return new Vector4(this.x+other.x,this.y+other.y,this.z+other.z,this.w+other.w)
    }
    sub(other:Vector4):Vector4{
        return this.add(other.neg())
    }
    scale(q:number):Vector4{
        return new Vector4(this.x*q,this.y*q,this.z*q,this.w*q)
    }
    mul(other:Vector4):number{
        return this.x*other.x+this.y*other.y+this.z*other.z+this.w*other.w
    }
    toFloat32Array():Float32Array {
        return new Float32Array([this.x, this.y, this.z, this.w]);
    }
    len1():number{
        return this.mul(this)
    }
}