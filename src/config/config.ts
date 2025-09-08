
import type { Optimizations } from '../Types/Optimizations';
export const o11s: Optimizations = {
    CPU_CHUNKS: true,
    CHUNK_SIZE: 300,
    RENDER_DISTANCE: 5,
    LOD_DISTANCE: 1,
    CPU_SOFT_FRUSTUM_CULLING: false,//needs fixing
    CPU_LOD: false,//needs mega fixing
    USE_WEBGPU:true//WebGl temporarily broken
}