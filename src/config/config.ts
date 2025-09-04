
import type { Optimizations } from '../Types/Optimizations';
export const o11s: Optimizations = {
    CPU_CHUNKS: true,
    CHUNK_SIZE: 10,
    RENDER_DISTANCE: 6,
    LOD_DISTANCE: 3,
    CPU_SOFT_FRUSTUM_CULLING: false,//needs fixing
    CPU_LOD: false,//irrelevant
    USE_WEBGPU:true
}