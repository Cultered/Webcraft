
import { vec4, vec4Add, vec4Neg, vec4Scale, forward, right, up } from '../../misc/vec4';
import * as M from '../../misc/mat4';
import { Entity } from '../Entity';
import type { Component } from './Component';

export default class Freecam implements Component {
  private keys: Set<string> = new Set();
  private mouseSensitivity = 0.0025;
  private canvasEl?: HTMLCanvasElement;
  private entity?: Entity;
  private lastSpeedBoost = 1;

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvasEl = canvasEl;
  }

  start(entity: Entity) {
    this.entity = entity;
    console.log('Freecam component started on entity', entity.id);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvasEl?.addEventListener('click', () => {
      this.canvasEl?.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvasEl) {
        document.addEventListener('mousemove', this.onMouseMove);
      } else {
        document.removeEventListener('mousemove', this.onMouseMove);
      }
    });
  }

  update(entity: Entity, deltaMs?: number) {
    if (!entity) return;
    const delta = (deltaMs ?? 0) / 1000;
    const speedBase = this.keys.has('shift') ? 30*this.lastSpeedBoost : 3;
    if(this.keys.has("shift"))this.lastSpeedBoost*=1.5**delta
    else this.lastSpeedBoost = 1
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
    const dy = e.movementY * this.mouseSensitivity;
    const dx = e.movementX * this.mouseSensitivity;
    const ry = M.mat4Rotation(0, dx, 0);
    const rx = M.mat4Rotation(dy, 0, 0);
    this.entity.rotation = M.mat4Mul(M.mat4(), ry, this.entity.rotation);
    this.entity.rotation = M.mat4Mul(M.mat4(), rx, this.entity.rotation);
    this.entity.updateInverseRotation = true;
  };
}
