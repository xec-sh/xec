#!/usr/bin/env node
/**
 * Build Automation with @xec-js/ush
 * 
 * Real-world examples of automating build processes using @xec-js/ush.
 */

import { $ } from '@xec-js/ush';
import * as path from 'path';
import * as fs from 'fs/promises';

// ===== Build Configuration =====
interface BuildConfig {
  name: string;
  type: 'node' | 'typescript' | 'react' | 'vue' | 'python' | 'go' | 'rust';
  sourceDir: string;
  outputDir: string;
  entry?: string;
  dependencies?: string[];
  env?: Record<string, string>;
  scripts?: {
    prebuild?: string;
    build: string;
    postbuild?: string;
    test?: string;
    lint?: string;
  };
}

// ===== Build Pipeline Class =====
class BuildPipeline {
  private startTime: number = 0;
  private steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    duration?: number;
    error?: string;
  }> = [];

  constructor(private config: BuildConfig) { }

  // Initialize build environment
  private async initialize() {
    this.startTime = Date.now();
    console.log(`🏗️  Starting build for ${this.config.name}\n`);

    // Create output directory
    await $`mkdir -p ${this.config.outputDir}`;

    // Set up environment
    if (this.config.env) {
      process.env = { ...process.env, ...this.config.env };
    }
  }

  // Add a build step
  private addStep(name: string) {
    this.steps.push({ name, status: 'pending' });
  }

  // Execute a build step
  private async executeStep(
    name: string,
    operation: () => Promise<void>,
    optional = false
  ) {
    const step = this.steps.find(s => s.name === name);
    if (!step) {
      this.addStep(name);
      return this.executeStep(name, operation, optional);
    }

    console.log(`\n📋 ${name}...`);
    step.status = 'running';
    const stepStart = Date.now();

    try {
      await operation();
      step.status = 'success';
      step.duration = Date.now() - stepStart;
      console.log(`✅ ${name} completed (${step.duration}ms)`);
    } catch (error: any) {
      if (optional) {
        step.status = 'skipped';
        console.log(`⏭️  ${name} skipped (optional)`);
      } else {
        step.status = 'failed';
        step.error = error.message;
        step.duration = Date.now() - stepStart;
        console.error(`❌ ${name} failed: ${error.message}`);
        throw error;
      }
    }
  }

  // Clean build artifacts
  async clean() {
    await this.executeStep('Clean', async () => {
      await $`rm -rf ${this.config.outputDir}/*`.nothrow();

      // Type-specific cleaning
      switch (this.config.type) {
        case 'node':
        case 'typescript':
        case 'react':
        case 'vue':
          await $`rm -rf node_modules .cache dist build coverage`.nothrow();
          break;
        case 'python':
          await $`find . -type d -name __pycache__ -exec rm -rf {} +`.nothrow();
          await $`rm -rf .pytest_cache .mypy_cache *.egg-info dist build`.nothrow();
          break;
        case 'go':
          await $`go clean -cache -testcache`.nothrow();
          break;
        case 'rust':
          await $`cargo clean`.nothrow();
          break;
      }
    });
  }

  // Install dependencies
  async installDependencies() {
    await this.executeStep('Install Dependencies', async () => {
      switch (this.config.type) {
        case 'node':
        case 'typescript':
        case 'react':
        case 'vue':
          // Detect package manager
          if (await this.fileExists('yarn.lock')) {
            await $`yarn install --frozen-lockfile`;
          } else if (await this.fileExists('pnpm-lock.yaml')) {
            await $`pnpm install --frozen-lockfile`;
          } else {
            await $`npm ci`;
          }
          break;

        case 'python':
          // Create virtual environment if needed
          if (!await this.fileExists('venv')) {
            await $`python -m venv venv`;
          }
          await $`./venv/bin/pip install -r requirements.txt`;
          break;

        case 'go':
          await $`go mod download`;
          break;

        case 'rust':
          // Cargo downloads dependencies automatically
          break;
      }
    });
  }

  // Run linting
  async lint() {
    await this.executeStep('Lint', async () => {
      if (this.config.scripts?.lint) {
        await $`${this.config.scripts.lint}`;
      } else {
        switch (this.config.type) {
          case 'typescript':
          case 'react':
            await $`npx eslint ${this.config.sourceDir} --ext .ts,.tsx,.js,.jsx`;
            break;
          case 'python':
            await $`./venv/bin/flake8 ${this.config.sourceDir}`;
            await $`./venv/bin/mypy ${this.config.sourceDir}`;
            break;
          case 'go':
            await $`go vet ./...`;
            await $`golint ./...`.nothrow();
            break;
          case 'rust':
            await $`cargo clippy -- -D warnings`;
            break;
        }
      }
    }, true); // Optional step
  }

  // Run tests
  async test() {
    await this.executeStep('Test', async () => {
      if (this.config.scripts?.test) {
        await $`${this.config.scripts.test}`;
      } else {
        switch (this.config.type) {
          case 'node':
          case 'typescript':
          case 'react':
          case 'vue':
            await $`npm test`;
            break;
          case 'python':
            await $`./venv/bin/pytest`;
            break;
          case 'go':
            await $`go test -v ./...`;
            break;
          case 'rust':
            await $`cargo test`;
            break;
        }
      }
    }, true); // Optional step
  }

  // Main build step
  async build() {
    // Pre-build hook
    if (this.config.scripts?.prebuild) {
      await this.executeStep('Pre-build', async () => {
        await $`${this.config.scripts!.prebuild}`;
      });
    }

    // Main build
    await this.executeStep('Build', async () => {
      if (this.config.scripts?.build) {
        await $`${this.config.scripts.build}`;
      } else {
        switch (this.config.type) {
          case 'typescript':
            await $`npx tsc`;
            break;
          case 'react':
            await $`npm run build`;
            break;
          case 'vue':
            await $`npm run build`;
            break;
          case 'python':
            await $`./venv/bin/python -m py_compile ${this.config.sourceDir}/**/*.py`;
            break;
          case 'go':
            const output = path.join(this.config.outputDir, this.config.name);
            await $`go build -o ${output} ${this.config.entry || '.'}`;
            break;
          case 'rust':
            await $`cargo build --release`;
            await $`cp target/release/${this.config.name} ${this.config.outputDir}/`;
            break;
        }
      }
    });

    // Post-build hook
    if (this.config.scripts?.postbuild) {
      await this.executeStep('Post-build', async () => {
        await $`${this.config.scripts!.postbuild}`;
      });
    }
  }

  // Bundle assets
  async bundle() {
    await this.executeStep('Bundle', async () => {
      switch (this.config.type) {
        case 'react':
        case 'vue':
          // Assets are usually bundled during build
          break;
        case 'node':
        case 'typescript':
          // Bundle with esbuild or webpack if configured
          if (await this.fileExists('webpack.config.js')) {
            await $`npx webpack --mode production`;
          } else if (await this.fileExists('esbuild.config.js')) {
            await $`npx esbuild ${this.config.entry} --bundle --outdir=${this.config.outputDir}`;
          }
          break;
      }
    }, true);
  }

  // Optimize build output
  async optimize() {
    await this.executeStep('Optimize', async () => {
      switch (this.config.type) {
        case 'react':
        case 'vue':
          // Minify JS
          await $`find ${this.config.outputDir} -name "*.js" -exec terser {} -o {} -c -m \\;`.nothrow();

          // Optimize images
          if (await $.which('optipng')) {
            await $`find ${this.config.outputDir} -name "*.png" -exec optipng -o7 {} \\;`.nothrow();
          }
          if (await $.which('jpegoptim')) {
            await $`find ${this.config.outputDir} -name "*.jpg" -exec jpegoptim -m85 {} \\;`.nothrow();
          }
          break;

        case 'go':
          // Strip debug symbols
          await $`strip ${this.config.outputDir}/${this.config.name}`.nothrow();
          break;

        case 'rust':
          // Rust release builds are already optimized
          break;
      }
    }, true);
  }

  // Generate documentation
  async generateDocs() {
    await this.executeStep('Generate Documentation', async () => {
      switch (this.config.type) {
        case 'typescript':
          if (await this.fileExists('typedoc.json')) {
            await $`npx typedoc`;
          }
          break;
        case 'python':
          if (await this.fileExists('docs/conf.py')) {
            await $`./venv/bin/sphinx-build -b html docs ${this.config.outputDir}/docs`;
          }
          break;
        case 'go':
          await $`go doc -all > ${this.config.outputDir}/docs.txt`.nothrow();
          break;
        case 'rust':
          await $`cargo doc --no-deps`;
          await $`cp -r target/doc ${this.config.outputDir}/`;
          break;
      }
    }, true);
  }

  // Create distribution package
  async package() {
    await this.executeStep('Package', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const packageName = `${this.config.name}-${timestamp}`;

      switch (this.config.type) {
        case 'node':
        case 'typescript':
          // Create tarball
          await $`tar -czf ${packageName}.tar.gz -C ${this.config.outputDir} .`;
          break;

        case 'react':
        case 'vue':
          // Create zip for web deployment
          await $`cd ${this.config.outputDir} && zip -r ../${packageName}.zip .`;
          break;

        case 'python':
          // Create wheel
          if (await this.fileExists('setup.py')) {
            await $`./venv/bin/python setup.py bdist_wheel`;
          }
          break;

        case 'go':
          // Create archives for different platforms
          const platforms = [
            { GOOS: 'linux', GOARCH: 'amd64' },
            { GOOS: 'darwin', GOARCH: 'amd64' },
            { GOOS: 'windows', GOARCH: 'amd64' }
          ];

          for (const platform of platforms) {
            const ext = platform.GOOS === 'windows' ? '.exe' : '';
            const output = `${this.config.outputDir}/${this.config.name}-${platform.GOOS}-${platform.GOARCH}${ext}`;
            await $.env(platform)`go build -o ${output} ${this.config.entry || '.'}`;
          }
          break;
      }
    });
  }

  // Generate build report
  private async generateReport() {
    const duration = Date.now() - this.startTime;
    const successful = this.steps.filter(s => s.status === 'success').length;
    const failed = this.steps.filter(s => s.status === 'failed').length;
    const skipped = this.steps.filter(s => s.status === 'skipped').length;

    console.log('\n' + '='.repeat(50));
    console.log('📊 Build Report');
    console.log('='.repeat(50));
    console.log(`Build: ${this.config.name}`);
    console.log(`Type: ${this.config.type}`);
    console.log(`Total Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Steps: ${successful} successful, ${failed} failed, ${skipped} skipped`);
    console.log('\nStep Details:');

    for (const step of this.steps) {
      const icon = {
        success: '✅',
        failed: '❌',
        skipped: '⏭️',
        pending: '⏸️',
        running: '🔄'
      }[step.status];

      const time = step.duration ? ` (${step.duration}ms)` : '';
      console.log(`  ${icon} ${step.name}${time}`);
      if (step.error) {
        console.log(`     Error: ${step.error}`);
      }
    }

    console.log('='.repeat(50));

    // Save report to file
    const report = {
      build: this.config.name,
      type: this.config.type,
      timestamp: new Date().toISOString(),
      duration,
      steps: this.steps,
      success: failed === 0
    };

    await $`echo ${JSON.stringify(report, null, 2)} > ${this.config.outputDir}/build-report.json`;
  }

  // Helper to check if file exists
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  // Main pipeline execution
  async run(options: {
    clean?: boolean;
    test?: boolean;
    lint?: boolean;
    docs?: boolean;
    package?: boolean;
    optimize?: boolean;
  } = {}) {
    try {
      await this.initialize();

      if (options.clean) {
        await this.clean();
      }

      await this.installDependencies();

      if (options.lint) {
        await this.lint();
      }

      if (options.test) {
        await this.test();
      }

      await this.build();
      await this.bundle();

      if (options.optimize) {
        await this.optimize();
      }

      if (options.docs) {
        await this.generateDocs();
      }

      if (options.package) {
        await this.package();
      }

      await this.generateReport();

      console.log('\n🎉 Build completed successfully!');

    } catch (error) {
      await this.generateReport();
      console.error('\n💥 Build failed!');
      throw error;
    }
  }
}

