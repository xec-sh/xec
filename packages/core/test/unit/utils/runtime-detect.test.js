import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { RuntimeDetector } from '../../../src/utils/runtime-detect.js';
describe('RuntimeDetector', () => {
    let originalBun;
    let originalDeno;
    beforeEach(() => {
        originalBun = globalThis.Bun;
        originalDeno = globalThis.Deno;
        RuntimeDetector.reset();
    });
    afterEach(() => {
        if (originalBun !== undefined) {
            globalThis.Bun = originalBun;
        }
        else {
            delete globalThis.Bun;
        }
        if (originalDeno !== undefined) {
            globalThis.Deno = originalDeno;
        }
        else {
            delete globalThis.Deno;
        }
        RuntimeDetector.reset();
    });
    describe('detect()', () => {
        it('should detect Node.js runtime', () => {
            delete globalThis.Bun;
            delete globalThis.Deno;
            expect(RuntimeDetector.detect()).toBe('node');
        });
        it('should detect Bun runtime', () => {
            globalThis.Bun = { version: '1.0.0' };
            delete globalThis.Deno;
            expect(RuntimeDetector.detect()).toBe('bun');
        });
        it('should detect Deno runtime', () => {
            delete globalThis.Bun;
            globalThis.Deno = { version: { deno: '1.0.0' } };
            expect(RuntimeDetector.detect()).toBe('deno');
        });
        it('should prioritize Bun over Deno if both exist', () => {
            globalThis.Bun = { version: '1.0.0' };
            globalThis.Deno = { version: { deno: '1.0.0' } };
            expect(RuntimeDetector.detect()).toBe('bun');
        });
        it('should cache the detection result', () => {
            delete globalThis.Bun;
            delete globalThis.Deno;
            const result1 = RuntimeDetector.detect();
            globalThis.Bun = { version: '1.0.0' };
            const result2 = RuntimeDetector.detect();
            expect(result1).toBe('node');
            expect(result2).toBe('node');
        });
    });
    describe('getBunVersion()', () => {
        it('should return Bun version when running in Bun', () => {
            globalThis.Bun = { version: '1.0.25' };
            expect(RuntimeDetector.getBunVersion()).toBe('1.0.25');
        });
        it('should return null when not running in Bun', () => {
            delete globalThis.Bun;
            expect(RuntimeDetector.getBunVersion()).toBeNull();
        });
        it('should cache Bun version', () => {
            globalThis.Bun = { version: '1.0.0' };
            const version1 = RuntimeDetector.getBunVersion();
            globalThis.Bun.version = '2.0.0';
            const version2 = RuntimeDetector.getBunVersion();
            expect(version1).toBe('1.0.0');
            expect(version2).toBe('1.0.0');
        });
    });
    describe('hasFeature()', () => {
        describe('Bun features', () => {
            beforeEach(() => {
                globalThis.Bun = {
                    spawn: jest.fn(),
                    serve: jest.fn(),
                    SQLite: jest.fn(),
                    version: '1.0.0'
                };
            });
            it('should detect Bun spawn feature', () => {
                expect(RuntimeDetector.hasFeature('spawn')).toBe(true);
            });
            it('should detect Bun serve feature', () => {
                expect(RuntimeDetector.hasFeature('serve')).toBe(true);
            });
            it('should detect Bun SQLite feature', () => {
                expect(RuntimeDetector.hasFeature('sqlite')).toBe(true);
            });
            it('should return false for missing Bun features', () => {
                delete globalThis.Bun.serve;
                expect(RuntimeDetector.hasFeature('serve')).toBe(false);
            });
            it('should return false when Bun is not available', () => {
                delete globalThis.Bun;
                RuntimeDetector.reset();
                expect(RuntimeDetector.hasFeature('spawn')).toBe(true);
                expect(RuntimeDetector.hasFeature('serve')).toBe(false);
                expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
            });
        });
        describe('Node.js features', () => {
            beforeEach(() => {
                delete globalThis.Bun;
                delete globalThis.Deno;
            });
            it('should always have spawn in Node.js', () => {
                expect(RuntimeDetector.hasFeature('spawn')).toBe(true);
            });
            it('should not have Bun-specific features in Node.js', () => {
                expect(RuntimeDetector.hasFeature('serve')).toBe(false);
                expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
            });
        });
        describe('Deno features', () => {
            beforeEach(() => {
                delete globalThis.Bun;
                globalThis.Deno = { version: { deno: '1.0.0' } };
            });
            it('should return false for all features in Deno', () => {
                expect(RuntimeDetector.hasFeature('spawn')).toBe(false);
                expect(RuntimeDetector.hasFeature('serve')).toBe(false);
                expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
            });
        });
    });
    describe('Helper methods', () => {
        it('isNode() should work correctly', () => {
            delete globalThis.Bun;
            delete globalThis.Deno;
            expect(RuntimeDetector.isNode()).toBe(true);
            globalThis.Bun = { version: '1.0.0' };
            RuntimeDetector.reset();
            expect(RuntimeDetector.isNode()).toBe(false);
        });
        it('isBun() should work correctly', () => {
            delete globalThis.Bun;
            expect(RuntimeDetector.isBun()).toBe(false);
            globalThis.Bun = { version: '1.0.0' };
            RuntimeDetector.reset();
            expect(RuntimeDetector.isBun()).toBe(true);
        });
        it('isDeno() should work correctly', () => {
            delete globalThis.Deno;
            expect(RuntimeDetector.isDeno()).toBe(false);
            globalThis.Deno = { version: { deno: '1.0.0' } };
            RuntimeDetector.reset();
            expect(RuntimeDetector.isDeno()).toBe(true);
        });
    });
    describe('reset()', () => {
        it('should clear cached runtime detection', () => {
            delete globalThis.Bun;
            expect(RuntimeDetector.detect()).toBe('node');
            globalThis.Bun = { version: '1.0.0' };
            expect(RuntimeDetector.detect()).toBe('node');
            RuntimeDetector.reset();
            expect(RuntimeDetector.detect()).toBe('bun');
        });
        it('should clear cached Bun version', () => {
            globalThis.Bun = { version: '1.0.0' };
            expect(RuntimeDetector.getBunVersion()).toBe('1.0.0');
            globalThis.Bun.version = '2.0.0';
            expect(RuntimeDetector.getBunVersion()).toBe('1.0.0');
            RuntimeDetector.reset();
            expect(RuntimeDetector.getBunVersion()).toBe('2.0.0');
        });
    });
    describe('Edge cases', () => {
        it('should handle malformed Bun global', () => {
            globalThis.Bun = {};
            expect(RuntimeDetector.detect()).toBe('bun');
            expect(RuntimeDetector.getBunVersion()).toBeUndefined();
        });
        it('should handle malformed Deno global', () => {
            globalThis.Deno = {};
            expect(RuntimeDetector.detect()).toBe('deno');
        });
        it('should handle Bun global without required functions', () => {
            globalThis.Bun = { version: '1.0.0' };
            expect(RuntimeDetector.hasFeature('spawn')).toBe(false);
            expect(RuntimeDetector.hasFeature('serve')).toBe(false);
            expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
        });
    });
});
//# sourceMappingURL=runtime-detect.test.js.map