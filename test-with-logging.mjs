/**
 * Test with manual fetch to see what's happening
 */

// Test fetching manually
const url = 'https://esm.sh/camelcase@8.0.0?bundle';
console.log('Fetching:', url);

const response = await fetch(url);
const content = await response.text();

console.log('\nContent length:', content.length);
console.log('\nFirst 300 chars:');
console.log(content.substring(0, 300));

// Check if it's a redirect
const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();
const redirectPattern = /export\s+\*\s+from\s+["']([^"']+)["'];?\s*export\s+{\s*default\s*}\s+from\s+["']\1["']/;
const match = cleaned.match(redirectPattern);

if (match) {
  console.log('\n✓ Detected redirect to:', match[1]);
  const targetPath = match[1];
  const base = new URL(url);
  const targetURL = `${base.protocol}//${base.host}${targetPath}`;
  console.log('Full target URL:', targetURL);

  console.log('\nFetching actual bundle...');
  const response2 = await fetch(targetURL);
  const content2 = await response2.text();
  console.log('Bundle length:', content2.length);
  console.log('\nFirst 500 chars:');
  console.log(content2.substring(0, 500));

  // Check for any imports
  const hasImports = /from\s+["'][^"']+["']/.test(content2);
  console.log('\nHas imports:', hasImports);
} else {
  console.log('\n❌ No redirect detected');
}
