/**
 * Docker Build Fluent API
 */

import { DockerEphemeralFluentAPI } from './base.js';

import type { FluentAPIBuilder, DockerBuildConfig } from './types.js';
import type { ExecutionEngine } from '../../../core/execution-engine.js';

/**
 * Docker Build Fluent API
 * Provides a chainable interface for building Docker images
 */
export class DockerBuildFluentAPI implements FluentAPIBuilder<DockerBuildConfig> {
  private config: Partial<DockerBuildConfig>;

  constructor(
    private engine: ExecutionEngine,
    context: string,
    tag?: string
  ) {
    this.config = { context, tag };
  }

  /**
   * Reset configuration
   */
  reset(): this {
    this.config = { context: this.config.context };
    return this;
  }

  /**
   * Set build context
   */
  context(path: string): this {
    this.config.context = path;
    return this;
  }

  /**
   * Set Dockerfile path
   */
  dockerfile(path: string): this {
    this.config.dockerfile = path;
    return this;
  }

  /**
   * Set image tag
   */
  tag(tag: string): this {
    this.config.tag = tag;
    return this;
  }

  /**
   * Add build arguments
   */
  buildArgs(args: Record<string, string>): this {
    this.config.buildArgs = { ...this.config.buildArgs, ...args };
    return this;
  }

  /**
   * Add single build argument
   */
  buildArg(key: string, value: string): this {
    this.config.buildArgs = { ...this.config.buildArgs, [key]: value };
    return this;
  }

  /**
   * Set build target (for multi-stage builds)
   */
  target(target: string): this {
    this.config.target = target;
    return this;
  }

  /**
   * Set platform (e.g., linux/amd64, linux/arm64)
   */
  platform(platform: string): this {
    this.config.platform = platform;
    return this;
  }

  /**
   * Disable build cache
   */
  noCache(noCache = true): this {
    this.config.noCache = noCache;
    return this;
  }

  /**
   * Always pull base images
   */
  pull(pull = true): this {
    this.config.pull = pull;
    return this;
  }

  /**
   * Set build progress output format
   */
  progress(progress: 'auto' | 'plain' | 'tty'): this {
    this.config.progress = progress;
    return this;
  }

  /**
   * Add build secrets
   */
  secrets(secrets: Record<string, string>): this {
    this.config.secrets = { ...this.config.secrets, ...secrets };
    return this;
  }

  /**
   * Add single build secret
   */
  secret(id: string, src: string): this {
    this.config.secrets = { ...this.config.secrets, [id]: src };
    return this;
  }

  /**
   * Set SSH agent socket or keys for build
   */
  ssh(ssh: string): this {
    this.config.ssh = ssh;
    return this;
  }

  /**
   * Add cache sources
   */
  cacheFrom(sources: string[]): this {
    this.config.cacheFrom = [...(this.config.cacheFrom || []), ...sources];
    return this;
  }

  /**
   * Add cache destinations
   */
  cacheTo(destinations: string[]): this {
    this.config.cacheTo = [...(this.config.cacheTo || []), ...destinations];
    return this;
  }

  /**
   * Set build outputs
   */
  outputs(outputs: string[]): this {
    this.config.outputs = outputs;
    return this;
  }

  /**
   * Add labels to the image
   */
  labels(labels: Record<string, string>): this {
    this.config.labels = { ...this.config.labels, ...labels };
    return this;
  }

  /**
   * Add single label
   */
  label(key: string, value: string): this {
    this.config.labels = { ...this.config.labels, [key]: value };
    return this;
  }

