import { describe, it, expect, beforeEach } from 'vitest';
import Model from '../Model/Model';
import type { DirectLight, PointLight } from '../Types/Light';

describe('Lighting System Tests', () => {
    let model: Model;

    beforeEach(() => {
        model = new Model();
    });

    describe('DirectLight Management', () => {
        it('should add and retrieve directional lights', () => {
            const directLight: DirectLight = {
                id: 'sun',
                direction: new Float32Array([0, -1, 0, 0]) as any,
                color: new Float32Array([1, 1, 0.8, 1]) as any,
                enabled: true
            };

            model.addDirectLight(directLight);
            const retrieved = model.getDirectLight('sun');
            
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('sun');
            expect(retrieved?.direction[1]).toBe(-1);
            expect(retrieved?.enabled).toBe(true);
        });

        it('should remove directional lights', () => {
            const directLight: DirectLight = {
                id: 'temp-light',
                direction: new Float32Array([1, 0, 0, 0]) as any,
                color: new Float32Array([1, 0, 0, 0.5]) as any,
                enabled: true
            };

            model.addDirectLight(directLight);
            expect(model.getDirectLight('temp-light')).toBeDefined();
            
            const removed = model.removeDirectLight('temp-light');
            expect(removed).toBe(true);
            expect(model.getDirectLight('temp-light')).toBeUndefined();
        });
    });

    describe('PointLight Management', () => {
        it('should add and retrieve point lights', () => {
            const pointLight: PointLight = {
                id: 'torch',
                position: new Float32Array([5, 2, 3, 1]) as any,
                color: new Float32Array([1, 0.5, 0, 0.8]) as any,
                radius: 10,
                enabled: true
            };

            model.addPointLight(pointLight);
            const retrieved = model.getPointLight('torch');
            
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('torch');
            expect(retrieved?.position[0]).toBe(5);
            expect(retrieved?.radius).toBe(10);
            expect(retrieved?.enabled).toBe(true);
        });

        it('should remove point lights', () => {
            const pointLight: PointLight = {
                id: 'temp-point',
                position: new Float32Array([0, 0, 0, 1]) as any,
                color: new Float32Array([0, 1, 0, 1]) as any,
                radius: 5,
                enabled: true
            };

            model.addPointLight(pointLight);
            expect(model.getPointLight('temp-point')).toBeDefined();
            
            const removed = model.removePointLight('temp-point');
            expect(removed).toBe(true);
            expect(model.getPointLight('temp-point')).toBeUndefined();
        });
    });

    describe('LightingData Collection', () => {
        it('should return only enabled lights', () => {
            const enabledDirectLight: DirectLight = {
                id: 'enabled-direct',
                direction: new Float32Array([0, -1, 0, 0]) as any,
                color: new Float32Array([1, 1, 1, 1]) as any,
                enabled: true
            };

            const disabledDirectLight: DirectLight = {
                id: 'disabled-direct',
                direction: new Float32Array([1, 0, 0, 0]) as any,
                color: new Float32Array([1, 0, 0, 1]) as any,
                enabled: false
            };

            const enabledPointLight: PointLight = {
                id: 'enabled-point',
                position: new Float32Array([1, 1, 1, 1]) as any,
                color: new Float32Array([0, 1, 0, 1]) as any,
                radius: 5,
                enabled: true
            };

            const disabledPointLight: PointLight = {
                id: 'disabled-point',
                position: new Float32Array([2, 2, 2, 1]) as any,
                color: new Float32Array([0, 0, 1, 1]) as any,
                radius: 8,
                enabled: false
            };

            model.addDirectLight(enabledDirectLight);
            model.addDirectLight(disabledDirectLight);
            model.addPointLight(enabledPointLight);
            model.addPointLight(disabledPointLight);

            const lightingData = model.getLightingData();
            
            expect(lightingData.directLights).toHaveLength(1);
            expect(lightingData.directLights[0].id).toBe('enabled-direct');
            
            expect(lightingData.pointLights).toHaveLength(1);
            expect(lightingData.pointLights[0].id).toBe('enabled-point');
        });

        it('should return empty arrays when no lights exist', () => {
            const lightingData = model.getLightingData();
            
            expect(lightingData.directLights).toHaveLength(0);
            expect(lightingData.pointLights).toHaveLength(0);
        });
    });
});