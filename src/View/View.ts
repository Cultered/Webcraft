
import { WebGPUView } from './WebGPUView';
import { BaseView } from './BaseView';

/**
 * Factory function to create view instances.
 * 
 * RIP WebGL you won't be missed.
 */
export async function createView(canvasEl: HTMLCanvasElement): Promise<WebGPUView> {
    let view;
    view = new WebGPUView();
    await view.init(canvasEl);
    return Promise.resolve(view);
}

export { WebGPUView };
export type { BaseView };
