import { vec4, vec4Add, vec4Neg, vec4Scale, forward, right, up } from '../../../misc/vec4';
import * as M from '../../../misc/mat4';
import { Entity } from '../../Entity';
import type { Component } from '../Component';
import { DELTA_TIME } from '../../../Controller/Controller';

export default class UprightCam implements Component {
  private keys: Set<string> = new Set();
  private mouseSensitivity = 0.002;
  private lockElement!: HTMLCanvasElement;
  private entity?: Entity;
  private lastSpeedBoost = 1;
  
  // Store rotation angles instead of incremental rotation
  private yaw = 0;   // Horizontal rotation (Y-axis)
  private pitch = 0; // Vertical rotation (X-axis)
  
  private maxPitch = Math.PI / 2 - 0.01; // Prevent looking straight up/down

  constructor(lockElement?: HTMLCanvasElement, startingPitch?: number, startingYaw?: number) {
    if (lockElement) {
      this.lockElement = lockElement;
    } else {
      this.lockElement = document.querySelector('#main-canvas') as HTMLCanvasElement;
    }
    if (startingPitch !== undefined) {
      this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, startingPitch));
    }
    if (startingYaw !== undefined) {
      this.yaw = startingYaw;
    }
  }

  start(entity: Entity) {
    this.entity = entity;
    console.log('UprightCam component started on entity', entity.id);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.lockElement?.addEventListener('click', () => {
      this.lockElement?.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.lockElement) {
        document.addEventListener('mousemove', this.onMouseMove);
      } else {
        document.removeEventListener('mousemove', this.onMouseMove);
      }
    });
  }

  update(entity: Entity) {
    if (!entity) return;
    const delta = (DELTA_TIME ?? 0) / 1000;
    const speedBase = this.keys.has('shift') ? 30 * this.lastSpeedBoost : 3;
    if (this.keys.has("shift")) this.lastSpeedBoost *= 1.35 ** delta;
    else this.lastSpeedBoost = 1;

    // Update rotation matrix from yaw and pitch (no roll)
    // Apply yaw first (Y-axis), then pitch (X-axis)
    const rotationY = M.mat4Rotation(0, this.yaw, 0);
    const rotationX = M.mat4Rotation(this.pitch, 0, 0);
    entity.rotation = M.mat4Mul(M.mat4(), rotationX, rotationY);
    entity.updateInverseRotation = true;

    // Movement is calculated relative to camera direction
    const forwardVec = vec4Scale(vec4(), forward(), speedBase * delta);
    const rightVec = vec4Scale(vec4(), right(), speedBase * delta);
    const upVec = vec4Scale(vec4(), up(), speedBase * delta);
    const backward = vec4Neg(vec4(), forwardVec);
    const left = vec4Neg(vec4(), rightVec);
    const down = vec4Neg(vec4(), upVec);

    if (this.keys.has('w')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), backward);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
    if (this.keys.has('s')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), forwardVec);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
    if (this.keys.has('a')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), left);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
    if (this.keys.has('d')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), rightVec);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
    if (this.keys.has(' ')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), upVec);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
    if (this.keys.has('control')) {
      const dir = M.mat4MulVec4(vec4(), entity.requestInverseRotation(), down);
      entity.position = vec4Add(vec4(), entity.position, dir);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.entity) return;
    
    // Update yaw (horizontal) and pitch (vertical) based on mouse movement
    this.yaw += e.movementX * this.mouseSensitivity;
    this.pitch += e.movementY * this.mouseSensitivity;
    
    // Clamp pitch to prevent gimbal lock and looking too far up/down
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));
  };
}
