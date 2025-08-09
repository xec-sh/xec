import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';
import { test, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { TempDir, TempFile, withTempDir, withTempFile } from '../../../src/utils/temp.js';
describe('Temp Utilities', () => {
    describe('TempFile', () => {
        let tempFile;
        beforeEach(() => {
            tempFile = new TempFile();
        });
        afterEach(async () => {
            await tempFile.cleanup();
        });
        test('should generate unique paths with UUID entropy', () => {
            const file1 = new TempFile();
            const file2 = new TempFile();
            expect(file1.path).not.toBe(file2.path);
            expect(file1.path).toMatch(/ush-[a-f0-9]{32}\.tmp$/);
            expect(file2.path).toMatch(/ush-[a-f0-9]{32}\.tmp$/);
        });
        test('should use custom prefix and suffix', () => {
            const file = new TempFile({ prefix: 'test-', suffix: '.dat' });
            expect(file.path).toMatch(/test-[a-f0-9]{32}\.dat$/);
        });
        test('should use system temp directory by default', () => {
            expect(tempFile.path).toContain(tmpdir());
        });
        test('should use custom directory', () => {
            const customDir = '/custom/tmp';
            const file = new TempFile({ dir: customDir });
            expect(file.path).toContain(customDir);
        });
        test('should create empty file', async () => {
            await tempFile.create();
            const stats = await fs.stat(tempFile.path);
            expect(stats.isFile()).toBe(true);
            const content = await fs.readFile(tempFile.path, 'utf8');
            expect(content).toBe('');
        });
        test('should create file with content', async () => {
            const content = 'Hello, World!';
            await tempFile.create(content);
            const readContent = await fs.readFile(tempFile.path, 'utf8');
            expect(readContent).toBe(content);
        });
        test('should write content to file', async () => {
            await tempFile.create();
            await tempFile.write('New content');
            const content = await fs.readFile(tempFile.path, 'utf8');
            expect(content).toBe('New content');
        });
        test('should append content to file', async () => {
            await tempFile.create('Initial');
            await tempFile.append(' content');
            const content = await fs.readFile(tempFile.path, 'utf8');
            expect(content).toBe('Initial content');
        });
        test('should read file content', async () => {
            const content = 'Test content';
            await tempFile.create(content);
            const readContent = await tempFile.read();
            expect(readContent).toBe(content);
        });
        test('should check file existence', async () => {
            expect(await tempFile.exists()).toBe(false);
            await tempFile.create();
            expect(await tempFile.exists()).toBe(true);
            await tempFile.cleanup();
            expect(await tempFile.exists()).toBe(false);
        });
        test('should cleanup file', async () => {
            await tempFile.create();
            expect(await tempFile.exists()).toBe(true);
            await tempFile.cleanup();
            expect(await tempFile.exists()).toBe(false);
        });
        test('should not cleanup if keep option is true', async () => {
            const file = new TempFile({ keep: true });
            await file.create();
            await file.cleanup();
            expect(await file.exists()).toBe(true);
            await fs.unlink(file.path);
        });
        test('should ignore cleanup errors', async () => {
            await tempFile.create();
            await fs.unlink(tempFile.path);
            await expect(tempFile.cleanup()).resolves.toBeUndefined();
        });
    });
    describe('TempDir', () => {
        let tempDir;
        beforeEach(() => {
            tempDir = new TempDir();
        });
        afterEach(async () => {
            await tempDir.cleanup();
        });
        test('should generate unique paths with UUID entropy', () => {
            const dir1 = new TempDir();
            const dir2 = new TempDir();
            expect(dir1.path).not.toBe(dir2.path);
            expect(dir1.path).toMatch(/ush-[a-f0-9]{32}$/);
            expect(dir2.path).toMatch(/ush-[a-f0-9]{32}$/);
        });
        test('should create directory', async () => {
            await tempDir.create();
            const stats = await fs.stat(tempDir.path);
            expect(stats.isDirectory()).toBe(true);
        });
        test('should check directory existence', async () => {
            expect(await tempDir.exists()).toBe(false);
            await tempDir.create();
            expect(await tempDir.exists()).toBe(true);
            await tempDir.cleanup();
            expect(await tempDir.exists()).toBe(false);
        });
        test('should return file path within directory', () => {
            const filePath = tempDir.file('test.txt');
            expect(filePath).toBe(join(tempDir.path, 'test.txt'));
        });
        test('should prevent path traversal attacks', () => {
            expect(() => tempDir.file('../escape.txt')).toThrow('Invalid file name');
            expect(() => tempDir.file('../../escape.txt')).toThrow('Invalid file name');
            expect(() => tempDir.file('/etc/passwd')).toThrow('Invalid file name');
            expect(() => tempDir.file('subdir/../../../escape.txt')).toThrow('Invalid file name');
            expect(() => tempDir.file('subdir/file.txt')).not.toThrow();
            expect(() => tempDir.file('./file.txt')).not.toThrow();
            expect(() => tempDir.file('file.txt')).not.toThrow();
        });
        test('should cleanup directory recursively', async () => {
            await tempDir.create();
            await fs.writeFile(join(tempDir.path, 'file1.txt'), 'content1');
            await fs.mkdir(join(tempDir.path, 'subdir'));
            await fs.writeFile(join(tempDir.path, 'subdir', 'file2.txt'), 'content2');
            await tempDir.cleanup();
            expect(await tempDir.exists()).toBe(false);
        });
        test('should not cleanup if keep option is true', async () => {
            const dir = new TempDir({ keep: true });
            await dir.create();
            await dir.cleanup();
            expect(await dir.exists()).toBe(true);
            await fs.rm(dir.path, { recursive: true, force: true });
        });
    });
    describe('withTempFile', () => {
        test('should create and cleanup temp file automatically', async () => {
            let filePath = null;
            const result = await withTempFile(async (file) => {
                filePath = file.path;
                await file.write('test content');
                expect(await file.exists()).toBe(true);
                return 'success';
            });
            expect(result).toBe('success');
            if (filePath) {
                await expect(fs.access(filePath)).rejects.toThrow();
            }
        });
        test('should cleanup even if function throws', async () => {
            let filePath = null;
            await expect(withTempFile(async (file) => {
                filePath = file.path;
                await file.create();
                throw new Error('Test error');
            })).rejects.toThrow('Test error');
            if (filePath) {
                await expect(fs.access(filePath)).rejects.toThrow();
            }
        });
    });
    describe('withTempDir', () => {
        test('should create and cleanup temp dir automatically', async () => {
            let dirPath = null;
            const result = await withTempDir(async (dir) => {
                dirPath = dir.path;
                expect(await dir.exists()).toBe(true);
                await fs.writeFile(dir.file('test.txt'), 'content');
                return 'success';
            });
            expect(result).toBe('success');
            if (dirPath) {
                await expect(fs.access(dirPath)).rejects.toThrow();
            }
        });
        test('should cleanup even if function throws', async () => {
            let dirPath = null;
            await expect(withTempDir(async (dir) => {
                dirPath = dir.path;
                throw new Error('Test error');
            })).rejects.toThrow('Test error');
            if (dirPath) {
                await expect(fs.access(dirPath)).rejects.toThrow();
            }
        });
    });
    describe('Security Tests', () => {
        test('should not be vulnerable to command injection', async () => {
            const dangerousContent = [
                '; rm -rf /',
                '$(rm -rf /)',
                '`rm -rf /`',
                '| rm -rf /',
                '&& rm -rf /',
                '\'; rm -rf / #',
                '"; rm -rf / #'
            ];
            for (const content of dangerousContent) {
                const file = new TempFile();
                await file.create(content);
                expect(await file.exists()).toBe(true);
                const readContent = await file.read();
                expect(readContent).toBe(content);
                await file.cleanup();
            }
            const file = new TempFile();
            expect(file.path).toMatch(/^(\/tmp|\/var\/folders|[A-Z]:\\Temp)/);
        });
        test('should handle special characters in content', async () => {
            const specialContent = '$PATH ${PATH} `id` $(whoami) \n\r\t\0';
            const file = new TempFile();
            await file.create(specialContent);
            const readContent = await file.read();
            expect(readContent).toBe(specialContent);
            await file.cleanup();
        });
        test('should use secure random generation', () => {
            const paths = new Set();
            const count = 1000;
            for (let i = 0; i < count; i++) {
                const file = new TempFile();
                paths.add(file.path);
            }
            expect(paths.size).toBe(count);
        });
    });
});
//# sourceMappingURL=temp.test.js.map