  /**
   * Validate build configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.context) {
      errors.push('Build context is required');
    }

    if (this.config.platform && !this.config.platform.match(/^[a-z]+\/[a-z0-9]+$/)) {
      errors.push(`Invalid platform format: ${this.config.platform}`);
    }

    if (this.config.progress && !['auto', 'plain', 'tty'].includes(this.config.progress)) {
      errors.push(`Invalid progress format: ${this.config.progress}`);
    }

    return errors;
  }

  /**
   * Build configuration object
   */
  build(): DockerBuildConfig {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid build configuration: ${errors.join(', ')}`);
    }
    return this.config as DockerBuildConfig;
  }

  /**
   * Execute the build
   */
  async execute(): Promise<string> {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid build configuration: ${errors.join(', ')}`);
    }

    // Build command arguments
    const args = ['build'];

    // Tag
    if (this.config.tag) {
      args.push('-t', this.config.tag);
    }

    // Dockerfile
    if (this.config.dockerfile) {
      args.push('-f', this.config.dockerfile);
    }

    // Build arguments
    if (this.config.buildArgs) {
      for (const [key, value] of Object.entries(this.config.buildArgs)) {
        args.push('--build-arg', `${key}=${value}`);
      }
    }

    // Target
    if (this.config.target) {
      args.push('--target', this.config.target);
    }

    // Platform
    if (this.config.platform) {
      args.push('--platform', this.config.platform);
    }

    // No cache
    if (this.config.noCache) {
      args.push('--no-cache');
    }

    // Pull
    if (this.config.pull) {
      args.push('--pull');
    }

    // Progress
    if (this.config.progress) {
      args.push('--progress', this.config.progress);
    }

    // Secrets
    if (this.config.secrets) {
      for (const [id, src] of Object.entries(this.config.secrets)) {
        args.push('--secret', `id=${id},src=${src}`);
      }
    }

    // SSH
    if (this.config.ssh) {
      args.push('--ssh', this.config.ssh);
    }

    // Cache from
    if (this.config.cacheFrom) {
      for (const source of this.config.cacheFrom) {
        args.push('--cache-from', source);
      }
    }

    // Cache to
    if (this.config.cacheTo) {
      for (const dest of this.config.cacheTo) {
        args.push('--cache-to', dest);
      }
    }

    // Outputs
    if (this.config.outputs) {
      for (const output of this.config.outputs) {
        args.push('--output', output);
      }
    }

    // Labels
    if (this.config.labels) {
      for (const [key, value] of Object.entries(this.config.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    // Build context (must be last)
    args.push(this.config.context!);

    // Execute build command
    const cmdStr = args.join(' ');
    const result = await this.engine.run`docker ${cmdStr}`;

    if (!result.ok) {
      throw new Error(`Docker build failed: ${result.stderr}`);
    }

    // Extract image ID from output if no tag was specified
    if (!this.config.tag) {
      const match = result.stdout.match(/Successfully built ([a-f0-9]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    return this.config.tag ?? '';
  }

  /**
   * Build and create ephemeral container with the built image
   */
  async buildAndRun(imageTag?: string): Promise<DockerEphemeralFluentAPI> {
    // Execute the build
    const builtImage = await this.execute();

    // Use provided tag, configured tag, or built image ID
    const tag = imageTag || this.config.tag || builtImage;
    if (!tag) {
      throw new Error('[xec-core] Image tag required for ephemeral container after build');
    }

    // Return fluent API configured for ephemeral container
    return new DockerEphemeralFluentAPI(this.engine, tag);
  }

  /**
   * Build and push to registry
   */
  async buildAndPush(registry?: string): Promise<void> {
    // Execute the build
    await this.execute();

    if (!this.config.tag) {
      throw new Error('[xec-core] Image tag required for push');
    }

    // Prepare push tag
    let pushTag = this.config.tag;
    if (registry) {
      pushTag = `${registry}/${this.config.tag}`;
      // Re-tag if registry is specified
      await this.engine.run`docker tag ${this.config.tag} ${pushTag}`;
    }

    // Push to registry
    const pushResult = await this.engine.run`docker push ${pushTag}`;

    if (!pushResult.ok) {
      throw new Error(`Docker push failed: ${pushResult.stderr}`);
    }
  }

  /**
   * Build with BuildKit
   */
  async buildWithBuildKit(): Promise<string> {
    // Enable BuildKit
    process.env['DOCKER_BUILDKIT'] = '1';

    try {
      return await this.execute();
    } finally {
      // Restore environment
      delete process.env['DOCKER_BUILDKIT'];
    }
  }

  /**
   * Build multi-platform image
   */
  async buildMultiPlatform(platforms: string[]): Promise<void> {
    // Ensure buildx is available
    await this.ensureBuildx();

    // Build command with buildx
    const args = ['buildx', 'build'];

    // Platforms
    args.push('--platform', platforms.join(','));

    // Tag
    if (this.config.tag) {
      args.push('-t', this.config.tag);
    }

    // Other options (similar to execute())
    if (this.config.dockerfile) {
      args.push('-f', this.config.dockerfile);
    }

    if (this.config.buildArgs) {
      for (const [key, value] of Object.entries(this.config.buildArgs)) {
        args.push('--build-arg', `${key}=${value}`);
      }
    }

    if (this.config.target) {
      args.push('--target', this.config.target);
    }

    if (this.config.noCache) {
      args.push('--no-cache');
    }

    if (this.config.pull) {
      args.push('--pull');
    }

    // Push is required for multi-platform builds
    args.push('--push');

    // Build context
    args.push(this.config.context!);

    // Execute buildx command
    const cmdStr = args.join(' ');
    const result = await this.engine.run`docker ${cmdStr}`;

    if (!result.ok) {
      throw new Error(`Docker buildx failed: ${result.stderr}`);
    }
  }

  /**
   * Ensure buildx is available and configured
   */
  private async ensureBuildx(): Promise<void> {
    // Check if buildx is available
    const checkResult = await this.engine.run`docker buildx version`.nothrow();

    if (checkResult.exitCode !== 0) {
      throw new Error('[xec-core] Docker buildx is not available');
    }

    // Create builder instance if not exists
    const builderName = 'xec-buildx-builder';
    const inspectResult = await this.engine.run`docker buildx inspect ${builderName}`.nothrow();

    if (inspectResult.exitCode !== 0) {
      // Create new builder
      await this.engine.run`docker buildx create --name ${builderName} --use`;
    } else {
      // Use existing builder
      await this.engine.run`docker buildx use ${builderName}`;
    }
  }

  /**
   * Scan built image for vulnerabilities
   */
  async scanImage(imageTag?: string): Promise<string> {
    const image = imageTag || this.config.tag;
    if (!image) {
      throw new Error('[xec-core] Image tag required for scanning');
    }

    // Try different scanners in order of preference
    const scanners = [
      { cmd: `docker scout cves ${image}`, name: 'Docker Scout' },
      { cmd: `trivy image ${image}`, name: 'Trivy' },
      { cmd: `docker scan ${image}`, name: 'Docker Scan' }
    ];

    for (const scanner of scanners) {
      const result = await this.engine.run`${scanner.cmd}`.nothrow();
      if (result.exitCode === 0) {
        return result.stdout;
      }
    }

    throw new Error('[xec-core] No vulnerability scanner available');
  }

  /**
   * Get image size and layers
   */
  async inspectSize(): Promise<{ size: string; layers: number }> {
    if (!this.config.tag) {
      throw new Error('[xec-core] Image tag required for inspection');
    }

    const result = await this.engine.run`docker image inspect ${this.config.tag} --format '{{.Size}},{{len .RootFS.Layers}}'`;
    const [sizeBytes, layerCount] = result.stdout.trim().split(',');

    // Convert size to human-readable format
    const size = this.formatBytes(parseInt(sizeBytes || '0'));

    return { size, layers: parseInt(layerCount || '0') };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}