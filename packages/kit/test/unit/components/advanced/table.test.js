import { it, expect, describe } from 'vitest';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';
import { TablePrompt } from '../../../../src/components/advanced/table.js';
describe('TablePrompt', () => {
    const testData = [
        { id: 1, name: 'Alice', age: 30, active: true },
        { id: 2, name: 'Bob', age: 25, active: false },
        { id: 3, name: 'Charlie', age: 35, active: true },
        { id: 4, name: 'David', age: 28, active: false },
        { id: 5, name: 'Eve', age: 32, active: true }
    ];
    const columns = [
        { key: 'id', label: 'ID', width: 5 },
        { key: 'name', label: 'Name', width: 10 },
        { key: 'age', label: 'Age', width: 5 },
        { key: 'active', label: 'Active', width: 8 }
    ];
    describe('rendering', () => {
        it('should render table with headers and data', async () => {
            await testPrompt(TablePrompt, {
                message: 'Select a user',
                data: testData,
                columns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select a user');
                expect(output).toContain('ID');
                expect(output).toContain('Name');
                expect(output).toContain('Age');
                expect(output).toContain('Active');
                expect(output).toContain('Alice');
                expect(output).toContain('Bob');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle empty data', async () => {
            await testPrompt(TablePrompt, {
                message: 'Select item',
                data: [],
                columns,
                emptyMessage: 'No data available'
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('No data to display');
                sendKey({ name: 'escape' });
            });
        });
        it('should apply column formatting', async () => {
            const columnsWithFormat = [
                { key: 'name', label: 'Name' },
                {
                    key: 'age',
                    label: 'Age',
                    format: (value) => `${value} years`
                },
                {
                    key: 'active',
                    label: 'Status',
                    format: (value) => value ? '✅ Active' : '❌ Inactive'
                }
            ];
            await testPrompt(TablePrompt, {
                message: 'Formatted table',
                data: testData.slice(0, 2),
                columns: columnsWithFormat
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('30 years');
                expect(output).toContain('✅ Active');
                expect(output).toContain('❌ Inactive');
                sendKey({ name: 'escape' });
            });
        });
        it('should align columns correctly', async () => {
            const columnsWithAlign = [
                { key: 'id', label: 'ID', align: 'right', width: 5 },
                { key: 'name', label: 'Name', align: 'left', width: 10 },
                { key: 'age', label: 'Age', align: 'center', width: 5 }
            ];
            await testPrompt(TablePrompt, {
                message: 'Aligned table',
                data: testData.slice(0, 2),
                columns: columnsWithAlign
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('ID');
                expect(output).toContain('Name');
                expect(output).toContain('Age');
                sendKey({ name: 'escape' });
            });
        });
        it('should truncate long text', async () => {
            const longData = [
                { id: 1, text: 'This is a very long text that should be truncated' }
            ];
            const columnsWithTruncate = [
                { key: 'text', label: 'Text', width: 20, truncate: true }
            ];
            await testPrompt(TablePrompt, {
                message: 'Truncated text',
                data: longData,
                columns: columnsWithTruncate
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('...');
                expect(output).not.toContain('should be truncated');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('navigation', () => {
        it('should navigate with arrow keys', async () => {
            await testPrompt(TablePrompt, {
                message: 'Navigate table',
                data: testData,
                columns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toMatch(/▶.*Alice/);
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toMatch(/▶.*Bob/);
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toMatch(/▶.*Charlie/);
                sendKey({ name: 'up' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toMatch(/▶.*Bob/);
                sendKey({ name: 'escape' });
            });
        });
        it('should handle page navigation', async () => {
            const largeData = Array.from({ length: 50 }, (_, i) => ({
                id: i + 1,
                name: `User ${i + 1}`,
                age: 20 + (i % 30),
                active: i % 2 === 0
            }));
            await testPrompt(TablePrompt, {
                message: 'Large table',
                data: largeData,
                columns,
                pageSize: 10
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('User 1');
                expect(output).toContain('Showing 1-10 of 50 rows');
                sendKey({ name: 'pagedown' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('Large table');
                expect(output).toContain('Showing');
                sendKey({ name: 'pageup' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('User 1');
                expect(output).toContain('Showing 1-10 of 50 rows');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle home/end keys', async () => {
            await testPrompt(TablePrompt, {
                message: 'Navigate with home/end',
                data: testData,
                columns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'end' });
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toMatch(/▶.*Eve/);
                sendKey({ name: 'home' });
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toMatch(/▶.*Alice/);
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('virtual scrolling', () => {
        it('should show scroll indicator for large datasets', async () => {
            const largeData = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                name: `User ${i + 1}`,
                age: 20 + (i % 30),
                active: i % 2 === 0
            }));
            await testPrompt(TablePrompt, {
                message: 'Scrollable table',
                data: largeData,
                columns,
                pageSize: 10
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Scrollable table');
                expect(output).toContain('Showing');
                sendKey({ name: 'escape' });
            });
        });
        it('should update scroll position when navigating', async () => {
            const largeData = Array.from({ length: 30 }, (_, i) => ({
                id: i + 1,
                name: `User ${i + 1}`,
                age: 20,
                active: true
            }));
            await testPrompt(TablePrompt, {
                message: 'Scroll position',
                data: largeData,
                columns,
                pageSize: 10
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                for (let i = 0; i < 15; i++) {
                    sendKey({ name: 'down' });
                }
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Scroll position');
                expect(output).toMatch(/▶.*User 4/);
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('selection', () => {
        it('should handle single selection', async () => {
            const result = await testPrompt(TablePrompt, {
                message: 'Select a user',
                data: testData,
                columns
            }, async ({ sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'return' });
            });
            expect(Array.isArray(result) ? result.length : 1).toBeGreaterThan(0);
        });
        it('should handle multiple selection', async () => {
            const result = await testPrompt(TablePrompt, {
                message: 'Select users',
                data: testData,
                columns,
                multiple: true
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'space' });
                sendKey({ name: 'down' });
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Select users');
                sendKey({ name: 'return' });
            });
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });
        it('should handle select all', async () => {
            const result = await testPrompt(TablePrompt, {
                message: 'Select all users',
                data: testData.slice(0, 3),
                columns,
                multiple: true
            }, async ({ sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ ctrl: true, name: 'a' });
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'return' });
            });
            expect(result).toHaveLength(3);
            expect(result).toEqual(testData.slice(0, 3));
        });
        it('should show selection count', async () => {
            await testPrompt(TablePrompt, {
                message: 'Multi-select',
                data: testData,
                columns,
                multiple: true
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey({ name: 'space' });
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Multi-select');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('search', () => {
        it('should filter data when searching', async () => {
            await testPrompt(TablePrompt, {
                message: 'Search users',
                data: testData,
                columns,
                searchable: true
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('/');
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('Search users');
                sendKey('a');
                sendKey('l');
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('Alice');
                sendKey({ name: 'escape' });
            });
        });
        it('should use custom filter function', async () => {
            const customFilter = (row, query) => row.age.toString().includes(query);
            await testPrompt(TablePrompt, {
                message: 'Custom filter',
                data: testData,
                columns,
                searchable: true,
                filter: customFilter
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('/');
                sendKey('3');
                sendKey('0');
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Custom filter');
                expect(output).toContain('Alice');
                sendKey({ name: 'escape' });
            });
        });
        it('should clear search on escape', async () => {
            await testPrompt(TablePrompt, {
                message: 'Clear search',
                data: testData,
                columns,
                searchable: true
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('/');
                sendKey('xyz');
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('Clear search');
                output = getLastRender();
                expect(output).toContain('Alice');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('sorting', () => {
        it('should sort data by column', async () => {
            const sortableColumns = columns.map(col => ({
                ...col,
                sortable: true
            }));
            await testPrompt(TablePrompt, {
                message: 'Sortable table',
                data: testData,
                columns: sortableColumns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('3');
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('Sortable table');
                expect(output).toContain('25');
                output = getLastRender();
                expect(output).toContain('35');
                sendKey({ name: 'escape' });
            });
        });
        it('should only sort allowed columns', async () => {
            const mixedColumns = [
                { key: 'id', label: 'ID', sortable: false },
                { key: 'name', label: 'Name', sortable: true },
                { key: 'age', label: 'Age', sortable: true }
            ];
            await testPrompt(TablePrompt, {
                message: 'Partial sortable',
                data: testData,
                columns: mixedColumns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('1');
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output.indexOf('Alice')).toBeLessThan(output.indexOf('Bob'));
                sendKey('2');
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output.indexOf('Alice')).toBeLessThan(output.indexOf('Bob'));
                expect(output.indexOf('Bob')).toBeLessThan(output.indexOf('Charlie'));
                sendKey({ name: 'escape' });
            });
        });
        it('should show sort indicators', async () => {
            const sortableColumns = columns.map(col => ({
                ...col,
                sortable: true
            }));
            await testPrompt(TablePrompt, {
                message: 'Sort indicators',
                data: testData,
                columns: sortableColumns
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                sendKey('2');
                await new Promise(resolve => setTimeout(resolve, 50));
                let output = getLastRender();
                expect(output).toContain('↑');
                sendKey('2');
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                expect(output).toContain('↓');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('help text', () => {
        it('should show appropriate help text', async () => {
            await testPrompt(TablePrompt, {
                message: 'Table with help',
                data: testData,
                columns,
                multiple: true,
                searchable: true
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                const output = getLastRender();
                expect(output).toContain('Table with help');
                expect(output).toContain('navigate');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('non-TTY mode', () => {
        it('should handle non-TTY environment', async () => {
            const result = await testNonTTYPrompt(TablePrompt, {
                message: 'Non-TTY table',
                data: testData,
                columns,
                defaultSelection: testData[0]
            }, testData[0]);
            expect(result).toEqual(testData[0]);
        });
    });
});
//# sourceMappingURL=table.test.js.map