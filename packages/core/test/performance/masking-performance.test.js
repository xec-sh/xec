import { it, expect, describe, beforeAll } from '@jest/globals';
import { BaseAdapter } from '../../src/adapters/base-adapter';
class TestAdapter extends BaseAdapter {
    constructor() {
        super(...arguments);
        this.adapterName = 'test';
    }
    async execute(command) {
        return this.createResultSync('', '', 0, undefined, 'test command', Date.now(), Date.now());
    }
    async isAvailable() {
        return true;
    }
    async dispose() {
    }
    testMaskSensitiveData(text) {
        return this.maskSensitiveData(text);
    }
    testMaskSensitiveDataOptimized(text) {
        if (!this.config.sensitiveDataMasking.enabled || !text) {
            return text;
        }
        const sources = this.config.sensitiveDataMasking.patterns.map(p => `(${p.source})`);
        const combinedPattern = new RegExp(sources.join('|'), 'gi');
        return text.replace(combinedPattern, (match, ...args) => {
            const replacement = this.config.sensitiveDataMasking.replacement;
            if (match.includes('BEGIN') && match.includes('PRIVATE KEY')) {
                return replacement;
            }
            if (match.match(/^gh[ps]_[a-zA-Z0-9]{16,}$/)) {
                return replacement;
            }
            let patternIndex = -1;
            let patternGroups = [];
            for (let i = 0; i < this.config.sensitiveDataMasking.patterns.length; i++) {
                const startIdx = i + 1;
                if (args[startIdx - 1] !== undefined) {
                    patternIndex = i;
                    const pattern = this.config.sensitiveDataMasking.patterns[i];
                    const groupCount = pattern ? (pattern.source.match(/\(/g) || []).length : 0;
                    patternGroups = args.slice(startIdx, startIdx + groupCount);
                    break;
                }
            }
            const groups = patternGroups.slice(0, -2);
            if (groups.length === 0 || groups.every(g => g === undefined)) {
                return replacement;
            }
            if (groups.length === 2 && match.includes('":')) {
                return `"${groups[0]}": ${replacement}`;
            }
            if (groups.length === 4 && groups[0]?.includes('Authorization') && groups[1] && groups[2] !== undefined && groups[3]) {
                return groups[0] + groups[1] + ' ' + replacement;
            }
            if (groups.length === 6) {
                const key = groups[0];
                const separator = groups[1];
                if (key.startsWith('--')) {
                    return key + ' ' + replacement;
                }
                return key + separator + replacement;
            }
            if (groups.length === 5 && groups[0]?.startsWith('--')) {
                return groups[0] + ' ' + replacement;
            }
            if (groups.length === 3 && groups[0] && groups[1] !== undefined && groups[2]) {
                if (groups[0] === 'Bearer') {
                    return groups[0] + ' ' + replacement;
                }
                return groups[0] + groups[1] + replacement;
            }
            if (groups.length === 2 && groups[0] && groups[1]) {
                return groups[0] + replacement;
            }
            if (groups.length === 1 && groups[0]) {
                return replacement;
            }
            if (match.includes('=')) {
                const [key] = match.split('=', 2);
                return key + '=' + replacement;
            }
            else if (match.includes(':')) {
                const [key] = match.split(':', 2);
                return key + ': ' + replacement;
            }
            return replacement;
        });
    }
}
describe('Sensitive Data Masking Performance', () => {
    let adapter;
    let testData;
    beforeAll(() => {
        adapter = new TestAdapter();
        const lines = [];
        for (let i = 0; i < 1000; i++) {
            if (i % 10 === 0) {
                lines.push(`{"api_key": "sk-1234567890abcdef${i}", "data": "normal content"}`);
            }
            else if (i % 10 === 1) {
                lines.push(`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${i}`);
            }
            else if (i % 10 === 2) {
                lines.push(`password=MySecretPass${i}word123`);
            }
            else if (i % 10 === 3) {
                lines.push(`AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY${i}`);
            }
            else if (i % 10 === 4) {
                lines.push(`github_token="ghp_1234567890abcdef${i}"`);
            }
            else if (i % 10 === 5) {
                lines.push(`--client-secret 'super-secret-${i}'`);
            }
            else if (i % 10 === 6) {
                lines.push(`DATABASE_PASSWORD=${i}MyDatabasePassword123`);
            }
            else if (i % 10 === 7) {
                lines.push(`token: xoxb-123456789012-1234567890123-${i}`);
            }
            else if (i % 10 === 8) {
                lines.push(`Normal log line without any sensitive data ${i}`);
            }
            else {
                lines.push(`{"secret": "confidential-data-${i}", "public": "visible"}`);
            }
        }
        testData = lines.join('\n');
    });
    it('should mask sensitive data correctly', () => {
        const maskedOriginal = adapter.testMaskSensitiveData(testData);
        const maskedOptimized = adapter.testMaskSensitiveDataOptimized(testData);
        expect(maskedOptimized).toBe(maskedOriginal);
        expect(maskedOriginal).toContain('[REDACTED]');
        expect(maskedOriginal).not.toContain('sk-1234567890abcdef');
        expect(maskedOriginal).not.toContain('MySecretPass');
        expect(maskedOriginal).not.toContain('wJalrXUtnFEMI');
    });
    it('should show performance improvement with optimized version', () => {
        const iterations = 10;
        const startOriginal = performance.now();
        for (let i = 0; i < iterations; i++) {
            adapter.testMaskSensitiveData(testData);
        }
        const timeOriginal = performance.now() - startOriginal;
        const startOptimized = performance.now();
        for (let i = 0; i < iterations; i++) {
            adapter.testMaskSensitiveDataOptimized(testData);
        }
        const timeOptimized = performance.now() - startOptimized;
        console.log(`Original: ${timeOriginal.toFixed(2)}ms for ${iterations} iterations`);
        console.log(`Optimized: ${timeOptimized.toFixed(2)}ms for ${iterations} iterations`);
        console.log(`Improvement: ${((timeOriginal - timeOptimized) / timeOriginal * 100).toFixed(1)}%`);
        console.log(`Speed-up: ${(timeOriginal / timeOptimized).toFixed(1)}x`);
        expect(timeOptimized).toBeLessThan(timeOriginal / 2);
    });
    it('should handle edge cases correctly', () => {
        const edgeCases = [
            '',
            'no sensitive data here',
            'password=',
            'token:',
            '{"api_key":}',
            'Authorization: Bearer',
            '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'
        ];
        for (const testCase of edgeCases) {
            const maskedOriginal = adapter.testMaskSensitiveData(testCase);
            const maskedOptimized = adapter.testMaskSensitiveDataOptimized(testCase);
            expect(maskedOptimized).toBe(maskedOriginal);
        }
    });
});
//# sourceMappingURL=masking-performance.test.js.map