// ===== Example: Multi-Project Build =====
async function buildMonorepo(rootPath: string) {
  console.log('🏗️  Building Monorepo\n');

  // Discover projects
  const packageJsons = await $`find ${rootPath} -name package.json -not -path "*/node_modules/*"`;
  const projects = packageJsons.stdout.trim().split('\n')
    .filter(p => p && p !== `${rootPath}/package.json`)
    .map(p => path.dirname(p));

  console.log(`Found ${projects.length} projects:`);
  projects.forEach(p => console.log(`  - ${path.relative(rootPath, p)}`));

  // Build dependency graph
  const dependencyGraph = new Map<string, string[]>();

  for (const project of projects) {
    const pkgJson = JSON.parse(await $`cat ${project}/package.json`.then(r => r.stdout));
    const deps = [
      ...Object.keys(pkgJson.dependencies || {}),
      ...Object.keys(pkgJson.devDependencies || {})
    ].filter(dep => dep.startsWith('@monorepo/'));

    dependencyGraph.set(project, deps);
  }

  // Topological sort for build order
  const buildOrder = topologicalSort(projects, dependencyGraph);

  console.log('\n📋 Build order:');
  buildOrder.forEach((p, i) => console.log(`  ${i + 1}. ${path.relative(rootPath, p)}`));

  // Build projects in order
  const results = [];

  for (const project of buildOrder) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Building: ${path.relative(rootPath, project)}`);
    console.log('='.repeat(50));

    const pkgJson = JSON.parse(await $`cat ${project}/package.json`.then(r => r.stdout));

    const config: BuildConfig = {
      name: pkgJson.name,
      type: detectProjectType(project),
      sourceDir: path.join(project, 'src'),
      outputDir: path.join(project, 'dist')
    };

    const pipeline = new BuildPipeline(config);

    try {
      await pipeline.run({
        clean: true,
        lint: true,
        test: true,
        optimize: true
      });
      results.push({ project, success: true });
    } catch (error) {
      results.push({ project, success: false, error });
      console.error(`Failed to build ${path.relative(rootPath, project)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Monorepo Build Summary');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.success).length;
  console.log(`Total: ${results.length} projects`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${results.length - successful}`);

  if (results.some(r => !r.success)) {
    console.log('\nFailed projects:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${path.relative(rootPath, r.project)}`);
    });
  }
}

