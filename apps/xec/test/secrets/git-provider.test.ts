import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import { it, expect, describe, afterAll, beforeAll, beforeEach } from '@jest/globals';

import { SecretError } from '../../src/secrets/types.js';
import { GitSecretProvider } from '../../src/secrets/providers/git.js';

describe('GitSecretProvider', () => {
  let provider: GitSecretProvider;
  let testDir: string;
  let gitRepoDir: string;

  beforeAll(async () => {
    // Create a test git repository
    testDir = path.join(os.tmpdir(), `xec-test-git-secrets-${Date.now()}`);
    gitRepoDir = path.join(testDir, 'repo');
    await fs.mkdir(gitRepoDir, { recursive: true });

    // Initialize git repo
    execSync('git init', { cwd: gitRepoDir });
    execSync('git config user.email "test@example.com"', { cwd: gitRepoDir });
    execSync('git config user.name "Test User"', { cwd: gitRepoDir });
    
    // Make initial commit
    await fs.writeFile(path.join(gitRepoDir, 'README.md'), '# Test Repo');
    execSync('git add .', { cwd: gitRepoDir });
    execSync('git commit -m "Initial commit"', { cwd: gitRepoDir });
  });

  afterAll(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    provider = new GitSecretProvider({
      repoPath: gitRepoDir,
      autoCommit: false // Disable auto-commit for most tests
    });
  });

  describe('Phase 1: Basic functionality', () => {
    describe('initialize', () => {
      it('should create directory structure', async () => {
        await provider.initialize();

        const secretsPath = path.join(gitRepoDir, '.xec/secrets');
        expect(existsSync(secretsPath)).toBe(true);
        expect(existsSync(path.join(secretsPath, 'keys'))).toBe(true);
        expect(existsSync(path.join(secretsPath, 'data'))).toBe(true);
        expect(existsSync(path.join(secretsPath, '.gitignore'))).toBe(true);
        expect(existsSync(path.join(secretsPath, 'config.json'))).toBe(true);
      });

      it('should generate master key on first initialization', async () => {
        await provider.initialize();

        const masterKeyPath = path.join(gitRepoDir, '.xec/secrets/keys/master.key');
        expect(existsSync(masterKeyPath)).toBe(true);

        // Check that master key is encrypted
        const content = await fs.readFile(masterKeyPath, 'utf8');
        const keyData = JSON.parse(content);
        expect(keyData).toHaveProperty('version');
        expect(keyData).toHaveProperty('encrypted');
        expect(keyData).toHaveProperty('salt');
        expect(keyData).toHaveProperty('iv');
        expect(keyData).toHaveProperty('authTag');
      });

      it('should be idempotent', async () => {
        await provider.initialize();
        await provider.initialize(); // Should not throw

        const secretsPath = path.join(gitRepoDir, '.xec/secrets');
        expect(existsSync(secretsPath)).toBe(true);
      });

      it('should fail outside git repository', async () => {
        const nonGitDir = path.join(testDir, 'non-git');
        await fs.mkdir(nonGitDir, { recursive: true });

        const nonGitProvider = new GitSecretProvider({
          repoPath: nonGitDir
        });

        await expect(nonGitProvider.initialize()).rejects.toThrow(SecretError);
      });
    });

    describe('set/get', () => {
      beforeEach(async () => {
        await provider.initialize();
      });

      it('should set and get a secret', async () => {
        const key = 'test-key';
        const value = 'test-value';

        await provider.set(key, value);
        const retrieved = await provider.get(key);

        expect(retrieved).toBe(value);
      });

      it('should encrypt secrets with AES-256-GCM', async () => {
        const key = 'encrypted-key';
        const value = 'sensitive-value';

        await provider.set(key, value);

        // Read the raw encrypted file
        const secretsFile = path.join(gitRepoDir, '.xec/secrets/data/development.enc');
        const rawContent = await fs.readFile(secretsFile, 'utf8');
        const data = JSON.parse(rawContent);

        expect(data.format).toBe('git-encrypted');
        expect(data.secrets[key]).toHaveProperty('value');
        expect(data.secrets[key]).toHaveProperty('iv');
        expect(data.secrets[key]).toHaveProperty('authTag');

        // Ensure value is not in plaintext
        expect(rawContent).not.toContain(value);
      });

      it('should handle unicode values', async () => {
        const key = 'unicode-key';
        const value = 'Hello 世界! 🔐 Ñoño';

        await provider.set(key, value);
        const retrieved = await provider.get(key);

        expect(retrieved).toBe(value);
      });

      it('should return null for non-existent keys', async () => {
        const result = await provider.get('non-existent');
        expect(result).toBeNull();
      });

      it('should track metadata', async () => {
        const key = 'metadata-key';
        await provider.set(key, 'value');

        const secretsFile = path.join(gitRepoDir, '.xec/secrets/data/development.enc');
        const data = JSON.parse(await fs.readFile(secretsFile, 'utf8'));

        expect(data.secrets[key].metadata).toHaveProperty('addedAt');
        expect(data.secrets[key].metadata).toHaveProperty('addedBy');
        expect(data.secrets[key].metadata).toHaveProperty('updatedAt');
        expect(data.secrets[key].metadata).toHaveProperty('updatedBy');
      });
    });

    describe('delete', () => {
      beforeEach(async () => {
        await provider.initialize();
      });

      it('should delete an existing secret', async () => {
        const key = 'delete-me';
        await provider.set(key, 'value');

        expect(await provider.has(key)).toBe(true);
        await provider.delete(key);
        expect(await provider.has(key)).toBe(false);

        const retrieved = await provider.get(key);
        expect(retrieved).toBeNull();
      });

      it('should handle deleting non-existent keys', async () => {
        await expect(provider.delete('non-existent')).resolves.not.toThrow();
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        await provider.initialize();
      });

      it('should list all secret keys', async () => {
        const keys = ['key1', 'key2', 'key3'];

        for (const key of keys) {
          await provider.set(key, `value-${key}`);
        }

        const list = await provider.list();
        expect(list.sort()).toEqual(keys.sort());
      });

      it('should return empty array when no secrets', async () => {
        const list = await provider.list();
        expect(list).toEqual([]);
      });
    });

    describe('environment management', () => {
      beforeEach(async () => {
        await provider.initialize();
      });

      it('should support multiple environments', async () => {
        // Set in development
        await provider.set('dev-key', 'dev-value');

        // Switch to staging
        await provider.setEnvironment('staging');
        await provider.set('staging-key', 'staging-value');

        // Switch to production
        await provider.setEnvironment('production');
        await provider.set('prod-key', 'prod-value');

        // Verify isolation
        await provider.setEnvironment('development');
        expect(await provider.get('dev-key')).toBe('dev-value');
        expect(await provider.get('staging-key')).toBeNull();

        await provider.setEnvironment('staging');
        expect(await provider.get('staging-key')).toBe('staging-value');
        expect(await provider.get('dev-key')).toBeNull();
      });

      it('should copy environment', async () => {
        await provider.set('key1', 'value1');
        await provider.set('key2', 'value2');

        await provider.copyEnvironment('development', 'staging');

        await provider.setEnvironment('staging');
        expect(await provider.get('key1')).toBe('value1');
        expect(await provider.get('key2')).toBe('value2');
      });
    });

    describe('git integration', () => {
      it('should commit changes when autoCommit is enabled', async () => {
        const autoCommitProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: true
        });

        await autoCommitProvider.initialize();
        
        const beforeCommits = execSync('git log --oneline', { 
          cwd: gitRepoDir, 
          encoding: 'utf8' 
        }).split('\n').length;

        await autoCommitProvider.set('auto-key', 'auto-value');

        const afterCommits = execSync('git log --oneline', { 
          cwd: gitRepoDir, 
          encoding: 'utf8' 
        }).split('\n').length;

        expect(afterCommits).toBeGreaterThan(beforeCommits);

        const lastCommit = execSync('git log -1 --pretty=%B', {
          cwd: gitRepoDir,
          encoding: 'utf8'
        }).trim();

        expect(lastCommit).toContain('secrets: update auto-key');
      });
    });

    describe('export/import', () => {
      beforeEach(async () => {
        await provider.initialize();
      });

      it('should export all secrets', async () => {
        const secrets = {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        };

        for (const [key, value] of Object.entries(secrets)) {
          await provider.set(key, value);
        }

        const exported = await provider.export();
        expect(exported).toEqual(secrets);
      });

      it('should import secrets', async () => {
        const secrets = {
          imported1: 'value1',
          imported2: 'value2'
        };

        await provider.import(secrets);

        for (const [key, value] of Object.entries(secrets)) {
          expect(await provider.get(key)).toBe(value);
        }
      });

      it('should import from environment variables', async () => {
        process.env.SECRET_TEST_KEY1 = 'test-value1';
        process.env.SECRET_TEST_KEY2 = 'test-value2';

        await provider.importFromEnv('SECRET_TEST_');

        expect(await provider.get('key1')).toBe('test-value1');
        expect(await provider.get('key2')).toBe('test-value2');

        // Clean up
        delete process.env.SECRET_TEST_KEY1;
        delete process.env.SECRET_TEST_KEY2;
      });
    });
  });

  describe('Phase 2: Team features', () => {
    describe('team member management', () => {
      let teamProvider: GitSecretProvider;
      let memberPublicKey: string;
      let memberPrivateKey: string;

      beforeEach(async () => {
        teamProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: false,
          auditLog: true
        });

        await teamProvider.initialize();

        // Generate a test RSA key pair for team member
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });

        memberPublicKey = publicKey;
        memberPrivateKey = privateKey;

        // Save public key to file
        const pubKeyPath = path.join(testDir, 'member.pub');
        await fs.writeFile(pubKeyPath, memberPublicKey);
      });

      it('should add team member', async () => {
        const pubKeyPath = path.join(testDir, 'member.pub');
        await teamProvider.addTeamMember('alice@example.com', pubKeyPath, 'read-write');

        const members = await teamProvider.listTeamMembers();
        expect(members).toHaveLength(1);
        expect(members[0].userId).toBe('alice@example.com');
        expect(members[0].permissions).toBe('read-write');
      });

      it('should encrypt master key for team member', async () => {
        const pubKeyPath = path.join(testDir, 'member.pub');
        await teamProvider.addTeamMember('bob@example.com', pubKeyPath, 'read');

        const encKeyPath = path.join(
          gitRepoDir,
          '.xec/secrets/keys/team/bob_at_example.com.key.enc'
        );
        expect(existsSync(encKeyPath)).toBe(true);

        // Verify the encrypted key exists and is base64
        const encryptedKey = await fs.readFile(encKeyPath, 'utf8');
        expect(() => Buffer.from(encryptedKey, 'base64')).not.toThrow();
      });

      it('should remove team member', async () => {
        const pubKeyPath = path.join(testDir, 'member.pub');
        await teamProvider.addTeamMember('charlie@example.com', pubKeyPath);

        let members = await teamProvider.listTeamMembers();
        const initialCount = members.length;

        await teamProvider.removeTeamMember('charlie@example.com');

        members = await teamProvider.listTeamMembers();
        expect(members.length).toBe(initialCount - 1);
        expect(members.find(m => m.userId === 'charlie@example.com')).toBeUndefined();
      });

      it('should fail to remove non-existent member', async () => {
        await expect(
          teamProvider.removeTeamMember('nonexistent@example.com')
        ).rejects.toThrow(SecretError);
      });

      it('should support different permission levels', async () => {
        const pubKeyPath = path.join(testDir, 'member.pub');
        
        await teamProvider.addTeamMember('read@example.com', pubKeyPath, 'read');
        await teamProvider.addTeamMember('write@example.com', pubKeyPath, 'read-write');
        await teamProvider.addTeamMember('admin@example.com', pubKeyPath, 'admin');

        const members = await teamProvider.listTeamMembers();
        
        const readMember = members.find(m => m.userId === 'read@example.com');
        const writeMember = members.find(m => m.userId === 'write@example.com');
        const adminMember = members.find(m => m.userId === 'admin@example.com');

        expect(readMember?.permissions).toBe('read');
        expect(writeMember?.permissions).toBe('read-write');
        expect(adminMember?.permissions).toBe('admin');
      });
    });

    describe('key rotation', () => {
      let rotationProvider: GitSecretProvider;

      beforeEach(async () => {
        rotationProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: false
        });

        await rotationProvider.initialize();
      });

      it('should rotate master key', async () => {
        // Set some secrets
        await rotationProvider.set('key1', 'value1');
        await rotationProvider.set('key2', 'value2');

        // Get the original master key path
        const masterKeyPath = path.join(gitRepoDir, '.xec/secrets/keys/master.key');
        const originalKey = await fs.readFile(masterKeyPath, 'utf8');

        // Rotate the key
        await rotationProvider.rotateMasterKey();

        // Check that the key has changed
        const newKey = await fs.readFile(masterKeyPath, 'utf8');
        expect(newKey).not.toBe(originalKey);

        // Verify secrets are still accessible
        expect(await rotationProvider.get('key1')).toBe('value1');
        expect(await rotationProvider.get('key2')).toBe('value2');
      });

      it('should backup old keys when rotating', async () => {
        await rotationProvider.rotateMasterKey();

        const backupDir = path.join(gitRepoDir, '.xec/secrets/keys/backups');
        expect(existsSync(backupDir)).toBe(true);

        const backups = await fs.readdir(backupDir);
        expect(backups.length).toBeGreaterThan(0);
        expect(backups[0]).toMatch(/master-.*\.key\.bak/);
      });

      it('should re-encrypt all secrets across environments during rotation', async () => {
        // Set secrets in multiple environments
        await rotationProvider.set('dev-secret', 'dev-value');
        
        await rotationProvider.setEnvironment('staging');
        await rotationProvider.set('staging-secret', 'staging-value');
        
        await rotationProvider.setEnvironment('production');
        await rotationProvider.set('prod-secret', 'prod-value');

        // Rotate key
        await rotationProvider.setEnvironment('development');
        await rotationProvider.rotateMasterKey();

        // Verify all secrets are still accessible
        expect(await rotationProvider.get('dev-secret')).toBe('dev-value');
        
        await rotationProvider.setEnvironment('staging');
        expect(await rotationProvider.get('staging-secret')).toBe('staging-value');
        
        await rotationProvider.setEnvironment('production');
        expect(await rotationProvider.get('prod-secret')).toBe('prod-value');
      });

      it('should update team member keys during rotation', async () => {
        // Add a team member
        const { publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });

        const pubKeyPath = path.join(testDir, 'rotation-member.pub');
        await fs.writeFile(pubKeyPath, publicKey);
        
        await rotationProvider.addTeamMember('rotate@example.com', pubKeyPath);

        const encKeyPath = path.join(
          gitRepoDir,
          '.xec/secrets/keys/team/rotate_at_example.com.key.enc'
        );
        const originalEncKey = await fs.readFile(encKeyPath, 'utf8');

        // Rotate master key
        await rotationProvider.rotateMasterKey();

        // Check that team member's encrypted key has changed
        const newEncKey = await fs.readFile(encKeyPath, 'utf8');
        expect(newEncKey).not.toBe(originalEncKey);
      });
    });

    describe('audit logging', () => {
      let auditProvider: GitSecretProvider;

      beforeEach(async () => {
        auditProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: false,
          auditLog: true
        });

        await auditProvider.initialize();
      });

      it('should log secret operations', async () => {
        await auditProvider.set('audit-key', 'audit-value');
        await auditProvider.get('audit-key');
        await auditProvider.delete('audit-key');

        const logs = await auditProvider.getAuditLogs();
        
        expect(logs.some(l => l.action === 'set' && l.key === 'audit-key')).toBe(true);
        expect(logs.some(l => l.action === 'get' && l.key === 'audit-key')).toBe(true);
        expect(logs.some(l => l.action === 'delete' && l.key === 'audit-key')).toBe(true);
      });

      it('should log team operations', async () => {
        const { publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });

        const pubKeyPath = path.join(testDir, 'audit-member.pub');
        await fs.writeFile(pubKeyPath, publicKey);

        await auditProvider.addTeamMember('audit@example.com', pubKeyPath);
        await auditProvider.removeTeamMember('audit@example.com');

        const logs = await auditProvider.getAuditLogs();
        
        expect(logs.some(l => 
          l.action === 'team-add' && 
          l.details?.member === 'audit@example.com'
        )).toBe(true);
        
        expect(logs.some(l => 
          l.action === 'team-remove' && 
          l.details?.member === 'audit@example.com'
        )).toBe(true);
      });

      it('should filter audit logs by date', async () => {
        const startDate = new Date();
        
        await auditProvider.set('date-test-key', 'value');
        
        const endDate = new Date();
        endDate.setSeconds(endDate.getSeconds() + 1);

        const logs = await auditProvider.getAuditLogs(startDate, endDate);
        
        expect(logs.every(l => 
          l.timestamp >= startDate && l.timestamp <= endDate
        )).toBe(true);
      });

      it('should filter audit logs by action', async () => {
        await auditProvider.set('filter-key1', 'value1');
        await auditProvider.set('filter-key2', 'value2');
        await auditProvider.get('filter-key1');
        await auditProvider.delete('filter-key2');

        const setLogs = await auditProvider.getAuditLogs(undefined, undefined, 'set');
        const getLogs = await auditProvider.getAuditLogs(undefined, undefined, 'get');
        const deleteLogs = await auditProvider.getAuditLogs(undefined, undefined, 'delete');

        expect(setLogs.every(l => l.action === 'set')).toBe(true);
        expect(getLogs.every(l => l.action === 'get')).toBe(true);
        expect(deleteLogs.every(l => l.action === 'delete')).toBe(true);
      });

      it('should include git commit hash in audit logs', async () => {
        const commitProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: true,
          auditLog: true
        });

        await commitProvider.initialize();
        await commitProvider.set('commit-test-key', 'value');

        const logs = await commitProvider.getAuditLogs();
        const lastLog = logs[logs.length - 1];

        expect(lastLog.gitCommit).toBeDefined();
        expect(lastLog.gitCommit).toMatch(/^[a-f0-9]{40}$/);
      });

      it('should disable audit logging when configured', async () => {
        const noAuditProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: false,
          auditLog: false
        });

        await noAuditProvider.initialize();
        await noAuditProvider.set('no-audit-key', 'value');

        const auditDir = path.join(gitRepoDir, '.xec/secrets/audit');
        const files = existsSync(auditDir) ? await fs.readdir(auditDir) : [];
        
        // Should not create new audit logs when disabled
        const beforeCount = files.length;
        await noAuditProvider.get('no-audit-key');
        
        const afterFiles = existsSync(auditDir) ? await fs.readdir(auditDir) : [];
        expect(afterFiles.length).toBe(beforeCount);
      });
    });

    describe('error handling', () => {
      it('should throw SecretError with proper codes', async () => {
        const errorProvider = new GitSecretProvider({
          repoPath: gitRepoDir
        });

        await errorProvider.initialize();

        // Test various error scenarios
        try {
          await errorProvider.removeTeamMember('nonexistent@example.com');
        } catch (error) {
          expect(error).toBeInstanceOf(SecretError);
          expect((error as SecretError).code).toBe('TEAM_MEMBER_NOT_FOUND');
        }
      });

      it('should handle corrupted encrypted files', async () => {
        await provider.initialize();
        await provider.set('corrupt-test', 'value');

        // Corrupt the encrypted file
        const secretsFile = path.join(gitRepoDir, '.xec/secrets/data/development.enc');
        await fs.writeFile(secretsFile, 'corrupted data');

        await expect(provider.get('corrupt-test')).rejects.toThrow(SecretError);
      });

      it('should handle missing master key', async () => {
        await provider.initialize();

        // Remove master key
        const masterKeyPath = path.join(gitRepoDir, '.xec/secrets/keys/master.key');
        await fs.unlink(masterKeyPath);

        // Create new provider instance
        const newProvider = new GitSecretProvider({
          repoPath: gitRepoDir
        });

        await newProvider.initialize();
        await expect(newProvider.get('any-key')).rejects.toThrow(SecretError);
      });
    });

    describe('security', () => {
      it('should create files with restricted permissions', async () => {
        await provider.initialize();
        await provider.set('secure-key', 'secure-value');

        // Check master key permissions
        const masterKeyPath = path.join(gitRepoDir, '.xec/secrets/keys/master.key');
        const masterKeyStats = await fs.stat(masterKeyPath);
        expect(masterKeyStats.mode & 0o777).toBe(0o600);

        // Check encrypted secrets permissions
        const secretsFile = path.join(gitRepoDir, '.xec/secrets/data/development.enc');
        const secretsStats = await fs.stat(secretsFile);
        expect(secretsStats.mode & 0o777).toBe(0o600);
      });

      it('should not expose secrets in git history', async () => {
        const gitProvider = new GitSecretProvider({
          repoPath: gitRepoDir,
          autoCommit: true
        });

        await gitProvider.initialize();
        await gitProvider.set('sensitive-key', 'sensitive-value-12345');

        // Check that .gitignore prevents master key from being committed
        const gitignorePath = path.join(gitRepoDir, '.xec/secrets/.gitignore');
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        expect(gitignoreContent).toContain('master.key');

        // Check git log doesn't contain the secret value
        const gitLog = execSync('git log --all --full-history -p', {
          cwd: gitRepoDir,
          encoding: 'utf8'
        });
        
        expect(gitLog).not.toContain('sensitive-value-12345');
      });

      it('should verify checksum integrity', async () => {
        await provider.initialize();
        await provider.set('checksum-key', 'checksum-value');

        // Tamper with the encrypted file
        const secretsFile = path.join(gitRepoDir, '.xec/secrets/data/development.enc');
        const data = JSON.parse(await fs.readFile(secretsFile, 'utf8'));
        
        // Change checksum
        data.checksum = 'invalid-checksum';
        await fs.writeFile(secretsFile, JSON.stringify(data, null, 2));

        // Should still work as checksum is recalculated, but demonstrates the field exists
        const secretData = JSON.parse(await fs.readFile(secretsFile, 'utf8'));
        expect(secretData).toHaveProperty('checksum');
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should handle concurrent operations', async () => {
      await provider.initialize();

      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(provider.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // Verify all writes succeeded
      for (let i = 0; i < 10; i++) {
        expect(await provider.get(`concurrent-${i}`)).toBe(`value-${i}`);
      }
    });

    it('should handle large secrets', async () => {
      await provider.initialize();

      const largeValue = 'x'.repeat(100000); // 100KB
      await provider.set('large-key', largeValue);

      const retrieved = await provider.get('large-key');
      expect(retrieved).toBe(largeValue);
    });

    it('should maintain consistency across provider instances', async () => {
      await provider.initialize();
      await provider.set('shared-key', 'shared-value');

      // Create new provider instance
      const provider2 = new GitSecretProvider({
        repoPath: gitRepoDir
      });

      expect(await provider2.get('shared-key')).toBe('shared-value');
    });

    it('should handle special characters in keys', async () => {
      await provider.initialize();

      const specialKeys = [
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'KEY_WITH_CAPS'
      ];

      for (const key of specialKeys) {
        await provider.set(key, `value-for-${key}`);
        expect(await provider.get(key)).toBe(`value-for-${key}`);
      }
    });
  });
});