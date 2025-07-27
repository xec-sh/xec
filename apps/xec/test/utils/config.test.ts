import { merge } from 'es-toolkit';
import { it, expect, describe, beforeEach } from '@jest/globals';

import { ConfigManager } from '../../src/utils/config.js';

describe('ConfigManager with es-toolkit', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('merge functionality', () => {
    it('should merge configurations correctly', () => {
      const config1 = {
        defaults: {
          adapter: 'local' as const,
          timeout: 5000
        },
        adapters: {
          ssh: {
            defaults: {
              port: 22
            }
          }
        }
      };

      const config2 = {
        defaults: {
          timeout: 10000,
          shell: '/bin/bash'
        },
        adapters: {
          ssh: {
            defaults: {
              port: 2222,
              username: 'user'
            }
          },
          docker: {
            defaults: {
              socket: '/var/run/docker.sock'
            }
          }
        }
      };

      const merged = merge(config1, config2);

      // Verify the merge behavior
      expect(merged.defaults.adapter).toBe('local');
      expect(merged.defaults.timeout).toBe(10000); // config2 overrides
      expect(merged.defaults.shell).toBe('/bin/bash'); // from config2
      expect(merged.adapters.ssh.defaults.port).toBe(2222); // config2 overrides
      expect(merged.adapters.ssh.defaults.username).toBe('user'); // from config2
      expect(merged.adapters.docker).toBeDefined(); // from config2
    });

    it('should handle nested objects correctly', () => {
      const config1 = {
        profiles: {
          dev: {
            env: {
              NODE_ENV: 'development',
              DEBUG: 'true'
            }
          }
        }
      };

      const config2 = {
        profiles: {
          dev: {
            env: {
              NODE_ENV: 'production',
              API_URL: 'https://api.example.com'
            },
            timeout: 30000
          },
          prod: {
            env: {
              NODE_ENV: 'production'
            }
          }
        }
      };

      const merged = merge(config1, config2);

      expect(merged.profiles.dev.env.NODE_ENV).toBe('production'); // config2 overrides
      expect(merged.profiles.dev.env.DEBUG).toBe('true'); // from config1
      expect(merged.profiles.dev.env.API_URL).toBe('https://api.example.com'); // from config2
      expect(merged.profiles.dev.timeout).toBe(30000); // from config2
      expect(merged.profiles.prod).toBeDefined(); // from config2
    });

    it('should handle empty objects', () => {
      const config1 = {};
      const config2 = { defaults: { adapter: 'ssh' as const } };
      
      const merged = merge(config1, config2);
      
      expect(merged).toEqual({ defaults: { adapter: 'ssh' } });
    });
  });

  describe('setValue and getValue', () => {
    it('should set and get nested values', () => {
      configManager.setValue('adapters.ssh.defaults.port', 2222);
      configManager.setValue('defaults.timeout', 10000);

      expect(configManager.getValue('adapters.ssh.defaults.port')).toBe(2222);
      expect(configManager.getValue('defaults.timeout')).toBe(10000);
      expect(configManager.getValue('non.existent.path')).toBeUndefined();
    });
  });
});