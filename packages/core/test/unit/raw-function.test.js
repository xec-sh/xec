import { it, expect, describe } from '@jest/globals';
import { $ } from '../../src/index.js';
import { interpolateRaw } from '../../src/utils/shell-escape.js';
function createTemplateStringsArray(strings) {
    const template = strings;
    template.raw = strings;
    return template;
}
describe('Raw function', () => {
    it('should handle basic raw string interpolation', () => {
        const pattern = '*.txt';
        const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), pattern);
        expect(result).toBe('ls *.txt');
    });
    it('should handle raw string with spaces without escaping', () => {
        const pattern = '*.txt *.js';
        const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), pattern);
        expect(result).toBe('ls *.txt *.js');
    });
    it('should handle pipe operations without escaping', () => {
        const command = 'ps aux | grep node';
        const result = interpolateRaw(createTemplateStringsArray(['', '']), command);
        expect(result).toBe('ps aux | grep node');
    });
    it('should handle arrays without escaping', () => {
        const patterns = ['*.txt', '*.js'];
        const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), patterns);
        expect(result).toBe('ls *.txt *.js');
    });
    it('should handle objects by JSON stringifying', () => {
        const config = { name: 'app', port: 3000 };
        const result = interpolateRaw(createTemplateStringsArray(['echo ', ' > config.json']), config);
        expect(result).toBe('echo {"name":"app","port":3000} > config.json');
    });
    it('should handle null and undefined values', () => {
        const result1 = interpolateRaw(createTemplateStringsArray(['echo ', ' test']), null);
        expect(result1).toBe('echo  test');
        const result2 = interpolateRaw(createTemplateStringsArray(['echo ', ' test']), undefined);
        expect(result2).toBe('echo  test');
    });
    it('should have raw method available on $ object', () => {
        expect(typeof $.raw).toBe('function');
    });
});
//# sourceMappingURL=raw-function.test.js.map