// Helper: Detect project type
function detectProjectType(projectPath: string): BuildConfig['type'] {
  const files = [
    { file: 'tsconfig.json', type: 'typescript' as const },
    { file: 'package.json', type: 'node' as const },
    { file: 'go.mod', type: 'go' as const },
    { file: 'Cargo.toml', type: 'rust' as const },
    { file: 'requirements.txt', type: 'python' as const },
    { file: 'setup.py', type: 'python' as const }
  ];

  for (const { file, type } of files) {
    if (fs.access(path.join(projectPath, file)).then(() => true).catch(() => false)) {
      // Check for React/Vue
      if (type === 'node' || type === 'typescript') {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
          if (pkgJson.dependencies?.react) return 'react';
          if (pkgJson.dependencies?.vue) return 'vue';
        } catch { }
      }
      return type;
    }
  }

  return 'node'; // Default
}

// Helper: Topological sort
function topologicalSort(nodes: string[], dependencies: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(node: string) {
    if (visited.has(node)) return;
    visited.add(node);

    const deps = dependencies.get(node) || [];
    for (const dep of deps) {
      const depNode = nodes.find(n => n.endsWith(dep.replace('@monorepo/', '')));
      if (depNode) visit(depNode);
    }

    result.push(node);
  }

  for (const node of nodes) {
    visit(node);
  }

  return result;
}

