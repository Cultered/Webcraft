import type { Vector4 } from '../misc/Vector4';

export interface DirectLight {
    id: string;
    direction: Vector4;  // Direction the light is pointing (normalized)
    color: Vector4;      // RGB color + intensity (w component)
    enabled: boolean;
}

export interface PointLight {
    id: string;
    position: Vector4;   // World position of the light
    color: Vector4;      // RGB color + intensity (w component)
    radius: number;      // Maximum distance the light affects
    enabled: boolean;
}

export interface LightingData {
    directLights: DirectLight[];
    pointLights: PointLight[];
}