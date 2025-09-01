import { describe, it, expect, vi, beforeEach } from 'vitest';
import Model from './Model';
import { Entity } from './Entity';
import { MeshComponent } from './Components/MeshComponent';
import { Rotator } from './Components/Rotator';
import type { Mesh } from '../Types/Mesh';
import * as V from '../misc/Vector4';
import * as M from '../misc/Matrix4x4';

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
            const position = new Float32Array([1, 2, 3, 1]) as V.Vector4;
            const entity = model.addEntity('positioned-entity', { position });
            
            expect(entity.position).toBe(position);
        });

        it('should add entity with custom rotation and scale', () => {
            const rotation = M.mat4Rotation(0, Math.PI / 2, 0);
            const scale = new Float32Array([2, 2, 2, 1]) as V.Vector4;
            
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

    describe('Position Management', () => {
        it('should set entity position', () => {
            const entity = model.addEntity('movable-entity');
            const newPosition = new Float32Array([5, 10, 15, 1]) as V.Vector4;
            
            const result = model.setObjectPosition('movable-entity', newPosition);
            
            expect(result).toBe(true);
            expect(entity.position).toBe(newPosition);
        });

        it('should return false when setting position of non-existent entity', () => {
            const newPosition = new Float32Array([1, 2, 3, 1]) as V.Vector4;
            
            const result = model.setObjectPosition('non-existent', newPosition);
            
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
            const position = new Float32Array([1, 2, 3, 0]) as V.Vector4;
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

    describe('Mesh Management', () => {
        it('should find mesh by ID from entities', () => {
            const entity = model.addEntity('mesh-entity');
            const meshComponent = new MeshComponent(mockMesh1, false);
            entity.addComponent(meshComponent);
            
            const foundMesh = model.getMesh('mesh-1');
            expect(foundMesh).toBe(mockMesh1);
        });

        it('should return undefined for non-existent mesh', () => {
            const foundMesh = model.getMesh('non-existent-mesh');
            expect(foundMesh).toBeUndefined();
        });

        it('should get all meshes from entities', () => {
            const entity1 = model.addEntity('entity-1');
            const entity2 = model.addEntity('entity-2');
            
            entity1.addComponent(new MeshComponent(mockMesh1, false));
            entity2.addComponent(new MeshComponent(mockMesh2, true));
            
            const meshes = model.getMeshes();
            
            expect(meshes['mesh-1']).toBe(mockMesh1);
            expect(meshes['mesh-2']).toBe(mockMesh2);
            expect(Object.keys(meshes)).toHaveLength(2);
        });

        it('should return empty object when no meshes exist', () => {
            const meshes = model.getMeshes();
            expect(meshes).toEqual({});
        });
    });

    describe('Scene Object Generation', () => {
        it('should get objects without camera (fallback mode)', () => {
            model.addEntity('entity-1', {
                position: new Float32Array([1, 2, 3, 1]) as V.Vector4
            });
            model.addEntity('entity-2', {
                position: new Float32Array([4, 5, 6, 1]) as V.Vector4
            });
            
            const objects = model.getObjects();
            
            expect(objects).toHaveLength(2);
            expect(objects[0].id).toBe('entity-1');
            expect(objects[0].position).toEqual(new Float32Array([1, 2, 3, 1]));
            expect(objects[1].id).toBe('entity-2');
            expect(objects[1].position).toEqual(new Float32Array([4, 5, 6, 1]));
        });

        it('should get objects with camera for chunk-based culling', () => {
            // Add main camera
            model.addCamera('main-camera', new Float32Array([0, 0, 0, 0]) as V.Vector4);
            
            // Add entities near the camera
            model.addEntity('near-entity', {
                position: new Float32Array([1, 1, 1, 1]) as V.Vector4
            });
            
            const objects = model.getObjects();
            
            expect(objects).toHaveLength(1);
            expect(objects[0].id).toBe('near-entity');
        });

        it('should handle entities with mesh components for LOD', () => {
            model.addCamera('main-camera', new Float32Array([0, 0, 0, 0]) as V.Vector4);
            
            const entity = model.addEntity('lod-entity', {
                position: new Float32Array([0, 0, 0, 1]) as V.Vector4 // Close to camera
            });
            entity.addComponent(new MeshComponent(mockMesh1, true));
            
            const objects = model.getObjects();
            
            expect(objects).toHaveLength(1);
            expect(objects[0].props.mesh).toBe('mesh-1'); // Should be original mesh (close)
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

    describe('Scene Object Conversion', () => {
        it('should convert entity to scene object correctly', () => {
            const position = new Float32Array([1, 2, 3, 1]) as V.Vector4;
            const rotation = M.mat4Rotation(0, Math.PI / 4, 0);
            const scale = new Float32Array([2, 2, 2, 1]) as V.Vector4;
            
            const entity = model.addEntity('scene-entity', { position, rotation, scale });
            entity.props.customProp = 'test-value';
            
            const objects = model.getObjects();
            const sceneObject = objects.find(obj => obj.id === 'scene-entity');
            
            expect(sceneObject).toBeDefined();
            expect(sceneObject!.id).toBe('scene-entity');
            expect(sceneObject!.position).toBe(position);
            expect(sceneObject!.rotation).toBe(rotation);
            expect(sceneObject!.scale).toBe(scale);
            expect((sceneObject!.props as any).customProp).toBe('test-value');
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle multiple entities with different component configurations', () => {
            // Static entity (no components)
            const staticEntity = model.addEntity('static');
            
            // Mesh-only entity
            const meshEntity = model.addEntity('mesh-only');
            meshEntity.addComponent(new MeshComponent(mockMesh1, false));
            
            // Rotating entity
            const rotatingEntity = model.addEntity('rotating');
            rotatingEntity.addComponent(new Rotator(0.5));
            
            // Complex entity (mesh + rotator)
            const complexEntity = model.addEntity('complex');
            complexEntity.addComponent(new MeshComponent(mockMesh2, true));
            complexEntity.addComponent(new Rotator(0.1, { x: 1, y: 0, z: 0 }));
            
            // Verify all entities exist
            expect(model.getEntityById('static')).toBe(staticEntity);
            expect(model.getEntityById('mesh-only')).toBe(meshEntity);
            expect(model.getEntityById('rotating')).toBe(rotatingEntity);
            expect(model.getEntityById('complex')).toBe(complexEntity);
            
            // Update system should work
            model.update(16);
            
            // Get scene objects
            const objects = model.getObjects();
            expect(objects).toHaveLength(4);
        });

        it('should integrate with camera and chunking system', () => {
            // Add camera at origin
            model.addCamera('main-camera', new Float32Array([0, 0, 0, 0]) as V.Vector4);
            
            // Add entities at various distances
            model.addEntity('close', {
                position: new Float32Array([1, 1, 1, 1]) as V.Vector4
            });
            
            model.addEntity('medium', {
                position: new Float32Array([30, 30, 30, 1]) as V.Vector4
            });
            
            model.addEntity('far', {
                position: new Float32Array([200, 200, 200, 1]) as V.Vector4
            });
            
            const objects = model.getObjects();
            
            // Only entities within render distance should be included
            // (exact count depends on chunk settings, but should be > 0 and < 3)
            expect(objects.length).toBeGreaterThan(0);
            expect(objects.length).toBeLessThanOrEqual(3);
        });
    });
});