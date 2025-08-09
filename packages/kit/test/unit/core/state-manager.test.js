import { it, vi, expect, describe } from 'vitest';
import { StateManager } from '../../../src/core/state-manager.js';
describe('StateManager', () => {
    describe('basic functionality', () => {
        it('should initialize with initial state', () => {
            const manager = new StateManager({ count: 0 });
            expect(manager.getState()).toEqual({ count: 0 });
        });
        it('should update state with new value', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState({ count: 1 });
            expect(manager.getState()).toEqual({ count: 1 });
        });
        it('should update state with updater function', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState(prev => ({ count: prev.count + 1 }));
            expect(manager.getState()).toEqual({ count: 1 });
        });
        it('should not notify if state does not change', () => {
            const manager = new StateManager({ count: 0 });
            const subscriber = vi.fn();
            manager.subscribe(subscriber);
            const currentState = manager.getState();
            manager.setState(currentState);
            expect(subscriber).not.toHaveBeenCalled();
        });
    });
    describe('subscriptions', () => {
        it('should notify subscribers on state change', () => {
            const manager = new StateManager({ count: 0 });
            const subscriber = vi.fn();
            manager.subscribe(subscriber);
            manager.setState({ count: 1 });
            expect(subscriber).toHaveBeenCalledWith({ count: 1 }, { count: 0 });
        });
        it('should support multiple subscribers', () => {
            const manager = new StateManager({ count: 0 });
            const subscriber1 = vi.fn();
            const subscriber2 = vi.fn();
            manager.subscribe(subscriber1);
            manager.subscribe(subscriber2);
            manager.setState({ count: 1 });
            expect(subscriber1).toHaveBeenCalled();
            expect(subscriber2).toHaveBeenCalled();
        });
        it('should unsubscribe correctly', () => {
            const manager = new StateManager({ count: 0 });
            const subscriber = vi.fn();
            const unsubscribe = manager.subscribe(subscriber);
            unsubscribe();
            manager.setState({ count: 1 });
            expect(subscriber).not.toHaveBeenCalled();
        });
    });
    describe('history management', () => {
        it('should support undo', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState({ count: 1 });
            manager.setState({ count: 2 });
            expect(manager.canUndo()).toBe(true);
            manager.undo();
            expect(manager.getState()).toEqual({ count: 1 });
        });
        it('should support redo', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState({ count: 1 });
            manager.setState({ count: 2 });
            manager.undo();
            expect(manager.canRedo()).toBe(true);
            manager.redo();
            expect(manager.getState()).toEqual({ count: 2 });
        });
        it('should clear future on new state', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState({ count: 1 });
            manager.setState({ count: 2 });
            manager.undo();
            manager.setState({ count: 3 });
            expect(manager.canRedo()).toBe(false);
        });
        it('should reset to initial state', () => {
            const manager = new StateManager({ count: 0 });
            manager.setState({ count: 1 });
            manager.setState({ count: 2 });
            manager.reset();
            expect(manager.getState()).toEqual({ count: 0 });
            expect(manager.canUndo()).toBe(false);
            expect(manager.canRedo()).toBe(false);
        });
    });
});
//# sourceMappingURL=state-manager.test.js.map