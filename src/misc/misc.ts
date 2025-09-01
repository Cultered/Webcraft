export function radians(degrees: number): number {
    return degrees * (Math.PI / 180);
}
export function ShowWebGPUInstructions() {

    console.error('WebGPU API unavailable or initialization failed:');
    try{
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