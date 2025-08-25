import Model from '../Model/Model';
import { Matrix4x4 } from '../misc/Matrix4x4';
import { Vector4 } from '../misc/Vector4';

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

      // movement calculations
      const speedBase = this.keys.has('shift') ? -20 : -3; // units per second
      const forward = Vector4.forward().scale(speedBase * delta);
      const right = Vector4.right().scale(speedBase * delta);
      const up = Vector4.up().scale(speedBase * delta);

      let moveOps = 0;
      const t2 = performance.now();
      if (this.keys.has('w')) {
        cam.position = cam.position.add(this.model.requestInverseRotation(cam).mul(forward));
        moveOps++;
      }
      if (this.keys.has('s')) {
        cam.position = cam.position.sub(this.model.requestInverseRotation(cam).mul(forward));
        moveOps++;
      }
      if (this.keys.has('a')) {
        cam.position = cam.position.add(this.model.requestInverseRotation(cam).mul(right));
        moveOps++;
      }
      if (this.keys.has('d')) {
        cam.position = cam.position.sub(this.model.requestInverseRotation(cam).mul(right));
        moveOps++;
      }
      if (this.keys.has(' ')) {
        cam.position = cam.position.sub(this.model.requestInverseRotation(cam).mul(up));
        moveOps++;
      }
      if (this.keys.has('control')) {
        cam.position = cam.position.add(this.model.requestInverseRotation(cam).mul(up));
        moveOps++;
      }
      times['movement'] = performance.now() - t2;
      times['movement_ops'] = moveOps;

      const t3 = performance.now();
      // push camera update into model
      this.model.updateCamera(this.camId, cam.position, cam.rotation);
      times['updateCamera'] = performance.now() - t3;

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
    const dy = e.movementY * this.mouseSensitivity; // x axis rotation
    const dx = e.movementX * this.mouseSensitivity; // y axis rotation
    const ry = Matrix4x4.rotationalMatrix(new Vector4(0, -dx, 0, 0));
    const rx = Matrix4x4.rotationalMatrix(new Vector4(-dy, 0, 0, 0));
    cam.rotation = rx.mulMatrix(ry.mulMatrix(cam.rotation));
    cam.props.updateInverseRotation = true;
    this.model.updateCamera(this.camId, cam.position, cam.rotation);
  };
}
