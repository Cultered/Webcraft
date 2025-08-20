export function setUpCanvas():HTMLCanvasElement{
    const canvas = document.createElement('canvas');
    canvas.id = 'webgpu-canvas';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.display = 'block';
    document.querySelector('#app')!.appendChild(canvas);
    return canvas;
}