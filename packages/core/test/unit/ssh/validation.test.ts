import { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { it, expect, describe } from '@jest/globals';

import { Config, NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { PRIVATE_KEY_PATH, PRIVATE_KEY_PPK_PATH } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function normalizeConfig(config: Config) {
  return new NodeSSH().connect(config);
}

describe('SSH Configuration Validation', () => {
  describe('host and sock validation', () => {
    it('should throw if neither host or sock is provided', async () => {
      await expect(normalizeConfig({
        username: 'asdasd',
      })).rejects.toThrow('Either config.host or config.sock must be provided');
    });

    it('should throw if sock is not valid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        sock: 1,
      } as never)).rejects.toThrow('config.sock must be a valid object');

      await expect(normalizeConfig({
        username: 'asd',
        sock: 'hey',
      } as never)).rejects.toThrow('config.sock must be a valid object');

      await expect(normalizeConfig({
        username: 'asd',
        sock: '',
      } as never)).rejects.toThrow('config.sock must be a valid object');

      await expect(normalizeConfig({
        username: 'asd',
        sock: null,
      } as never)).rejects.toThrow('Either config.host or config.sock must be provided');
    });

    it('should not throw if sock is valid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        sock: new Socket(),
      })).rejects.toThrow('Socket is closed');
    });

    it('should throw if host is not valid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 2,
      } as never)).rejects.toThrow('config.host must be a valid string');

      await expect(normalizeConfig({
        username: 'asd',
        host: NaN,
      } as never)).rejects.toThrow('config.host must be a valid string');

      await expect(normalizeConfig({
        username: 'asd',
        host: null,
      } as never)).rejects.toThrow('Either config.host or config.sock must be provided');

      await expect(normalizeConfig({
        username: 'asd',
        host: {},
      } as never)).rejects.toThrow('config.host must be a valid string');

      await expect(normalizeConfig({
        username: 'asd',
        host: '',
      })).rejects.toThrow();
    });

    it('should not throw if host is valid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
      })).rejects.toThrow();
    });
  });

  describe('username validation', () => {
    it('should not throw if username is not present', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
      })).rejects.toThrow();
    });

    it('should throw if username is not valid', async () => {
      await expect(normalizeConfig({
        host: 'localhost',
        username: {},
      } as never)).rejects.toThrow('config.username must be a valid string');

      await expect(normalizeConfig({
        host: 'localhost',
        username: 2,
      } as never)).rejects.toThrow('config.username must be a valid string');
    });

    it('should not throw if username is valid', async () => {
      await expect(normalizeConfig({
        host: 'localhost',
        username: 'steel',
      })).rejects.toThrow();
    });
  });

  describe('password validation', () => {
    it('should not throw if password is not present', async () => {
      await expect(normalizeConfig({
        username: 'stee',
        host: 'localhost',
      })).rejects.toThrow();
    });

    it('should throw if password is invalid', async () => {
      await expect(normalizeConfig({
        host: 'localhost',
        username: 'asdasd',
        password: 1,
      } as never)).rejects.toThrow('config.password must be a valid string');

      await expect(normalizeConfig({
        host: 'localhost',
        username: 'asdasd',
        password: {},
      } as never)).rejects.toThrow('config.password must be a valid string');

      await expect(normalizeConfig({
        host: 'localhost',
        username: 'asdasd',
        password() {
          // No Op
        },
      } as never)).rejects.toThrow('config.password must be a valid string');
    });

    it('should not throw if password is valid', async () => {
      await expect(normalizeConfig({
        host: 'localhost',
        username: 'asd',
        password: 'pass',
      })).rejects.toThrow();
    });
  });

  describe('privateKey validation', () => {
    it('should not throw if privateKey is not present', async () => {
      await expect(normalizeConfig({
        host: 'localhost',
        username: 'asd',
      })).rejects.toThrow();
    });

    it('should throw if privateKey is invalid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey: 1,
      } as never)).rejects.toThrow('config.privateKey must be a valid string');

      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey: {},
      } as never)).rejects.toThrow('config.privateKey must be a valid string');

      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey() {
          // No Op
        },
      } as never)).rejects.toThrow('config.privateKey must be a valid string');
    });

    it('should throw if privateKey is a file and does not exist', async () => {
      const keyPath = join(__dirname, 'fixtures', 'non-existent.pub');
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKeyPath: keyPath,
      })).rejects.toThrow('config.privateKeyPath does not exist at given fs path');
    });

    it('should throw if privateKey is specified and so is privateKeyPath', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey: 'x',
        privateKeyPath: 'y',
      })).rejects.toThrow('config.privateKeyPath must not be specified when config.privateKey is specified');
    });

    it('should not throw if privateKey is valid', async () => {
      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey: readFileSync(PRIVATE_KEY_PATH, 'utf8'),
      })).rejects.toThrow();

      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKey: readFileSync(PRIVATE_KEY_PPK_PATH, 'utf8'),
      })).rejects.toThrow();

      await expect(normalizeConfig({
        username: 'asd',
        host: 'localhost',
        privateKeyPath: PRIVATE_KEY_PATH,
      })).rejects.toThrow();
    });
  });
});