// ===== Example: CI/CD Pipeline =====
async function cicdPipeline(config: BuildConfig) {
  console.log('🚀 CI/CD Pipeline\n');

  const pipeline = new BuildPipeline(config);

  // CI Stage
  console.log('📦 Continuous Integration Stage\n');

  try {
    await pipeline.run({
      clean: true,
      lint: true,
      test: true,
      optimize: false,
      package: false
    });

    console.log('\n✅ CI stage passed!');
  } catch (error) {
    console.error('\n❌ CI stage failed!');
    process.exit(1);
  }

  // CD Stage (only on main branch)
  const branch = await $`git branch --show-current`.then(r => r.stdout.trim());

  if (branch === 'main' || branch === 'master') {
    console.log('\n📦 Continuous Deployment Stage\n');

    // Build for production
    const prodConfig = {
      ...config,
      env: {
        ...config.env,
        NODE_ENV: 'production',
        BUILD_ENV: 'production'
      }
    };

    const prodPipeline = new BuildPipeline(prodConfig);

    await prodPipeline.run({
      clean: true,
      lint: false, // Already done in CI
      test: false, // Already done in CI
      optimize: true,
      docs: true,
      package: true
    });

    // Deploy (example)
    console.log('\n🚀 Deploying...');

    // Example: Deploy to S3
    if (config.type === 'react' || config.type === 'vue') {
      await $`aws s3 sync ${config.outputDir} s3://my-bucket/app --delete`;
      await $`aws cloudfront create-invalidation --distribution-id ABCD1234 --paths "/*"`;
    }

    // Example: Deploy to server
    if (config.type === 'node' || config.type === 'go') {
      const server = 'user@production-server.com';
      await $`rsync -avz ${config.outputDir}/ ${server}:/var/app/`;
      await $.ssh(server)`sudo systemctl restart app`;
    }

    console.log('\n✅ Deployment completed!');
  }
}

