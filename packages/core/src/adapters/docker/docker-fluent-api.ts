import type { DockerOptions, ProcessPromise, ExecutionEngine, DockerEphemeralOptions } from '../../core/execution-engine.js';

/**
 * Fluent API for Docker operations
 * Provides a chainable interface for building Docker commands
 */
export class DockerFluentAPI {
  private options: Partial<DockerOptions> = {};
  
  constructor(private engine: ExecutionEngine) {}
  
  /**
   * Configure for ephemeral container execution
   * @param image Docker image to use
   */
  ephemeral(image: string): DockerFluentAPI {
    this.options = { ...this.options, image };
    return this;
  }
  
  /**
   * Configure for existing container execution
   * @param name Container name
   */
  container(name: string): DockerFluentAPI {
    this.options = { ...this.options, container: name };
    return this;
  }
  
  /**
   * Add volume mounts
   * @param volumes Array of volume mount strings (e.g., ['/host:/container'])
   */
  volumes(volumes: string[]): DockerFluentAPI {
    if ('image' in this.options) {
      (this.options as DockerEphemeralOptions).volumes = volumes;
    } else {
      console.warn('[xec-core] volumes() is only applicable for ephemeral containers');
    }
    return this;
  }
  
  /**
   * Set working directory
   * @param path Working directory path in container
   */
  workdir(path: string): DockerFluentAPI {
    this.options = { ...this.options, workdir: path };
    return this;
  }
  
  /**
   * Set user for command execution
   * @param user User (name or UID)
   */
  user(user: string): DockerFluentAPI {
    this.options = { ...this.options, user };
    return this;
  }
  
  /**
   * Set environment variables
   * @param env Environment variables
   */
  env(env: Record<string, string>): DockerFluentAPI {
    this.options = { ...this.options, env };
    return this;
  }
  
  /**
   * Set network for ephemeral containers
   * @param network Network name
   */
  network(network: string): DockerFluentAPI {
    if ('image' in this.options) {
      (this.options as DockerEphemeralOptions).network = network;
    } else {
      console.warn('[xec-core] network() is only applicable for ephemeral containers');
    }
    return this;
  }
  
  /**
   * Add port mappings for ephemeral containers
   * @param ports Array of port mappings (e.g., ['8080:80'])
   */
  ports(ports: string[]): DockerFluentAPI {
    if ('image' in this.options) {
      (this.options as DockerEphemeralOptions).ports = ports;
    } else {
      console.warn('[xec-core] ports() is only applicable for ephemeral containers');
    }
    return this;
  }
  
  /**
   * Add labels for ephemeral containers
   * @param labels Container labels
   */
  labels(labels: Record<string, string>): DockerFluentAPI {
    if ('image' in this.options) {
      (this.options as DockerEphemeralOptions).labels = labels;
    } else {
      console.warn('[xec-core] labels() is only applicable for ephemeral containers');
    }
    return this;
  }
  
  /**
   * Run container in privileged mode (ephemeral only)
   * @param privileged Whether to run privileged
   */
  privileged(privileged = true): DockerFluentAPI {
    if ('image' in this.options) {
      (this.options as DockerEphemeralOptions).privileged = privileged;
    } else {
      console.warn('[xec-core] privileged() is only applicable for ephemeral containers');
    }
    return this;
  }
  
  /**
   * Execute command (alias for run, better semantics for persistent containers)
   */
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    return this.run(strings, ...values);
  }
  
  /**
   * Run command (better semantics for ephemeral containers)
   */
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    // Validate that either image or container is set
    if (!('image' in this.options) && !('container' in this.options)) {
      throw new Error('[xec-core] Docker fluent API requires either ephemeral() or container() to be called first');
    }
    
    // Create the docker context with options
    const dockerEngine = this.engine.docker(this.options as DockerOptions);
    
    // If dockerEngine has a run method (old DockerContext API), use it
    if ('run' in dockerEngine && typeof (dockerEngine as any).run === 'function') {
      return (dockerEngine as any).run(strings, ...values);
    }
    
    // Otherwise, it's an ExecutionEngine, use its run method
    return (dockerEngine as ExecutionEngine).run(strings, ...values);
  }
  
  /**
   * Build Docker image (for future enhancement)
   * @param context Build context path
   * @param tag Image tag
   */
  build(context: string, tag?: string): DockerFluentBuildAPI {
    return new DockerFluentBuildAPI(this.engine, context, tag);
  }
}

/**
 * Fluent API for Docker build operations
 */
export class DockerFluentBuildAPI {
  private buildOptions: {
    context: string;
    tag?: string;
    dockerfile?: string;
    buildArgs?: Record<string, string>;
    target?: string;
    noCache?: boolean;
  };
  
  constructor(
    private engine: ExecutionEngine,
    context: string,
    tag?: string
  ) {
    this.buildOptions = { context, tag };
  }
  
  /**
   * Set Dockerfile path
   */
  dockerfile(path: string): DockerFluentBuildAPI {
    this.buildOptions.dockerfile = path;
    return this;
  }
  
  /**
   * Set build arguments
   */
  buildArgs(args: Record<string, string>): DockerFluentBuildAPI {
    this.buildOptions.buildArgs = args;
    return this;
  }
  
  /**
   * Set build target
   */
  target(target: string): DockerFluentBuildAPI {
    this.buildOptions.target = target;
    return this;
  }
  
  /**
   * Disable build cache
   */
  noCache(noCache = true): DockerFluentBuildAPI {
    this.buildOptions.noCache = noCache;
    return this;
  }
  
  /**
   * Execute the build
   */
  async execute(): Promise<void> {
    // Build command parts
    const args = ['build'];
    
    if (this.buildOptions.tag) {
      args.push('-t', this.buildOptions.tag);
    }
    
    if (this.buildOptions.dockerfile) {
      args.push('-f', this.buildOptions.dockerfile);
    }
    
    if (this.buildOptions.buildArgs) {
      for (const [key, value] of Object.entries(this.buildOptions.buildArgs)) {
        args.push('--build-arg', `${key}=${value}`);
      }
    }
    
    if (this.buildOptions.target) {
      args.push('--target', this.buildOptions.target);
    }
    
    if (this.buildOptions.noCache) {
      args.push('--no-cache');
    }
    
    args.push(this.buildOptions.context);
    
    // Execute build command using the engine's template literal support
    const commandStr = args.join(' ');
    // Create a synthetic template string array
    const strings = [`docker ${commandStr}`] as any;
    strings.raw = strings;
    const result = await this.engine.run(strings);
    if (!result.ok) {
      throw new Error(`Docker build failed: ${result.stderr}`);
    }
  }
  
  /**
   * Build and then create ephemeral container with the built image
   */
  async ephemeral(imageTag?: string): Promise<DockerFluentAPI> {
    // Execute the build first
    await this.execute();
    
    // Use the tag from build or provided imageTag
    const tag = imageTag || this.buildOptions.tag;
    if (!tag) {
      throw new Error('[xec-core] Image tag required for ephemeral container after build');
    }
    
    // Return fluent API configured for ephemeral container
    return new DockerFluentAPI(this.engine).ephemeral(tag);
  }
}