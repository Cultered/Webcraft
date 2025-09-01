import { WebGLView } from './WebGLView';
import { WebGPUView } from './WebGPUView';
import { BaseView } from './BaseView';

/**
 * Factory function to create the appropriate view implementation
 * @param useWebGPU - Whether to use WebGPU (true) or WebGL (false)
 * @returns A view instance (WebGPUView or WebGLView)
 */
export function createView(useWebGPU: boolean = true): BaseView {
    if (useWebGPU) {
        return new WebGPUView();
    } else {
        return new WebGLView();
    }
}

export { WebGLView, WebGPUView };
export type { BaseView };