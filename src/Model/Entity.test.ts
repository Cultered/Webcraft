import { describe, it, expect } from 'vitest';
import { Entity } from './Entity';
import type { Component } from './Components/Component';
import * as M from '../misc/mat4';

// Mock components for testing
class MockComponent implements Component {
    startCalled = false;
    updateCalled = false;
    updateReturnValue: any = 'update-result';

    start(_entity: Entity) {
        this.startCalled = true;
        return _entity;
    }

    update(_entity: Entity, _deltaMs?: number) {
        this.updateCalled = true;
        return this.updateReturnValue;
    }
}

class MockComponent2 implements Component {
    startCalled = false;
    updateCalled = false;
    updateReturnValue: any = 'update-result';

    start(_entity: Entity) {
        this.startCalled = true;
        return _entity;
    }

    update(_entity: Entity, _deltaMs?: number) {
        this.updateCalled = true;
        return this.updateReturnValue;
    }
}

class MockStaticComponent implements Component {
    startCalled = false;

    start(entity: Entity) {
        this.startCalled = true;
        return entity;
    }
    // No update method, so entity remains static
}

describe('Entity', () => {
    it('should create entity with default values', () => {
        const entity = new Entity('test-id');
        
        expect(entity.id).toBe('test-id');
        expect(entity.position).toEqual(new Float32Array([0, 0, 0, 1]));
        expect(entity.rotation).toEqual(M.mat4Identity());
        expect(entity.scale).toEqual(new Float32Array([1, 1, 1, 1]));
        expect(entity.isStatic).toBe(true);
        expect(entity.components.size).toBe(0);
        expect(entity.props).toEqual({});
    });

    it('should create entity with custom values', () => {
        const position = new Float32Array([1, 2, 3, 1]);
        const rotation = M.mat4Rotation(0, Math.PI / 4, 0);
        const scale = new Float32Array([2, 2, 2, 1]);

        const entity = new Entity('custom-id', position, rotation, scale);
        
        expect(entity.id).toBe('custom-id');
        expect(entity.position).toBe(position);
        expect(entity.rotation).toBe(rotation);
        expect(entity.scale).toBe(scale);
    });

    it('should add component and call start', () => {
        const entity = new Entity('test-entity');
        const component = new MockComponent();
        
        const result = entity.addComponent(component);
        
        expect(result).toBe(component);
        expect(component.startCalled).toBe(true);
        expect(entity.components.size).toBe(1);
        expect(entity.isStatic).toBe(false); // Should become non-static due to update method
    });

    it('should remain static when adding component without update method', () => {
        const entity = new Entity('test-entity');
        const component = new MockStaticComponent();
        
        entity.addComponent(component);
        
        expect(component.startCalled).toBe(true);
        expect(entity.components.size).toBe(1);
        expect(entity.isStatic).toBe(true); // Should remain static
    });

    it('should retrieve component by constructor', () => {
        const entity = new Entity('test-entity');
        const component = new MockComponent();
        
        entity.addComponent(component);
        
        const retrieved = entity.getComponent(MockComponent);
        expect(retrieved).toBe(component);
    });

    it('should return undefined for non-existent component', () => {
        const entity = new Entity('test-entity');
        
        const retrieved = entity.getComponent(MockComponent);
        expect(retrieved).toBeUndefined();
    });

    it('should update all components when not static', () => {
        const entity = new Entity('test-entity');
        const component1 = new MockComponent();
        const component2 = new MockComponent2();
        component1.updateReturnValue = 'result1';
        component2.updateReturnValue = 'result2';
        
        entity.addComponent(component1);
        entity.addComponent(component2);
        
        const results = entity.update(16);
        
        expect(component1.updateCalled).toBe(true);
        expect(component2.updateCalled).toBe(true);
        expect(results).toEqual(['result1', 'result2']);
    });

    it('should not update components when static', () => {
        const entity = new Entity('test-entity');
        // Entity remains static because we don't add components with update methods
        
        const result = entity.update(16);
        
        expect(result).toBeUndefined();
    });

    it('should handle components without update method during update', () => {
        const entity = new Entity('test-entity');
        const dynamicComponent = new MockComponent();
        const staticComponent = new MockStaticComponent();
        
        entity.addComponent(dynamicComponent);
        entity.addComponent(staticComponent);
        
        expect(entity.components.size).toBe(2); // Should have both components
        
        const results = entity.update(16);
        
        expect(dynamicComponent.updateCalled).toBe(true);
        expect(results).toEqual(['update-result', null]);
    });

    it('should handle component key generation correctly', () => {
        const entity = new Entity('test-entity');
        const component1 = new MockComponent();
        const component2 = new MockComponent();
        
        entity.addComponent(component1);
        entity.addComponent(component2);
        
        // Second component should replace first due to same constructor name
        expect(entity.components.size).toBe(1);
        expect(entity.getComponent(MockComponent)).toBe(component2);
    });
});