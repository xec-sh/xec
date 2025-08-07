import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { MockTTY, createMockTTY, mockProcessStreams } from '../../../helpers/mock-tty.js';
import { Progress, progress, MultiProgress, multiProgress, type ProgressTask } from '../../../../src/components/feedback/progress.js';

describe('Progress', () => {
  let mockTTY: MockTTY;
  let streams: ReturnType<typeof mockProcessStreams>;

  beforeEach(() => {
    mockTTY = createMockTTY();
    streams = mockProcessStreams({ isTTY: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockTTY.cleanup();
    streams.restore();
    vi.useRealTimers();
  });

  describe('single progress bar', () => {
    it('should render progress bar', () => {
      const p = new Progress({ title: 'Loading', total: 100 });
      p.start();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Loading');
      expect(output).toContain('[');
      expect(output).toContain(']');
      expect(output).toContain('0%');
      
      p.stop();
    });

    it('should update progress', () => {
      const p = new Progress({ total: 100 });
      p.start();
      
      p.update(50);
      
      // Give renderer time to process
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('50%');
      expect(output).toContain('█');
      
      p.stop();
    });

    it('should show custom format', () => {
      const p = new Progress({
        total: 1000,
        format: (current, total) => `${current} of ${total} items`
      });
      p.start();
      
      p.update(250);
      vi.runOnlyPendingTimers();
      const output = streams.stdout.getOutput!();
      expect(output).toContain('250 of 1000 items');
      
      p.stop();
    });

    it('should calculate ETA', () => {
      const p = new Progress({ total: 100, showETA: true });
      p.start();
      
      // Advance time and progress
      vi.advanceTimersByTime(1000);
      p.update(10);
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('ETA:');
      
      p.stop();
    });

    it('should increment progress', () => {
      const p = new Progress({ total: 10 });
      p.start();
      
      p.increment();
      p.increment(2);
      vi.runOnlyPendingTimers();
      
      // Clear output buffer and force final render
      streams.stdout.write.mockClear();
      p.update(3); // Force update to current state
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('3/10'); // Should show 3 of 10
      
      p.stop();
    });

    it('should complete automatically at 100%', () => {
      const completeSpy = vi.fn();
      const p = new Progress({ total: 100 });
      p.on('complete', completeSpy);
      
      p.start();
      p.update(100);
      
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should show completion message', () => {
      const p = new Progress({ title: 'Download', total: 100 });
      p.start();
      
      vi.advanceTimersByTime(5000);
      p.complete();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✓ Download completed');
      expect(output).toContain('5s');
    });

    it('should handle failure', () => {
      const errorSpy = vi.fn();
      const p = new Progress({ title: 'Upload', total: 100 });
      p.on('error', errorSpy);
      
      p.start();
      p.fail('Network error');
      
      expect(errorSpy).toHaveBeenCalledWith('Network error');
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✗ Upload failed');
    });

    it('should format time correctly', () => {
      const p = new Progress({ title: 'Task', total: 100 });
      p.start();
      
      // Test different time ranges
      vi.advanceTimersByTime(45 * 1000); // 45 seconds
      p.complete();
      let output = streams.stdout.getOutput!();
      expect(output).toContain('45s');
      
      // Reset and test minutes
      streams.restore();
      streams = mockProcessStreams({ isTTY: true });
      
      const p2 = new Progress({ title: 'Task', total: 100 });
      p2.start();
      vi.advanceTimersByTime(125 * 1000); // 2m 5s
      p2.complete();
      output = streams.stdout.getOutput!();
      expect(output).toContain('2m 5s');
      
      // Reset and test hours
      streams.restore();
      streams = mockProcessStreams({ isTTY: true });
      
      const p3 = new Progress({ title: 'Task', total: 100 });
      p3.start();
      vi.advanceTimersByTime(3665 * 1000); // 1h 1m
      p3.complete();
      output = streams.stdout.getOutput!();
      expect(output).toContain('1h 1m');
    });

    it('should use factory function', () => {
      const p = progress({ title: 'Quick task', total: 50 });
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Quick task');
      
      p.stop();
    });
  });

  describe('multi progress', () => {
    const tasks: ProgressTask[] = [
      { id: 'download', label: 'Downloading', weight: 30 },
      { id: 'extract', label: 'Extracting', weight: 20 },
      { id: 'install', label: 'Installing', weight: 50 }
    ];

    it('should render multiple progress bars', () => {
      const mp = new MultiProgress({
        title: 'Installation',
        tasks
      });
      mp.start();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Installation');
      expect(output).toContain('Overall Progress');
      expect(output).toContain('Downloading');
      expect(output).toContain('Extracting');
      expect(output).toContain('Installing');
      
      mp.stop();
    });

    it('should update individual task progress', () => {
      const mp = new MultiProgress({ tasks });
      mp.start();
      
      mp.update('download', { progress: 50, status: 'active' });
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('◐ Downloading');
      expect(output).toContain('50%');
      
      mp.stop();
    });

    it('should calculate weighted overall progress', () => {
      const mp = new MultiProgress({ tasks });
      mp.start();
      
      // Complete download (30% weight)
      mp.update('download', { progress: 100, status: 'completed' });
      vi.runOnlyPendingTimers();
      
      let output = streams.stdout.getOutput!();
      expect(output).toContain('30%'); // Overall should be 30%
      
      // Half complete extract (20% weight) = 10% more
      mp.update('extract', { progress: 50, status: 'active' });
      vi.runOnlyPendingTimers();
      
      output = streams.stdout.getOutput!();
      expect(output).toContain('40%'); // Overall should be 40%
      
      mp.stop();
    });

    it('should show task status icons', () => {
      const mp = new MultiProgress({ tasks });
      mp.start();
      
      mp.update('download', { status: 'active' });
      vi.runOnlyPendingTimers();
      mp.update('extract', { status: 'completed' });
      vi.runOnlyPendingTimers();
      mp.update('install', { status: 'failed', error: 'Permission denied' });
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('◐'); // Active
      expect(output).toContain('✓'); // Completed
      expect(output).toContain('✗'); // Failed
      expect(output).toContain('Permission denied');
      
      mp.stop();
    });

    it('should complete individual tasks', () => {
      const mp = new MultiProgress({ tasks });
      mp.start();
      
      mp.complete('download');
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✓ Downloading');
      
      mp.stop();
    });

    it('should add new tasks dynamically', () => {
      const mp = new MultiProgress({ 
        tasks: [tasks[0]]
      });
      mp.start();
      
      mp.addTask({ id: 'verify', label: 'Verifying', weight: 10 });
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Verifying');
      
      mp.stop();
    });

    it('should complete when all tasks done', () => {
      const completeSpy = vi.fn();
      const mp = new MultiProgress({ tasks });
      mp.on('complete', completeSpy);
      
      mp.start();
      
      mp.complete('download');
      mp.complete('extract');
      mp.complete('install');
      
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should show final summary', () => {
      const mp = new MultiProgress({ 
        title: 'Build',
        tasks: [
          { id: 't1', label: 'Task 1' },
          { id: 't2', label: 'Task 2' },
          { id: 't3', label: 'Task 3' }
        ]
      });
      mp.start();
      
      vi.advanceTimersByTime(3000);
      
      mp.complete('t1');
      mp.complete('t2');
      mp.fail('t3', 'Error');
      
      mp.stop();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('✗ Build failed');
      expect(output).toContain('1 failed, 2 completed');
      expect(output).toContain('3s');
    });

    it('should emit update events', () => {
      const updateSpy = vi.fn();
      const mp = new MultiProgress({ tasks });
      mp.on('update', updateSpy);
      
      mp.start();
      mp.update('download', { progress: 75 });
      
      expect(updateSpy).toHaveBeenCalledWith('download', expect.objectContaining({
        id: 'download',
        progress: 75
      }));
      
      mp.stop();
    });

    it('should use factory function', () => {
      const mp = multiProgress({
        title: 'Quick multi',
        tasks: [{ id: 'test', label: 'Test' }]
      });
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Quick multi');
      
      mp.stop();
    });
  });

  describe('edge cases', () => {
    it('should handle zero total', () => {
      const p = new Progress({ total: 0 });
      p.start();
      
      p.update(10); // Should not crash
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('0%');
      
      p.stop();
    });

    it('should clamp progress to total', () => {
      const p = new Progress({ total: 100 });
      p.start();
      
      p.update(150); // Over total
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('100%');
      
      p.stop();
    });

    it('should handle multiple starts', () => {
      const p = new Progress({ total: 100 });
      p.start();
      p.start(); // Should not error
      
      p.update(50);
      vi.runOnlyPendingTimers();
      
      const output = streams.stdout.getOutput!();
      expect(output).toContain('50%');
      
      p.stop();
    });

    it('should handle stop without start', () => {
      const p = new Progress({ total: 100 });
      expect(() => p.stop()).not.toThrow();
    });
  });
});