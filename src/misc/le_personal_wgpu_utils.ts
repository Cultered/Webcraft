// To import this just concat the webgpu_utils string to your shader code string

export const webgpu_utils = /*wgsl*/`

fn hash(p: vec2f) -> f32 {
    return fract(sin(dot(p ,vec2f(127.1,311.7))) * 43758.5453123);
}

fn noise2D(p: vec2f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(hash(i + vec2f(0.0, 0.0)), hash(i + vec2f(1.0, 0.0)), u.x),
        mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
        u.y
    );
}

fn fbm(p: vec2f) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var pos = p;
    
    for (var i = 0; i < 6; i++) {
        value += amplitude * noise2D(pos);
        pos *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

fn noise3D(p: vec3f) -> f32 {
    let p_xy = p.xy;
    let p_yz = p.yz;
    let p_zx = p.zx;
    let n_xy = noise2D(p_xy);
    let n_yz = noise2D(p_yz);
    let n_zx = noise2D(p_zx);
    return (n_xy + n_yz + n_zx) / 3.0;
}
fn fbm3D(p: vec3f) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var pos = p;
    for (var i = 0; i < 6; i++) {
        value += amplitude * noise3D(pos);
        pos *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}


`