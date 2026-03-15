---
title: Migrating from Gulp/Grunt
description: Guide for migrating from Gulp or Grunt task runners to Xec
keywords: [migration, gulp, grunt, task runner, build automation]
source_files:
  - apps/xec/src/commands/watch.ts
  - packages/core/src/core/execution-engine.ts
  - apps/xec/src/script-runner.ts
verification_date: 2025-08-03
---

# Migrating from Gulp/Grunt to Xec

## Overview

This guide helps you migrate from JavaScript task runners like Gulp and Grunt to Xec's modern execution system. While Gulp and Grunt revolutionized front-end build tooling, Xec provides a more comprehensive solution with TypeScript support, multi-environment execution, and better performance.

## Why Migrate from Gulp/Grunt?

### Gulp/Grunt Limitations

**Gulp Example:**
```javascript
// gulpfile.js
const gulp = require('gulp');
const sass = require('gulp-sass');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');

gulp.task('styles', () => {
  return gulp.src('src/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(concat('app.css'))
    .pipe(gulp.dest('dist/css'));
});

gulp.task('scripts', () => {
  return gulp.src('src/js/**/*.js')
    .pipe(uglify())
    .pipe(concat('app.js'))
    .pipe(gulp.dest('dist/js'));
});

gulp.task('default', gulp.series('styles', 'scripts'));
```

**Grunt Example:**
```javascript
// Gruntfile.js
module.exports = function(grunt) {
  grunt.initConfig({
    sass: {
      dist: {
        files: {
          'dist/css/app.css': 'src/scss/main.scss'
        }
      }
    },
    uglify: {
      dist: {
        files: {
          'dist/js/app.js': ['src/js/**/*.js']
        }
      }
    },
    watch: {
      styles: {
        files: ['src/scss/**/*.scss'],
        tasks: ['sass']
      }
    }
  });
  
  grunt.loadNpmTasks('grunt-sass');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  
  grunt.registerTask('default', ['sass', 'uglify']);
};
```

**Problems:**
- Plugin ecosystem fragmentation
- Complex configuration syntax
- Memory intensive streaming
- Limited to local execution
- Callback hell in complex workflows
- Maintenance burden of plugins

### Xec Advantages

```typescript
// scripts/build.ts
import { $, glob, watch } from '@xec-sh/core';

// Compile styles
async function buildStyles() {
  await $`sass src/scss/main.scss dist/css/app.css --compressed`;
  console.log('✅ Styles compiled');
}

// Build scripts
async function buildScripts() {
  const files = await glob('src/js/**/*.js');
  await $`esbuild ${files.join(' ')} --bundle --minify --outfile=dist/js/app.js`;
  console.log('✅ Scripts bundled');
}

// Run both in parallel
await Promise.all([buildStyles(), buildScripts()]);
```

**Benefits:**
- Native TypeScript with type safety
- Direct tool invocation (no wrapper plugins)
- Multi-environment execution
- Better performance (no streaming overhead)
- Modern async/await patterns
- Integrated file watching

## Core Concepts Mapping

### Gulp/Grunt → Xec

| Gulp/Grunt Concept | Xec Equivalent | Description |
|--------------------|----------------|-------------|
| Task | Task/Script | Unit of work |
| gulp.src() | glob() | File selection |
| .pipe() | Shell pipes or await | Command chaining |
| gulp.dest() | File operations | Output handling |
| gulp.watch() | watch command | File monitoring |
| gulp.series() | Sequential steps | Task ordering |
| gulp.parallel() | Promise.all() | Parallel execution |
| Plugins | Direct tools | No wrapper needed |

## Common Task Migrations

### 1. Style Processing

**Gulp:**
```javascript
const sass = require('gulp-sass')(require('sass'));
const autoprefixer = require('gulp-autoprefixer');
const cleanCSS = require('gulp-clean-css');

gulp.task('styles', () => {
  return gulp.src('src/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(autoprefixer())
    .pipe(cleanCSS())
    .pipe(gulp.dest('dist/css'));
});
```

**Xec Script:**
```typescript
// scripts/styles.ts
import { $, glob } from '@xec-sh/core';
import path from 'path';

export async function buildStyles() {
  const sassFiles = await glob('src/scss/**/*.scss');
  
  for (const file of sassFiles) {
    const output = file
      .replace('src/scss', 'dist/css')
      .replace('.scss', '.css');
    
    // Compile SASS, add prefixes, and minify
    await $`sass ${file} ${output} --compressed`;
    await $`postcss ${output} --use autoprefixer -o ${output}`;
  }
  
  console.log(`✅ Compiled ${sassFiles.length} style files`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await buildStyles();
}
```

### 2. JavaScript Bundling

