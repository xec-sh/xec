const content = `/* esm.sh - camelcase@8.0.0 */
export * from "/camelcase@8.0.0/es2022/camelcase.bundle.mjs";
export { default } from "/camelcase@8.0.0/es2022/camelcase.bundle.mjs";
`;

const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();
console.log('Cleaned content:');
console.log(cleaned);
console.log('');

const redirectPattern = /export\s+\*\s+from\s+["']([^"']+)["'];?\s*export\s+{\s*default\s*}\s+from\s+["']\1["']/;
const match = cleaned.match(redirectPattern);

console.log('Match:', match);
if (match) {
  console.log('Target path:', match[1]);
} else {
  console.log('NO MATCH!');
}
