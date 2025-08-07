import { it, expect, describe } from '@jest/globals';
import { CommandError, TimeoutError, ConnectionError } from '@xec-sh/core';

import {
  enhanceError,
  EnhancedCommandError,
  EnhancedTimeoutError,
  EnhancedExecutionError,
  EnhancedConnectionError
} from '../../src/utils/enhanced-error.js';

describe('Enhanced Error System', () => {
  describe('EnhancedExecutionError', () => {
    it('should create error with basic properties', () => {
      const error = new EnhancedExecutionError(
        'Test error message',
        'TEST_ERROR',
        { command: 'test-command', adapter: 'local' },
        [{ message: 'Try this instead' }]
      );
      
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.context.command).toBe('test-command');
      expect(error.context.adapter).toBe('local');
      expect(error.suggestions).toHaveLength(1);
      expect(error.suggestions[0]?.message).toBe('Try this instead');
      expect(error.systemInfo).toBeDefined();
      expect(error.systemInfo.platform).toBe(process.platform);
    });
    
    it('should add suggestions dynamically', () => {
      const error = new EnhancedExecutionError('Test', 'TEST');
      
      error.addSuggestion({
        message: 'First suggestion',
        command: 'fix-command'
      });
      
      error.addSuggestion({
        message: 'Second suggestion',
        documentation: 'https://docs.example.com'
      });
      
      expect(error.suggestions).toHaveLength(2);
      expect(error.suggestions[0]?.command).toBe('fix-command');
      expect(error.suggestions[1]?.documentation).toBe('https://docs.example.com');
    });
    
    it('should format error for display', () => {
      const error = new EnhancedExecutionError(
        'Command failed',
        'CMD_FAILED',
        {
          command: 'npm test',
          adapter: 'docker',
          container: 'myapp',
          duration: 5000
        },
        [
          {
            message: 'Check if npm is installed',
            command: 'docker exec myapp which npm'
          },
          {
            message: 'See troubleshooting guide',
            documentation: 'https://docs.xec.sh/troubleshooting'
          }
        ]
      );
      
      const formatted = error.format();
      
      expect(formatted).toContain('Error: Command failed');
      expect(formatted).toContain('Code: CMD_FAILED');
      expect(formatted).toContain('Context:');
      expect(formatted).toContain('  Command: npm test');
      expect(formatted).toContain('  Adapter: docker');
      expect(formatted).toContain('  Container: myapp');
      expect(formatted).toContain('  Duration: 5000ms');
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('  1. Check if npm is installed');
      expect(formatted).toContain('     Try: docker exec myapp which npm');
      expect(formatted).toContain('  2. See troubleshooting guide');
      expect(formatted).toContain('     See: https://docs.xec.sh/troubleshooting');
    });
    
    it('should include system info in verbose format', () => {
      const error = new EnhancedExecutionError('Test', 'TEST');
      const verbose = error.format(true);
      
      expect(verbose).toContain('System:');
      expect(verbose).toContain(`Platform: ${process.platform}`);
      expect(verbose).toContain(`Architecture: ${process.arch}`);
      expect(verbose).toContain(`Node Version: ${process.version}`);
      expect(verbose).toContain('Stack Trace:');
    });
  });
  
  describe('EnhancedCommandError', () => {
    it('should generate suggestions for exit code 127', () => {
      const error = new EnhancedCommandError(
        'unknown-cmd',
        127,
        undefined,
        '',
        'unknown-cmd: command not found',
        1000,
        'local'
      );
      
      // Should have suggestions for command not found
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Command not found'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('which'))).toBe(true);
    });
    
    it('should generate suggestions for permission denied', () => {
      const error = new EnhancedCommandError(
        'cat /etc/shadow',
        1,
        undefined,
        '',
        'cat: /etc/shadow: Permission denied',
        100,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Permission denied'))).toBe(true);
      expect(suggestions.some(s => s.command === 'sudo <command>')).toBe(true);
    });
    
    it('should generate adapter-specific suggestions for SSH', () => {
      const error = new EnhancedCommandError(
        'npm test',
        127,
        undefined,
        '',
        'npm: command not found',
        500,
        'ssh'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Check SSH connection'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('ssh -v'))).toBe(true);
    });
    
    it('should generate adapter-specific suggestions for Docker', () => {
      const error = new EnhancedCommandError(
        'python script.py',
        127,
        undefined,
        '',
        'python: not found',
        200,
        'docker'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Check if command exists in container'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('docker exec'))).toBe(true);
    });
    
    it('should generate adapter-specific suggestions for Kubernetes', () => {
      const error = new EnhancedCommandError(
        'kubectl version',
        127,
        undefined,
        '',
        'kubectl: not found',
        300,
        'kubernetes'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Check if command exists in pod'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('kubectl exec'))).toBe(true);
    });
    
    it('should generate suggestions for exit code 2 (misuse)', () => {
      const error = new EnhancedCommandError(
        'grep',
        2,
        undefined,
        '',
        'grep: invalid option',
        50,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Misuse of shell command'))).toBe(true);
      expect(suggestions.some(s => s.command === 'man grep')).toBe(true);
    });
    
    it('should generate suggestions for exit code 126 (cannot execute)', () => {
      const error = new EnhancedCommandError(
        './script.sh',
        126,
        undefined,
        '',
        'Permission denied',
        100,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Command cannot execute'))).toBe(true);
      expect(suggestions.some(s => s.command === 'ls -la ./script.sh')).toBe(true);
    });
    
    it('should generate suggestions for exit code 128 (invalid argument)', () => {
      const error = new EnhancedCommandError(
        'exit 256',
        128,
        undefined,
        '',
        'exit: 256: numeric argument required',
        50,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Invalid argument to exit'))).toBe(true);
      expect(suggestions.some(s => s.documentation?.includes('exitcodes.html'))).toBe(true);
    });
  });
  
  describe('EnhancedConnectionError', () => {
    it('should generate suggestions for DNS errors', () => {
      const error = new EnhancedConnectionError(
        'unknown.host.com',
        new Error('getaddrinfo ENOTFOUND unknown.host.com'),
        22,
        'ssh'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Host not found'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('nslookup'))).toBe(true);
      expect(suggestions.some(s => s.message.includes('Try using IP address'))).toBe(true);
    });
    
    it('should generate suggestions for connection refused', () => {
      const error = new EnhancedConnectionError(
        'localhost',
        new Error('connect ECONNREFUSED 127.0.0.1:22'),
        22,
        'ssh'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Connection refused'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('nc -zv'))).toBe(true);
      expect(suggestions.some(s => s.message.includes('Check if SSH service'))).toBe(true);
    });
    
    it('should generate suggestions for timeout errors', () => {
      const error = new EnhancedConnectionError(
        'remote.server.com',
        new Error('Connection timeout'),
        22
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Connection timeout'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('ping'))).toBe(true);
      expect(suggestions.some(s => s.message.includes('Check firewall'))).toBe(true);
    });
    
    it('should generate suggestions for authentication errors', () => {
      const error = new EnhancedConnectionError(
        'secure.server.com',
        new Error('Authentication failed'),
        22,
        'ssh'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Authentication failed'))).toBe(true);
      expect(suggestions.some(s => s.message.includes('Check SSH key permissions'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('chmod 600'))).toBe(true);
    });
  });
  
  describe('EnhancedTimeoutError', () => {
    it('should suggest increasing timeout', () => {
      const error = new EnhancedTimeoutError(
        'npm install',
        30000,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Increase timeout'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('--timeout 60000ms'))).toBe(true);
    });
    
    it('should suggest background execution for long tasks', () => {
      const error = new EnhancedTimeoutError(
        'apt-get install large-package',
        60000,
        'local'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Long-running installation'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('nohup'))).toBe(true);
    });
    
    it('should suggest SSH-specific fixes', () => {
      const error = new EnhancedTimeoutError(
        'long-running-script.sh',
        30000,
        'ssh'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Check SSH connection stability'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('ssh.keepaliveInterval'))).toBe(true);
    });
    
    it('should suggest container resource checks', () => {
      const error = new EnhancedTimeoutError(
        'heavy-computation',
        45000,
        'docker'
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('Check container/pod resources'))).toBe(true);
      expect(suggestions.some(s => s.command?.includes('docker stats'))).toBe(true);
    });
  });
  
  describe('enhanceError', () => {
    it('should enhance standard CommandError', () => {
      const originalError = new CommandError(
        'test-cmd',
        1,
        undefined,
        'output',
        'error output',
        100
      );
      
      const enhanced = enhanceError(originalError, { adapter: 'ssh' });
      
      expect(enhanced).toBeInstanceOf(EnhancedCommandError);
      expect(enhanced.context.adapter).toBe('ssh');
      expect(enhanced.suggestions.length).toBeGreaterThan(0);
    });
    
    it('should enhance standard ConnectionError', () => {
      const originalError = new ConnectionError(
        'test.host.com',
        new Error('Connection failed')
      );
      
      const enhanced = enhanceError(originalError, { adapter: 'ssh' });
      
      expect(enhanced).toBeInstanceOf(EnhancedConnectionError);
      expect(enhanced.context.adapter).toBe('ssh');
      expect(enhanced.suggestions.length).toBeGreaterThan(0);
    });
    
    it('should enhance standard TimeoutError', () => {
      const originalError = new TimeoutError(
        'slow-command',
        5000
      );
      
      const enhanced = enhanceError(originalError, { adapter: 'docker' });
      
      expect(enhanced).toBeInstanceOf(EnhancedTimeoutError);
      expect(enhanced.context.adapter).toBe('docker');
      expect(enhanced.suggestions.length).toBeGreaterThan(0);
    });
    
    it('should handle already enhanced errors', () => {
      const enhanced = new EnhancedExecutionError(
        'Already enhanced',
        'ENHANCED',
        { command: 'test' }
      );
      
      const reEnhanced = enhanceError(enhanced, { adapter: 'new-adapter' });
      
      expect(reEnhanced).toBe(enhanced);
      expect(reEnhanced.context.adapter).toBe('new-adapter');
      expect(reEnhanced.context.command).toBe('test');
    });
    
    it('should handle generic errors', () => {
      const genericError = new Error('Something went wrong');
      const enhanced = enhanceError(genericError, { command: 'unknown' });
      
      expect(enhanced).toBeInstanceOf(EnhancedExecutionError);
      expect(enhanced.code).toBe('UNKNOWN_ERROR');
      expect(enhanced.context.command).toBe('unknown');
      expect(enhanced.suggestions.some(s => s.message.includes('unexpected error'))).toBe(true);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle errors with no suggestions', () => {
      const error = new EnhancedExecutionError(
        'Unknown error',
        'UNKNOWN',
        { command: 'test' }
      );
      
      expect(error.suggestions).toHaveLength(0);
      const formatted = error.format();
      expect(formatted).not.toContain('Suggestions:');
    });
    
    it('should format error with all context fields', () => {
      const error = new EnhancedExecutionError(
        'Complex error',
        'COMPLEX',
        {
          command: 'complex-command',
          adapter: 'ssh',
          host: 'remote.server.com',
          container: 'mycontainer',
          pod: 'mypod',
          cwd: '/working/directory',
          env: { NODE_ENV: 'test', DEBUG: 'true' },
          timestamp: new Date('2023-01-01'),
          duration: 12345
        }
      );
      
      const formatted = error.format();
      expect(formatted).toContain('Command: complex-command');
      expect(formatted).toContain('Adapter: ssh');
      expect(formatted).toContain('Host: remote.server.com');
      expect(formatted).toContain('Container: mycontainer');
      expect(formatted).toContain('Pod: mypod');
      expect(formatted).toContain('Directory: /working/directory');
      expect(formatted).toContain('Duration: 12345ms');
    });
    
    it('should handle verbose format with stack trace', () => {
      const error = new EnhancedExecutionError('Test error', 'TEST');
      const verbose = error.format(true);
      
      expect(verbose).toContain('Stack Trace:');
      expect(verbose).toContain('EnhancedExecutionError');
      expect(verbose).toContain('at Object.<anonymous>');
    });
    
    it('should handle suggestions with only documentation', () => {
      const error = new EnhancedExecutionError(
        'Error with doc',
        'DOC_ERROR',
        {},
        [{
          message: 'Read the documentation',
          documentation: 'https://docs.example.com/error'
        }]
      );
      
      const formatted = error.format();
      expect(formatted).toContain('Read the documentation');
      expect(formatted).toContain('See: https://docs.example.com/error');
      expect(formatted).not.toContain('Try:');
    });
  });
  
  describe('Error suggestions quality', () => {
    it('should provide helpful install commands', () => {
      const error = new EnhancedCommandError(
        'git',
        127,
        undefined,
        '',
        'git: command not found',
        100
      );
      
      // Find the suggestion that has the actual install command (not the 'which' command)
      const installSuggestion = error.suggestions.find(s => 
        s.message.includes('install') && s.command && !s.command.includes('which')
      );
      expect(installSuggestion).toBeDefined();
      expect(installSuggestion?.command).toContain('brew install git');
      expect(installSuggestion?.command).toContain('apt-get install git');
    });
    
    it('should provide helpful file not found suggestions', () => {
      const error = new EnhancedCommandError(
        'cat config.json',
        1,
        undefined,
        '',
        'cat: config.json: No such file or directory',
        50
      );
      
      const suggestions = error.suggestions;
      expect(suggestions.some(s => s.message.includes('File or directory not found'))).toBe(true);
      expect(suggestions.some(s => s.command === 'ls -la <path>')).toBe(true);
    });
    
    it('should handle signal-based termination', () => {
      const error = new EnhancedCommandError(
        'sleep 100',
        null as any,
        'SIGTERM',
        '',
        '',
        5000
      );
      
      expect(error.message).toContain('exit code null');
      expect(error.context.duration).toBe(5000);
    });
  });
});