**Grunt:**
```javascript
grunt.initConfig({
  concat: {
    dist: {
      src: ['src/js/lib/*.js', 'src/js/app.js'],
      dest: 'dist/js/bundle.js'
    }
  },
  uglify: {
    dist: {
      files: {
        'dist/js/bundle.min.js': ['dist/js/bundle.js']
      }
    }
  },
  babel: {
    options: {
      presets: ['@babel/preset-env']
    },
    dist: {
      files: {
        'dist/js/app.js': 'src/js/app.js'
      }
    }
  }
});
```

**Xec Script:**
```typescript
// scripts/bundle.ts
import { $, glob } from '@xec-sh/core';

export async function bundleScripts() {
  // Use modern bundler instead of concat/uglify
  await $`esbuild src/js/app.js \
    --bundle \
    --minify \
    --sourcemap \
    --target=es2020 \
    --outfile=dist/js/bundle.min.js`;
  
  // Or use webpack/rollup if preferred
  // await $`webpack --mode production`;
  
  console.log('✅ JavaScript bundled and minified');
}
```

### 3. Image Optimization

**Gulp:**
```javascript
const imagemin = require('gulp-imagemin');

gulp.task('images', () => {
  return gulp.src('src/images/**/*')
    .pipe(imagemin([
      imagemin.gifsicle({interlaced: true}),
      imagemin.mozjpeg({quality: 75}),
      imagemin.optipng({optimizationLevel: 5}),
      imagemin.svgo()
    ]))
    .pipe(gulp.dest('dist/images'));
});
```

**Xec Script:**
```typescript
// scripts/images.ts
import { $, glob } from '@xec-sh/core';
import path from 'path';
import { mkdir } from 'fs/promises';

export async function optimizeImages() {
  const images = await glob('src/images/**/*.{jpg,png,gif,svg}');
  
  // Ensure output directory exists
  await mkdir('dist/images', { recursive: true });
  
  // Process images in parallel with concurrency limit
  const batchSize = 5;
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (image) => {
      const output = image.replace('src/', 'dist/');
      const dir = path.dirname(output);
      
      await mkdir(dir, { recursive: true });
      
      // Use sharp or imagemin CLI
      await $`imagemin ${image} --out-dir=${dir}`;
    }));
  }
  
  console.log(`✅ Optimized ${images.length} images`);
}
```

### 4. File Watching

**Gulp:**
```javascript
gulp.task('watch', () => {
  gulp.watch('src/scss/**/*.scss', gulp.series('styles'));
  gulp.watch('src/js/**/*.js', gulp.series('scripts'));
  gulp.watch('src/images/**/*', gulp.series('images'));
});
```

**Xec Configuration:**
```yaml
# .xec/config.yaml
tasks:
  watch:styles:
    command: xec watch --pattern "src/scss/**/*.scss" --exec "xec build:styles"
    
  watch:scripts:
    command: xec watch --pattern "src/js/**/*.js" --exec "xec build:scripts"
    
  watch:all:
    parallel: true
    steps:
      - command: xec watch:styles
      - command: xec watch:scripts
```

**Xec Script:**
```typescript
// scripts/watch.ts
import { watch } from '@xec-sh/core';
import { buildStyles } from './styles';
import { bundleScripts } from './bundle';

// Watch multiple patterns
watch({
  'src/scss/**/*.scss': buildStyles,
  'src/js/**/*.js': bundleScripts,
  'src/images/**/*': () => $`xec optimize:images`
});

console.log('👀 Watching for changes...');
```

### 5. Clean Task

**Grunt:**
```javascript
grunt.initConfig({
  clean: {
    dist: ['dist/**/*', 'tmp/**/*'],
    cache: ['.sass-cache', 'node_modules/.cache']
  }
});
```

**Xec Script:**
```typescript
// scripts/clean.ts
import { rm } from 'fs/promises';
import { $, glob } from '@xec-sh/core';

export async function clean() {
  const dirs = ['dist', 'tmp', '.sass-cache', 'node_modules/.cache'];
  
  await Promise.all(
    dirs.map(dir => 
      rm(dir, { recursive: true, force: true })
    )
  );
  
  // Clean specific file patterns
  const tempFiles = await glob('**/*.tmp');
  await Promise.all(
    tempFiles.map(file => rm(file))
  );
  
  console.log('🧹 Cleaned build artifacts');
}
```

## Complex Workflow Migration

### Gulp Workflow Example

