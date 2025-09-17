import { Writable } from 'node:stream';
import { it, expect, describe } from '@jest/globals';

import { Command, SSHAdapterOptions, DockerAdapterOptions } from '../../../src/types/command.js';
import { createMockCommand, createMockSSHOptions, createMockDockerOptions } from '../../helpers/mock-factories.js';

describe('Command', () => {
  describe('Command interface', () => {
    it('should have all required properties', () => {
      const command: Command = {
        command: 'echo',
        args: ['Hello', 'World'],
        cwd: '/tmp',
        env: { NODE_ENV: 'test' },
        timeout: 5000,
        stdin: 'input data',
        stdout: 'pipe',
        stderr: 'pipe',
        shell: true,
        detached: false,
        signal: new AbortController().signal,
        adapter: 'local',
        adapterOptions: { type: 'local' }
      };
      
      expect(command.command).toBe('echo');
      expect(command.args).toEqual(['Hello', 'World']);
      expect(command.cwd).toBe('/tmp');
      expect(command.env).toEqual({ NODE_ENV: 'test' });
      expect(command.timeout).toBe(5000);
      expect(command.stdin).toBe('input data');
      expect(command.stdout).toBe('pipe');
      expect(command.stderr).toBe('pipe');
      expect(command.shell).toBe(true);
      expect(command.detached).toBe(false);
      expect(command.signal).toBeInstanceOf(AbortSignal);
      expect(command.adapter).toBe('local');
      expect(command.adapterOptions).toEqual({ type: 'local' });
    });
    
    it('should work with minimal properties', () => {
      const command: Command = {
        command: 'ls'
      };
      
      expect(command.command).toBe('ls');
      expect(command.args).toBeUndefined();
      expect(command.cwd).toBeUndefined();
      expect(command.env).toBeUndefined();
    });
  });
  
  describe('AdapterOptions types', () => {
    it('should validate SSH adapter options', () => {
      const sshOptions: SSHAdapterOptions = {
        type: 'ssh',
        host: 'example.com',
        username: 'user',
        port: 2222,
        privateKey: 'key content',
        passphrase: 'secret',
        password: 'pass'
      };
      
      expect(sshOptions.type).toBe('ssh');
      expect(sshOptions.host).toBe('example.com');
      expect(sshOptions.username).toBe('user');
      expect(sshOptions.port).toBe(2222);
      expect(sshOptions.privateKey).toBe('key content');
      expect(sshOptions.passphrase).toBe('secret');
      expect(sshOptions.password).toBe('pass');
    });
    
    it('should validate Docker adapter options', () => {
      const dockerOptions: DockerAdapterOptions = {
        type: 'docker',
        container: 'my-container',
        user: 'root',
        workdir: '/app'
      };
      
      expect(dockerOptions.type).toBe('docker');
      expect(dockerOptions.container).toBe('my-container');
      expect(dockerOptions.user).toBe('root');
      expect(dockerOptions.workdir).toBe('/app');
    });
    
    it('should work with minimal SSH options', () => {
      const sshOptions: SSHAdapterOptions = {
        type: 'ssh',
        host: 'example.com',
        username: 'user'
      };
      
      expect(sshOptions.port).toBeUndefined();
      expect(sshOptions.privateKey).toBeUndefined();
    });
    
    it('should work with minimal Docker options', () => {
      const dockerOptions: DockerAdapterOptions = {
        type: 'docker',
        container: 'my-container'
      };
      
      expect(dockerOptions.user).toBeUndefined();
      expect(dockerOptions.workdir).toBeUndefined();
    });
  });
  
  describe('Mock factories', () => {
    it('should create valid mock command', () => {
      const command = createMockCommand();
      
      expect(command.command).toBe('echo');
      expect(command.args).toEqual(['test']);
      expect(command.cwd).toBe('/tmp');
      expect(command.env).toEqual({ TEST: 'true' });
      expect(command.timeout).toBe(5000);
      expect(command.shell).toBe(true);
    });
    
    it('should allow overriding mock command properties', () => {
      const command = createMockCommand({
        command: 'ls',
        args: ['-la'],
        cwd: '/home'
      });
      
      expect(command.command).toBe('ls');
      expect(command.args).toEqual(['-la']);
      expect(command.cwd).toBe('/home');
      expect(command.env).toEqual({ TEST: 'true' }); // Default not overridden
    });
    
    it('should create valid mock SSH options', () => {
      const sshOptions = createMockSSHOptions();
      
      expect(sshOptions.type).toBe('ssh');
      expect(sshOptions.host).toBe('test.example.com');
      expect(sshOptions.username).toBe('testuser');
      expect(sshOptions.port).toBe(22);
    });
    
    it('should create valid mock Docker options', () => {
      const dockerOptions = createMockDockerOptions();
      
      expect(dockerOptions.type).toBe('docker');
      expect(dockerOptions.container).toBe('test-container');
      expect(dockerOptions.workdir).toBe('/app');
    });
  });
  
  describe('Stream options', () => {
    it('should accept different stream option values', () => {
      const command1: Command = { command: 'echo', stdout: 'pipe' };
      const command2: Command = { command: 'echo', stdout: 'ignore' };
      const command3: Command = { command: 'echo', stdout: 'inherit' };
      
      expect(command1.stdout).toBe('pipe');
      expect(command2.stdout).toBe('ignore');
      expect(command3.stdout).toBe('inherit');
    });
    
    it('should accept stream objects', () => {
      const customStream = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });
      
      const command: Command = {
        command: 'echo',
        stdout: customStream
      };
      
      expect(command.stdout).toBe(customStream);
    });
  });
  
  describe('AdapterType', () => {
    it('should accept valid adapter types', () => {
      const adapters = ['local', 'ssh', 'docker', 'auto'];
      
      adapters.forEach(adapter => {
        const command: Command = {
          command: 'echo',
          adapter: adapter as any
        };
        
        expect(command.adapter).toBe(adapter);
      });
    });
  });
});