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