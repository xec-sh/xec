/**
 * Turn `export *` into the list of names it actually re-exports.
 *
 * A star export makes the public surface implicit: it changes whenever the
 * module behind it gains a symbol, so an internal helper becomes public by
 * accident and nobody reviews it. It also defeats tree-shaking, and it hides
 * collisions until two modules happen to export the same name.
 *
 * The names are read from the TypeScript program rather than guessed, and
 * values and types are separated so `isolatedModules` and `verbatimModuleSyntax`
 * consumers get a correct `export type`.
 *
 * Usage: node scripts/expand-star-exports.mjs <package-dir>
 */

import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';

const pkgDir = path.resolve(process.argv[2] ?? '.');
const indexPath = path.join(pkgDir, 'src/index.ts');
const source = fs.readFileSync(indexPath, 'utf8');

const configPath = ts.findConfigFile(pkgDir, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error(`no tsconfig under ${pkgDir}`);
const parsed = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  path.dirname(configPath)
);

const program = ts.createProgram([indexPath], parsed.options);
const checker = program.getTypeChecker();
const indexFile = program.getSourceFile(indexPath);
if (!indexFile) throw new Error(`${indexPath} is not in the program`);

/** Names a module exports, split into values and types. */
function exportsOf(specifier) {
  const resolved = ts.resolveModuleName(
    specifier,
    indexPath,
    parsed.options,
    ts.sys
  ).resolvedModule;
  if (!resolved) throw new Error(`cannot resolve ${specifier}`);

  const file = program.getSourceFile(resolved.resolvedFileName);
  if (!file) throw new Error(`${resolved.resolvedFileName} is not in the program`);

  const moduleSymbol = checker.getSymbolAtLocation(file);
  if (!moduleSymbol) return { values: [], types: [] };

  const values = [];
  const types = [];

  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const name = symbol.getName();
    if (name === 'default') continue;

    // A symbol is a value if any of its declarations produces one. Interfaces
    // and type aliases do not, and must be re-exported as types.
    const flags = symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol).flags
      : symbol.flags;
    const isValue = Boolean(
      flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function | ts.SymbolFlags.Class |
               ts.SymbolFlags.Enum | ts.SymbolFlags.ValueModule | ts.SymbolFlags.Method |
               ts.SymbolFlags.Property)
    );

    (isValue ? values : types).push(name);
  }

  return { values: values.sort(), types: types.sort() };
}

/** Wrap a name list at a sensible width. */
function block(keyword, names, specifier) {
  const oneLine = `export ${keyword}{ ${names.join(', ')} } from '${specifier}';`;
  if (oneLine.length <= 100) return oneLine;

  const lines = [`export ${keyword}{`];
  let current = ' ';
  for (const name of names) {
    if (current.length + name.length + 2 > 96) {
      lines.push(`${current.trimEnd()}`);
      current = ' ';
    }
    current += ` ${name},`;
  }
  if (current.trim()) lines.push(current.trimEnd());
  lines.push(`} from '${specifier}';`);
  return lines.join('\n');
}

let output = source;
let replaced = 0;

for (const statement of [...indexFile.statements].reverse()) {
  if (!ts.isExportDeclaration(statement)) continue;
  if (statement.exportClause) continue; // already explicit
  if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

  const specifier = statement.moduleSpecifier.text;
  const { values, types } = exportsOf(specifier);
  if (values.length === 0 && types.length === 0) {
    console.error(`  ${specifier}: exports nothing — left alone`);
    continue;
  }

  const parts = [];
  if (values.length) parts.push(block('', values, specifier));
  if (types.length) parts.push(block('type ', types, specifier));

  const start = statement.getStart(indexFile);
  const end = statement.getEnd();
  output = output.slice(0, start) + parts.join('\n') + output.slice(end);
  replaced += 1;
  console.error(`  ${specifier}: ${values.length} values, ${types.length} types`);
}

fs.writeFileSync(indexPath, output);
console.error(`${path.relative(process.cwd(), indexPath)}: expanded ${replaced} star exports`);
