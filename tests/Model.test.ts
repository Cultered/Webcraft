import { describe, it, expect, vi, beforeEach } from 'vitest';
import Model from '../src/Model/Model';
import { Entity } from '../src/Model/Entity';
import { MeshComponent } from '../src/Model/Components/MeshComponent';
import { Rotator } from '../src/Model/Components/Rotator';
import type { Mesh } from '../src/Types/MeshType';
import * as V from '../src/misc/vec4';
import * as M from '../src/misc/mat4';

// Mock meshes for testing
const mockMesh1: Mesh = {
    id: 'mesh-1',
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2])
};

const mockMesh2: Mesh = {
    id: 'mesh-2',
    vertices: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2])
};

describe('Model', () => {
    let model: Model;

    beforeEach(() => {
        model = new Model();
    });

    describe('Constructor and Initialization', () => {
        it('should create empty model', () => {
            expect(model).toBeDefined();
            expect(model.getEntityById('nonexistent')).toBeUndefined();
        });
    });

    describe('Entity Management', () => {
        it('should add entity with default options', () => {
            const entity = model.addEntity('test-entity');
            
            expect(entity).toBeDefined();
            expect(entity.id).toBe('test-entity');
            expect(entity.position).toEqual(new Float32Array([0, 0, 0, 1]));
            expect(entity.rotation).toEqual(M.mat4Identity());
            expect(entity.scale).toEqual(new Float32Array([1, 1, 1, 1]));
        });

        it('should add entity with custom position', () => {
            const position = V.vec4(1, 2, 3, 1);
            const entity = model.addEntity('positioned-entity', { position });
            
            expect(entity.position).toBe(position);
        });

        it('should add entity with custom rotation and scale', () => {
            const rotation = M.mat4Rotation(0, Math.PI / 2, 0);
            const scale = V.vec4(2, 2, 2, 1);
            
            const entity = model.addEntity('transformed-entity', { rotation, scale });
            
            expect(entity.rotation).toBe(rotation);
            expect(entity.scale).toBe(scale);
        });

        it('should add entity with components', () => {
            const meshComponent = new MeshComponent(mockMesh1, true);
            const rotatorComponent = new Rotator(0.5);
            
            const entity = model.addEntity('component-entity', {
                components: [meshComponent, rotatorComponent]
            });
            
            expect(entity.getComponent(MeshComponent)).toBe(meshComponent);
            expect(entity.getComponent(Rotator)).toBe(rotatorComponent);
            expect(entity.props.mesh).toBe('mesh-1'); // Set by MeshComponent.start()
        });

        it('should retrieve entity by ID', () => {
            const entity = model.addEntity('findable-entity');
            
            const found = model.getEntityById('findable-entity');
            expect(found).toBe(entity);
        });

        it('should return undefined for non-existent entity', () => {
            const found = model.getEntityById('non-existent');
            expect(found).toBeUndefined();
        });

        it('should add existing entity', () => {
            const entity = new Entity('external-entity');
            
            const result = model.addExistingEntity(entity);
            
            expect(result).toBe(entity);
            expect(model.getEntityById('external-entity')).toBe(entity);
        });

        it('should handle duplicate entity IDs when adding existing entity', () => {
            const entity1 = model.addEntity('duplicate-id');
            const entity2 = new Entity('duplicate-id');
            
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const result = model.addExistingEntity(entity2);
            
            expect(result).toBe(entity1); // Should return existing entity
            expect(consoleSpy).toHaveBeenCalledWith('Entity with id duplicate-id already exists in Model. Skipping add.');
            
            consoleSpy.mockRestore();
        });
    });

    describe('Component Management', () => {
        it('should add component to existing entity', () => {
            const entity = model.addEntity('component-target');
            const component = new MeshComponent(mockMesh1, false);
            
            const result = model.addComponentToEntity('component-target', component);
            
            expect(result).toBe(true);
            expect(entity.getComponent(MeshComponent)).toBe(component);
        });

        it('should return false when adding component to non-existent entity', () => {
            const component = new MeshComponent(mockMesh1, false);
            
            const result = model.addComponentToEntity('non-existent', component);
            
            expect(result).toBe(false);
        });
    });

    describe('Camera Management', () => {
        it('should add camera with default position and rotation', () => {
            model.addCamera('main-camera');
            
            const camera = model.getCamera('main-camera');
            expect(camera).toBeDefined();
            expect(camera!.id).toBe('main-camera');
            expect(camera!.position).toEqual(new Float32Array([0, 0, 0, 0]));
            expect(camera!.rotation).toEqual(M.mat4Identity());
            expect(camera!.scale).toEqual(new Float32Array([1, 1, 1, 1]));
        });

        it('should add camera with custom position and rotation', () => {
            const position = V.vec4(1, 2, 3, 0);
            const rotation = M.mat4Rotation(Math.PI / 4, 0, 0);
            
            model.addCamera('custom-camera', position, rotation);
            
            const camera = model.getCamera('custom-camera');
            expect(camera!.position).toBe(position);
            expect(camera!.rotation).toBe(rotation);
        });

        it('should return undefined for non-existent camera', () => {
            const camera = model.getCamera('non-existent-camera');
            expect(camera).toBeUndefined();
        });
    });


    describe('Update System', () => {
        it('should update all entities', () => {
            const entity1 = model.addEntity('entity-1');
            const entity2 = model.addEntity('entity-2');
            
            const rotator1 = new Rotator(0.1);
            const rotator2 = new Rotator(0.2);
            
            entity1.addComponent(rotator1);
            entity2.addComponent(rotator2);
            
            const originalRotation1 = new Float32Array(entity1.rotation);
            const originalRotation2 = new Float32Array(entity2.rotation);
            
            model.update(16);
            
            // Both entities should have been updated (rotation changed)
            expect(entity1.rotation).not.toEqual(originalRotation1);
            expect(entity2.rotation).not.toEqual(originalRotation2);
        });

        it('should handle entities without update methods', () => {
            model.addEntity('static-entity');
            // No components with update methods
            
            expect(() => model.update(16)).not.toThrow();
        });
    });
});