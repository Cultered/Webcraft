export function radians(degrees: number): number {
    return degrees * (Math.PI / 180);
}
export function ShowWebGPUInstructions() {

    console.error('WebGPU API unavailable or initialization failed:');
    try {
        const instructions = document.createElement('div');
        instructions.style.position = 'absolute';
        instructions.style.top = '0';
        instructions.style.left = '0';
        instructions.style.width = '100%';
        instructions.style.backgroundColor = '#ffcccc';
        instructions.style.color = '#000';
        instructions.style.padding = '10px';
        instructions.style.fontFamily = 'Arial, sans-serif';
        instructions.style.zIndex = '1000';
        instructions.innerHTML = `
                    <strong>WebGPU is not supported or enabled in your browser.</strong><br>
                    To enable WebGPU, follow these instructions:<br>
                    <ul>
                        <li><strong>Chrome:</strong> Go to <code>chrome://flags/#enable-unsafe-webgpu</code> and enable it.</li>
                        <li><strong>Edge:</strong> Go to <code>edge://flags#enable-unsafe-webgpu</code> and enable it.</li>
                        <li><strong>Firefox:</strong> Go to <code>about:config</code>, search for "dom.webgpu.enabled", and enable it.</li>
                        <li><strong>Safari:</strong> Enable the "WebGPU" experimental feature in Safari's Develop menu.</li>
                    </ul>
                `;
        document.body.appendChild(instructions);
    }
    catch (error) {
        console.error('WebGPU is not supported or enabled in your browser');
    }
}


// Torus tube algorithm (translated from Python)
export function torusTube(R: number, R1: number, p: number, q: number, Nu: number, Nv: number): [number, number, number][] {
    const points: [number, number, number][] = [];
    let pk: number[] | null = null;
    for (let j = -1; j <= Nv; j++) {
        const v = 2 * Math.PI * j / (Nv + 1);
        const r = Math.cos(q * v) + 2;
        const old_pk = pk;
        pk = [
            R * r * Math.cos(p * v),
            -R * Math.sin(q * v),
            R * r * Math.sin(p * v)
        ];
        if (!old_pk) continue;
        // nv = pk - old_pk
        let nv = pk.map((val, idx) => val - old_pk[idx]);
        const nvLen = Math.sqrt(nv.reduce((acc, val) => acc + val * val, 0));
        nv = nv.map(val => val / nvLen);
        // iv: random orthogonal vector
        let iv = [Math.random(), Math.random(), Math.random()];
        const dot = iv[0] * nv[0] + iv[1] * nv[1] + iv[2] * nv[2];
        iv = iv.map((val, idx) => val - dot * nv[idx]);
        const ivLen = Math.sqrt(iv.reduce((acc, val) => acc + val * val, 0));
        iv = iv.map(val => val / ivLen);
        // jv = cross(nv, iv)
        let jv = [
            nv[1] * iv[2] - nv[2] * iv[1],
            nv[2] * iv[0] - nv[0] * iv[2],
            nv[0] * iv[1] - nv[1] * iv[0]
        ];
        const jvLen = Math.sqrt(jv.reduce((acc, val) => acc + val * val, 0));
        jv = jv.map(val => val / jvLen);
        for (let i = 0; i <= Nu; i++) {
            const u = -Math.PI + 2 * Math.PI * i / (Nu + 1);
            const ea = [
                R1 * (Math.cos(u) * iv[0] + Math.sin(u) * jv[0]),
                R1 * (Math.cos(u) * iv[1] + Math.sin(u) * jv[1]),
                R1 * (Math.cos(u) * iv[2] + Math.sin(u) * jv[2])
            ];
            const x = ea[0] + pk[0];
            const y = ea[1] + pk[1];
            const z = ea[2] + pk[2];
            // Avoid duplicates
            if (!points.some(pt => pt[0] === x && pt[1] === y && pt[2] === z)) {
                points.push([x, y, z]);
            }
        }
    }
    return points;
}

/**
 * Generate points on the surface of a sphere.
 * @param radius Sphere radius
 * @param stacks Number of latitude divisions (>=2)
 * @param slices Number of longitude divisions (>=3)
 * @returns Array of unique [x,y,z] points on the sphere surface
 */
export function sphere(radius: number, stacks: number, slices: number): [number, number, number][] {
    const pts: [number, number, number][] = [];
    if (stacks < 2) stacks = 2;
    if (slices < 3) slices = 3;
    for (let i = 0; i <= stacks; i++) {
        const phi = Math.PI * i / stacks; // 0..PI
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        for (let j = 0; j < slices; j++) {
            const theta = 2 * Math.PI * j / slices; // 0..2PI
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const x = radius * sinPhi * cosTheta;
            const y = radius * cosPhi;
            const z = radius * sinPhi * sinTheta;
            if (!pts.some(p => p[0] === x && p[1] === y && p[2] === z)) {
                pts.push([x, y, z]);
            }
        }
    }
    return pts;
}

/**
 * Generate multiple spheres by reusing sphere().
 * @param centers Array of sphere center coordinates
 * @param radius Radius for each sphere (or array matching centers length)
 * @param stacks Latitude divisions
 * @param slices Longitude divisions
 * @returns Combined unique points for all spheres
 */
export function sphere2(sphereRadius: number, stacks: number, slices: number): [number, number, number][] {
    /**
     * centersSphereRadius: radius of the sphere on which centers are placed
     * centerStacks/centerSlices: resolution for center distribution
     * sphereRadius: radius (or array of radii) for generated spheres at each center
     * stacks/slices: resolution of each generated sphere surface
     */
    const centers = sphere(sphereRadius*stacks, stacks, slices);
    const out: [number, number, number][] = [];
    centers.forEach((c) => {
        const r = sphereRadius;
        const base = sphere(r, stacks, slices);
        for (const p of base) {
            const x = p[0] + c[0];
            const y = p[1] + c[1];
            const z = p[2] + c[2];
            if (!out.some(q => q[0] === x && q[1] === y && q[2] === z)) out.push([x, y, z]);
        }
    });
    return out;
}

export function sphere3(sphereRadius: number, stacks: number, slices: number): [number, number, number][] {
    const centers = sphere2(sphereRadius*stacks, stacks, slices);
    const out: [number, number, number][] = [];
    centers.forEach((c) => {
        const r = sphereRadius;
        const base = sphere(r, stacks, slices);
        for (const p of base) {
            const x = p[0] + c[0];
            const y = p[1] + c[1];
            const z = p[2] + c[2];
            if (!out.some(q => q[0] === x && q[1] === y && q[2] === z)) out.push([x, y, z]);
        }
    });
    return out;
}