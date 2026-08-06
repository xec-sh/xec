import globals from 'globals';
import eslintJs from '@eslint/js';
import eslintTs from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import perfectionistPlugin from 'eslint-plugin-perfectionist';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

// ----------------------------------------------------------------------

/**
 * @rules common
 */
const commonRules = () => ({
  'func-names': 1,
  'no-unused-vars': 0,
  'object-shorthand': 1,
  'no-useless-rename': 1,
  'default-case-last': 2,
  'consistent-return': 2,
  'no-constant-condition': 1,
  'default-case': [2, { commentPattern: '^no default$' }],
  'lines-around-directive': [2, { before: 'always', after: 'always' }],
  'arrow-body-style': [2, 'as-needed', { requireReturnForObjectLiteral: false }],
  // typescript
  '@typescript-eslint/no-shadow': 2,
  '@typescript-eslint/no-explicit-any': 0,
  '@typescript-eslint/no-empty-object-type': 0,
  '@typescript-eslint/consistent-type-imports': 0,
  // `ignoreRestSiblings` covers the extract-to-omit idiom
  // (`const { a, ...rest } = x`), and the underscore prefix is the
  // conventional marker for a binding that exists only to hold a position —
  // both are legitimate patterns rather than dead code.
  '@typescript-eslint/no-unused-vars': [
    1,
    { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' },
  ],
});

/**
 * @rules import
 * from 'eslint-plugin-import'.
 */
const importRules = () => ({
  ...importPlugin.configs.recommended.rules,
  'import/named': 0,
  'import/export': 0,
  'import/default': 0,
  'import/namespace': 0,
  'import/no-named-as-default': 0,
  'import/newline-after-import': 2,
  'import/no-named-as-default-member': 0,
  'import/no-cycle': [
    0, // disabled if slow
    { maxDepth: '∞', ignoreExternal: false, allowUnsafeDynamicCyclicDependency: false },
  ],
});

/**
 * @rules unused imports
 * from 'eslint-plugin-unused-imports'.
 */
const unusedImportsRules = () => ({
  'unused-imports/no-unused-imports': 1,
  'unused-imports/no-unused-vars': [
    0,
    { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
  ],
});

/**
 * @rules sort or imports/exports
 * from 'eslint-plugin-perfectionist'.
 */
const sortImportsRules = () => {
  return {
    'perfectionist/sort-named-imports': [1, { type: 'line-length', order: 'asc' }],
    'perfectionist/sort-named-exports': [1, { type: 'line-length', order: 'asc' }],
    'perfectionist/sort-exports': [
      1,
      {
        order: 'asc',
        type: 'line-length',
        // A section comment starts a new group. Without this the sort runs
        // across the whole file, so any heading a reader relies on ends up
        // describing whatever the sort happened to place under it — which
        // is exactly what had happened to @xec-sh/ops.
        partitionByComment: true,
      },
    ],
    'perfectionist/sort-imports': [
      2,
      {
        order: 'asc',
        ignoreCase: true,
        type: 'line-length',
        environment: 'node',
        internalPattern: ['^src/.+'],
        groups: [
          'style',
          'side-effect',
          'type',
          ['builtin', 'external'],
          'internal',
          ['parent', 'sibling', 'index'],
          'unknown',
        ],
      },
    ],
  };
};

/**
 * Custom ESLint configuration.
 */
const customConfig = {
  plugins: {
    'unused-imports': unusedImportsPlugin,
    perfectionist: perfectionistPlugin,
    import: importPlugin,
  },
  settings: {
    // https://www.npmjs.com/package/eslint-import-resolver-typescript
    ...importPlugin.configs.typescript.settings,
    'import/resolver': {
      ...importPlugin.configs.typescript.settings['import/resolver'],
      typescript: {
        alwaysTryTypes: true,
        tsconfigRootDir: import.meta.dirname,
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    ...commonRules(),
    ...importRules(),
    ...unusedImportsRules(),
    ...sortImportsRules(),
  },
};

// ----------------------------------------------------------------------

export default [
  { files: ['{apps,packages}/*/*.{js,mjs,cjs,ts,jsx,tsx}'] },
  {
    // Docusaurus resolves `@theme/*`, `@site/*` and several `@docusaurus/*`
    // entries through build-time aliases that no static resolver can follow,
    // so import resolution is reported per-package rather than by the plugin.
    // Without this the website is either unlinted or drowned in false
    // positives — it was previously unlinted, since the repo's lint script
    // only covered apps/ and packages/.
    files: ['website/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'import/no-unresolved': 0,
    },
  },
  {
    ignores: [
      '!apps/*/src/**/*',
      '!packages/*/src/**/*',
      'eslint.config.*',
      '**/dist/**',
      '**/coverage/**',
      // Stryker clones the package into a sandbox mid-run; those copies are
      // outside every tsconfig and vanish when the run ends.
      '**/.stryker-tmp/**',
      '**/node_modules/**',
      '**/*.d.ts',
      // Scripts the CLI compiles at run time. They are generated, gitignored
      // and outside every tsconfig, so the type-aware parser only reported
      // them as unreadable.
      '**/.xec/.tmp/**',
      // Fixtures are inputs, not code. Several are deliberately malformed —
      // a module with no export exists precisely to make the loader fail —
      // so linting them into correctness would destroy what they test.
      '**/test/fixtures/**',
    ],
  },
  {
    languageOptions: {
      parser: eslintTs.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Plain JavaScript fixtures and examples are deliberately outside the
    // TypeScript project. Type-aware parsing cannot read them, so lint them
    // syntactically instead of leaving them unparsed.
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: false,
      },
    },
  },
  eslintJs.configs.recommended,
  ...eslintTs.configs.recommended,
  customConfig,
  {
    // Docusaurus resolves `@theme/*`, `@site/*` and several `@docusaurus/*`
    // entries through build-time aliases that no static resolver can follow.
    // Without this the website is either unlinted or drowned in false
    // positives — it was previously unlinted, since the repo's lint script
    // covered only apps/ and packages/.
    files: ['website/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      'import/no-unresolved': 0,
    },
  },
  {
    // Examples are documentation that happens to compile. A function defined
    // to show a pattern and never invoked, or a named result that exists so
    // the reader can see what a call returns, is the point of the file rather
    // than dead code — and renaming those to `_result` would make the docs
    // worse. Everything that catches real defects still applies.
    files: ['**/examples/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      'func-names': 0,
      'default-case': 0,
      // Every numbered example redeclares `result`, `engine`, `config` in its
      // own section. Those shadow a sibling section's local, never an import
      // — the four cases that shadowed a module were fixed rather than
      // silenced — and renaming them per section would obscure the point.
      '@typescript-eslint/no-shadow': 0,
    },
  },
  {
    // Tests exercise the tagged-template API for its effects, and assert on
    // what it did rather than on its value; `$\`cmd\`` is a call, and the
    // rule's own option says so. Terminal assertions match ANSI escapes,
    // which are control characters by definition. Anonymous callbacks are
    // named by the test title in every reporter.
    files: ['**/{test,tests,__tests__}/**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-expressions': [2, { allowTaggedTemplates: true }],
      'no-control-regex': 0,
      'func-names': 0,
      // Each `it()` declares its own `result`, `adapter`, `manager`. Those
      // shadow a name in an enclosing `describe`, which is how a test file is
      // meant to read; the cases that shadowed an imported module were fixed
      // rather than silenced.
      '@typescript-eslint/no-shadow': 0,
    },
  },
];
