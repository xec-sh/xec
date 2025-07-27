import * as os from 'os';
import * as path from 'path';
import { it, expect, describe, beforeEach } from '@jest/globals';

import { $, configure } from '../../src/index.js';

describe('Directory Operations', () => {
  const originalCwd = process.cwd();
  
  beforeEach(() => {
    // Reset configuration before each test
    configure({ defaultCwd: originalCwd });
  });

  describe('$.cd()', () => {
    it('should handle absolute paths', () => {
      const engine = $.cd('/tmp');
      expect(engine.pwd()).toBe('/tmp');
    });
    
    it('should handle relative paths', () => {
      const basePath = '/home/user';
      const engine = $.cd(basePath).cd('./projects');
      expect(engine.pwd()).toBe(path.join(basePath, 'projects'));
    });
    
    it('should handle parent directory references', () => {
      const engine = $.cd('/home/user/projects').cd('../');
      expect(engine.pwd()).toBe('/home/user');
    });
    
    it('should handle multiple relative path segments', () => {
      const engine = $.cd('/home/user').cd('./projects/../documents/./files');
      expect(engine.pwd()).toBe('/home/user/documents/files');
    });
    
    it('should expand tilde to home directory', () => {
      const homedir = os.homedir();
      const engine = $.cd('~');
      expect(engine.pwd()).toBe(homedir);
    });
    
    it('should expand tilde with path', () => {
      const homedir = os.homedir();
      const engine = $.cd('~/projects');
      expect(engine.pwd()).toBe(path.join(homedir, 'projects'));
    });
    
    it('should handle tilde in middle of path correctly', () => {
      // Tilde expansion only works at the beginning
      const engine = $.cd('/tmp').cd('./~test');
      expect(engine.pwd()).toBe('/tmp/~test');
    });
    
    it('should resolve relative paths from current directory', () => {
      // Start from a known directory
      const engine1 = $.cd('/home/user');
      const engine2 = engine1.cd('projects');
      const engine3 = engine2.cd('../documents');
      
      expect(engine1.pwd()).toBe('/home/user');
      expect(engine2.pwd()).toBe('/home/user/projects');
      expect(engine3.pwd()).toBe('/home/user/documents');
    });
    
    it('should maintain separate directories for different engine instances', () => {
      const engine1 = $.cd('/tmp');
      const engine2 = $.cd('/home');
      
      expect(engine1.pwd()).toBe('/tmp');
      expect(engine2.pwd()).toBe('/home');
    });
  });
  
  describe('$.pwd()', () => {
    it('should return process.cwd() by default', () => {
      expect($.pwd()).toBe(originalCwd);
    });
    
    it('should return configured default directory', () => {
      configure({ defaultCwd: '/custom/default' });
      expect($.pwd()).toBe('/custom/default');
    });
    
    it('should return current directory after cd()', () => {
      const engine = $.cd('/usr/local');
      expect(engine.pwd()).toBe('/usr/local');
    });
    
    it('should work with $.defaults()', () => {
      $.defaults({ defaultCwd: '/default/path' });
      expect($.pwd()).toBe('/default/path');
    });
  });
  
  describe('Integration', () => {
    it('should maintain directory context through chained operations', () => {
      const engine = $
        .cd('/tmp')
        .env({ TEST: 'value' })
        .timeout(5000)
        .cd('./subdir');
        
      expect(engine.pwd()).toBe('/tmp/subdir');
    });
    
    it('should work with $.with()', () => {
      const engine = $.with({ cwd: '/home/user' });
      expect(engine.pwd()).toBe('/home/user');
      
      const engine2 = engine.cd('./documents');
      expect(engine2.pwd()).toBe('/home/user/documents');
    });
    
    it('should handle Windows-style paths on Windows', () => {
      // This test would need to be platform-specific
      // For now, just verify the basic functionality works
      const engine = $.cd(path.resolve('/'));
      expect(engine.pwd()).toBe(path.resolve('/'));
    });
  });
});