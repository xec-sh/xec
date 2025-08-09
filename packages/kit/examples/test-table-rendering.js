#!/usr/bin/env tsx
import { TablePrompt } from '../src/components/advanced/table.js';
const data = [
    { id: 1, name: 'Short', status: 'active', emoji: '✅', date: '2024-01-01' },
    { id: 2, name: 'Medium Name Here', status: 'pending', emoji: '⏳', date: '2024-01-02' },
    { id: 3, name: 'Very Long Name That Should Be Truncated', status: 'inactive', emoji: '❌', date: '2024-01-03' },
    { id: 4, name: 'CJK 中文测试', status: 'active', emoji: '🔥', date: '2024-01-04' },
    { id: 5, name: 'Mixed 混合 Text', status: 'pending', emoji: '🚀', date: '2024-01-05' },
];
async function testRendering() {
    const prompt = new TablePrompt({
        message: 'Test Table Rendering',
        data,
        columns: [
            { key: 'id', label: 'ID', width: 5, align: 'center' },
            { key: 'name', label: 'Name', width: 25, align: 'left' },
            { key: 'status', label: 'Status', width: 10, align: 'center' },
            { key: 'emoji', label: 'Icon', width: 5, align: 'center' },
            { key: 'date', label: 'Date', width: 12, align: 'right' },
        ],
        selectable: 'single',
        pageSize: 10,
    });
    const rendered = prompt.render();
    console.log('Table Rendering Output:');
    console.log('='.repeat(80));
    console.log(rendered);
    console.log('='.repeat(80));
    console.log('\nColumn Width Analysis:');
    data.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`);
        console.log(`  ID (5): "${row.id}" -> width: ${getWidth(String(row.id))}`);
        console.log(`  Name (25): "${row.name}" -> width: ${getWidth(row.name)}`);
        console.log(`  Status (10): "${row.status}" -> width: ${getWidth(row.status)}`);
        console.log(`  Emoji (5): "${row.emoji}" -> width: ${getWidth(row.emoji)}`);
        console.log(`  Date (12): "${row.date}" -> width: ${getWidth(row.date)}`);
    });
}
function getWidth(text) {
    let width = 0;
    const chars = Array.from(text);
    for (const char of chars) {
        const code = char.codePointAt(0);
        if (!code)
            continue;
        if ((code >= 0x0300 && code <= 0x036F) ||
            (code >= 0xFE00 && code <= 0xFE0F) ||
            (code === 0x200B) ||
            (code === 0x200C) ||
            (code === 0x200D) ||
            (code === 0xFEFF)) {
            width += 0;
        }
        else if ((code >= 0x1F300 && code <= 0x1FAF8) ||
            (code >= 0x2600 && code <= 0x27BF) ||
            (code >= 0xFF00 && code <= 0xFFEF) ||
            (code >= 0x4E00 && code <= 0x9FFF) ||
            (code >= 0x3000 && code <= 0x303F)) {
            width += 2;
        }
        else if (code >= 0x20 && code <= 0x7E) {
            width += 1;
        }
        else {
            width += 1;
        }
    }
    return width;
}
testRendering().catch(console.error);
//# sourceMappingURL=test-table-rendering.js.map