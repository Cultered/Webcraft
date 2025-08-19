// Globals
var deltaTime = 0;
var prevTime = 0;
const stats = document.getElementById('stats');

async function loadShaderModuleFromFile(device, url) {
    const code = await fetch(url).then(r => r.text());
    return device.createShaderModule({ code });
}
async function getContext() {
    if (!navigator.gpu) {
        console.error("WebGPU API unavailable");
        return;
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
    });
    if (!adapter) {
        throw new Error("No adapter found");
    }
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxBufferSize: 600000000, // Adjust as needed
        }
    });
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: format,
        alphaMode: 'premultiplied',
    });
    return [adapter, device, canvas, context, format];
}

function generateIndexedSphere(lati, long, radius) {
    const vertices = [];
    const indices = [];

    for (let lat = 0; lat <= lati; lat++) {
        const theta = (lat / lati) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= long; lon++) {
            const phi = (lon / long) * 2 * Math.PI;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = radius * sinTheta * cosPhi;
            const y = radius * cosTheta;
            const z = radius * sinTheta * sinPhi;

            vertices.push(x, y, z); // use vec3<f32>
        }
    }

    for (let lat = 0; lat < lati; lat++) {
        for (let lon = 0; lon < long; lon++) {
            const first = lat * (long + 1) + lon;
            const second = first + long + 1;

            indices.push(first, first + 1, second);
            indices.push(second, first + 1, second + 1);
        }
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices),
    };
}

function dTimeUpdate() {
    const currentTime = performance.now();
    deltaTime = (currentTime - prevTime);
    prevTime = currentTime;
    return deltaTime;
}

function getFps() {
    const fps = 1000 / deltaTime;
    return fps;
}

class Vector4 {
    constructor(x, y, z, w) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
}
class Matrix4x4 {
    constructor(vec1, vec2, vec3, vec4) {
        this.vec1 = vec1; // vec4<f32>
        this.vec2 = vec2; // vec4<f32>
        this.vec3 = vec3; // vec4<f32>
        this.vec4 = vec4; // vec4<f32>
    }
}

function rotationalMatrix(angle) {
    let cosX = Math.cos(angle.x);
    let sinX = Math.sin(angle.x);
    let cosY = Math.cos(angle.y);
    let sinY = Math.sin(angle.y);
    let cosZ = Math.cos(angle.z);
    let sinZ = Math.sin(angle.z);

    return new Matrix4x4(
        new Vector4(cosY * cosZ, -cosY * sinZ, sinY, 0.0),
        new Vector4(sinX * sinY * cosZ + cosX * sinZ, -sinX * sinY * sinZ + cosX * cosZ, -sinX * cosY, 0.0),
        new Vector4(-cosX * sinY * cosZ + sinX * sinZ, cosX * sinY * sinZ + sinX * cosZ, cosX * cosY, 0.0),
        new Vector4(0.0, 0.0, 0.0, 1.0)
    );
}
function radians(degrees) {
    return degrees * (Math.PI / 180);
}
function projectionMatrix(fovY, aspect, near, far) {
    let f = 1.0 / Math.tan(radians(fovY) * 0.5);
    let nf = 1.0 / (near - far);
    let proj = new Matrix4x4(
        new Vector4(f / aspect, 0.0, 0.0, 0.0),
        new Vector4(0.0, f, 0.0, 0.0),
        new Vector4(0.0, 0.0, (far + near) * nf, -1.0),
        new Vector4(0.0, 0.0, 2.0 * far * near * nf, 0.0)
    );
    return proj;
}

class Vector3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
class GameObject {
    constructor() {
        this.position = new Vector3(0, 0, 0);
        this.rotation = new Vector3(0, 0, 0);
        this.props = {};
    }
}
class GameScript {
    constructor(src) {
        this.src = src;
        this.params = {};
    }
    run() {
        this.src(this.params);
    }
}
class Player extends GameObject {
    constructor() {
        super();
    }
}
class Sphere extends GameObject {
    constructor(lat, long, radius) {
        super();
        this.radius = radius;
        this.lat = lat;
        this.long = long;
        console.log("Creating sphere")
        const { vertices, indices } = generateIndexedSphere(lat, long, radius);

        console.log("Sphere created with vertex count: " + vertices.length + " and triangles count: " + indices.length / 3);
        this.props['vertices'] = vertices;
        this.props['indices'] = indices;
    }
}



