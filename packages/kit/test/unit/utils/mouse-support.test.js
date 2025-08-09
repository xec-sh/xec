import { it, vi, expect, describe } from 'vitest';
import { MouseMode, MouseSupport, TerminalMouse, withMouseSupport } from '../../../src/utils/mouse-support.js';
describe('MouseSupport', () => {
    describe('basic functionality', () => {
        it('should create mouse support instance', () => {
            const mouse = new MouseSupport();
            expect(mouse).toBeDefined();
            expect(mouse.isEnabled()).toBe(true);
        });
        it('should respect enabled option', () => {
            const mouse = new MouseSupport({ enabled: false });
            expect(mouse.isEnabled()).toBe(false);
        });
        it('should enable and disable', () => {
            const mouse = new MouseSupport({ enabled: false });
            mouse.enable();
            expect(mouse.isEnabled()).toBe(true);
            mouse.disable();
            expect(mouse.isEnabled()).toBe(false);
        });
        it('should emit enabled/disabled events', () => {
            const enableHandler = vi.fn();
            const disableHandler = vi.fn();
            const mouse = new MouseSupport({ enabled: false });
            mouse.on('enabled', enableHandler);
            mouse.on('disabled', disableHandler);
            mouse.enable();
            expect(enableHandler).toHaveBeenCalled();
            mouse.disable();
            expect(disableHandler).toHaveBeenCalled();
        });
    });
    describe('region management', () => {
        it('should initialize with regions', () => {
            const regions = [
                { id: 'header', x: 0, y: 0, width: 100, height: 10 },
                { id: 'body', x: 0, y: 10, width: 100, height: 50 },
                { x: 0, y: 60, width: 100, height: 10 }
            ];
            const mouse = new MouseSupport({ regions });
            expect(mouse['regions'].has('header')).toBe(true);
            expect(mouse['regions'].has('body')).toBe(true);
            expect(mouse['regions'].size).toBe(2);
        });
        it('should add regions', () => {
            const mouse = new MouseSupport();
            const region = {
                x: 0,
                y: 0,
                width: 10,
                height: 5,
                id: 'test-region',
            };
            mouse.addRegion(region);
            expect(mouse['regions'].has('test-region')).toBe(true);
        });
        it('should auto-generate region ID if not provided', () => {
            const mouse = new MouseSupport();
            const region = {
                x: 0,
                y: 0,
                width: 10,
                height: 5,
            };
            mouse.addRegion(region);
            expect(region.id).toBeDefined();
            expect(region.id).toMatch(/^region-\d+-[\d.]+$/);
        });
        it('should remove regions', () => {
            const mouse = new MouseSupport();
            const region = {
                x: 0,
                y: 0,
                width: 10,
                height: 5,
                id: 'test',
            };
            mouse.addRegion(region);
            mouse.removeRegion('test');
            expect(mouse['regions'].has('test')).toBe(false);
        });
        it('should update regions', () => {
            const mouse = new MouseSupport();
            const region = {
                x: 0,
                y: 0,
                width: 10,
                height: 5,
                id: 'test',
            };
            mouse.addRegion(region);
            mouse.updateRegion('test', { x: 5, width: 20 });
            const updated = mouse['regions'].get('test');
            expect(updated?.x).toBe(5);
            expect(updated?.width).toBe(20);
            expect(updated?.y).toBe(0);
        });
        it('should clear all regions', () => {
            const mouse = new MouseSupport();
            mouse.addRegion({ x: 0, y: 0, width: 10, height: 5, id: 'r1' });
            mouse.addRegion({ x: 10, y: 0, width: 10, height: 5, id: 'r2' });
            mouse.clearRegions();
            expect(mouse['regions'].size).toBe(0);
        });
        it('should emit region events', () => {
            const addHandler = vi.fn();
            const removeHandler = vi.fn();
            const updateHandler = vi.fn();
            const clearHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('region-added', addHandler);
            mouse.on('region-removed', removeHandler);
            mouse.on('region-updated', updateHandler);
            mouse.on('regions-cleared', clearHandler);
            const region = { x: 0, y: 0, width: 10, height: 5, id: 'test' };
            mouse.addRegion(region);
            expect(addHandler).toHaveBeenCalledWith(region);
            mouse.updateRegion('test', { x: 5 });
            expect(updateHandler).toHaveBeenCalled();
            mouse.removeRegion('test');
            expect(removeHandler).toHaveBeenCalledWith(region);
            mouse.clearRegions();
            expect(clearHandler).toHaveBeenCalled();
        });
    });
    describe('click handling', () => {
        it('should handle click events', () => {
            const clickHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('click', clickHandler);
            const event = {
                type: 'click',
                position: { x: 5, y: 5 },
                button: 'left',
            };
            const handled = mouse.handleMouseEvent(event);
            expect(handled).toBe(false);
            expect(clickHandler).toHaveBeenCalledWith(expect.objectContaining({
                position: { x: 5, y: 5 },
                button: 'left',
                region: null,
                isDoubleClick: false,
            }));
        });
        it('should detect clicks on regions', () => {
            const regionClickHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('region-click', regionClickHandler);
            mouse.addRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                id: 'button',
            });
            const event = {
                type: 'click',
                position: { x: 5, y: 5 },
                button: 'left',
            };
            const handled = mouse.handleMouseEvent(event);
            expect(handled).toBe(true);
            expect(regionClickHandler).toHaveBeenCalledWith(expect.objectContaining({
                region: expect.objectContaining({ id: 'button' }),
                event,
                isDoubleClick: false,
            }));
        });
        it('should emit region-specific click events', () => {
            const specificHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.addRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                id: 'button',
            });
            mouse.on('click:button', specificHandler);
            mouse.handleMouseEvent({
                type: 'click',
                position: { x: 5, y: 5 },
            });
            expect(specificHandler).toHaveBeenCalled();
        });
        it('should detect double clicks', async () => {
            const mouse = new MouseSupport({ clickDelay: 300 });
            const clickHandler = vi.fn();
            mouse.on('click', clickHandler);
            const event = {
                type: 'click',
                position: { x: 5, y: 5 },
            };
            mouse.handleMouseEvent(event);
            mouse.handleMouseEvent(event);
            expect(clickHandler).toHaveBeenCalledTimes(2);
            expect(clickHandler).toHaveBeenLastCalledWith(expect.objectContaining({
                isDoubleClick: true,
            }));
        });
        it('should not detect double click after delay', async () => {
            const mouse = new MouseSupport({ clickDelay: 50 });
            const clickHandler = vi.fn();
            mouse.on('click', clickHandler);
            const event = {
                type: 'click',
                position: { x: 5, y: 5 },
            };
            mouse.handleMouseEvent(event);
            await new Promise(resolve => setTimeout(resolve, 100));
            mouse.handleMouseEvent(event);
            expect(clickHandler).toHaveBeenLastCalledWith(expect.objectContaining({
                isDoubleClick: false,
            }));
        });
    });
    describe('scroll handling', () => {
        it('should handle scroll events', () => {
            const scrollHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('scroll', scrollHandler);
            const event = {
                type: 'scroll',
                position: { x: 5, y: 5 },
                direction: 'up',
                delta: 3,
            };
            mouse.handleMouseEvent(event);
            expect(scrollHandler).toHaveBeenCalledWith(expect.objectContaining({
                position: { x: 5, y: 5 },
                direction: 'up',
                delta: 3,
            }));
        });
        it('should apply scroll sensitivity', () => {
            const scrollHandler = vi.fn();
            const mouse = new MouseSupport({ scrollSensitivity: 2 });
            mouse.on('scroll', scrollHandler);
            mouse.handleMouseEvent({
                type: 'scroll',
                position: { x: 0, y: 0 },
                delta: 3,
            });
            expect(scrollHandler).toHaveBeenCalledWith(expect.objectContaining({
                delta: 6,
            }));
        });
        it('should handle scroll on regions', () => {
            const regionScrollHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('region-scroll', regionScrollHandler);
            mouse.addRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                id: 'scrollable',
            });
            mouse.handleMouseEvent({
                type: 'scroll',
                position: { x: 5, y: 5 },
                direction: 'down',
                delta: 1,
            });
            expect(regionScrollHandler).toHaveBeenCalledWith(expect.objectContaining({
                region: expect.objectContaining({ id: 'scrollable' }),
            }));
        });
    });
    describe('move handling', () => {
        it('should handle move events', () => {
            const moveHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('move', moveHandler);
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 10, y: 20 },
            });
            expect(moveHandler).toHaveBeenCalledWith(expect.objectContaining({
                position: { x: 10, y: 20 },
            }));
        });
        it('should detect hover enter/leave', () => {
            const enterHandler = vi.fn();
            const leaveHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('region-enter', enterHandler);
            mouse.on('region-leave', leaveHandler);
            mouse.addRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                id: 'hover',
            });
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 5, y: 5 },
            });
            expect(enterHandler).toHaveBeenCalledWith(expect.objectContaining({
                region: expect.objectContaining({ id: 'hover' }),
            }));
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 20, y: 20 },
            });
            expect(leaveHandler).toHaveBeenCalledWith(expect.objectContaining({
                region: expect.objectContaining({ id: 'hover' }),
            }));
        });
        it('should emit region-specific hover events', () => {
            const enterHandler = vi.fn();
            const leaveHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.addRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                id: 'button',
            });
            mouse.on('enter:button', enterHandler);
            mouse.on('leave:button', leaveHandler);
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 5, y: 5 },
            });
            expect(enterHandler).toHaveBeenCalled();
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 20, y: 20 },
            });
            expect(leaveHandler).toHaveBeenCalled();
        });
    });
    describe('drag handling', () => {
        it('should handle drag events', () => {
            const dragStartHandler = vi.fn();
            const dragHandler = vi.fn();
            const dragEndHandler = vi.fn();
            const mouse = new MouseSupport();
            mouse.on('drag-start', dragStartHandler);
            mouse.on('drag', dragHandler);
            mouse.on('drag-end', dragEndHandler);
            mouse.handleMouseEvent({
                type: 'drag',
                position: { x: 10, y: 10 },
                button: 'left',
            });
            expect(dragStartHandler).toHaveBeenCalled();
            expect(dragHandler).toHaveBeenCalledWith(expect.objectContaining({
                start: { x: 10, y: 10 },
                current: { x: 10, y: 10 },
                delta: { x: 0, y: 0 },
            }));
            mouse.handleMouseEvent({
                type: 'drag',
                position: { x: 20, y: 15 },
                button: 'left',
            });
            expect(dragHandler).toHaveBeenCalledWith(expect.objectContaining({
                start: { x: 10, y: 10 },
                current: { x: 20, y: 15 },
                delta: { x: 10, y: 5 },
            }));
            mouse.handleMouseEvent({
                type: 'drag',
                position: { x: 20, y: 15 },
            });
            expect(dragEndHandler).toHaveBeenCalled();
        });
    });
    describe('disabled state', () => {
        it('should not handle events when disabled', () => {
            const clickHandler = vi.fn();
            const mouse = new MouseSupport({ enabled: false });
            mouse.on('click', clickHandler);
            const handled = mouse.handleMouseEvent({
                type: 'click',
                position: { x: 0, y: 0 },
            });
            expect(handled).toBe(false);
            expect(clickHandler).not.toHaveBeenCalled();
        });
    });
    describe('static helpers', () => {
        it('should convert terminal coordinates to region', () => {
            const region = MouseSupport.terminalToRegion(5, 10, 8, 16);
            expect(region).toEqual({
                x: 80,
                y: 80,
                width: 8,
                height: 16,
            });
        });
        it('should parse SGR mouse sequences', () => {
            const event = MouseSupport.parseMouseSequence('\x1b[<0;10;20M');
            expect(event).toEqual({
                type: 'click',
                position: { x: 9, y: 19 },
                button: 'left',
            });
        });
        it('should parse scroll sequences', () => {
            const upEvent = MouseSupport.parseMouseSequence('\x1b[<64;5;10M');
            expect(upEvent).toEqual({
                type: 'scroll',
                position: { x: 4, y: 9 },
                direction: 'up',
                delta: 1,
            });
            const downEvent = MouseSupport.parseMouseSequence('\x1b[<65;5;10M');
            expect(downEvent).toEqual({
                type: 'scroll',
                position: { x: 4, y: 9 },
                direction: 'down',
                delta: 1,
            });
        });
        it('should return null for invalid sequences', () => {
            expect(MouseSupport.parseMouseSequence('invalid')).toBeNull();
            expect(MouseSupport.parseMouseSequence('\x1b[M')).toBeNull();
        });
    });
    describe('edge cases', () => {
        it('should clear hoveredRegion when removing hovered region', () => {
            const mouse = new MouseSupport();
            const region = {
                id: 'hoverable',
                x: 0,
                y: 0,
                width: 100,
                height: 100
            };
            mouse.addRegion(region);
            mouse.handleMouseEvent({
                type: 'move',
                position: { x: 50, y: 50 }
            });
            mouse.removeRegion('hoverable');
            expect(mouse['regions'].has('hoverable')).toBe(false);
        });
        it('should handle unknown event types', () => {
            const mouse = new MouseSupport();
            const result = mouse.handleMouseEvent({
                type: 'unknown',
                position: { x: 0, y: 0 }
            });
            expect(result).toBe(false);
        });
    });
});
describe('TerminalMouse', () => {
    it('should enable mouse mode', () => {
        const writer = vi.fn();
        const terminal = new TerminalMouse(writer);
        terminal.enable(MouseMode.Normal);
        expect(writer).toHaveBeenCalledWith('\x1b[?1000h');
        expect(writer).toHaveBeenCalledWith('\x1b[?1006h');
        expect(writer).toHaveBeenCalledWith('\x1b[?1004h');
        expect(terminal.isEnabled()).toBe(true);
        expect(terminal.getMode()).toBe(MouseMode.Normal);
    });
    it('should disable mouse mode', () => {
        const writer = vi.fn();
        const terminal = new TerminalMouse(writer);
        terminal.enable(MouseMode.Normal);
        writer.mockClear();
        terminal.disable();
        expect(writer).toHaveBeenCalledWith('\x1b[?1000l');
        expect(writer).toHaveBeenCalledWith('\x1b[?1006l');
        expect(writer).toHaveBeenCalledWith('\x1b[?1004l');
        expect(terminal.isEnabled()).toBe(false);
        expect(terminal.getMode()).toBe(MouseMode.Off);
    });
    it('should switch modes', () => {
        const writer = vi.fn();
        const terminal = new TerminalMouse(writer);
        terminal.enable(MouseMode.Normal);
        writer.mockClear();
        terminal.enable(MouseMode.AnyEvent);
        expect(writer).toHaveBeenCalledWith('\x1b[?1000l');
        expect(writer).toHaveBeenCalledWith('\x1b[?1003h');
    });
    it('should handle multiple disable calls', () => {
        const writer = vi.fn();
        const terminal = new TerminalMouse(writer);
        terminal.disable();
        terminal.disable();
        expect(writer).not.toHaveBeenCalled();
    });
});
describe('withMouseSupport mixin', () => {
    class TestPrompt {
        constructor(options) {
            this.options = options;
            this.writer = options.writer;
        }
    }
    it('should add mouse functionality', () => {
        const PromptWithMouse = withMouseSupport(TestPrompt);
        const instance = new PromptWithMouse({});
        expect(instance.mouse).toBeDefined();
        expect(instance.handleMouseEvent).toBeDefined();
        expect(instance.enableMouse).toBeDefined();
        expect(instance.disableMouse).toBeDefined();
    });
    it('should handle mouse events', () => {
        const PromptWithMouse = withMouseSupport(TestPrompt);
        const instance = new PromptWithMouse({});
        const handled = instance.handleMouseEvent({
            type: 'click',
            position: { x: 0, y: 0 },
        });
        expect(handled).toBe(false);
    });
    it('should set up terminal mouse with writer', () => {
        const writer = vi.fn();
        const PromptWithMouse = withMouseSupport(TestPrompt);
        const instance = new PromptWithMouse({ writer });
        expect(instance.terminalMouse).toBeDefined();
        instance.enableMouse();
        expect(writer).toHaveBeenCalled();
    });
    it('should call override methods', () => {
        const clickHandler = vi.fn();
        const scrollHandler = vi.fn();
        class TestPromptWithHandlers {
            constructor(options) {
                this.options = options;
                this.onMouseClick = clickHandler;
                this.onMouseScroll = scrollHandler;
            }
        }
        const PromptWithMouse = withMouseSupport(TestPromptWithHandlers);
        const instance = new PromptWithMouse({});
        instance.mouse?.emit('click', { test: true });
        expect(clickHandler).toHaveBeenCalledWith({ test: true });
        instance.mouse?.emit('scroll', { test: true });
        expect(scrollHandler).toHaveBeenCalledWith({ test: true });
    });
    it('should respect mouse option', () => {
        const PromptWithMouse = withMouseSupport(TestPrompt);
        const instance = new PromptWithMouse({ mouse: false });
        expect(instance.mouse).toBeUndefined();
    });
    it('should enable/disable mouse', () => {
        const writer = vi.fn();
        const PromptWithMouse = withMouseSupport(TestPrompt);
        const instance = new PromptWithMouse({ writer });
        instance.enableMouse();
        expect(instance.mouse?.isEnabled()).toBe(true);
        expect(writer).toHaveBeenCalled();
        writer.mockClear();
        instance.disableMouse();
        expect(instance.mouse?.isEnabled()).toBe(false);
        expect(writer).toHaveBeenCalled();
    });
});
//# sourceMappingURL=mouse-support.test.js.map