import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { ProgressReporter, createProgressReporter } from '../../../src/utils/progress.js';

describe('ProgressReporter', () => {
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Basic functionality', () => {
    test('should create reporter with default options', () => {
      const reporter = new ProgressReporter();
      expect(reporter).toBeDefined();
    });

    test('should create reporter with custom options', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({
        enabled: true,
        onProgress,
        updateInterval: 1000,
        reportLines: true,
        prefix: 'Test'
      });
      expect(reporter).toBeDefined();
    });

    test('should not emit events when disabled', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({
        enabled: false,
        onProgress
      });

      reporter.start('Starting');
      reporter.progress('Working', 50, 100);
      reporter.complete('Done');

      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  describe('Event emission', () => {
    test('should emit start event', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.start('Starting task');

      expect(onProgress).toHaveBeenCalledWith({
        type: 'start',
        message: 'Starting task'
      });
    });

    test('should emit progress event with percentage', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.start();
      reporter.progress('Processing', 30, 100);

      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'progress',
          message: 'Processing',
          current: 30,
          total: 100,
          percentage: 30
        })
      );
    });

    test('should emit complete event', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.start();
      reporter.complete('Task completed');

      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'complete',
          message: 'Task completed',
          data: {
            linesProcessed: 0,
            bytesProcessed: 0
          }
        })
      );
    });

    test('should emit error event', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      const error = new Error('Test error');
      reporter.error(error, 'Custom error message');

      expect(onProgress).toHaveBeenCalledWith({
        type: 'error',
        message: 'Custom error message',
        duration: 0,
        data: { error }
      });
    });
  });

  describe('Output reporting', () => {
    test('should track line count', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({
        onProgress,
        reportLines: true
      });

      reporter.start();
      onProgress.mockClear(); // Clear the start event

      reporter.reportOutput('Line 1\nLine 2\nLine 3\n');

      // Should report progress for lines
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          message: 'Processed 3 lines'
        })
      );
    });

    test('should track byte count', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.start();
      reporter.reportOutput(Buffer.from('Hello World'));
      reporter.complete();

      const completeCall = onProgress.mock.calls.find(
        call => (call[0] as any).type === 'complete'
      );

      expect((completeCall?.[0] as any)?.data).toEqual({
        linesProcessed: 0,
        bytesProcessed: 11
      });
    });

    test('should track output data', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({
        onProgress,
        reportLines: true
      });

      reporter.start();
      onProgress.mockClear();

      reporter.reportOutput('Line 1\nLine 2\n');

      // Should report line progress
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          message: 'Processed 2 lines'
        })
      );
    });
  });

  describe('Prefix handling', () => {
    test('should add prefix to messages', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({
        onProgress,
        prefix: 'MyTask'
      });

      reporter.start('Starting');

      expect(onProgress).toHaveBeenCalledWith({
        type: 'start',
        message: 'MyTask: Starting'
      });
    });
  });

  describe('Default progress handler', () => {
    test('should log start event', () => {
      const reporter = new ProgressReporter();

      reporter.start('Starting task');

      expect(consoleLogSpy).toHaveBeenCalledWith('▶ Starting task');
    });

    test('should log progress with percentage', () => {
      const reporter = new ProgressReporter();

      reporter.progress('Processing', 50, 100);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[██████████          ] 50.0% Processing')
      );
    });

    test('should log progress without percentage', () => {
      const reporter = new ProgressReporter();

      reporter.progress('Working...');

      expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Working...');
    });

    test('should log complete event', () => {
      const reporter = new ProgressReporter();

      reporter.start();
      reporter.complete('Done');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Done')
      );
    });

    test('should log error event', () => {
      const reporter = new ProgressReporter();

      reporter.error(new Error('Test'), 'Failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed');
    });
  });

  describe('Formatting utilities', () => {
    test('should format bytes correctly', () => {
      const reporter = new ProgressReporter();

      // Use reflection to test private method
      const formatBytes = (reporter as any).formatBytes.bind(reporter);

      expect(formatBytes(100)).toBe('100.0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });

    test('should format duration correctly', () => {
      const reporter = new ProgressReporter();

      // Use reflection to test private method
      const formatDuration = (reporter as any).formatDuration.bind(reporter);

      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(65000)).toBe('1.1m');
      expect(formatDuration(3700000)).toBe('1.0h');
    });

    test('should create progress bar correctly', () => {
      const reporter = new ProgressReporter();

      // Use reflection to test private method
      const createProgressBar = (reporter as any).createProgressBar.bind(reporter);

      expect(createProgressBar(0)).toBe('[                    ]');
      expect(createProgressBar(50)).toBe('[██████████          ]');
      expect(createProgressBar(100)).toBe('[████████████████████]');
    });
  });

  describe('createProgressReporter factory', () => {
    test('should create reporter instance', () => {
      const reporter = createProgressReporter({
        enabled: true,
        prefix: 'Test'
      });

      expect(reporter).toBeInstanceOf(ProgressReporter);
    });
  });

  describe('Edge cases', () => {
    test('should handle zero total in percentage calculation', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.progress('Processing', 0, 0);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          message: 'Processing',
          current: 0,
          total: 0
        })
      );
    });

    test('should handle zero duration', () => {
      const onProgress = jest.fn();
      const reporter = new ProgressReporter({ onProgress });

      reporter.start();
      reporter.progress('Processing', 50, 100);

      // When duration is 0, rate and eta should not be set
      const progressCall = onProgress.mock.calls.find(
        call => (call[0] as any).type === 'progress'
      )?.[0] as any;

      expect(progressCall).toMatchObject({
        type: 'progress',
        current: 50,
        total: 100,
        percentage: 50
      });

      // Rate and ETA should only be set when duration > 0
      if (progressCall?.duration === 0) {
        expect(progressCall.rate).toBeUndefined();
        expect(progressCall.eta).toBeUndefined();
      }
    });
  });
});