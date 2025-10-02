/**
 * Table Export Demo
 *
 * Demonstrates exporting table data to various formats:
 * - CSV (Comma-Separated Values)
 * - TSV (Tab-Separated Values)
 * - JSON (JavaScript Object Notation)
 * - Text (Plain text table)
 * - Markdown (GitHub-flavored Markdown)
 * - HTML (Hypertext Markup Language)
 */

import {
  table,
  exportToCSV,
  exportToTSV,
  exportToJSON,
  exportToText,
  exportToHTML,
  exportToMarkdown,
  type TableColumn,
} from '../../src/index.js';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  available: boolean;
}

const products: Product[] = [
  { id: 1, name: 'Laptop Pro', category: 'Electronics', price: 1299.99, stock: 45, available: true },
  { id: 2, name: 'Wireless Mouse', category: 'Accessories', price: 29.99, stock: 150, available: true },
  { id: 3, name: 'USB-C Cable', category: 'Accessories', price: 12.99, stock: 0, available: false },
  { id: 4, name: '4K Monitor', category: 'Electronics', price: 499.99, stock: 23, available: true },
  { id: 5, name: 'Keyboard RGB', category: 'Accessories', price: 89.99, stock: 67, available: true },
  { id: 6, name: 'Desk Lamp', category: 'Office', price: 45.50, stock: 12, available: true },
];

const columns: TableColumn<Product>[] = [
  { key: 'id', header: 'ID', width: 5, align: 'right' },
  { key: 'name', header: 'Product Name', width: 20 },
  { key: 'category', header: 'Category', width: 15 },
  {
    key: 'price',
    header: 'Price',
    width: 10,
    align: 'right',
    format: (value) => `$${value.toFixed(2)}`,
  },
  { key: 'stock', header: 'Stock', width: 8, align: 'right' },
  { key: 'available', header: 'Available', width: 10 },
];

function section(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function main() {
  console.clear();
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       TABLE EXPORT DEMO                          ║');
  console.log('║       Export to Multiple Formats                 ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Display original table
  section('Original Table');
  table({
    data: products,
    columns,
    borders: 'rounded',
  });

  // CSV Export
  section('1. CSV Export (Comma-Separated Values)');
  console.log('Default CSV with quoted strings:');
  const csv = exportToCSV(products, columns, {
    includeHeaders: true,
    quoteStrings: true,
  });
  console.log(csv);

  console.log('\nCSV without quotes:');
  const csvNoQuotes = exportToCSV(products, columns, {
    quoteStrings: false,
  });
  console.log(csvNoQuotes);

  console.log('\nCSV with selected columns only:');
  const csvFiltered = exportToCSV(products, columns, {
    columns: ['id', 'name', 'price'],
  });
  console.log(csvFiltered);

  // TSV Export
  section('2. TSV Export (Tab-Separated Values)');
  const tsv = exportToTSV(products, columns);
  console.log(tsv);

  // JSON Export
  section('3. JSON Export (JavaScript Object Notation)');
  console.log('Compact JSON:');
  const json = exportToJSON(products, columns);
  console.log(json.slice(0, 200) + '...');

  console.log('\nPretty JSON:');
  const jsonPretty = exportToJSON(products, columns, {
    prettyPrint: true,
    indent: 2,
  });
  console.log(jsonPretty);

  // Text Export
  section('4. Text Export (Plain Text Table)');
  const text = exportToText(products, columns);
  console.log(text);

  // Markdown Export
  section('5. Markdown Export (GitHub-Flavored)');
  const markdown = exportToMarkdown(products, columns);
  console.log(markdown);

  console.log('\nMarkdown with selected columns:');
  const markdownFiltered = exportToMarkdown(products, columns, {
    columns: ['id', 'name', 'price'],
  });
  console.log(markdownFiltered);

  // HTML Export
  section('6. HTML Export (Table)');
  const html = exportToHTML(products, columns);
  console.log(html);

  // Use Case Examples
  section('Use Cases');

  console.log('\n✓ Save to file:');
  console.log('  fs.writeFileSync("products.csv", csv);');
  console.log('  fs.writeFileSync("products.json", json);');
  console.log('  fs.writeFileSync("products.md", markdown);');

  console.log('\n✓ Send via API:');
  console.log('  await fetch("/api/export", {');
  console.log('    method: "POST",');
  console.log('    headers: { "Content-Type": "application/json" },');
  console.log('    body: json');
  console.log('  });');

  console.log('\n✓ Email attachment:');
  console.log('  await sendEmail({');
  console.log('    to: "user@example.com",');
  console.log('    subject: "Product Report",');
  console.log('    attachments: [');
  console.log('      { filename: "products.csv", content: csv }');
  console.log('    ]');
  console.log('  });');

  console.log('\n✓ Clipboard copy:');
  console.log('  await navigator.clipboard.writeText(csv);');

  console.log('\n✓ Generate report:');
  console.log('  const report = `');
  console.log('    # Product Inventory Report');
  console.log('    Generated: ${new Date().toISOString()}');
  console.log('    ');
  console.log('    ${markdown}');
  console.log('  `;');

  // Performance
  section('Performance Test');
  const largeData = Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    category: ['Electronics', 'Accessories', 'Office'][i % 3]!,
    price: 10 + (i * 7) % 990,
    stock: i % 100,
    available: i % 3 === 0,
  }));

  console.log(`\nExporting ${largeData.length.toLocaleString()} rows...`);

  const formats = [
    { name: 'CSV', fn: () => exportToCSV(largeData, columns) },
    { name: 'TSV', fn: () => exportToTSV(largeData, columns) },
    { name: 'JSON', fn: () => exportToJSON(largeData, columns) },
    { name: 'Markdown', fn: () => exportToMarkdown(largeData, columns) },
    { name: 'HTML', fn: () => exportToHTML(largeData, columns) },
  ];

  for (const format of formats) {
    const start = performance.now();
    const result = format.fn();
    const end = performance.now();
    const size = new Blob([result]).size;
    const sizeMB = (size / (1024 * 1024)).toFixed(2);

    console.log(`  ${format.name.padEnd(10)} ${(end - start).toFixed(2)}ms  (${sizeMB}MB)`);
  }

  console.log('\n✓ All formats exported successfully!');
  console.log('\nExport functionality allows you to:');
  console.log('  • Save data to files');
  console.log('  • Send data via APIs');
  console.log('  • Generate reports');
  console.log('  • Share data in multiple formats');
  console.log('  • Import into other tools (Excel, Google Sheets, etc.)');
}

main().catch(console.error);
