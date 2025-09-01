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

/**
 * Legacy View class that maintains backward compatibility
 * @deprecated Use createView() factory function instead
 */
class View {
    private viewImpl: BaseView;
    private useWebGPU: boolean = true;

    constructor() {
        // Default to WebGPU
        this.viewImpl = new WebGPUView();
    }

    public async init(canvas: HTMLCanvasElement, useWebGPU: boolean = true) {
        this.setWebGPUBackend(useWebGPU);
        return await this.viewImpl.init(canvas);
    }

    public setWebGPUBackend(enabled: boolean) {
        if (this.useWebGPU !== enabled) {
            this.useWebGPU = enabled;
            this.viewImpl = enabled ? new WebGPUView() : new WebGLView();
        }
    }

    public setDebugElement(el: HTMLDivElement) {
        this.viewImpl.setDebugElement(el);
    }

    public async registerSceneObjects(objects: any[], updateVertices: boolean) {
        return await this.viewImpl.registerSceneObjects(objects, updateVertices);
    }

    public registerCamera(camera: any) {
        this.viewImpl.registerCamera(camera);
    }

    public uploadMeshes(meshes: any) {
        this.viewImpl.uploadMeshes(meshes);
    }

    public uploadMeshToGPU(meshId: string, vertices: Float32Array, indices: Uint32Array | Uint16Array) {
        this.viewImpl.uploadMeshToGPU(meshId, vertices, indices);
    }

    public render() {
        this.viewImpl.render();
    }
}

export default View;
export { WebGLView, WebGPUView };
export type { BaseView };