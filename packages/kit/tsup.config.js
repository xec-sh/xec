import { defineConfig } from 'tsup';
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: {
        resolve: true,
        entry: './src/index.ts',
        compilerOptions: {
            composite: false,
            incremental: false
        }
    },
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: process.env.NODE_ENV === 'production',
    external: ['picocolors', 'sisteransi'],
    platform: 'node',
    target: 'node14',
    shims: true,
    bundle: true,
    skipNodeModulesBundle: true,
    tsconfig: './tsconfig.json',
    esbuildOptions(options) {
        options.banner = {
            js: '"use strict";'
        };
        options.legalComments = 'none';
        options.drop = ['debugger'];
        options.minifyIdentifiers = true;
        options.minifySyntax = true;
        options.minifyWhitespace = true;
    },
    cjsInterop: true,
    metafile: true,
    onSuccess: async () => {
        if (process.env.ANALYZE_BUNDLE) {
            const { analyzeMetafile } = await import('esbuild');
            const fs = await import('fs/promises');
            const metafiles = await Promise.all([
                fs.readFile('dist/metafile-esm.json', 'utf-8'),
                fs.readFile('dist/metafile-cjs.json', 'utf-8')
            ]).catch(() => []);
            for (const [index, metafile] of metafiles.entries()) {
                if (metafile) {
                    console.log(`\n📊 Bundle Analysis (${index === 0 ? 'ESM' : 'CJS'}):`);
                    console.log(await analyzeMetafile(metafile, { verbose: true }));
                }
            }
        }
    }
});
//# sourceMappingURL=tsup.config.js.map