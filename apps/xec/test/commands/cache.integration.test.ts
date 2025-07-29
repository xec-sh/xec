import { Command } from 'commander';
import { it, expect, describe, beforeEach } from '@jest/globals';

import cacheCommand from '../../src/commands/cache.js';

describe('cache command integration tests', () => {
  let program: Command;
  
  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    cacheCommand(program);
  });

  describe('command structure', () => {
    it('should register cache command', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      expect(cacheCmd).toBeDefined();
      expect(cacheCmd?.description()).toBe('Manage module cache');
    });

    it('should have clear subcommand', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const clearCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'clear');
      
      expect(clearCmd).toBeDefined();
      expect(clearCmd?.description()).toBe('Clear all cached modules');
    });

    it('should have stats subcommand with alias', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const statsCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'stats');
      
      expect(statsCmd).toBeDefined();
      expect(statsCmd?.description()).toBe('Show cache statistics');
      expect(statsCmd?.aliases()).toContain('status');
    });

    it('should have list subcommand with alias', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const listCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'list');
      
      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toBe('List cached modules');
      expect(listCmd?.aliases()).toContain('ls');
    });

    it('should have preload subcommand', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const preloadCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'preload');
      
      expect(preloadCmd).toBeDefined();
      expect(preloadCmd?.description()).toBe('Preload modules into cache');
    });
  });

  describe('command options', () => {
    it('clear should have cache-dir option', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const clearCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'clear');
      const option = clearCmd?.options.find(opt => opt.long === '--cache-dir');
      
      expect(option).toBeDefined();
      expect(option?.description).toBe('Custom cache directory');
    });

    it('list should have json option', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const listCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'list');
      const option = listCmd?.options.find(opt => opt.long === '--json');
      
      expect(option).toBeDefined();
      expect(option?.description).toBe('Output as JSON');
    });

    it('preload should have cdn option', () => {
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      const preloadCmd = cacheCmd?.commands.find(cmd => cmd.name() === 'preload');
      const option = preloadCmd?.options.find(opt => opt.long === '--cdn');
      
      expect(option).toBeDefined();
      expect(option?.description).toBe('Preferred CDN (esm.sh, jsr.io)');
      expect(option?.defaultValue).toBe('esm.sh');
    });
  });

  describe('command parsing', () => {
    it('should parse cache clear command', () => {
      const args = ['node', 'xec', 'cache', 'clear'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache clear with custom dir', () => {
      const args = ['node', 'xec', 'cache', 'clear', '--cache-dir', '/tmp/cache'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache stats command', () => {
      const args = ['node', 'xec', 'cache', 'stats'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache list command', () => {
      const args = ['node', 'xec', 'cache', 'list'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache list with json flag', () => {
      const args = ['node', 'xec', 'cache', 'list', '--json'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache preload command', () => {
      const args = ['node', 'xec', 'cache', 'preload', 'module1', 'module2'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });

    it('should parse cache preload with cdn option', () => {
      const args = ['node', 'xec', 'cache', 'preload', 'module1', '--cdn', 'esm.sh'];
      expect(() => program.parse(args, { from: 'node' })).not.toThrow();
    });
  });
});