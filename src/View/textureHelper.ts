import { WebGPUView } from './WebGPUView';
export class TextureHelper {
    private view: WebGPUView;
    public textures: Map<string, GPUTexture> = new Map();
    public primitiveTexture?: GPUTexture;


    constructor(view: WebGPUView) {
        this.view = view;
        this.addPrimitiveTexture();
    }

    createTexture(data: Uint8Array, size: [number, number]) {
        const texture = this.view.getDevice()!.createTexture({
            size: size,
            format: 'rgba8unorm',
            sampleCount: 1,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.view.getDevice()!.queue.writeTexture(
            { texture: texture },
            data.buffer,
            { bytesPerRow: size[0] * 4 },
            { width: size[0], height: size[1] }
        );
        return texture;
    }

    updateTextureFromImageData(texture: GPUTexture, imageData: ImageData) {
        this.view.getDevice()!.queue.writeTexture(
            { texture: texture },
            new Uint8Array(imageData.data.buffer),
            { bytesPerRow: imageData.width * 4 },
            { width: imageData.width, height: imageData.height }
        );
    }

    updateTexture(texture: GPUTexture, data: Uint8Array, size: [number, number]) {
        this.view.getDevice()!.queue.writeTexture(
            { texture: texture },
            data.buffer,
            { bytesPerRow: size[0] * 4 },
            { width: size[0], height: size[1] }
        );
    }

    createTextureFromImageData(imageData: ImageData): GPUTexture {
        return this.createTexture(new Uint8Array(imageData.data.buffer), [imageData.width, imageData.height]);
    };

    addPrimitiveTexture(): GPUTexture | undefined {
        if (!this.view.getDevice()) throw new Error('WebGPU device not initialized');
        const textureData = new Uint8Array([
            255, 255, 255, 255, 255, 0, 0, 255,
            0, 255, 0, 255, 0, 0, 255, 255
        ]);
        const pt = this.createTexture(textureData, [2, 2]);
        this.textures.set('primitive', pt);
        this.primitiveTexture = pt;
        return pt;
    }

    public addTexture(textureId: string, imageData: ImageData): GPUTexture {
        if (!this.view.getDevice()) throw new Error('WebGPU device not initialized');

        const texture = this.createTextureFromImageData(imageData);

        this.textures.set(textureId, texture);

        return texture;
    }

    public createAndAddTexture(textureId: string, data: Uint8Array, size: [number, number]): GPUTexture {
        if (!this.view.getDevice()) throw new Error('WebGPU device not initialized');
        const texture = this.createTexture(data, size);
        this.textures.set(textureId, texture);
        return texture;
    }

    public createAndAddTextureFromImageData(textureId: string, imageData: ImageData): GPUTexture {
        if (!this.view.getDevice()) throw new Error('WebGPU device not initialized');
        const texture = this.createTextureFromImageData(imageData);
        this.textures.set(textureId, texture);
        return texture;
    }
}