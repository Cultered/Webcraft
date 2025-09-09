import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadOBJFile } from '../src/misc/loadFiles';

describe('File Loading', () => {
    beforeEach(() => {
        // Mock fetch
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should load OBJ file content from URL', async () => {
        const mockObjContent = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.5 1.0 0.0
f 1 2 3
`;

        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            text: async () => mockObjContent,
        });

        const result = await loadOBJFile('/test/model.obj');
        
        expect(result).toBe(mockObjContent);
        expect(global.fetch).toHaveBeenCalledWith('/test/model.obj');
    });

    it('should reject when fetch fails', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        await expect(loadOBJFile('/nonexistent.obj')).rejects.toThrow('Failed to load OBJ file: 404 Not Found');
    });

    it('should reject when network error occurs', async () => {
        (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

        await expect(loadOBJFile('/test/model.obj')).rejects.toThrow('Network error');
    });
});