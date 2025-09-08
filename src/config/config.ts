
import type { Optimizations } from '../Types/Optimizations';
export const o11s: Optimizations = {
    CPU_CHUNKS: true,//will probably be moved to gpu
    CHUNK_SIZE: 300,
    RENDER_DISTANCE: 5,
    LOD_DISTANCE: 1,
    CPU_SOFT_FRUSTUM_CULLING: false,//will probably be deprecated too
    CPU_LOD: false,//will be deprecated
    USE_WEBGPU: true//WebGL lighting implementation also working
}