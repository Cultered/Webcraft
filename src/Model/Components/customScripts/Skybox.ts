import { Entity } from '../../Entity';
import type { Component } from '../Component';
import { MODEL } from '../../../Controller/Controller';

export default class Skybox implements Component {
  private entity?: Entity;
  private cameraId: string;

  constructor(cameraId: string = 'main-camera') {
    this.cameraId = cameraId;
  }

  start(entity: Entity) {
    this.entity = entity;
    console.log('Skybox component started on entity', entity.id);
  }

  update() {
    if (!this.entity) return;
    
    // Get the camera position
    const camera = MODEL.getCamera(this.cameraId);
    if (camera) {
      // Make the skybox follow the camera position
      this.entity.position[0] = camera.position[0];
      this.entity.position[1] = camera.position[1];
      this.entity.position[2] = camera.position[2];
    }
  }

  destroy() {
    // Cleanup if needed
  }
}