// ===== Demo Function =====
async function runDemo() {
  console.log('🏗️  Build Automation Demo\n');

  // Create a demo TypeScript project
  const demoDir = '/tmp/build-automation-demo';
  await $`rm -rf ${demoDir}`.nothrow();
  await $`mkdir -p ${demoDir}/src`;

  // Create package.json
  const packageJson = {
    name: 'build-demo',
    version: '1.0.0',
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      test: 'echo "Running tests..." && exit 0',
      lint: 'echo "Linting..." && exit 0'
    },
    devDependencies: {
      typescript: '^5.0.0'
    }
  };

  await $`echo ${JSON.stringify(packageJson, null, 2)} > ${demoDir}/package.json`;

  // Create tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: './dist',
      rootDir: './src',
      strict: true
    }
  };

  await $`echo ${JSON.stringify(tsConfig, null, 2)} > ${demoDir}/tsconfig.json`;

  // Create source file
  const sourceCode = `
console.log('Build automation demo!');

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

// Run if main module
if (require.main === module) {
  console.log(greet('World'));
}
`;

  await $`echo ${sourceCode} > ${demoDir}/src/index.ts`;

  // Run build pipeline
  const config: BuildConfig = {
    name: 'build-demo',
    type: 'typescript',
    sourceDir: `${demoDir}/src`,
    outputDir: `${demoDir}/dist`
  };

  const pipeline = new BuildPipeline(config);

  await $`cd ${demoDir}`;

  await pipeline.run({
    clean: true,
    lint: true,
    test: true,
    docs: true,
    package: true,
    optimize: true
  });

  // Show results
  console.log('\n📁 Build artifacts:');
  await $`ls -la ${demoDir}/dist`;

  // Cleanup
  console.log('\n🧹 Cleaning up demo...');
  await $`rm -rf ${demoDir}`;

  console.log('\n✅ Build automation demo completed!');
}

// Run demo if executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}