async function initWebGPU() {

    try {
        const [adapter, device, canvas, context, format] = await getContext()
        const sampleCount = 1;
        canvas.addEventListener("webgpucontextlost", (event) => {
            event.preventDefault();
            console.error("WebGPU context lost! Attempting to recover...");
        });
        let depthTexture = device.createTexture({
            size: { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
            sampleCount,
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const clearColor = { r: 0, g: 0, b: 0, a: 1.0 };
        const player = new Player();
        const sphereObject = new Sphere(4200000, 5, 1);


        const shaderModule = await loadShaderModuleFromFile(device, './shader.wgsl');

        vertices = sphereObject.props['vertices'];
        const vertexBuffer = device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);

        indices = sphereObject.props['indices'];
        const indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);

        const uniform0Buffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const uniform1buffer = device.createBuffer({
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [{
                binding: 0,  // Must match @binding(0) in WGSL
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }
                , {
                binding: 1,  // Must match @binding(1) in WGSL
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }]
        });
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: uniform0Buffer }
            },
            {
                binding: 1,
                resource: { buffer: uniform1buffer }
            }]
        });
        const vertexBuffers = [
            {
                attributes: [
                    {
                        shaderLocation: 0, // position
                        offset: 0,
                        format: "float32x3",
                    }
                ],
                arrayStride: 12,
                stepMode: "vertex",
            },
        ];
        const pipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: "vertex_main",
                buffers: vertexBuffers,
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fragment_main",
                targets: [
                    {
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back",
            },

            layout: device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            multisample: {
                count: sampleCount, // 4x MSAA
            },
            depthStencil: {
                format: 'depth24plus', // or 'depth32float'
                depthWriteEnabled: true,
                depthCompare: 'less',  // Common default
            },
        };
        const renderPipeline = device.createRenderPipeline(pipelineDescriptor);

        function updateStats() {
            stats.innerText = `FPS: ${getFps().toFixed(0)} Vertices: ${(vertices.length).toLocaleString()}`;
            setTimeout(updateStats, 1000); // Update stats every sec
        }
        updateStats();


        function resizeCanvasAndDepthTexture() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (depthTexture) depthTexture.destroy();
            depthTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                sampleCount,
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            const projection = projectionMatrix(90, canvas.width / canvas.height, 0.1, 1000);
            const binding0uniform = new Float32Array([
                projection.vec1.x, projection.vec1.y, projection.vec1.z, projection.vec1.w,
                projection.vec2.x, projection.vec2.y, projection.vec2.z, projection.vec2.w,
                projection.vec3.x, projection.vec3.y, projection.vec3.z, projection.vec3.w,
                projection.vec4.x, projection.vec4.y, projection.vec4.z, projection.vec4.w,
            ]);
            device.queue.writeBuffer(uniform0Buffer, 0, binding0uniform);
        }


        window.addEventListener('resize', () => {
            resizeCanvasAndDepthTexture();
        });
        resizeCanvasAndDepthTexture();

        async function update() {
            dTimeUpdate();
            sphereObject.rotation.x += 0.001 * deltaTime;
            sphereObject.rotation.y += 0.001 * deltaTime;

            const rm = rotationalMatrix(sphereObject.rotation);
            const binding1uniform = new Float32Array([
                sphereObject.position.x,
                sphereObject.position.y,
                sphereObject.position.z,
                0, //padding for 16 byte align
                rm.vec1.x, rm.vec1.y, rm.vec1.z, rm.vec1.w,
                rm.vec2.x, rm.vec2.y, rm.vec2.z, rm.vec2.w,
                rm.vec3.x, rm.vec3.y, rm.vec3.z, rm.vec3.w,
                rm.vec4.x, rm.vec4.y, rm.vec4.z, rm.vec4.w,
            ]);


            device.queue.writeBuffer(uniform1buffer, 0, binding1uniform);


            const renderPassDescriptor = {
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    //resolveTarget: context.getCurrentTexture().createView(),
                    clearValue: clearColor,
                    loadOp: "clear",
                    storeOp: "store",
                }],
                depthStencilAttachment: {
                    view: depthTexture.createView(),
                    depthLoadOp: 'clear',
                    depthClearValue: 1.0,
                    depthStoreOp: 'store',
                },
            };

            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.setPipeline(renderPipeline);
            passEncoder.setVertexBuffer(0, vertexBuffer);
            passEncoder.setIndexBuffer(indexBuffer, "uint32"); // Or "uint16" if using Uint16Array


            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.drawIndexed(indices.length);

            passEncoder.end();

            device.queue.submit([commandEncoder.finish()]);
            requestAnimationFrame(update);
        }
        update();

    } catch (error) {
        console.error("WebGPU initialization failed:", error);
        document.getElementById('webgpu-instructions').style.display = 'block';
    }
}
initWebGPU()