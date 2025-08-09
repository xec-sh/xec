import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { RenderBatcher, MemoryManager, VirtualScroller, DatasetOptimizer, PerformanceMonitor, DynamicVirtualScroller } from '../../../src/utils/performance.js';
describe('VirtualScroller', () => {
    describe('basic functionality', () => {
        it('should create virtual scroller', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            expect(scroller).toBeDefined();
        });
        it('should calculate visible range', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            const items = Array.from({ length: 50 }, (_, i) => i);
            scroller.setItems(items);
            const range = scroller.getVisibleRange();
            expect(range.start).toBe(0);
            expect(range.end).toBe(8);
            expect(range.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        });
        it('should handle scroll offset', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
                overscan: 2,
            });
            const items = Array.from({ length: 50 }, (_, i) => i);
            scroller.setItems(items);
            scroller.setScrollOffset(100);
            const range = scroller.getVisibleRange();
            expect(range.start).toBe(3);
            expect(range.end).toBe(12);
        });
        it('should calculate total height', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            scroller.setItems(Array.from({ length: 50 }, (_, i) => i));
            expect(scroller.getTotalHeight()).toBe(1000);
        });
        it('should calculate max scroll offset', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            scroller.setItems(Array.from({ length: 50 }, (_, i) => i));
            expect(scroller.getMaxScrollOffset()).toBe(900);
        });
        it('should scroll to index', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            scroller.setItems(Array.from({ length: 50 }, (_, i) => i));
            scroller.scrollToIndex(10);
            const range = scroller.getVisibleRange();
            expect(range.start).toBeLessThanOrEqual(10);
            expect(range.end).toBeGreaterThanOrEqual(10);
        });
        it('should clamp scroll offset', () => {
            const scroller = new VirtualScroller({
                itemHeight: 20,
                viewportHeight: 100,
            });
            scroller.setItems(Array.from({ length: 10 }, (_, i) => i));
            scroller.setScrollOffset(1000);
            const range = scroller.getVisibleRange();
            expect(range.end).toBe(10);
        });
    });
});
describe('DynamicVirtualScroller', () => {
    it('should handle dynamic item heights', () => {
        const scroller = new DynamicVirtualScroller({
            viewportHeight: 100,
            getItemHeight: (item) => item % 2 === 0 ? 20 : 30,
        });
        scroller.setItems(Array.from({ length: 10 }, (_, i) => i));
        const range = scroller.getVisibleRange();
        expect(range.items.length).toBeGreaterThan(0);
        expect(range.offsets).toBeDefined();
    });
    it('should cache heights', () => {
        const getHeightSpy = vi.fn((item) => item * 10);
        const scroller = new DynamicVirtualScroller({
            viewportHeight: 100,
            getItemHeight: getHeightSpy,
        });
        scroller.setItems([1, 2, 3, 4, 5]);
        scroller.getTotalHeight();
        scroller.getTotalHeight();
        expect(getHeightSpy).toHaveBeenCalledTimes(5);
    });
    it('should clear cache on items change', () => {
        const scroller = new DynamicVirtualScroller({
            viewportHeight: 100,
            getItemHeight: (item) => item * 10,
        });
        scroller.setItems([1, 2, 3]);
        const height1 = scroller.getTotalHeight();
        scroller.setItems([4, 5, 6]);
        const height2 = scroller.getTotalHeight();
        expect(height1).toBe(60);
        expect(height2).toBe(150);
    });
    it('should emit items-changed event', () => {
        const changeHandler = vi.fn();
        const scroller = new DynamicVirtualScroller({
            viewportHeight: 100,
            getItemHeight: () => 20,
        });
        scroller.on('items-changed', changeHandler);
        scroller.setItems([1, 2, 3]);
        expect(changeHandler).toHaveBeenCalled();
    });
});
describe('RenderBatcher', () => {
    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', (cb) => {
            setTimeout(cb, 0);
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.stubGlobal('performance', {
            now: vi.fn(() => Date.now()),
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it('should batch updates', async () => {
        const batcher = new RenderBatcher();
        const update1 = vi.fn();
        const update2 = vi.fn();
        batcher.schedule('1', update1);
        batcher.schedule('2', update2);
        expect(update1).not.toHaveBeenCalled();
        expect(update2).not.toHaveBeenCalled();
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(update1).toHaveBeenCalled();
        expect(update2).toHaveBeenCalled();
    });
    it('should respect priority', async () => {
        const batcher = new RenderBatcher({ maxBatchSize: 2 });
        const calls = [];
        batcher.schedule('1', () => calls.push(1), 1);
        batcher.schedule('2', () => calls.push(2), 3);
        batcher.schedule('3', () => calls.push(3), 2);
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(calls).toEqual([2, 3]);
    });
    it('should cancel updates', async () => {
        const batcher = new RenderBatcher();
        const update = vi.fn();
        batcher.schedule('test', update);
        batcher.cancel('test');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(update).not.toHaveBeenCalled();
    });
    it('should emit batch-complete event', async () => {
        const completeHandler = vi.fn();
        const batcher = new RenderBatcher();
        batcher.on('batch-complete', completeHandler);
        batcher.schedule('1', () => { });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(completeHandler).toHaveBeenCalledWith({
            count: 1,
            duration: expect.any(Number),
        });
    });
    it('should handle errors', async () => {
        const errorHandler = vi.fn();
        const batcher = new RenderBatcher();
        batcher.on('error', errorHandler);
        batcher.schedule('bad', () => {
            throw new Error('Test error');
        });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(errorHandler).toHaveBeenCalledWith({
            id: 'bad',
            error: expect.any(Error),
        });
    });
    it('should clear pending updates', () => {
        const batcher = new RenderBatcher();
        const update = vi.fn();
        batcher.schedule('test', update);
        batcher.clear();
        expect(update).not.toHaveBeenCalled();
    });
});
describe('MemoryManager', () => {
    it('should register and cleanup resources', () => {
        const manager = new MemoryManager();
        const resource = { data: 'test' };
        manager.register('test', resource);
        manager.cleanup('test');
        expect(() => manager.cleanup('test')).not.toThrow();
    });
    it('should manage timers', () => {
        const manager = new MemoryManager();
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const timer = setTimeout(() => { }, 1000);
        manager.registerTimer('test', timer);
        manager.clearTimer('test');
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    });
    it('should manage intervals', () => {
        const manager = new MemoryManager();
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        const interval = setInterval(() => { }, 1000);
        manager.registerInterval('test', interval);
        manager.clearInterval('test');
        expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
    });
    it('should manage event listeners', () => {
        const manager = new MemoryManager();
        const target = {
            removeListener: vi.fn(),
        };
        const handler = () => { };
        manager.registerListener('test', target, 'event', handler);
        manager.clearListeners('test');
        expect(target.removeListener).toHaveBeenCalledWith('event', handler);
    });
    it('should handle DOM event listeners', () => {
        const manager = new MemoryManager();
        const target = {
            removeEventListener: vi.fn(),
        };
        const handler = () => { };
        manager.registerListener('test', target, 'click', handler);
        manager.clearListeners('test');
        expect(target.removeEventListener).toHaveBeenCalledWith('click', handler);
    });
    it('should cleanup all resources', () => {
        const manager = new MemoryManager();
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        const timer = setTimeout(() => { }, 1000);
        const interval = setInterval(() => { }, 1000);
        manager.registerTimer('timer', timer);
        manager.registerInterval('interval', interval);
        manager.cleanupAll();
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(clearIntervalSpy).toHaveBeenCalled();
    });
    it('should detect memory leaks', () => {
        const manager = new MemoryManager();
        {
            const resource = { data: 'test' };
            manager.register('test', resource);
        }
        if (global.gc) {
            global.gc();
        }
        const leaks = manager.checkForLeaks();
        expect(leaks).toBeDefined();
    });
});
describe('DatasetOptimizer', () => {
    it('should process data in chunks', async () => {
        const optimizer = new DatasetOptimizer({ chunkSize: 3 });
        const data = Array.from({ length: 10 }, (_, i) => i);
        const processor = vi.fn(async (chunk) => chunk.map(n => n * 2));
        const result = await optimizer.processInChunks(data, processor);
        expect(processor).toHaveBeenCalledTimes(4);
        expect(result).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    });
    it('should report progress', async () => {
        const optimizer = new DatasetOptimizer({ chunkSize: 2 });
        const data = [1, 2, 3, 4, 5];
        const progressHandler = vi.fn();
        await optimizer.processInChunks(data, async (chunk) => chunk, progressHandler);
        expect(progressHandler).toHaveBeenCalledWith(2, 5);
        expect(progressHandler).toHaveBeenCalledWith(4, 5);
        expect(progressHandler).toHaveBeenCalledWith(5, 5);
    });
    it('should build index for fast lookups', () => {
        const optimizer = new DatasetOptimizer({
            keyExtractor: (item) => item.id,
        });
        const data = [
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
            { id: 'c', value: 3 },
        ];
        optimizer.buildIndex(data);
        expect(optimizer.findByKey(data, 'b')).toEqual({ id: 'b', value: 2 });
        expect(optimizer.findByKey(data, 'd')).toBeUndefined();
    });
    it('should filter large datasets efficiently', async () => {
        const optimizer = new DatasetOptimizer({ chunkSize: 2 });
        const data = Array.from({ length: 10 }, (_, i) => i);
        const result = await optimizer.filter(data, (n) => n % 2 === 0);
        expect(result).toEqual([0, 2, 4, 6, 8]);
    });
    it('should handle async predicates', async () => {
        const optimizer = new DatasetOptimizer({ chunkSize: 3 });
        const data = [1, 2, 3, 4, 5];
        const result = await optimizer.filter(data, async (n) => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return n > 2;
        });
        expect(result).toEqual([3, 4, 5]);
    });
    it('should throw error if index not built', () => {
        const optimizer = new DatasetOptimizer({
            keyExtractor: (item) => item.id,
        });
        expect(() => optimizer.findByKey([{ id: 'a' }], 'a')).toThrow('Index not built');
    });
    it('should throw error if no key extractor', () => {
        const optimizer = new DatasetOptimizer();
        expect(() => optimizer.buildIndex([1, 2, 3])).toThrow('Key extractor required for indexing');
    });
});
describe('PerformanceMonitor', () => {
    it('should mark and measure performance', async () => {
        const monitor = new PerformanceMonitor();
        const measureHandler = vi.fn();
        monitor.on('measure', measureHandler);
        monitor.mark('start');
        await new Promise(resolve => setTimeout(resolve, 10));
        monitor.measure('operation', 'start');
        expect(measureHandler).toHaveBeenCalled();
        const call = measureHandler.mock.calls[0][0];
        expect(call.name).toBe('operation');
        expect(call.duration).toBeGreaterThanOrEqual(0);
    });
    it('should calculate metrics', async () => {
        const monitor = new PerformanceMonitor();
        for (let i = 0; i < 5; i++) {
            monitor.mark(`start-${i}`);
            await new Promise(resolve => setTimeout(resolve, 5));
            monitor.measure('test', `start-${i}`);
        }
        const metrics = monitor.getMetrics('test');
        expect(metrics).toBeDefined();
        expect(metrics.count).toBe(5);
        expect(metrics.min).toBeGreaterThanOrEqual(0);
        expect(metrics.max).toBeGreaterThanOrEqual(metrics.min);
        expect(metrics.avg).toBeGreaterThanOrEqual(0);
    });
    it('should return null for non-existent metrics', () => {
        const monitor = new PerformanceMonitor();
        expect(monitor.getMetrics('unknown')).toBeNull();
    });
    it('should clear metrics', () => {
        const monitor = new PerformanceMonitor();
        monitor.mark('start');
        monitor.measure('test', 'start');
        monitor.clear('test');
        expect(monitor.getMetrics('test')).toBeNull();
    });
    it('should clear all metrics', () => {
        const monitor = new PerformanceMonitor();
        monitor.mark('start1');
        monitor.measure('test1', 'start1');
        monitor.mark('start2');
        monitor.measure('test2', 'start2');
        monitor.clear();
        expect(monitor.getMetrics('test1')).toBeNull();
        expect(monitor.getMetrics('test2')).toBeNull();
    });
    it('should respect enabled state', async () => {
        const monitor = new PerformanceMonitor(false);
        const measureHandler = vi.fn();
        monitor.on('measure', measureHandler);
        monitor.mark('start');
        await new Promise(resolve => setTimeout(resolve, 5));
        monitor.measure('test', 'start');
        expect(measureHandler).not.toHaveBeenCalled();
        monitor.enable();
        monitor.mark('start2');
        await new Promise(resolve => setTimeout(resolve, 5));
        monitor.measure('test2', 'start2');
        expect(measureHandler).toHaveBeenCalled();
    });
    it('should measure between two marks', async () => {
        const monitor = new PerformanceMonitor();
        monitor.mark('start1');
        await new Promise(resolve => setTimeout(resolve, 5));
        monitor.mark('end1');
        monitor.measure('first-half', 'start1', 'end1');
        monitor.mark('start2');
        await new Promise(resolve => setTimeout(resolve, 5));
        monitor.mark('end2');
        monitor.measure('second-half', 'start2', 'end2');
        const firstMetrics = monitor.getMetrics('first-half');
        const secondMetrics = monitor.getMetrics('second-half');
        expect(firstMetrics).toBeDefined();
        expect(secondMetrics).toBeDefined();
        expect(firstMetrics.count).toBe(1);
        expect(secondMetrics.count).toBe(1);
        expect(firstMetrics.avg).toBeGreaterThanOrEqual(0);
        expect(secondMetrics.avg).toBeGreaterThanOrEqual(0);
    });
});
//# sourceMappingURL=performance.test.js.map