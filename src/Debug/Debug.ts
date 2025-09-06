class Debug {
    public dlog: string[] = [];
    public dlogElement: HTMLDivElement;
    public plog: Record<string, number[]> = {};
    private callCounts: Record<string, { count: number, lastTime: number, cps: number }> = {};
    public plogElement: HTMLDivElement;
    private selectedKey: string | null = null;
    private graphCanvas: HTMLCanvasElement;

    constructor() {
        this.dlogElement = this.setupDebugLogElement();
        this.plogElement = this.createPlogElement();
        this.graphCanvas = this.createGraphCanvas();
        this.plogElement.appendChild(this.graphCanvas);
        this.updateProfilerUI();
    }

    private createPlogElement(): HTMLDivElement {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.right = '8px';
        el.style.top = '80px';
        el.style.background = 'rgba(0,0,0,0.7)';
        el.style.color = 'white';
        el.style.padding = '8px';
        el.style.fontFamily = 'monospace';
        el.style.zIndex = '9999';
        el.innerText = 'Profiler';
        document.body.appendChild(el);
        return el;
    }

    private createGraphCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 100;
        canvas.style.display = 'block';
        canvas.style.marginTop = '8px';
        return canvas;
    }
    
    public log(str: string): void {
        this.dlog.push(str)
    }

    public flush(): void {
        this.dlogElement.innerText = this.dlog.join('\n');
        this.dlog = []
    }

    public perf<T>(name: string, cb: () => T): T {
        const start = performance.now();
        const result = cb();
        const end = performance.now();
        const elapsed = end - start;
        if (!this.plog[name]) this.plog[name] = [];
        this.plog[name].push(elapsed);
        if (this.plog[name].length > 100) this.plog[name].shift();
        // Calls per second tracking
        const now = performance.now();
        if (!this.callCounts[name]) {
            this.callCounts[name] = { count: 1, lastTime: now, cps: 0 };
        } else {
            const info = this.callCounts[name];
            info.count++;
            if (now - info.lastTime >= 1000) {
                info.cps = info.count / ((now - info.lastTime) / 1000);
                info.count = 0;
                info.lastTime = now;
            }
        }
        this.updateProfilerUI();
        return result;
    }

    private keyButtons: Map<string, HTMLButtonElement> = new Map();
    private titleDiv: HTMLDivElement | null = null;

    private updateProfilerUI() {
        // On first call, render key buttons and title
        if (!this.titleDiv) {
            this.titleDiv = document.createElement('div');
            this.titleDiv.innerText = 'Profiler Keys:';
            this.plogElement.insertBefore(this.titleDiv, this.graphCanvas);
        }
        // Add new buttons for new keys
        Object.keys(this.plog).forEach(key => {
            if (!this.keyButtons.has(key)) {
                const btn = document.createElement('button');
                btn.innerText = key;
                btn.style.margin = '2px';
                btn.style.background = (this.selectedKey === key) ? '#444' : '#222';
                btn.style.color = 'white';
                btn.style.border = '1px solid #888';
                btn.style.cursor = 'pointer';
                btn.onclick = () => {
                    this.selectedKey = key;
                    this.updateProfilerUI();
                };
                this.plogElement.insertBefore(btn, this.graphCanvas);
                this.keyButtons.set(key, btn);
            }
        });
        // Update button styles for selection
        this.keyButtons.forEach((btn, key) => {
            btn.style.background = (this.selectedKey === key) ? '#444' : '#222';
        });
        // Draw graph if key selected
        this.drawGraph();
    }

    private drawGraph() {
        const ctx = this.graphCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, this.graphCanvas.width, this.graphCanvas.height);
        if (!this.selectedKey || !this.plog[this.selectedKey] || this.plog[this.selectedKey].length === 0) {
            ctx.fillStyle = 'white';
            ctx.fillText('Select a key to view graph', 10, 50);
            return;
        }
        const data = this.plog[this.selectedKey];
        const w = this.graphCanvas.width;
        const h = this.graphCanvas.height;
        const max = Math.max(...data);
        const min = Math.min(...data);
        ctx.strokeStyle = '#0ff';
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = (i / (data.length - 1)) * (w - 10) + 5;
            const y = h - 5 - ((v - min) / (max - min || 1)) * (h - 10);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = 'white';
        let cps = 0;
        if (this.selectedKey && this.callCounts[this.selectedKey]) {
            cps = this.callCounts[this.selectedKey].cps;
        }
        ctx.fillText(`${this.selectedKey}: min=${min.toFixed(2)} max=${max.toFixed(2)} calls/s=${cps.toFixed(1)}`, 10, 10);
    }
    private setupDebugLogElement(): HTMLDivElement {
        const debugEl = document.createElement('div');
        debugEl.style.position = 'fixed';
        debugEl.style.right = '8px';
        debugEl.style.top = '8px';
        debugEl.style.background = 'rgba(0,0,0,0.6)';
        debugEl.style.color = 'white';
        debugEl.style.padding = '8px';
        debugEl.style.fontFamily = 'monospace';
        debugEl.style.zIndex = '9999';
        debugEl.innerText = 'Initializing...';
        document.body.appendChild(debugEl);
        return debugEl;
    }

}
const debug = new Debug();
export default debug