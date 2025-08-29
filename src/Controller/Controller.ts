import Model from '../Model/Model';
import * as V from '../misc/Vector4';
import * as M from '../misc/Matrix4x4';

type RenderFn = () => void;

export default class Controller {
  private model: Model;
  private renderFn: RenderFn;
  private keys: Set<string> = new Set();
  private mouseSensitivity = 0.0025; // radians per pixel
  private intervalId: number | null = null;
  private canvasEl?: HTMLCanvasElement;
  private debugEl?: HTMLElement;
  private camId: string;

  constructor(model: Model, renderFn: RenderFn, camId = 'main-camera') {
    this.model = model;
    this.renderFn = renderFn;
    this.camId = camId;
  }

  init(canvasEl: HTMLCanvasElement, debugEl: HTMLElement) {
    this.canvasEl = canvasEl;
    this.debugEl = debugEl;

    // keyboard
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    // pointer lock + mouse look
    this.canvasEl.addEventListener('click', () => {
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

  start() {
    if (this.intervalId !== null) return; // already running
    let lastModelTime = performance.now();

    this.intervalId = window.setInterval(() => {
      if (!this.debugEl) return;
      this.debugEl.innerText = '';

      const now = performance.now();
      const delta = (now - lastModelTime) / 1000; // seconds
      lastModelTime = now;

      // performance timers
      const times: { [k: string]: number } = {};

      const t0 = performance.now();
      this.model.update(delta * 1000);
      times['model.update'] = performance.now() - t0;

      const cam = this.model.getCamera(this.camId);
      if (!cam) {
        console.error("No camera")
        return
      }

      // movement calculations
      const speedBase = this.keys.has('shift') ? 20 : 3; // units per second
      const forward = V.vec4Scale(new Float32Array(4), V.forward(), speedBase * delta);
      const right = V.vec4Scale(new Float32Array(4), V.right(), speedBase * delta);
      const up = V.vec4Scale(new Float32Array(4), V.up(), speedBase * delta);
      const backward = V.vec4Neg(new Float32Array(4), forward);
      const left = V.vec4Neg(new Float32Array(4), right);
      const down = V.vec4Neg(new Float32Array(4), up);

      let moveOps = 0;
      const t2 = performance.now();
      if (this.keys.has('w')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), backward);// forward is -Z in view space
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      if (this.keys.has('s')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), forward);
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      if (this.keys.has('a')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), right);
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      if (this.keys.has('d')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), left);
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      if (this.keys.has(' ')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), down);// i actually dont know lmfao
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      if (this.keys.has('control')) {
        const dir = M.mat4MulVec4(new Float32Array(4), this.model.requestInverseRotation(cam), up);
        cam.position=V.vec4Add(new Float32Array(4), cam.position, dir);
        moveOps++;
      }
      times['movement'] = performance.now() - t2;
      times['movement_ops'] = moveOps;


      const t4 = performance.now();
      // trigger rendering (render loop handles FPS/debug)
      this.renderFn();
      times['renderFn'] = performance.now() - t4;

      // print timing breakdown
      const total = Object.values(times).reduce((s, v) => s + v, 0);
      let out = `Model loop total: ${total.toFixed(2)} ms`;
      for (const k of Object.keys(times)) {
        out += `\n${k}: ${times[k].toFixed(2)} ms`;
      }
      out += `\n`;
      this.debugEl.innerText += out;
    }, 1000 / 60);
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent) => {
    const cam = this.model.getCamera(this.camId);
    if (!cam) return;
    const dy = e.movementY * this.mouseSensitivity; // x axis rotation
    const dx = e.movementX * this.mouseSensitivity; // y axis rotation
    const ry = M.mat4Rotation(0, -dx, 0);
    const rx = M.mat4Rotation(-dy, 0, 0);

    cam.rotation = M.mat4Mul(new Float32Array(16), ry, cam.rotation);
    cam.rotation = M.mat4Mul(new Float32Array(16), rx, cam.rotation);
    cam.props.updateInverseRotation = true;
  };
}