```javascript
// gulpfile.js
const gulp = require('gulp');
const sass = require('gulp-sass');
const browserSync = require('browser-sync').create();
const useref = require('gulp-useref');
const gulpIf = require('gulp-if');
const uglify = require('gulp-uglify');
const cssnano = require('gulp-cssnano');
const del = require('del');
const runSequence = require('run-sequence');

// Development tasks
gulp.task('sass', () => {
  return gulp.src('app/scss/**/*.scss')
    .pipe(sass())
    .pipe(gulp.dest('app/css'))
    .pipe(browserSync.reload({
      stream: true
    }));
});

gulp.task('browserSync', () => {
  browserSync.init({
    server: {
      baseDir: 'app'
    }
  });
});

gulp.task('watch', ['browserSync', 'sass'], () => {
  gulp.watch('app/scss/**/*.scss', ['sass']);
  gulp.watch('app/*.html', browserSync.reload);
  gulp.watch('app/js/**/*.js', browserSync.reload);
});

// Production tasks
gulp.task('useref', () => {
  return gulp.src('app/*.html')
    .pipe(useref())
    .pipe(gulpIf('*.js', uglify()))
    .pipe(gulpIf('*.css', cssnano()))
    .pipe(gulp.dest('dist'));
});

gulp.task('images', () => {
  return gulp.src('app/images/**/*.+(png|jpg|gif|svg)')
    .pipe(imagemin())
    .pipe(gulp.dest('dist/images'));
});

gulp.task('fonts', () => {
  return gulp.src('app/fonts/**/*')
    .pipe(gulp.dest('dist/fonts'));
});

gulp.task('clean:dist', () => {
  return del.sync('dist');
});

gulp.task('build', (callback) => {
  runSequence('clean:dist', 
    ['sass', 'useref', 'images', 'fonts'],
    callback
  );
});

gulp.task('default', ['watch']);
```

### Migrated to Xec

```yaml
# .xec/config.yaml
tasks:
  dev:
    description: Start development server with watch
    parallel: true
    steps:
      - name: Build styles
        command: xec build:styles --watch
      - name: Start server
        command: xec serve
        
  build:
    description: Production build
    steps:
      - name: Clean
        command: xec clean
      - name: Build assets
        parallel: true
        steps:
          - command: xec build:styles --production
          - command: xec build:scripts --production
          - command: xec optimize:images
          - command: xec copy:fonts
      - name: Generate HTML
        command: xec build:html
        
  serve:
    command: browser-sync start --server app --files "app/**/*"
```

```typescript
// scripts/build.ts
import { $, glob, fs } from '@xec-sh/core';
import path from 'path';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

export async function buildStyles() {
  const sassFiles = await glob('app/scss/**/*.scss');
  
  for (const file of sassFiles) {
    const output = file
      .replace('app/scss', isProduction ? 'dist/css' : 'app/css')
      .replace('.scss', '.css');
    
    const commands = [
      `sass ${file} ${output}`,
      isProduction && `postcss ${output} --use cssnano -o ${output}`
    ].filter(Boolean);
    
    for (const cmd of commands) {
      await $`${cmd}`;
    }
  }
  
  console.log('✅ Styles built');
}

export async function buildScripts() {
  const target = isProduction ? 'dist' : 'app';
  
  await $`esbuild app/js/main.js \
    --bundle \
    ${isProduction ? '--minify' : ''} \
    --sourcemap \
    --outfile=${target}/js/bundle.js`;
  
  console.log('✅ Scripts built');
}

export async function buildHtml() {
  const html = await fs.readFile('app/index.html', 'utf-8');
  
  // Simple asset processing
  const processed = html
    .replace(/<!-- build:css (.+?) -->/g, '<link rel="stylesheet" href="$1">')
    .replace(/<!-- build:js (.+?) -->/g, '<script src="$1"></script>');
  
  await fs.writeFile('dist/index.html', processed);
  console.log('✅ HTML processed');
}

export async function optimizeImages() {
  const images = await glob('app/images/**/*.{jpg,png,gif,svg}');
  
  await Promise.all(
    images.map(async (image) => {
      const output = image.replace('app/', 'dist/');
      await fs.mkdir(path.dirname(output), { recursive: true });
      await $`imagemin ${image} --out-dir=${path.dirname(output)}`;
    })
  );
  
  console.log(`✅ Optimized ${images.length} images`);
}

export async function copyFonts() {
  await $`xec copy app/fonts/ dist/fonts/`;
  console.log('✅ Fonts copied');
}

export async function clean() {
  await fs.rm('dist', { recursive: true, force: true });
  console.log('🧹 Cleaned dist directory');
}

// Main build orchestration
export async function build() {
  await clean();
  
  await Promise.all([
    buildStyles(),
    buildScripts(),
    optimizeImages(),
    copyFonts()
  ]);
  
  await buildHtml();
  
  console.log('🎉 Build complete!');
}

// Watch mode
if (isWatch) {
  const { watch } = await import('@xec-sh/core');
  
  watch({
    'app/scss/**/*.scss': buildStyles,
    'app/js/**/*.js': buildScripts,
    'app/images/**/*': optimizeImages
  });
  
  console.log('👀 Watching for changes...');
}
```

## Stream Processing Alternative

