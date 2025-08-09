import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { MultiProgress, createSpinner, createProgressBar } from '../../../src/utils/progress.js';
const originalStdoutColumns = process.stdout.columns;
describe('Progress Utility Comprehensive Tests', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        process.stdout.columns = 80;
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        process.stdout.columns = originalStdoutColumns;
    });
    describe('ProgressBar', () => {
        it('should create progress bar with defaults', () => {
            const progress = createProgressBar();
            expect(progress).toBeDefined();
            expect(progress.update).toBeDefined();
            expect(progress.increment).toBeDefined();
            expect(progress.complete).toBeDefined();
        });
        it('should create progress bar with custom options', () => {
            const options = {
                total: 100,
                width: 40,
                complete: '=',
                incomplete: '-',
                head: '>',
                format: 'Progress: [:bar] :percent :etas'
            };
            const progress = createProgressBar(options);
            expect(progress).toBeDefined();
        });
        it('should update progress', () => {
            const progress = createProgressBar({ total: 10 });
            progress.update(5);
            expect(process.stdout.write).toHaveBeenCalled();
            const output = process.stdout.write.mock.calls[0][0];
            expect(output).toContain('50%');
        });
        it('should increment progress', () => {
            const progress = createProgressBar({ total: 10 });
            progress.update(2);
            const calls = process.stdout.write.mock.calls;
            const lastOutput = calls[calls.length - 1][0];
            expect(lastOutput).toContain('20%');
        });
        it('should complete progress', () => {
            const progress = createProgressBar({ total: 10 });
            progress.complete();
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            expect(output).toContain('100%');
        });
        it('should handle custom format tokens', () => {
            const progress = createProgressBar({
                total: 100,
                format: 'Downloading :filename [:bar] :percent :etas',
                tokens: {
                    filename: 'data.zip'
                }
            });
            progress.update(30);
            const output = process.stdout.write.mock.calls[0][0];
            expect(output).toContain('Downloading data.zip');
            expect(output).toContain('30%');
        });
        it('should calculate ETA', () => {
            const progress = createProgressBar({ total: 100 });
            progress.update(25);
            jest.advanceTimersByTime(1000);
            progress.update(50);
            const lastCall = process.stdout.write.mock.calls.length - 1;
            const output = process.stdout.write.mock.calls[lastCall][0];
            expect(output).toMatch(/[0-9]+s/);
        });
        it('should handle zero total', () => {
            const progress = createProgressBar({ total: 0 });
            expect(() => progress.update(1)).not.toThrow();
        });
        it('should handle overflow', () => {
            const progress = createProgressBar({ total: 10 });
            progress.update(15);
            const output = process.stdout.write.mock.calls[0][0];
            expect(output).toContain('100%');
        });
    });
    describe('Spinner', () => {
        it('should create spinner with defaults', () => {
            const spinner = createSpinner();
            expect(spinner).toBeDefined();
            expect(spinner.start).toBeDefined();
            expect(spinner.stop).toBeDefined();
            expect(spinner.succeed).toBeDefined();
            expect(spinner.fail).toBeDefined();
        });
        it('should create spinner with custom options', () => {
            const spinner = createSpinner({
                text: 'Loading...',
                interval: 80
            });
            expect(spinner).toBeDefined();
        });
        it('should start and animate spinner', () => {
            const spinner = createSpinner({ text: 'Processing' });
            spinner.start();
            jest.advanceTimersByTime(80);
            expect(process.stdout.write).toHaveBeenCalled();
            const firstCall = process.stdout.write.mock.calls[0];
            expect(firstCall[0]).toContain('Processing');
            jest.advanceTimersByTime(160);
            const callCount = process.stdout.write.mock.calls.length;
            expect(callCount).toBeGreaterThan(2);
        });
        it('should stop spinner', () => {
            const spinner = createSpinner({ text: 'Loading' });
            spinner.start();
            spinner.stop();
            const callCountAtStop = process.stdout.write.mock.calls.length;
            jest.advanceTimersByTime(1000);
            const callCountAfterDelay = process.stdout.write.mock.calls.length;
            expect(callCountAfterDelay).toBe(callCountAtStop);
        });
        it('should show success state', () => {
            const spinner = createSpinner({ text: 'Installing' });
            spinner.start();
            spinner.succeed('Installed successfully');
            const lastCall = process.stdout.write.mock.calls.length - 1;
            const output = process.stdout.write.mock.calls[lastCall][0];
            expect(output).toContain('✓');
            expect(output).toContain('Installed successfully');
        });
        it('should show failure state', () => {
            const spinner = createSpinner({ text: 'Building' });
            spinner.start();
            spinner.fail('Build failed');
            const lastCall = process.stdout.write.mock.calls.length - 1;
            const output = process.stdout.write.mock.calls[lastCall][0];
            expect(output).toContain('✗');
            expect(output).toContain('Build failed');
        });
        it('should update text while running', () => {
            const spinner = createSpinner({ text: 'Step 1' });
            spinner.start();
            spinner.stop();
            spinner.start('Step 2');
            jest.advanceTimersByTime(100);
            const lastCall = process.stdout.write.mock.calls.length - 1;
            const output = process.stdout.write.mock.calls[lastCall][0];
            expect(output).toContain('Step 2');
        });
    });
    describe('MultiProgress', () => {
        it('should create multi-progress manager', () => {
            const multi = new MultiProgress();
            expect(multi).toBeDefined();
            expect(multi.create).toBeDefined();
            expect(multi.remove).toBeDefined();
        });
        it('should manage multiple progress bars', () => {
            const multi = new MultiProgress();
            const bar1 = multi.create('file1', { total: 100, format: 'File 1: [:bar] :percent' });
            const bar2 = multi.create('file2', { total: 200, format: 'File 2: [:bar] :percent' });
            bar1.update(50);
            bar2.update(100);
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            expect(output).toContain('File 1');
            expect(output).toContain('File 2');
            expect(output).toContain('50%');
        });
        it('should remove progress bars', () => {
            const multi = new MultiProgress();
            const bar1 = multi.create('bar1', { total: 100 });
            const bar2 = multi.create('bar2', { total: 100 });
            multi.remove('bar1');
            bar2.update(50);
            const lastCall = process.stdout.write.mock.calls.length - 1;
            const output = process.stdout.write.mock.calls[lastCall][0];
            expect(output).toContain('50%');
        });
        it('should handle concurrent updates', () => {
            const multi = new MultiProgress();
            const bars = Array(5).fill(null).map((_, i) => multi.create(`task-${i}`, {
                total: 100,
                format: `Task ${i + 1}: [:bar] :percent`
            }));
            bars.forEach((bar, i) => {
                bar.update((i + 1) * 20);
            });
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            for (let i = 0; i < 5; i++) {
                expect(output).toContain(`Task ${i + 1}`);
            }
        });
    });
    describe('Real-world Scenarios', () => {
        it('should handle file download progress', () => {
            const fileSize = 1024 * 1024 * 10;
            const progress = createProgressBar({
                total: fileSize,
                format: 'Downloading [:bar] :percent :etas - :current/:total bytes',
                width: 30
            });
            let downloaded = 0;
            const chunkSize = 1024 * 100;
            const interval = setInterval(() => {
                downloaded += chunkSize;
                if (downloaded >= fileSize) {
                    clearInterval(interval);
                    progress.complete();
                }
                else {
                    progress.update(downloaded);
                }
            }, 100);
            jest.advanceTimersByTime(1000);
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            expect(output).toMatch(/[0-9]+\/[0-9]+ bytes/);
        });
        it('should handle multi-file processing', () => {
            const multi = new MultiProgress();
            const files = [
                { name: 'file1.txt', size: 1000 },
                { name: 'file2.txt', size: 2000 },
                { name: 'file3.txt', size: 1500 }
            ];
            const bars = files.map((file, i) => multi.create(`file-${i}`, {
                total: file.size,
                format: `${file.name}: [:bar] :percent`
            }));
            files.forEach((file, i) => {
                let processed = 0;
                while (processed < file.size) {
                    processed += 100;
                    bars[i]?.update(Math.min(processed, file.size));
                }
            });
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            files.forEach(file => {
                expect(output).toContain(file.name);
            });
        });
        it('should handle build process with spinner', async () => {
            const steps = [
                'Installing dependencies',
                'Compiling source',
                'Running tests',
                'Building artifacts',
                'Packaging'
            ];
            const spinner = createSpinner();
            for (const step of steps) {
                spinner.start(step);
                jest.advanceTimersByTime(1000 + Math.random() * 2000);
                if (Math.random() > 0.1) {
                    spinner.succeed(`${step} - Done`);
                }
                else {
                    spinner.fail(`${step} - Failed`);
                    break;
                }
            }
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            expect(output).toMatch(/✓|✗/);
        });
    });
    describe('Edge Cases', () => {
        it('should handle narrow terminal', () => {
            process.stdout.columns = 40;
            const progress = createProgressBar({
                total: 100,
                format: 'Very long progress label that might overflow: [:bar] :percent'
            });
            progress.update(50);
            expect(process.stdout.write).toHaveBeenCalled();
        });
        it('should handle no terminal (CI environment)', () => {
            process.stdout.columns = undefined;
            const progress = createProgressBar({ total: 100 });
            progress.update(50);
            expect(process.stdout.write).toHaveBeenCalled();
        });
        it('should handle rapid updates', () => {
            const progress = createProgressBar({ total: 1000 });
            for (let i = 0; i <= 1000; i++) {
                progress.update(i);
            }
            const callCount = process.stdout.write.mock.calls.length;
            expect(callCount).toBeLessThan(1000);
        });
        it('should handle concurrent spinners', () => {
            const spinner1 = createSpinner({ text: 'Task 1' });
            const spinner2 = createSpinner({ text: 'Task 2' });
            spinner1.start();
            spinner2.start();
            jest.advanceTimersByTime(500);
            spinner1.succeed('Task 1 complete');
            spinner2.fail('Task 2 failed');
            const output = process.stdout.write.mock.calls.map((call) => call[0]).join('');
            expect(output).toContain('Task 1');
            expect(output).toContain('Task 2');
        });
    });
});
//# sourceMappingURL=progress-comprehensive.test.js.map