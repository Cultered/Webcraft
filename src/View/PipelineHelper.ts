import { WebGPUView } from './WebGPUView';
import { RenderPipelineHelper } from './RenderPipelineHelper';
import { PostProcessingPipelineHelper } from './PostProcessingPipelineHelper';
import CustomRenderShader, { type CustomBufferSpec } from '../Model/Components/CustomRenderShader';
import PostProcessingShader from '../Model/Components/PostProcessingShader';
import type Entity from '../Model/Entity';

/**
 * Unified pipeline helper that combines render and post-processing pipeline management.
 * This class delegates to RenderPipelineHelper and PostProcessingPipelineHelper internally.
 */
export class PipelineHelper {
    private view: WebGPUView;
    private renderHelper: RenderPipelineHelper;
    private postProcessHelper: PostProcessingPipelineHelper;

    // Expose pipeline maps for backward compatibility
    public get renderPipelines() { return this.renderHelper.renderPipelines; }
    public get customShaderBuffers() { return this.renderHelper.customShaderBuffers; }
    public get customShaderBindGroups() { return this.renderHelper.customShaderBindGroups; }
    public get postProcessPipelines() { return this.postProcessHelper.postProcessPipelines; }
    public get postProcessBuffers() { return this.postProcessHelper.postProcessBuffers; }

    constructor(view: WebGPUView) {
        this.view = view;
        this.renderHelper = new RenderPipelineHelper(view);
        this.postProcessHelper = new PostProcessingPipelineHelper(view);
    }

    // =====================
    // Render Pipeline Methods (delegated to RenderPipelineHelper)
    // =====================

    public createRenderPipeline(shader: CustomRenderShader): void {
        this.renderHelper.createRenderPipeline(shader);
    }

    public updateCustomBuffer(buffer: GPUBuffer, spec: CustomBufferSpec): void {
        this.renderHelper.updateCustomBuffer(buffer, spec);
    }

    public getBindGroupForCustomShaderBuffers(shader: CustomRenderShader): GPUBindGroup {
        return this.renderHelper.getBindGroupForCustomShaderBuffers(shader);
    }

    public getBindGroupForCustomShaderTextures(pipeline: GPURenderPipeline, shader: CustomRenderShader): GPUBindGroup {
        return this.renderHelper.getBindGroupForCustomShaderTextures(pipeline, shader);
    }

    public createPipelinesForEntities(entities: Entity[]): void {
        this.renderHelper.createPipelinesForEntities(entities);
    }

    public getPipeline(shaderId: string): GPURenderPipeline | undefined {
        return this.renderHelper.getPipeline(shaderId);
    }

    public hasPipeline(shaderId: string): boolean {
        return this.renderHelper.hasPipeline(shaderId);
    }

    // =====================
    // Post-Processing Pipeline Methods (delegated to PostProcessingPipelineHelper)
    // =====================

    public createPostProcessPipelines(shaders: PostProcessingShader[]): void {
        this.postProcessHelper.createPostProcessPipelines(shaders);
    }

    public updatePostProcessBuffers(shader: PostProcessingShader): void {
        this.postProcessHelper.updatePostProcessBuffers(shader);
    }

    public getPostProcessPipeline(shaderId: string): GPURenderPipeline | undefined {
        return this.postProcessHelper.getPostProcessPipeline(shaderId);
    }

    public hasPostProcessPipeline(shaderId: string): boolean {
        return this.postProcessHelper.hasPostProcessPipeline(shaderId);
    }

    public getPostProcessBindGroup0(
        pipeline: GPURenderPipeline,
        sampler: GPUSampler,
        inputTexture: GPUTextureView,
        resolutionBuffer: GPUBuffer,
        timeBuffer: GPUBuffer,
        sceneTexture?: GPUTextureView
    ): GPUBindGroup {
        return this.postProcessHelper.getPostProcessBindGroup0(
            pipeline, sampler, inputTexture, resolutionBuffer, timeBuffer, sceneTexture
        );
    }

    public getPostProcessBindGroup1(pipeline: GPURenderPipeline, shader: PostProcessingShader): GPUBindGroup {
        return this.postProcessHelper.getPostProcessBindGroup1(pipeline, shader);
    }
}

