
import { vec4, vec4Add, vec4Neg, vec4Scale, forward, right, up } from '../../misc/vec4';
import * as M from '../../misc/mat4';
import { Entity } from '../Entity';
import type { Component } from './Component';
import Model from '../Model';

export default class Freecam implements Component {
  private keys: Set<string> = new Set();
  private mouseSensitivity = 0.0025;
  private canvasEl?: HTMLCanvasElement;
  private cam?: Entity;

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvasEl = canvasEl;
  }

  start(entity: Entity) {
    console.log('Freecam component started on entity', entity.id);
    this.cam = entity;
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
    if (!this.cam) return;
    const delta = (deltaMs ?? 0) / 1000;
    const speedBase = this.keys.has('shift') ? 20 : 3;
    const forwardVec = vec4Scale(vec4(), forward(), speedBase * delta);
    const rightVec = vec4Scale(vec4(), right(), speedBase * delta);
    const upVec = vec4Scale(vec4(), up(), speedBase * delta);
    const backward = vec4Neg(vec4(), forwardVec);
    const left = vec4Neg(vec4(), rightVec);
    const down = vec4Neg(vec4(), upVec);
    const model = entity.props.model as Model;
    if (!model) return;
    if (this.keys.has('w')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), backward);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
    if (this.keys.has('s')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), forwardVec);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
    if (this.keys.has('a')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), left);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
    if (this.keys.has('d')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), rightVec);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
    if (this.keys.has(' ')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), upVec);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
    if (this.keys.has('control')) {
      const dir = M.mat4MulVec4(vec4(), model.requestInverseRotation(this.cam), down);
      this.cam.position = vec4Add(vec4(), this.cam.position, dir);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.cam) return;
    const dy = e.movementY * this.mouseSensitivity;
    const dx = e.movementX * this.mouseSensitivity;
    const ry = M.mat4Rotation(0, dx, 0);
    const rx = M.mat4Rotation(dy, 0, 0);
    this.cam.rotation = M.mat4Mul(M.mat4(), ry, this.cam.rotation);
    this.cam.rotation = M.mat4Mul(M.mat4(), rx, this.cam.rotation);
    this.cam.props.updateInverseRotation = true;
  };
}
