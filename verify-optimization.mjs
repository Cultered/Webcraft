#!/usr/bin/env node

// Manual verification script for static entity optimization
import Model from '../src/Model/Model.js';
import { Entity } from '../src/Model/Entity.js';
import MeshComponent from '../src/Model/Components/MeshComponent.js';
import Rotator from '../src/Model/Components/Rotator.js';
import * as V from '../src/misc/vec4.js';

const mockMesh = {
    id: 'test-mesh',
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2])
};

console.log('=== Static Entity Optimization Verification ===\n');

const model = new Model();
model.addCamera('main-camera', V.vec4(0, 0, 0, 0));

// Add static entities
console.log('Adding static entities...');
const static1 = model.addEntity('static-1', { position: V.vec4(1, 0, 0, 1) });
const static2 = model.addEntity('static-2', { position: V.vec4(2, 0, 0, 1) });
static1.addComponent(new MeshComponent(mockMesh, false));
static2.addComponent(new MeshComponent(mockMesh, false));

// Add dynamic entities
console.log('Adding dynamic entities...');
const dynamic1 = model.addEntity('dynamic-1', { position: V.vec4(3, 0, 0, 1) });
const dynamic2 = model.addEntity('dynamic-2', { position: V.vec4(4, 0, 0, 1) });
dynamic1.addComponent(new Rotator(1.0));
dynamic2.addComponent(new Rotator(2.0));

console.log('\n=== Entity Classification ===');
console.log(`static-1 isStatic: ${static1.isStatic}`);
console.log(`static-2 isStatic: ${static2.isStatic}`);
console.log(`dynamic-1 isStatic: ${dynamic1.isStatic}`);
console.log(`dynamic-2 isStatic: ${dynamic2.isStatic}`);

const separated = model.getObjectsSeparated();
console.log(`\nStatic objects count: ${separated.static.length}`);
console.log(`Non-static objects count: ${separated.nonStatic.length}`);

console.log('\nStatic objects:');
separated.static.forEach(obj => console.log(`  - ${obj.id} at position [${obj.position[0]}, ${obj.position[1]}, ${obj.position[2]}]`));

console.log('\nNon-static objects:');
separated.nonStatic.forEach(obj => console.log(`  - ${obj.id} at position [${obj.position[0]}, ${obj.position[1]}, ${obj.position[2]}]`));

console.log('\n=== Testing Updates ===');
console.log('Performing model update...');
const rotationsBefore = {
    static1: [...static1.rotation],
    dynamic1: [...dynamic1.rotation]
};

model.update(16); // 16ms delta

const rotationsAfter = {
    static1: [...static1.rotation],
    dynamic1: [...dynamic1.rotation]
};

console.log('Static entity rotation changed:', !arraysEqual(rotationsBefore.static1, rotationsAfter.static1));
console.log('Dynamic entity rotation changed:', !arraysEqual(rotationsBefore.dynamic1, rotationsAfter.dynamic1));

console.log('\n=== Backward Compatibility ===');
const allObjects = model.getObjects();
const combinedSeparated = [...separated.static, ...separated.nonStatic];

console.log(`getObjects() count: ${allObjects.length}`);
console.log(`Combined separated count: ${combinedSeparated.length}`);
console.log('Counts match:', allObjects.length === combinedSeparated.length);

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, i) => Math.abs(val - b[i]) < 0.0001);
}

console.log('\n✅ Verification complete!');