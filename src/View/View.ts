import { WebGLView } from './WebGLView';
import { WebGPUView } from './WebGPUView';
import { BaseView } from './BaseView';
import { setUpCanvas } from '../misc/setUpCanvas';

/**
 * Factory function to create the appropriate view implementation
 * @param useWebGPU - Whether to use WebGPU (true) or WebGL (false)
 * @returns A view instance (WebGPUView or WebGLView)
 */
export async function createView(useWebGPU: boolean = true): Promise<BaseView> {
    let view;
    if (useWebGPU) {
        view = new WebGPUView();
    } else {
        view = new WebGLView();
    }
    await view.init(setUpCanvas());
    return Promise.resolve(view);
}

export { WebGLView, WebGPUView };
export type { BaseView };
