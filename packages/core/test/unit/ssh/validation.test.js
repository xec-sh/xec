import { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { it, expect, describe } from '@jest/globals';
import { NodeSSH } from '../../../src/utils/ssh.js';
import { PRIVATE_KEY_PATH, PRIVATE_KEY_PPK_PATH } from './helpers.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
async function normalizeConfig(config) {
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
            })).rejects.toThrow('config.sock must be a valid object');
            await expect(normalizeConfig({
                username: 'asd',
                sock: 'hey',
            })).rejects.toThrow('config.sock must be a valid object');
            await expect(normalizeConfig({
                username: 'asd',
                sock: '',
            })).rejects.toThrow('config.sock must be a valid object');
            await expect(normalizeConfig({
                username: 'asd',
                sock: null,
            })).rejects.toThrow('Either config.host or config.sock must be provided');
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
            })).rejects.toThrow('config.host must be a valid string');
            await expect(normalizeConfig({
                username: 'asd',
                host: NaN,
            })).rejects.toThrow('config.host must be a valid string');
            await expect(normalizeConfig({
                username: 'asd',
                host: null,
            })).rejects.toThrow('Either config.host or config.sock must be provided');
            await expect(normalizeConfig({
                username: 'asd',
                host: {},
            })).rejects.toThrow('config.host must be a valid string');
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
            })).rejects.toThrow('config.username must be a valid string');
            await expect(normalizeConfig({
                host: 'localhost',
                username: 2,
            })).rejects.toThrow('config.username must be a valid string');
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
            })).rejects.toThrow('config.password must be a valid string');
            await expect(normalizeConfig({
                host: 'localhost',
                username: 'asdasd',
                password: {},
            })).rejects.toThrow('config.password must be a valid string');
            await expect(normalizeConfig({
                host: 'localhost',
                username: 'asdasd',
                password() {
                },
            })).rejects.toThrow('config.password must be a valid string');
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
            })).rejects.toThrow('config.privateKey must be a valid string');
            await expect(normalizeConfig({
                username: 'asd',
                host: 'localhost',
                privateKey: {},
            })).rejects.toThrow('config.privateKey must be a valid string');
            await expect(normalizeConfig({
                username: 'asd',
                host: 'localhost',
                privateKey() {
                },
            })).rejects.toThrow('config.privateKey must be a valid string');
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
//# sourceMappingURL=validation.test.js.map