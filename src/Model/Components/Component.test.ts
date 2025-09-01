import { describe, it, expect } from 'vitest';
import type { Component } from './Component';
import { Entity } from '../Entity';

// Test implementations of the Component interface
class TestComponent implements Component {
    name: string;
    startResult: any = 'started';
    updateResult: any = 'updated';

    constructor(name: string) {
        this.name = name;
    }

    start(entity: Entity) {
        return this.startResult;
    }

    update(entity: Entity, deltaMs?: number) {
        return this.updateResult;
    }
}

class MinimalComponent implements Component {
    start(entity: Entity) {
        return entity.id;
    }
    // No update method - component is static
}

describe('Component Interface', () => {
    it('should allow implementation with both start and update methods', () => {
        const entity = new Entity('test-entity');
        const component = new TestComponent('test');
        
        // Component should implement required interface methods
        expect(typeof component.start).toBe('function');
        expect(typeof component.update).toBe('function');
        
        // Methods should work correctly
        const startResult = component.start(entity);
        expect(startResult).toBe('started');
        
        const updateResult = component.update(entity, 16);
        expect(updateResult).toBe('updated');
    });

    it('should allow implementation with only start method', () => {
        const entity = new Entity('test-entity');
        const component = new MinimalComponent();
        
        // Component should implement required start method
        expect(typeof component.start).toBe('function');
        expect(component.update).toBeUndefined(); // Optional method
        
        // Start method should work
        const result = component.start(entity);
        expect(result).toBe('test-entity');
    });

    it('should work with Entity component system', () => {
        const entity = new Entity('test-entity');
        const component = new TestComponent('integration-test');
        
        // Add component to entity
        const addedComponent = entity.addComponent(component);
        expect(addedComponent).toBe(component);
        
        // Component should be retrievable
        const retrieved = entity.getComponent(TestComponent);
        expect(retrieved).toBe(component);
        expect(retrieved?.name).toBe('integration-test');
    });

    it('should handle component with update method in entity update cycle', () => {
        const entity = new Entity('test-entity');
        const component = new TestComponent('updatable');
        component.updateResult = 'component-updated';
        
        entity.addComponent(component);
        
        // Entity should become non-static due to update method
        expect(entity.isStatic).toBe(false);
        
        // Update should call component update
        const results = entity.update(16);
        expect(results).toEqual(['component-updated']);
    });

    it('should handle component without update method in entity update cycle', () => {
        const entity = new Entity('test-entity');
        const component = new MinimalComponent();
        
        entity.addComponent(component);
        
        // Entity should remain static (no update method)
        expect(entity.isStatic).toBe(true);
        
        // Update should return undefined for static entities
        const result = entity.update(16);
        expect(result).toBeUndefined();
    });

    it('should support mixed components (with and without update)', () => {
        const entity = new Entity('test-entity');
        const updatableComponent = new TestComponent('updatable');
        const staticComponent = new MinimalComponent();
        
        updatableComponent.updateResult = 'dynamic-result';
        
        entity.addComponent(updatableComponent);
        entity.addComponent(staticComponent);
        
        // Entity should be non-static due to updatable component
        expect(entity.isStatic).toBe(false);
        
        // Update should handle both component types
        const results = entity.update(16);
        expect(results).toEqual(['dynamic-result', null]);
    });

    it('should allow component to access entity in start method', () => {
        class EntityAccessComponent implements Component {
            entityId?: string;
            
            start(entity: Entity) {
                this.entityId = entity.id;
                return this.entityId;
            }
        }
        
        const entity = new Entity('access-test');
        const component = new EntityAccessComponent();
        
        const result = component.start(entity);
        
        expect(component.entityId).toBe('access-test');
        expect(result).toBe('access-test');
    });

    it('should allow component to modify entity in update method', () => {
        class ModifyingComponent implements Component {
            start(entity: Entity) {
                return entity;
            }
            
            update(entity: Entity, deltaMs?: number) {
                // Modify entity properties
                entity.props.lastUpdate = deltaMs;
                entity.props.updateCount = (entity.props.updateCount || 0) + 1;
                return entity.props.updateCount;
            }
        }
        
        const entity = new Entity('modify-test');
        const component = new ModifyingComponent();
        
        entity.addComponent(component);
        
        // First update
        const result1 = entity.update(16);
        expect(result1).toEqual([1]);
        expect(entity.props.lastUpdate).toBe(16);
        expect(entity.props.updateCount).toBe(1);
        
        // Second update
        const result2 = entity.update(32);
        expect(result2).toEqual([2]);
        expect(entity.props.lastUpdate).toBe(32);
        expect(entity.props.updateCount).toBe(2);
    });
});