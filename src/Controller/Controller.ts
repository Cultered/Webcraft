import Model from '../Model/Model';
import { BaseView } from '../View/BaseView';
import debug from '../Debug/Debug';
export default class Controller {
  private model: Model;
  private view: BaseView;
  private canvasEl?: HTMLCanvasElement;
  private camId: string;
  private lastTime: number = performance.now();

  public hello() {
    console.log("Hi")
  }

  constructor(model: Model, view: BaseView, camId = 'main-camera') {
    this.model = model;
    this.view = view;
    this.camId = camId;
    const canvasEl = document.querySelector('#main-canvas') as HTMLCanvasElement;
    this.init(canvasEl)
  }

  init(canvasEl: HTMLCanvasElement) {
    this.canvasEl = canvasEl;
    this.canvasEl.addEventListener('click', () => {
      this.canvasEl?.requestPointerLock?.();
    });
    requestAnimationFrame(this.controllerLoop);
  }

  private delta() {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    return delta;
  }

  private controllerLoop = () => {
    debug.log(`Controller ready`);
    this.model.update(this.delta());
    debug.log(this.model.getCamera(this.camId)?.position.toString() || "No camera");
    this.renderLoop();
    requestAnimationFrame(this.controllerLoop);
    debug.flush();
  }

  private renderLoop = () => {
    const separatedObjects = debug.perf('model-objects', () => this.model.getObjectsSeparated());
    debug.perf('view-register', () =>
      this.view.registerSceneObjectsSeparated(
        separatedObjects.static,
        separatedObjects.nonStatic,
        this.model.updateStatic
      )
    );
    if (this.model.updateStatic) {
      this.model.updateStatic = false;
    }
    const mainCam = this.model.getCamera(this.camId);
    if (!mainCam) { console.error("No main camera"); return }
    this.view.registerCamera(mainCam);
    debug.perf('view-render', () => this.view.render());
  };

}
