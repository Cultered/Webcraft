import Model from '../Model/Model';
import { createView } from '../View/View';
import { BaseView } from '../View/BaseView';
import debug from '../Debug/Debug';
import { o11s } from '../config/config';
import { setUpCanvas } from '../misc/setUpCanvas';

export let DELTA_TIME = 0;

export default class Controller{
  public model!: Model;
  public view!: BaseView;
  private camId: string;
  private lastTime: number = performance.now();
  private canvasEl!: HTMLCanvasElement;


  constructor(camId='main-camera',canvasEl?: HTMLCanvasElement) {
    this.camId = camId;
    this.canvasEl = canvasEl || setUpCanvas();
  }

  async init() {
    this.model = new Model();
    this.view = await createView(o11s.USE_WEBGPU, this.canvasEl);
    this.canvasEl.addEventListener('click', () => {
      this.canvasEl.requestPointerLock?.();
    });
    requestAnimationFrame(this.controllerLoop);
  }

  private updateDeltaTime() {
    const now = performance.now();
    DELTA_TIME = now - this.lastTime;
    this.lastTime = now;
    return DELTA_TIME;
  }

  private controllerLoop = () => {
    debug.perf("controller-loop", () => {
      debug.log(`Controller ready`);  
      debug.perf("model-update",()=>this.model.update(DELTA_TIME));
      debug.log(this.model.getCamera(this.camId)?.position.reduce((prev, val) => prev + val.toFixed(2) + " ", "") || "No camera");
      this.renderLoop();
      requestAnimationFrame(this.controllerLoop);
      debug.flush();
    });
    this.updateDeltaTime();
  }

  private renderLoop = () => {
    const separatedObjects = debug.perf('model-objects', () => this.model.getObjectsSeparated());
    debug.log(`Rendering ${separatedObjects.static.length} static and ${separatedObjects.nonStatic.length} non-static objects.`); 
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
