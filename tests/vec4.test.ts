import * as V from '../src/misc/vec4';
import { describe, it, expect } from 'vitest';
describe('Vector4 functions', () => {
    let out = V.vec4();
    it('vec4 creation', () => {
        const v = V.vec4(1, 2, 3, 4);
        expect(v[0]).toBe(1);
        expect(v[1]).toBe(2);
        expect(v[2]).toBe(3);
        expect(v[3]).toBe(4);
    });
    it('vec4 addition', () => {
        const a = V.vec4(1, 2, 3, 4);
        const b = V.vec4(5, 6, 7, 8);
        out = V.vec4Add(V.vec4(), a, b);
        expect(out[0]).toBe(6);
        expect(out[1]).toBe(8);
        expect(out[2]).toBe(10);
        expect(out[3]).toBe(12);
    });
    it('vec4 subtraction', () => {
        const a = V.vec4(5, 6, 7, 8);
        const b = V.vec4(1, 2, 3, 4);
        V.vec4Sub(out, a, b);
        expect(out[0]).toBe(4);
        expect(out[1]).toBe(4);
        expect(out[2]).toBe(4);
        expect(out[3]).toBe(4);
    });
    it('vec4 scaling', () => {
        const a = V.vec4(1.5, 2.5, 3.5, 4.5);
        V.vec4Scale(out, a, 2);
        expect(out[0]).toBe(3);
        expect(out[1]).toBe(5);
        expect(out[2]).toBe(7);
        expect(out[3]).toBe(9);
    });
    it('vec4 dot product', () => {
        const a = V.vec4(1, 2, 3, 4);
        const b = V.vec4(5, 6, 7, 8);
        const dot = V.vec4Dot(a, b);
        expect(dot).toBe(70);
    } );
    it('vec4 length squared', () => {
        const a = V.vec4(1, 2, 3, 4);
        const lenSq = V.vec4LenSq(a);
        expect(lenSq).toBe(30);
    });
    it('vec4 negation', () => {
        const a = V.vec4(1, -2, 3, -4);
        V.vec4Neg(out, a);
        expect(out[0]).toBe(-1);
        expect(out[1]).toBe(2);
        expect(out[2]).toBe(-3);
        expect(out[3]).toBe(4);
    });
});