If you prefer Gulp's streaming approach, you can create similar patterns:

```typescript
// scripts/stream-example.ts
import { $, glob } from '@xec-sh/core';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { Transform } from 'stream';

// Create a transform stream
function createMinifyStream() {
  return new Transform({
    async transform(chunk, encoding, callback) {
      // Process chunk
      const minified = await minifyCode(chunk.toString());
      callback(null, minified);
    }
  });
}

// Use pipeline for streaming
async function processLargeFile() {
  await pipeline(
    createReadStream('src/large-file.js'),
    createMinifyStream(),
    createWriteStream('dist/large-file.min.js')
  );
}
```

## Plugin Replacement Guide

### Common Gulp/Grunt Plugins → Direct Tools

| Gulp/Grunt Plugin | Xec Replacement | Command Example |
|-------------------|-----------------|-----------------|
| gulp-sass | sass CLI | `sass input.scss output.css` |
| gulp-uglify | terser/esbuild | `terser input.js -o output.js` |
| gulp-concat | cat/esbuild | `cat file1.js file2.js > bundle.js` |
| gulp-autoprefixer | postcss | `postcss file.css --use autoprefixer` |
| gulp-imagemin | imagemin-cli | `imagemin images/* --out-dir=dist` |
| gulp-babel | babel CLI | `babel src -d dist` |
| gulp-eslint | eslint | `eslint src/**/*.js` |
| gulp-rename | mv/cp | `cp file.js file.min.js` |
| browser-sync | browser-sync | `browser-sync start` |
| gulp-sourcemaps | Built into tools | `esbuild --sourcemap` |

## Migration Strategy

### Phase 1: Assessment
1. List all Gulp/Grunt tasks
2. Identify plugin dependencies
3. Map to equivalent CLI tools
4. Plan migration order

### Phase 2: Parallel Implementation
```json
// package.json - Keep both during transition
{
  "scripts": {
    "build:gulp": "gulp build",
    "build:xec": "xec build",
    "build": "npm run build:xec"
  }
}
```

### Phase 3: Incremental Migration

**Week 1-2: Core Tasks**
- Build tasks
- Clean tasks
- Copy tasks

**Week 3-4: Complex Workflows**
- Watch tasks
- Development server
- Production builds

**Week 5: Optimization**
- Performance tuning
- Parallel execution
- Error handling

### Phase 4: Cleanup
- Remove Gulp/Grunt dependencies
- Delete old config files
- Update documentation

## Performance Comparison

### Build Time Improvements

```typescript
// Measure build performance
import { performance } from 'perf_hooks';

async function benchmarkBuild() {
  const start = performance.now();
  
  // Parallel execution with Xec
  await Promise.all([
    buildStyles(),
    buildScripts(),
    optimizeImages()
  ]);
  
  const end = performance.now();
  console.log(`Build completed in ${(end - start) / 1000}s`);
  
  // Typical results:
  // Gulp: 12-15s (sequential plugins)
  // Xec: 4-6s (parallel, direct tools)
}
```

## Advanced Features After Migration

### 1. Multi-Environment Builds

```typescript
// Build for different environments
const env = process.env.NODE_ENV || 'development';

await $`webpack --mode ${env}`;

if (env === 'production') {
  // Deploy to production servers
  await on('production-servers', 'systemctl restart app');
}
```

### 2. Conditional Processing

```typescript
// Smart rebuilds based on changes
import { createHash } from 'crypto';

const cache = new Map();

async function shouldRebuild(file: string): Promise<boolean> {
  const content = await fs.readFile(file);
  const hash = createHash('md5').update(content).digest('hex');
  
  if (cache.get(file) !== hash) {
    cache.set(file, hash);
    return true;
  }
  
  return false;
}
```

### 3. Remote Execution

```typescript
// Build locally, deploy remotely
await $`npm run build`;
await on('staging-server', 'docker build -t app .');
await on('staging-server', 'docker run -d app');
```

## Common Migration Issues

### 1. Plugin Dependencies
- Gulp/Grunt plugins may have unique features
- Research CLI alternatives or Node packages
- Some functionality may need custom implementation

### 2. Configuration Complexity
- Gulp/Grunt configs can be very complex
- Break down into smaller, focused scripts
- Use TypeScript for better organization

### 3. Streaming vs Promises
- Gulp uses streams extensively
- Xec uses promises/async-await
- Can use Node streams when needed

## Summary

Migrating from Gulp/Grunt to Xec provides:
- ✅ Direct tool usage (no plugin overhead)
- ✅ TypeScript with full type safety
- ✅ Better performance through parallelization
- ✅ Multi-environment execution
- ✅ Modern async/await patterns
- ✅ Simplified dependency management

Start by migrating simple tasks, then gradually move complex workflows to experience the benefits of Xec's modern approach!