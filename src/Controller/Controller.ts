import Model from '../Model/Model';
import { BaseView } from '../View/BaseView';
import { listenDelta, getDelta } from '../misc/misc';
export default class Controller {
  private model: Model;
  private view: BaseView;
  private intervalId: number | null = null;
  private canvasEl?: HTMLCanvasElement;
  private debugEl?: HTMLElement;
  private camId: string;

  constructor(model: Model, view: BaseView, debugEl: HTMLElement, camId = 'main-camera') {
    this.model = model;
    this.view = view;
    this.camId = camId;
    const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
    this.init(canvasEl, debugEl)
  }

  debugMode(enabled: boolean) {
    this.debugEl?.style.setProperty('display', enabled ? 'block' : 'none');
  }

  init(canvasEl: HTMLCanvasElement, debugEl: HTMLElement) {
    this.canvasEl = canvasEl;
    this.debugEl = debugEl;


    // pointer lock + mouse look
    this.canvasEl.addEventListener('click', () => {
      this.canvasEl?.requestPointerLock?.();
    });
    this.start();
  }



  async start() {

    const separatedObjects = this.model.getObjectsSeparated();
    await this.view.registerSceneObjectsSeparated(separatedObjects.static, separatedObjects.nonStatic, true);
    if (this.intervalId !== null) return; // already running
    listenDelta('controller-delta')

    const controllerLoop = () => {
      const delta = getDelta('controller-delta') / 1000; // seconds
      listenDelta('controller-delta')
      if (!this.debugEl) this.debugEl= new HTMLElement();
      this.debugEl.innerText = '';


      listenDelta('model-update')
      this.model.update(delta * 1000);
      this.debugEl.innerText += `Model update : ${getDelta('model-update')} ms`;

      listenDelta('camera-update')

      // Camera movement and mouse look logic moved to Freecam component
      this.debugEl.innerText += `\nCamera update : ${getDelta('camera-update')} ms`;

      listenDelta('view-update')
      this.renderLoop();
      this.debugEl.innerText += `\nRender loop : ${getDelta('view-update')} ms`;
      requestAnimationFrame(controllerLoop);
      this.debugEl.innerText += `\nTotal loop : ${delta} s`;
    }
    requestAnimationFrame(controllerLoop);

  }

  // moved render loop from main.ts into controller so controller owns FPS/debug
  private renderLoop = () => {
    if (!this.debugEl) this.debugEl = new HTMLElement();
    // update scene objects; non-blocking
    listenDelta('model-getobjects')
    const separatedObjects = this.model.getObjectsSeparated();
    this.debugEl.innerText += `\nModel get objects: ${getDelta('model-getobjects')} ms`;
    listenDelta('view-register')
    this.view.registerSceneObjectsSeparated(
      separatedObjects.static,
      separatedObjects.nonStatic,
      this.model.updateStatic
    );
    if (this.model.updateStatic) {
      this.model.updateStatic = false;
    }

    const mainCam = this.model.getCamera(this.camId);
    if (!mainCam) { console.error("No main camera"); return }
    this.view.registerCamera(mainCam);
    this.debugEl.innerText += `\nView register: ${getDelta('view-register')} ms`;

    listenDelta('view-render')
    this.view.render();

    this.debugEl.innerText += `\nView render: ${getDelta('view-render')} ms`;

  };

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Freecam component now handles input listeners
  }

}
