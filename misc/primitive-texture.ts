// Simple 4x4 checkerboard texture for testing
export function createPrimitiveTextureData(): ImageData {
    const size = 4;
    const data = new Uint8ClampedArray(size * size * 4);
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4;
            const isLight = (x + y) % 2 === 0;
            const color = isLight ? 255 : 128;
            
            data[index + 0] = color; // R
            data[index + 1] = color; // G
            data[index + 2] = color; // B
            data[index + 3] = 255;   // A
        }
    }
    
    return new ImageData(data, size, size);
}

// Alternative: return a simple 2x2 texture as raw data
export const PRIMITIVE_TEXTURE_2X2 = new Uint8Array([
    // Top row: white, red
    255, 255, 255, 255,   255, 0, 0, 255,
    // Bottom row: green, blue
    0, 255, 0, 255,       0, 0, 255, 255
]);