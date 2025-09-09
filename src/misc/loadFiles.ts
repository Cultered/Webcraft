export const loadImageData = (url: string) => new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('no 2d ctx')); return; }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = url;
});

/**
 * Load OBJ file content from a URL
 * @param url - The URL of the .obj file to load
 * @returns Promise that resolves to the OBJ file content as a string
 */
export const loadOBJFile = (url: string) => new Promise<string>((resolve, reject) => {
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load OBJ file: ${response.status} ${response.statusText}`);
            }
            return response.text();
        })
        .then(text => resolve(text))
        .catch(reject);
});