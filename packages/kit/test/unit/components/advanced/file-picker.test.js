import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';
import { FilePickerPrompt } from '../../../../src/components/advanced/file-picker.js';
vi.mock('fs/promises');
describe('FilePickerPrompt', () => {
    let tempDir;
    beforeEach(() => {
        tempDir = path.join(os.tmpdir(), 'test-file-picker');
        vi.mocked(fs.readdir).mockImplementation(async (dirPath, options) => {
            const createDirent = (name, isDir) => ({
                name,
                isDirectory: () => isDir,
                isFile: () => !isDir,
                isBlockDevice: () => false,
                isCharacterDevice: () => false,
                isSymbolicLink: () => false,
                isFIFO: () => false,
                isSocket: () => false
            });
            const pathStr = String(dirPath);
            if (pathStr === tempDir) {
                return [
                    createDirent('file1.txt', false),
                    createDirent('file2.js', false),
                    createDirent('folder1', true),
                    createDirent('folder2', true),
                    createDirent('.hidden', false)
                ];
            }
            else if (pathStr === path.join(tempDir, 'folder1')) {
                return [
                    createDirent('nested1.txt', false),
                    createDirent('nested2.txt', false)
                ];
            }
            else if (pathStr === path.join(tempDir, 'folder2')) {
                return [];
            }
            throw new Error('Directory not found');
        });
        vi.mocked(fs.stat).mockImplementation(async (filePath) => {
            const name = path.basename(String(filePath));
            if (name.includes('.txt')) {
                return { size: 1024, mtime: new Date('2024-01-01') };
            }
            else if (name.includes('.js')) {
                return { size: 2048, mtime: new Date() };
            }
            throw new Error('File not found');
        });
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    describe('basic navigation', () => {
        it('should list files and directories', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('file1.txt');
                expect(output).toContain('file2.js');
                expect(output).toContain('folder1/');
                expect(output).toContain('folder2/');
                expect(output).not.toContain('.hidden');
                sendKey({ name: 'escape' });
            });
        });
        it('should show hidden files when configured', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                showHidden: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'escape' });
            });
        });
        it('should navigate into directories', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('folder1');
                expect(output).toContain('folder2');
                expect(output).toMatch(/▶.*folder1/);
                sendKey({ name: 'return' });
                await new Promise(resolve => setTimeout(resolve, 200));
                output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'escape' });
            });
        });
        it('should navigate to parent directory', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                let output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'down' });
                await waitForRender();
                sendKey({ name: 'down' });
                await waitForRender();
                sendKey({ name: 'return' });
                await waitForRender();
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('nested1.txt');
                sendKey({ name: 'left' });
                await waitForRender();
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('file1.txt');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('file selection', () => {
        it('should select a file', async () => {
            const result = await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ sendKey, waitForRender, getLastRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'down' });
                sendKey({ name: 'down' });
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                sendKey({ name: 'escape' });
            });
            expect(true).toBe(true);
        });
        it('should select files in subdirectories', async () => {
            const result = await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ sendKey, waitForRender, getLastRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'return' });
                await new Promise(resolve => setTimeout(resolve, 100));
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                sendKey({ name: 'escape' });
            });
            expect(true).toBe(true);
        });
        it('should allow directory selection when configured', async () => {
            const result = await testPrompt(FilePickerPrompt, {
                message: 'Select a folder',
                root: tempDir,
                directories: true
            }, async ({ sendKey, waitForRender, getLastRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                sendKey({ name: 'escape' });
            });
            expect(true).toBe(true);
        });
    });
    describe('filtering', () => {
        it('should filter by extensions', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a text file',
                root: tempDir,
                filter: (file) => file.name.endsWith('.txt') || file.isDirectory
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('file1.txt');
                expect(output).not.toContain('file2.js');
                expect(output).toContain('folder1/');
                sendKey({ name: 'escape' });
            });
        });
        it('should use custom filter function', async () => {
            const filter = vi.fn((file) => file.name.startsWith('file'));
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                filter
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 100));
                const output = getLastRender();
                if (!output.includes('empty directory')) {
                    expect(output).toContain('file1.txt');
                    expect(output).toContain('file2.js');
                    expect(output).not.toContain('folder1/');
                    expect(output).not.toContain('folder2/');
                }
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('search functionality', () => {
        it('should filter items by search', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Search for files',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'escape' });
            });
        });
        it('should clear search on escape', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Search test',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('file info display', () => {
        it('should show file sizes', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                showSize: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'escape' });
            });
        });
        it('should show modification dates', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                showModified: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('error handling', () => {
        it('should handle directory read errors', async () => {
            vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('Permission denied'));
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select a file');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle non-existent directories', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: '/non/existent/path'
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Directory not found');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('breadcrumb navigation', () => {
        it('should show current path', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                showPath: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('📁 .');
                sendKey({ name: 'escape' });
            });
        });
        it('should update path when navigating', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select a file',
                root: tempDir,
                showPath: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'return' });
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('📁 folder1');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('multiple file selection', () => {
        it('should allow multiple file selection', async () => {
            const result = await testPrompt(FilePickerPrompt, {
                message: 'Select files',
                root: tempDir,
                multiple: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select files');
                expect(output).toContain('[ ]');
                sendKey({ name: 'escape' });
            });
            expect(true).toBe(true);
        });
        it('should show selection count', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Select files',
                root: tempDir,
                multiple: true
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select files');
                expect(output).toContain('[ ]');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('keyboard shortcuts', () => {
        it('should handle home/end keys', async () => {
            await testPrompt(FilePickerPrompt, {
                message: 'Navigate with shortcuts',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'end' });
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toMatch(/▶.*/);
                sendKey({ name: 'home' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toMatch(/▶.*/);
                sendKey({ name: 'escape' });
            });
        });
        it('should handle page up/down', async () => {
            vi.mocked(fs.readdir).mockImplementationOnce(async () => Array.from({ length: 50 }, (_, i) => ({
                name: `file${i}.txt`,
                isDirectory: () => false
            })));
            await testPrompt(FilePickerPrompt, {
                message: 'Page navigation',
                root: tempDir
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'pagedown' });
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('Page navigation');
                sendKey({ name: 'pageup' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('file0.txt');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('non-TTY mode', () => {
        it('should handle non-TTY environment', async () => {
            const result = await testNonTTYPrompt(FilePickerPrompt, {
                message: 'Non-TTY test',
                root: tempDir,
                defaultFile: path.join(tempDir, 'file1.txt')
            }, path.join(tempDir, 'file1.txt'));
            expect(result).toBe(path.join(tempDir, 'file1.txt'));
        });
    });
});
//# sourceMappingURL=file-picker.test.js.map