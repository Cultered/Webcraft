import { describe, it, expect, beforeEach } from 'vitest';
import Model from '../src/Model/Model';
import MeshComponent from '../src/Model/Components/MeshComponent';
import Rotator from '../src/Model/Components/Rotator';
import * as V from '../src/misc/vec4';
import * as M from '../src/misc/mat4';
import type { Mesh } from '../src/Types/MeshType';

// Mock mesh for testing
const mockMesh: Mesh = {
    id: 'test-mesh',
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2])
};

describe('Model Static Entity Optimization', () => {
    let model: Model;

    beforeEach(() => {
        model = new Model();
        model.addCamera('main-camera', V.vec4(0, 0, 0, 0));
    });

    describe('Entity Static Classification', () => {
        it('should classify entities without update components as static', () => {
            const staticEntity = model.addEntity('static-entity', {
                position: V.vec4(1, 2, 3, 1)
            });
            
            expect(staticEntity.isStatic).toBe(true);
            
            const separated = model.getObjectsSeparated();
            expect(separated.static).toHaveLength(1);
            expect(separated.nonStatic).toHaveLength(0);
            expect(separated.static[0].id).toBe('static-entity');
        });

        it('should classify entities with non-updating components as static', () => {
            const staticEntity = model.addEntity('static-with-mesh', {
                position: V.vec4(1, 2, 3, 1)
            });
            staticEntity.addComponent(new MeshComponent(mockMesh, false)); // no update method
            
            expect(staticEntity.isStatic).toBe(true);
            
            const separated = model.getObjectsSeparated();
            expect(separated.static).toHaveLength(1);
            expect(separated.nonStatic).toHaveLength(0);
        });

        it('should classify entities with update components as non-static', () => {
            const dynamicEntity = model.addEntity('dynamic-entity', {
                position: V.vec4(1, 2, 3, 1)
            });
            dynamicEntity.addComponent(new Rotator(1.0)); // has update method
            
            expect(dynamicEntity.isStatic).toBe(false);
            
            const separated = model.getObjectsSeparated();
            expect(separated.static).toHaveLength(0);
            expect(separated.nonStatic).toHaveLength(1);
            expect(separated.nonStatic[0].id).toBe('dynamic-entity');
        });

        it('should properly separate mixed static and non-static entities', () => {
            // Add static entities
            const static1 = model.addEntity('static-1', { position: V.vec4(1, 0, 0, 1) });
            const static2 = model.addEntity('static-2', { position: V.vec4(2, 0, 0, 1) });
            static1.addComponent(new MeshComponent(mockMesh, false));
            static2.addComponent(new MeshComponent(mockMesh, false));
            
            // Add dynamic entities
            const dynamic1 = model.addEntity('dynamic-1', { position: V.vec4(3, 0, 0, 1) });
            const dynamic2 = model.addEntity('dynamic-2', { position: V.vec4(4, 0, 0, 1) });
            dynamic1.addComponent(new Rotator(1.0));
            dynamic2.addComponent(new Rotator(2.0));
            
            const separated = model.getObjectsSeparated();
            
            expect(separated.static).toHaveLength(2);
            expect(separated.nonStatic).toHaveLength(2);
            
            const staticIds = separated.static.map(obj => obj.id);
            const nonStaticIds = separated.nonStatic.map(obj => obj.id);
            
            expect(staticIds).toContain('static-1');
            expect(staticIds).toContain('static-2');
            expect(nonStaticIds).toContain('dynamic-1');
            expect(nonStaticIds).toContain('dynamic-2');
        });
    });

    describe('Backward Compatibility', () => {
        it('should maintain backward compatibility with getObjects()', () => {
            model.addEntity('static-1');
            const dynamic1 = model.addEntity('dynamic-1');
            dynamic1.addComponent(new Rotator(1.0));
            
            const allObjects = model.getObjects();
            const separated = model.getObjectsSeparated();
            const combinedSeparated = [...separated.static, ...separated.nonStatic];
            
            expect(allObjects).toHaveLength(2);
            expect(combinedSeparated).toHaveLength(2);
            
            // Objects should be the same (though order might differ)
            const allIds = allObjects.map(obj => obj.id).sort();
            const combinedIds = combinedSeparated.map(obj => obj.id).sort();
            expect(allIds).toEqual(combinedIds);
        });
    });

    describe('SceneObject Properties', () => {
        it('should convert entities to scene objects correctly maintaining separation', () => {
            const position = V.vec4(1, 2, 3, 1);
            const rotation = M.mat4Rotation(0, Math.PI / 4, 0);
            const scale = V.vec4(2, 2, 2, 1);
            
            const staticEntity = model.addEntity('static-test', { position, rotation, scale });
            staticEntity.props.customProp = 'static-value';
            
            const dynamicEntity = model.addEntity('dynamic-test', { 
                position: V.vec4(4, 5, 6, 1), 
                rotation: M.mat4Rotation(Math.PI / 2, 0, 0),
                scale: V.vec4(3, 3, 3, 1)
            });
            dynamicEntity.addComponent(new Rotator(1.0));
            dynamicEntity.props.customProp = 'dynamic-value';
            
            const separated = model.getObjectsSeparated();
            
            const staticObj = separated.static.find(obj => obj.id === 'static-test');
            const dynamicObj = separated.nonStatic.find(obj => obj.id === 'dynamic-test');
            
            expect(staticObj).toBeDefined();
            expect(dynamicObj).toBeDefined();
            
            // Verify static object properties
            expect(staticObj!.position).toBe(position);
            expect(staticObj!.rotation).toBe(rotation);
            expect(staticObj!.scale).toBe(scale);
            expect((staticObj!.props as any).customProp).toBe('static-value');
            
            // Verify dynamic object properties
            expect(dynamicObj!.position).toEqual(V.vec4(4, 5, 6, 1));
            expect((dynamicObj!.props as any).customProp).toBe('dynamic-value');
        });
    });

    describe('Update Behavior', () => {
        it('should only update non-static entities during model update', () => {
            const staticEntity = model.addEntity('static');
            const dynamicEntity = model.addEntity('dynamic');
            
            const rotator = new Rotator(1.0);
            dynamicEntity.addComponent(rotator);
            
            const originalStaticRotation = new Float32Array(staticEntity.rotation);
            const originalDynamicRotation = new Float32Array(dynamicEntity.rotation);
            
            model.update(16); // 16ms delta
            
            // Static entity should not have changed
            expect(staticEntity.rotation).toEqual(originalStaticRotation);
            
            // Dynamic entity should have changed
            expect(dynamicEntity.rotation).not.toEqual(originalDynamicRotation);
        });
    });
});