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
    neg():Vector4{
        return new Vector4(-this.x,-this.y,-this.z,-this.w)
    }
    add(other:Vector4):Vector4{
        return new Vector4(this.x+other.x,this.y+other.y,this.z+other.z,this.w+other.w)
    }
    sub(other:Vector4):Vector4{
        return this.add(other.neg())
    }
    mul(other:Vector4):Vector4{
        return new Vector4(this.x*other.x,this.y*other.y,this.z*other.z,this.w*other.w)
    }
}