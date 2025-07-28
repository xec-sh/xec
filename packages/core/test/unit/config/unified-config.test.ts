import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { UnifiedConfigLoader } from '../../../src/config/unified-config.js';

describe('UnifiedConfigLoader', () => {
  let loader: UnifiedConfigLoader;
  let tempDir: string;
  
  beforeEach(async () => {
    // Reset the singleton instance
    (UnifiedConfigLoader as any).instance = undefined;
    loader = UnifiedConfigLoader.getInstance();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-test-'));
    
    // Mock environment
    delete process.env['XEC_CONFIG'];
    delete process.env['XEC_PROFILE'];
    delete process.env['XEC_TIMEOUT'];
    delete process.env['XEC_SHELL'];
    delete process.env['XEC_CWD'];
  });
  
  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  describe('load()', () => {
    it('should load empty config when no files exist', async () => {
      const config = await loader.load([path.join(tempDir, 'nonexistent.yaml')]);
      expect(config).toEqual({});
    });
    
    it('should load and parse valid YAML config', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      const configContent = `
name: test-config
description: Test configuration

defaults:
  timeout: 30s
  shell: /bin/bash
  env:
    NODE_ENV: production

hosts:
  prod:
    host: prod.example.com
    username: deploy
    port: 22

containers:
  app:
    name: myapp-prod
    image: myapp:latest

pods:
  web:
    name: web-deployment
    namespace: production

aliases:
  deploy: xec on prod deploy.sh
  logs: xec logs app --follow
`;
      
      await fs.writeFile(configPath, configContent);
      const config = await loader.load([configPath]);
      
      expect(config.name).toBe('test-config');
      expect(config.description).toBe('Test configuration');
      expect(config.defaults?.timeout).toBe('30s');
      expect(config.defaults?.shell).toBe('/bin/bash');
      expect(config.defaults?.env?.['NODE_ENV']).toBe('production');
      expect(config.hosts?.['prod']?.host).toBe('prod.example.com');
      expect(config.containers?.['app']?.name).toBe('myapp-prod');
      expect(config.pods?.['web']?.namespace).toBe('production');
      expect(config.aliases?.['deploy']).toBe('xec on prod deploy.sh');
    });
    
    it('should merge multiple config files', async () => {
      const globalConfig = path.join(tempDir, 'global.yaml');
      const localConfig = path.join(tempDir, 'local.yaml');
      
      await fs.writeFile(globalConfig, `
defaults:
  timeout: 60s
  shell: /bin/bash

hosts:
  global:
    host: global.example.com
    username: admin
`);
      
      await fs.writeFile(localConfig, `
defaults:
  timeout: 30s
  env:
    APP_ENV: local

hosts:
  local:
    host: localhost
    username: dev
`);
      
      const config = await loader.load([globalConfig, localConfig]);
      
      // Later configs override earlier ones
      expect(config.defaults?.timeout).toBe('30s');
      expect(config.defaults?.shell).toBe('/bin/bash'); // Preserved from global
      expect(config.defaults?.env?.['APP_ENV']).toBe('local');
      
      // Both hosts should be present
      expect(config.hosts?.['global']?.host).toBe('global.example.com');
      expect(config.hosts?.['local']?.host).toBe('localhost');
    });
    
    it('should apply environment variable overrides', async () => {
      process.env['XEC_TIMEOUT'] = '120s';
      process.env['XEC_SHELL'] = '/bin/zsh';
      process.env['XEC_CWD'] = '/tmp/work';
      
      const config = await loader.load();
      
      expect(config.defaults?.timeout).toBe('120s');
      expect(config.defaults?.shell).toBe('/bin/zsh');
      expect(config.defaults?.cwd).toBe('/tmp/work');
    });
  });
  
  describe('profiles', () => {
    it('should apply profile with containers and pods', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
hosts:
  dev:
    host: dev.example.com

profiles:
  production:
    hosts:
      prod:
        host: prod.example.com
    containers:
      app:
        name: app-prod
        image: myapp:prod
    pods:
      web:
        name: web-prod
        namespace: production
`);
      
      await loader.load([configPath]);
      loader.applyProfile('production');
      
      const config = loader.get();
      expect(config.hosts?.['prod']?.host).toBe('prod.example.com');
      expect(config.containers?.['app']?.name).toBe('app-prod');
      expect(config.pods?.['web']?.name).toBe('web-prod');
    });
    it('should apply profile settings', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
defaults:
  timeout: 30s

hosts:
  dev:
    host: dev.example.com

profiles:
  production:
    defaults:
      timeout: 60s
      env:
        NODE_ENV: production
    hosts:
      prod:
        host: prod.example.com
        username: deploy
`);
      
      await loader.load([configPath]);
      loader.applyProfile('production');
      
      const config = loader.get();
      expect(config.defaults?.timeout).toBe('60s');
      expect(config.defaults?.env?.['NODE_ENV']).toBe('production');
      expect(config.hosts?.['prod']?.host).toBe('prod.example.com');
      expect(config.hosts?.['dev']?.host).toBe('dev.example.com'); // Original hosts preserved
    });
    
    it('should support profile inheritance', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
profiles:
  base:
    defaults:
      timeout: 30s
      shell: /bin/bash
  production:
    extends: base
    defaults:
      timeout: 60s
      env:
        NODE_ENV: production
`);
      
      await loader.load([configPath]);
      loader.applyProfile('production');
      
      const config = loader.get();
      expect(config.defaults?.timeout).toBe('60s'); // Overridden
      expect(config.defaults?.shell).toBe('/bin/bash'); // Inherited
      expect(config.defaults?.env?.['NODE_ENV']).toBe('production');
    });
    
    it('should apply profile from environment variable', async () => {
      process.env['XEC_PROFILE'] = 'staging';
      
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
profiles:
  staging:
    defaults:
      timeout: 45s
`);
      
      await loader.load([configPath]);
      
      expect(loader.get().defaults?.timeout).toBe('45s');
      expect(loader.getActiveProfile()).toBe('staging');
    });
  });
  
  describe('resource access methods', () => {
    beforeEach(async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
hosts:
  prod:
    host: prod.example.com
    username: deploy
    privateKeyPath: ~/.ssh/id_rsa
    port: 2222
    
containers:
  app:
    name: myapp-container
    
pods:
  web:
    name: web-pod
    namespace: default
    container: nginx
`);
      await loader.load([configPath]);
    });
    
    it('should get host configuration', () => {
      const host = loader.getHost('prod');
      expect(host?.host).toBe('prod.example.com');
      expect(host?.username).toBe('deploy');
      expect(host?.port).toBe(2222);
    });
    
    it('should convert host to SSH options', async () => {
      const sshOptions = await loader.hostToSSHOptions('prod');
      expect(sshOptions.host).toBe('prod.example.com');
      expect(sshOptions.username).toBe('deploy');
      expect(sshOptions.privateKey).toBeUndefined(); // Can't read private key in test
      expect(sshOptions.port).toBe(2222);
    });
    
    it('should convert host to SSH options with privateKey', async () => {
      const configPath = path.join(tempDir, 'config-with-key.yaml');
      await fs.writeFile(configPath, `
hosts:
  secure:
    host: secure.example.com
    username: admin
    privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
`);
      
      await loader.load([configPath]);
      const sshOptions = await loader.hostToSSHOptions('secure');
      expect(sshOptions.host).toBe('secure.example.com');
      expect(sshOptions.username).toBe('admin');
      expect(sshOptions.privateKey).toContain('BEGIN RSA PRIVATE KEY');
    });
    
    it('should throw error when host not found', async () => {
      await expect(loader.hostToSSHOptions('nonexistent')).rejects.toThrow("Host 'nonexistent' not found in configuration");
    });
    
    it('should get container configuration', () => {
      const container = loader.getContainer('app');
      expect(container?.name).toBe('myapp-container');
    });
    
    it('should convert container to Docker options', () => {
      const dockerOptions = loader.containerToDockerOptions('app');
      expect(dockerOptions.container).toBe('myapp-container');
    });
    
    it('should throw error when container not found', () => {
      expect(() => loader.containerToDockerOptions('nonexistent')).toThrow("Container 'nonexistent' not found in configuration");
    });
    
    it('should get pod configuration', () => {
      const pod = loader.getPod('web');
      expect(pod?.name).toBe('web-pod');
      expect(pod?.namespace).toBe('default');
      expect(pod?.container).toBe('nginx');
    });
    
    it('should convert pod to K8s options', () => {
      const k8sOptions = loader.podToK8sOptions('web');
      expect(k8sOptions.pod).toBe('web-pod');
      expect(k8sOptions.namespace).toBe('default');
      expect(k8sOptions.container).toBe('nginx');
    });
    
    it('should throw error when pod not found', () => {
      expect(() => loader.podToK8sOptions('nonexistent')).toThrow("Pod 'nonexistent' not found in configuration");
    });
    
    it('should list all resources', () => {
      expect(loader.listHosts()).toEqual(['prod']);
      expect(loader.listContainers()).toEqual(['app']);
      expect(loader.listPods()).toEqual(['web']);
    });
    
    it('should get loaded configuration paths', async () => {
      const configPath = path.join(tempDir, 'test-config.yaml');
      await fs.writeFile(configPath, 'name: test');
      await loader.load([configPath]);
      
      const loadedPaths = loader.getLoadedPaths();
      expect(loadedPaths).toContain(configPath);
    });
    
    it('should list all profiles', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
profiles:
  dev:
    defaults:
      timeout: 10s
  staging:
    defaults:
      timeout: 20s
  production:
    defaults:
      timeout: 30s
`);
      
      await loader.load([configPath]);
      expect(loader.listProfiles()).toEqual(['dev', 'staging', 'production']);
    });
  });
  
  describe('aliases', () => {
    it('should resolve aliases', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
aliases:
  deploy: xec on prod deploy.sh
  logs: xec logs app --follow
  status: xec exec "systemctl status app"
`);
      
      await loader.load([configPath]);
      
      expect(loader.resolveAlias('deploy')).toBe('xec on prod deploy.sh');
      expect(loader.resolveAlias('logs')).toBe('xec logs app --follow');
      expect(loader.resolveAlias('status')).toBe('xec exec "systemctl status app"');
      expect(loader.resolveAlias('unknown')).toBeUndefined();
    });
  });
  
  describe('getValue/setValue', () => {
    it('should get values by dot notation path', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
defaults:
  timeout: 30s
  env:
    NODE_ENV: production
    DATABASE_URL: postgres://localhost
`);
      
      await loader.load([configPath]);
      
      expect(loader.getValue('defaults.timeout')).toBe('30s');
      expect(loader.getValue('defaults.env.NODE_ENV')).toBe('production');
      expect(loader.getValue('defaults.env.DATABASE_URL')).toBe('postgres://localhost');
      expect(loader.getValue('nonexistent.path')).toBeUndefined();
    });
    
    it('should set values by dot notation path', () => {
      loader.setValue('defaults.timeout', '60s');
      loader.setValue('defaults.env.NEW_VAR', 'value');
      loader.setValue('new.nested.property', 'test');
      
      expect(loader.getValue('defaults.timeout')).toBe('60s');
      expect(loader.getValue('defaults.env.NEW_VAR')).toBe('value');
      expect(loader.getValue('new.nested.property')).toBe('test');
    });
  });
  
  describe('toEngineConfig()', () => {
    it('should convert to ExecutionEngineConfig', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, `
defaults:
  timeout: 30s
  cwd: /app
  shell: /bin/bash
  encoding: utf8
  throwOnNonZeroExit: false
  env:
    NODE_ENV: production
`);
      
      await loader.load([configPath]);
      const engineConfig = loader.toEngineConfig();
      
      expect(engineConfig.defaultTimeout).toBe(30000); // Converted to ms
      expect(engineConfig.defaultCwd).toBe('/app');
      expect(engineConfig.defaultShell).toBe('/bin/bash');
      expect(engineConfig.encoding).toBe('utf8');
      expect(engineConfig.throwOnNonZeroExit).toBe(false);
      expect(engineConfig.defaultEnv?.['NODE_ENV']).toBe('production');
    });
    
    it('should parse different timeout formats', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      
      // Test milliseconds
      await fs.writeFile(configPath, 'defaults:\n  timeout: 5000');
      await loader.load([configPath]);
      expect(loader.toEngineConfig().defaultTimeout).toBe(5000);
      
      // Test seconds
      await fs.writeFile(configPath, 'defaults:\n  timeout: 30s');
      await loader.load([configPath]);
      expect(loader.toEngineConfig().defaultTimeout).toBe(30000);
      
      // Test minutes
      await fs.writeFile(configPath, 'defaults:\n  timeout: 2m');
      await loader.load([configPath]);
      expect(loader.toEngineConfig().defaultTimeout).toBe(120000);
      
      // Test hours
      await fs.writeFile(configPath, 'defaults:\n  timeout: 1h');
      await loader.load([configPath]);
      expect(loader.toEngineConfig().defaultTimeout).toBe(3600000);
      
      // Test without unit (defaults to ms)
      await fs.writeFile(configPath, 'defaults:\n  timeout: "100"');
      await loader.load([configPath]);
      expect(loader.toEngineConfig().defaultTimeout).toBe(100);
    });
  });
  
  describe('save()', () => {
    it('should save configuration to file', async () => {
      const config = {
        name: 'saved-config',
        defaults: {
          timeout: '45s'
        },
        hosts: {
          test: {
            host: 'test.example.com',
            username: 'user'
          }
        }
      };
      
      const savePath = path.join(tempDir, 'saved', 'config.yaml');
      await loader.save(config, savePath);
      
      const savedContent = await fs.readFile(savePath, 'utf-8');
      expect(savedContent).toContain('name: saved-config');
      expect(savedContent).toContain('timeout: 45s');
      expect(savedContent).toContain('host: test.example.com');
      
      // Verify it can be loaded back
      const loadedConfig = await loader.load([savePath]);
      expect(loadedConfig.name).toBe('saved-config');
      expect(loadedConfig.defaults?.timeout).toBe('45s');
      expect(loadedConfig.hosts?.['test']?.host).toBe('test.example.com');
    });
  });
  
  describe('error handling', () => {
    it('should handle invalid YAML gracefully', async () => {
      const configPath = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(configPath, '{ invalid yaml: [}');
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      const config = await loader.load([configPath]);
      expect(config).toEqual({}); // Empty config on error
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
    
    it('should throw error for invalid profile', () => {
      expect(() => loader.applyProfile('nonexistent')).toThrow("Profile 'nonexistent' not found");
    });
    
    it('should throw error for invalid timeout format', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configPath, 'defaults:\n  timeout: invalid-format');
      await loader.load([configPath]);
      
      expect(() => loader.toEngineConfig()).toThrow('Invalid timeout format: invalid-format');
    });
  });
  
  describe('exists()', () => {
    it('should return true when config file exists', async () => {
      const configPath = path.join(tempDir, '.xec', 'config.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, 'name: test-config');
      
      // Mock process.cwd to return tempDir
      const originalCwd = process.cwd;
      process.cwd = () => tempDir;
      
      try {
        const exists = await loader.exists();
        expect(exists).toBe(true);
      } finally {
        process.cwd = originalCwd;
      }
    });
    
    it('should return true when XEC_CONFIG env var points to existing file', async () => {
      const configPath = path.join(tempDir, 'env-config.yaml');
      await fs.writeFile(configPath, 'name: env-config');
      
      process.env['XEC_CONFIG'] = configPath;
      
      try {
        const exists = await loader.exists();
        expect(exists).toBe(true);
      } finally {
        delete process.env['XEC_CONFIG'];
      }
    });
    
    it('should return false when no config files exist', async () => {
      // Mock process.cwd to return tempDir
      const originalCwd = process.cwd;
      process.cwd = () => tempDir;
      
      try {
        const exists = await loader.exists();
        expect(exists).toBe(false);
      } finally {
        process.cwd = originalCwd;
      }
    });
  });
  
  describe('plugins handling', () => {
    it('should merge plugins arrays', async () => {
      const config1 = path.join(tempDir, 'config1.yaml');
      const config2 = path.join(tempDir, 'config2.yaml');
      
      await fs.writeFile(config1, `
plugins:
  - plugin1
  - plugin2
`);
      
      await fs.writeFile(config2, `
plugins:
  - plugin2
  - plugin3
`);
      
      const config = await loader.load([config1, config2]);
      expect(config.plugins).toEqual(['plugin1', 'plugin2', 'plugin3']);
    });
  });
});