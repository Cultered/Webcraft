export function setupDebugElement(): HTMLDivElement {
        const debugEl = document.createElement('div');
        debugEl.style.position = 'fixed';
        debugEl.style.right = '8px';
        debugEl.style.top = '8px';
        debugEl.style.background = 'rgba(0,0,0,0.6)';
        debugEl.style.color = 'white';
        debugEl.style.padding = '8px';
        debugEl.style.fontFamily = 'monospace';
        debugEl.style.zIndex = '9999';
        debugEl.innerText = 'WebGPU: init...';
        document.body.appendChild(debugEl);
        return debugEl;
}