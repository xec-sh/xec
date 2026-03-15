import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { execSync } from 'node:child_process';

import { getCachedMachineId } from '../machine-id.js';
import {
  encode,
  decode,
  encrypt,
  decrypt
} from '../crypto.js';
import {
  SecretError,
  SecretProvider,
  SecretProviderConfig
} from '../types.js';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * Git-based secrets configuration
 */
interface GitSecretConfig {
  repoPath?: string;           // Default: current git root
  secretsPath?: string;        // Default: .xec/secrets
  environment?: string;        // Default: 'development'
  autoCommit?: boolean;        // Default: true
  commitMessage?: string;      // Template for commit messages
  keyAlgorithm?: 'rsa' | 'ed25519';  // Default: 'rsa'
  keySize?: 2048 | 4096;      // Default: 4096
  compression?: boolean;       // Default: true for large secrets
  auditLog?: boolean;          // Default: true - Enable audit logging
}

/**
 * Team member key information
 */
interface TeamKeyInfo {
  userId: string;              // Git user email or identifier
  publicKey: string;           // RSA public key (PEM format)
  addedAt: Date;
  addedBy: string;
  permissions: 'read' | 'read-write' | 'admin';
  encryptedMasterKey: string;  // Base64 encoded
}

/**
 * Audit log entry
 */
interface AuditLog {
  timestamp: Date;
  action: 'get' | 'set' | 'delete' | 'rotate' | 'team-add' | 'team-remove' | 'export' | 'import';
  user: string;
  key?: string;
  environment?: string;
  gitCommit?: string;
  details?: Record<string, any>;
}

/**
 * Encrypted git secret format
 */
interface EncryptedGitSecret {
  version: 2;
  format: 'git-encrypted';
  environment: string;
  secrets: {
    [key: string]: {
      value: string;             // Base64 encrypted value
      iv: string;                // Base64 initialization vector
      authTag: string;           // Base64 auth tag
      metadata: {
        addedAt: Date;
        addedBy: string;         // Git user identity
        updatedAt: Date;
        updatedBy: string;
        description?: string;
      };
    };
  };
  checksum: string;              // SHA-256 of entire payload
}

/**
 * Master key structure
 */
interface MasterKey {
  version: number;
  algorithm: 'aes-256-gcm';
  key: Buffer;           // 32 bytes
  salt: Buffer;          // 32 bytes
  createdAt: Date;
  rotatedAt?: Date;
  createdBy: string;     // Git user identity
}

/**
 * Backup format for complete secrets
 */
interface SecretsBackup {
  version: 1;
  format: 'git-secrets-backup';
  createdAt: Date;
  createdBy: string;
  environments: {
    [env: string]: {
      secrets: Record<string, string>;
      metadata?: Record<string, any>;
    };
  };
  compressed?: boolean;
  checksum: string;
}

/**
 * Cache entry for decrypted secrets
 */
interface CacheEntry {
  value: string;
  timestamp: number;
  ttl: number;
}

/**
 * Git-based secret provider that stores encrypted secrets in git repository
 * Phase 1: Basic encryption/decryption, single-user support, git integration, local key storage
 * Phase 2: Multi-user key management, team member management, key rotation, audit logging
 * Phase 3: Environment management, migration tools, backup/restore, performance optimization
 */
export class GitSecretProvider implements SecretProvider {
  private repoPath: string;
  private secretsPath: string;
  private keyPath: string;
  private environment: string;
  private autoCommit: boolean;
  private encryptionKey?: Buffer;
  private initialized = false;
  private config: GitSecretConfig;
  private teamKeys: Map<string, TeamKeyInfo> = new Map();
  private auditLogEnabled: boolean;
  private userPrivateKey?: crypto.KeyObject;
  private userPublicKey?: crypto.KeyObject;

  // Phase 3: Performance optimization
  private secretsCache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number = 60000; // 1 minute default
  private compressionThreshold: number = 1024; // Compress secrets larger than 1KB
  private batchQueue: Map<string, string> = new Map();
  private batchTimer?: NodeJS.Timeout;

  constructor(config?: SecretProviderConfig['config']) {
    this.config = config || {};
    this.repoPath = this.config.repoPath || this.findGitRoot();
    this.secretsPath = path.join(this.repoPath, this.config.secretsPath || '.xec/secrets');
    this.keyPath = path.join(this.secretsPath, 'keys');
    this.environment = this.config.environment || 'development';
    this.autoCommit = this.config.autoCommit !== false;
    this.auditLogEnabled = this.config.auditLog !== false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Check for git repository
    await this.verifyGitRepository();

    // 2. Create directory structure
    await this.createDirectoryStructure();

    // 3. Load or generate master key
    await this.initializeMasterKey();

    // 4. Setup user key if needed (Phase 2)
    await this.setupUserKey();

    // 5. Load team keys (Phase 2)
    await this.loadTeamKeys();

    // 6. Verify access permissions
    await this.verifyAccess();

    this.initialized = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureInitialized();

    try {
      // Phase 3: Check cache first for performance
      const cacheKey = `${this.environment}:${key}`;
      const cached = this.secretsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        // Log audit event for cached access
        await this.logAudit('get', key);
        return cached.value;
      }

      // 1. Load encrypted secrets file for current environment
      const encryptedData = await this.loadEncryptedSecrets();

      if (!encryptedData || !encryptedData.secrets[key]) {
        return null;
      }

      // 2. Get master key
      const masterKey = await this.getMasterKey();

      // 3. Decrypt specific secret
      const secret = encryptedData.secrets[key];

      // 4. Verify integrity
      await this.verifyIntegrity(secret);

      // 5. Decrypt and return value
      const value = this.decryptValue(secret, masterKey);

      // Phase 3: Cache the decrypted value
      this.secretsCache.set(cacheKey, {
        value,
        timestamp: Date.now(),
        ttl: this.cacheTTL
      });

      // 6. Log audit event (Phase 2)
      await this.logAudit('get', key);

      return value;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }

      throw new SecretError(
        `Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ERROR',
        key
      );
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Phase 3: Invalidate cache
      const cacheKey = `${this.environment}:${key}`;
      this.secretsCache.delete(cacheKey);

      // 1. Load current secrets
      const data = await this.loadOrCreateSecrets();

      // 2. Get master key
      const masterKey = await this.getMasterKey();

      // 3. Encrypt new value (with compression for large values)
      const encrypted = await this.encryptValue(value, masterKey);

      // 4. Update metadata
      const gitUser = await this.getGitUser();
      encrypted.metadata = {
        ...encrypted.metadata,
        updatedAt: new Date(),
        updatedBy: gitUser
      };

      if (!data.secrets[key]) {
        encrypted.metadata.addedAt = new Date();
        encrypted.metadata.addedBy = gitUser;
      } else {
        encrypted.metadata.addedAt = data.secrets[key].metadata.addedAt;
        encrypted.metadata.addedBy = data.secrets[key].metadata.addedBy;
      }

      // 5. Save to encrypted file
      data.secrets[key] = encrypted;
      await this.saveEncryptedSecrets(data);

      // 6. Create git commit if autoCommit is enabled
      if (this.autoCommit) {
        await this.commitChanges(`secrets: update ${key}`);
      }

      // 7. Log audit event (Phase 2)
      await this.logAudit('set', key);
    } catch (error) {
      throw new SecretError(
        `Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SET_ERROR',
        key
      );
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Phase 3: Invalidate cache
      const cacheKey = `${this.environment}:${key}`;
      this.secretsCache.delete(cacheKey);

      const data = await this.loadEncryptedSecrets();

      if (!data || !data.secrets[key]) {
        return; // Secret doesn't exist
      }

      delete data.secrets[key];
      await this.saveEncryptedSecrets(data);

      if (this.autoCommit) {
        await this.commitChanges(`secrets: delete ${key}`);
      }

      // Log audit event (Phase 2)
      await this.logAudit('delete', key);
    } catch (error) {
      throw new SecretError(
        `Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR',
        key
      );
    }
  }

  async list(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const data = await this.loadEncryptedSecrets();
      return data ? Object.keys(data.secrets) : [];
    } catch (error) {
      throw new SecretError(
        `Failed to list secrets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ERROR'
      );
    }
  }

  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();

    const data = await this.loadEncryptedSecrets();
    return data ? key in data.secrets : false;
  }

  /**
   * Set the environment for secrets
   */
  async setEnvironment(env: string): Promise<void> {
    this.environment = env;
    await this.loadEnvironmentSecrets();
  }

  /**
   * Copy secrets from one environment to another
   */
  async copyEnvironment(source: string, target: string): Promise<void> {
    const currentEnv = this.environment;

    // Load source environment secrets
    this.environment = source;
    const sourceSecrets = await this.loadEncryptedSecrets();

    // Save to target environment
    this.environment = target;
    if (sourceSecrets) {
      await this.saveEncryptedSecrets(sourceSecrets);

      if (this.autoCommit) {
        await this.commitChanges(`secrets: copy ${source} to ${target}`);
      }
    }

    // Restore original environment
    this.environment = currentEnv;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private findGitRoot(): string {
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
      return gitRoot;
    } catch (error) {
      throw new SecretError(
        'Not in a git repository. Please run this command from within a git repository.',
        'NOT_GIT_REPO'
      );
    }
  }

  private async verifyGitRepository(): Promise<void> {
    try {
      execSync('git status', { cwd: this.repoPath, encoding: 'utf8' });
    } catch (error) {
      throw new SecretError(
        'Not in a git repository or git is not available',
        'NOT_GIT_REPO'
      );
    }
  }

  private async createDirectoryStructure(): Promise<void> {
    // Create directory structure
    await fs.mkdir(this.secretsPath, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.keyPath, { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(this.keyPath, 'team'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(this.secretsPath, 'data'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(this.secretsPath, 'audit'), { recursive: true, mode: 0o700 });

    // Create .gitignore if it doesn't exist
    const gitignorePath = path.join(this.secretsPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      const gitignoreContent = [
        '# Never commit unencrypted master key',
        'keys/master.key',
        '',
        '# Temporary files',
        '*.tmp',
        '*.bak',
        '',
        '# Decrypted files',
        '*.decrypted',
        '*.plain'
      ].join('\n');

      await fs.writeFile(gitignorePath, gitignoreContent, { mode: 0o644 });
    }

    // Create config.json if it doesn't exist
    const configPath = path.join(this.secretsPath, 'config.json');
    if (!existsSync(configPath)) {
      const config = {
        type: 'git',
        version: 1,
        createdAt: new Date().toISOString()
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o644 });
    }
  }

  private async initializeMasterKey(): Promise<void> {
    const masterKeyPath = path.join(this.keyPath, 'master.key');
    const masterKeyEncPath = path.join(this.keyPath, 'master.key.enc');

    if (existsSync(masterKeyPath)) {
      // Load existing master key
      try {
        await this.loadMasterKey();
      } catch (error) {
        // If we can't load directly, we'll try team key later
        console.debug('Master key direct load failed, will try team key');
      }
    } else if (existsSync(masterKeyEncPath)) {
      // Master key exists but encrypted for team - we'll decrypt with user key
      console.debug('Master key encrypted for team, will decrypt with user key');
    } else {
      // Generate new master key
      await this.generateMasterKey();
    }
  }

  private async generateMasterKey(): Promise<void> {
    // Generate a new 256-bit key
    const key = crypto.randomBytes(32);
    const salt = crypto.randomBytes(32);

    const masterKey: MasterKey = {
      version: 1,
      algorithm: 'aes-256-gcm',
      key,
      salt,
      createdAt: new Date(),
      createdBy: await this.getGitUser()
    };

    // Get machine ID for encrypting the master key
    const machineId = await getCachedMachineId();

    // Encrypt master key with machine ID
    const { encrypted, salt: encSalt, iv, authTag } = await encrypt(
      JSON.stringify({
        key: key.toString('base64'),
        salt: salt.toString('base64')
      }),
      machineId
    );

    // Save encrypted master key
    const encryptedMasterKey = {
      version: 1,
      encrypted: encode(encrypted),
      salt: encode(encSalt),
      iv: encode(iv),
      authTag: encode(authTag),
      metadata: {
        createdAt: masterKey.createdAt,
        createdBy: masterKey.createdBy
      }
    };

    const masterKeyPath = path.join(this.keyPath, 'master.key');
    await fs.writeFile(
      masterKeyPath,
      JSON.stringify(encryptedMasterKey, null, 2),
      { mode: 0o600 }
    );

    this.encryptionKey = key;
  }

  private async loadMasterKey(): Promise<void> {
    const masterKeyPath = path.join(this.keyPath, 'master.key');

    try {
      const data = await fs.readFile(masterKeyPath, 'utf8');
      const encryptedMasterKey = JSON.parse(data);

      // Get machine ID
      const machineId = await getCachedMachineId();

      // Decrypt master key
      const decrypted = await decrypt(
        decode(encryptedMasterKey.encrypted),
        decode(encryptedMasterKey.salt),
        decode(encryptedMasterKey.iv),
        decode(encryptedMasterKey.authTag),
        machineId
      );

      const masterKeyData = JSON.parse(decrypted);
      this.encryptionKey = Buffer.from(masterKeyData.key, 'base64');
    } catch (error) {
      throw new SecretError(
        'Failed to load master key. The key may be corrupted or you may not have access.',
        'NO_MASTER_KEY'
      );
    }
  }

  private async getMasterKey(): Promise<Buffer> {
    if (!this.encryptionKey) {
      // Try to load master key directly
      try {
        await this.loadMasterKey();
      } catch (error) {
        // If direct load fails, try to decrypt using user's team key (Phase 2)
        const teamKey = await this.decryptMasterKeyWithUserKey();
        if (teamKey) {
          this.encryptionKey = teamKey;
        } else {
          throw new SecretError('Master key not available', 'NO_MASTER_KEY');
        }
      }
    }

    if (!this.encryptionKey) {
      throw new SecretError('Master key not available', 'NO_MASTER_KEY');
    }

    return this.encryptionKey;
  }

  private async verifyAccess(): Promise<void> {
    try {
      await fs.access(this.secretsPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new SecretError(
        `Cannot access secret storage directory: ${this.secretsPath}`,
        'ACCESS_DENIED'
      );
    }
  }

  private async loadEncryptedSecrets(): Promise<EncryptedGitSecret | null> {
    const secretsFilePath = path.join(this.secretsPath, 'data', `${this.environment}.enc`);

    if (!existsSync(secretsFilePath)) {
      return null;
    }

    try {
      const data = await fs.readFile(secretsFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new SecretError(
        `Failed to load encrypted secrets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DECRYPTION_FAILED'
      );
    }
  }

  private async loadOrCreateSecrets(): Promise<EncryptedGitSecret> {
    const existing = await this.loadEncryptedSecrets();

    if (existing) {
      return existing;
    }

    // Create new secrets file
    const newSecrets: EncryptedGitSecret = {
      version: 2,
      format: 'git-encrypted',
      environment: this.environment,
      secrets: {},
      checksum: ''
    };

    // Calculate checksum
    newSecrets.checksum = this.calculateChecksum(newSecrets);

    return newSecrets;
  }

  private async saveEncryptedSecrets(data: EncryptedGitSecret): Promise<void> {
    // Update checksum
    data.checksum = this.calculateChecksum(data);

    const secretsFilePath = path.join(this.secretsPath, 'data', `${this.environment}.enc`);

    await fs.writeFile(
      secretsFilePath,
      JSON.stringify(data, null, 2),
      { mode: 0o600 }
    );
  }

  private async loadEnvironmentSecrets(): Promise<void> {
    // This will trigger a reload when environment changes
    await this.loadEncryptedSecrets();
  }

  private async encryptValue(value: string, masterKey: Buffer): Promise<any> {
    // Phase 3: Compress large values for performance
    let dataToEncrypt = Buffer.from(value, 'utf8');
    let compressed = false;

    if (this.config.compression !== false && dataToEncrypt.length > this.compressionThreshold) {
      dataToEncrypt = Buffer.from(await gzipAsync(dataToEncrypt));
      compressed = true;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(dataToEncrypt),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      value: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      compressed,
      metadata: {}
    };
  }

  private decryptValue(secret: any, masterKey: Buffer): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(secret.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));

    let decrypted = Buffer.concat([
      decipher.update(Buffer.from(secret.value, 'base64')),
      decipher.final()
    ]);

    // Phase 3: Decompress if needed
    if (secret.compressed) {
      try {
        decrypted = Buffer.from(zlib.gunzipSync(decrypted));
      } catch (error) {
        throw new SecretError('Failed to decompress secret', 'DECRYPTION_FAILED');
      }
    }

    return decrypted.toString('utf8');
  }

  private async verifyIntegrity(secret: any): Promise<void> {
    // In Phase 1, we rely on GCM auth tag for integrity
    // Additional verification can be added in later phases
    if (!secret.authTag) {
      throw new SecretError('Secret integrity verification failed', 'DECRYPTION_FAILED');
    }
  }

  private calculateChecksum(data: EncryptedGitSecret): string {
    const copy = { ...data, checksum: '' };
    const content = JSON.stringify(copy);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async getGitUser(): Promise<string> {
    try {
      const email = execSync('git config user.email', {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim();

      return email || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  private async commitChanges(message: string): Promise<void> {
    try {
      // Add changes to git
      execSync(`git add ${this.secretsPath}`, { cwd: this.repoPath });

      // Check if there are changes to commit
      const status = execSync('git status --porcelain', {
        cwd: this.repoPath,
        encoding: 'utf8'
      });

      if (status.trim()) {
        // Commit changes
        execSync(`git commit -m "${message}"`, { cwd: this.repoPath });
      }
    } catch (error) {
      throw new SecretError(
        `Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_OPERATION_FAILED'
      );
    }
  }

  /**
   * Export all secrets (decrypted) - use with caution
   */
  async export(): Promise<Record<string, string>> {
    await this.ensureInitialized();

    const keys = await this.list();
    const secrets: Record<string, string> = {};

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) {
        secrets[key] = value;
      }
    }

    await this.logAudit('export', undefined, { count: Object.keys(secrets).length });

    return secrets;
  }

  /**
   * Import secrets from a plain object
   */
  async import(secrets: Record<string, string>): Promise<void> {
    await this.ensureInitialized();

    for (const [key, value] of Object.entries(secrets)) {
      await this.set(key, value);
    }

    if (this.autoCommit) {
      await this.commitChanges(`secrets: import ${Object.keys(secrets).length} secrets`);
    }
  }

  /**
   * Migrate from local provider
   */
  async migrateFromLocal(localProvider: any): Promise<void> {
    // 1. Export all secrets from local provider
    const secrets = await localProvider.export();

    // 2. Initialize git provider
    await this.initialize();

    // 3. Import secrets
    for (const [key, value] of Object.entries(secrets)) {
      await this.set(key, value as string);
    }

    // 4. Commit migration
    if (this.autoCommit) {
      await this.commitChanges('migrate: import secrets from local provider');
    }
  }

  /**
   * Import from environment variables
   */
  async importFromEnv(prefix: string = 'SECRET_'): Promise<void> {
    const imported: string[] = [];

    for (const [envKey, value] of Object.entries(process.env)) {
      if (envKey.startsWith(prefix) && value) {
        const key = envKey.slice(prefix.length).toLowerCase();
        await this.set(key, value);
        imported.push(key);
      }
    }

    if (this.autoCommit && imported.length > 0) {
      await this.commitChanges(`import: ${imported.length} secrets from environment`);
    }

    await this.logAudit('import', undefined, { imported: imported.length });
  }

  // ==================== Phase 2: Team Features ====================

  /**
   * Setup user's RSA key pair for team collaboration
   */
  private async setupUserKey(): Promise<void> {
    const userEmail = await this.getGitUser();
    const userKeyPath = path.join(this.keyPath, 'user.key');
    const userPubKeyPath = path.join(this.keyPath, 'user.pub');

    if (!existsSync(userKeyPath)) {
      // Generate new RSA key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: this.config.keySize || 4096,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: await this.getUserPassphrase()
        }
      });

      // Save keys
      await fs.writeFile(userKeyPath, privateKey, { mode: 0o600 });
      await fs.writeFile(userPubKeyPath, publicKey, { mode: 0o644 });

      // Add self to team if not exists
      if (!this.teamKeys.has(userEmail)) {
        await this.addTeamMember(userEmail, userPubKeyPath, 'admin');
      }
    } else {
      // Load existing keys
      const privateKeyPem = await fs.readFile(userKeyPath, 'utf8');
      const publicKeyPem = await fs.readFile(userPubKeyPath, 'utf8');

      this.userPrivateKey = crypto.createPrivateKey({
        key: privateKeyPem,
        passphrase: await this.getUserPassphrase()
      });
      this.userPublicKey = crypto.createPublicKey(publicKeyPem);
    }
  }

  /**
   * Get user passphrase for private key
   * In production, this should use OS keychain
   */
  private async getUserPassphrase(): Promise<string> {
    // For now, derive from machine ID
    // In production, use OS keychain or prompt
    const machineId = await getCachedMachineId();
    return crypto.createHash('sha256').update(machineId).digest('hex');
  }

  /**
   * Load team keys from storage
   */
  private async loadTeamKeys(): Promise<void> {
    const teamDir = path.join(this.keyPath, 'team');
    const metadataPath = path.join(teamDir, 'metadata.json');

    if (!existsSync(metadataPath)) {
      // No team metadata yet
      return;
    }

    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      for (const [userId, info] of Object.entries(metadata)) {
        this.teamKeys.set(userId, info as TeamKeyInfo);
      }
    } catch (error) {
      throw new SecretError(
        'Failed to load team keys',
        'TEAM_MEMBER_NOT_FOUND'
      );
    }
  }

  /**
   * Save team keys metadata
   */
  private async saveTeamKeys(): Promise<void> {
    const teamDir = path.join(this.keyPath, 'team');
    const metadataPath = path.join(teamDir, 'metadata.json');

    const metadata: Record<string, TeamKeyInfo> = {};
    for (const [userId, info] of this.teamKeys.entries()) {
      metadata[userId] = info;
    }

    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      { mode: 0o600 }
    );
  }

  /**
   * Add a team member with their public key
   */
  async addTeamMember(email: string, publicKeyPath: string, permissions: 'read' | 'read-write' | 'admin' = 'read-write'): Promise<void> {
    await this.ensureInitialized();

    // 1. Read and validate public key
    const publicKeyPem = await fs.readFile(publicKeyPath, 'utf8');
    const publicKey = crypto.createPublicKey(publicKeyPem);

    // 2. Get master key
    const masterKey = await this.getMasterKey();

    // 3. Encrypt master key with team member's public key
    const encryptedMasterKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      masterKey
    );

    // 4. Store team member info
    const teamMember: TeamKeyInfo = {
      userId: email,
      publicKey: publicKeyPem,
      encryptedMasterKey: encryptedMasterKey.toString('base64'),
      addedAt: new Date(),
      addedBy: await this.getGitUser(),
      permissions
    };

    this.teamKeys.set(email, teamMember);

    // 5. Save public key
    const teamKeyPath = path.join(this.keyPath, 'team', `${email.replace('@', '_at_')}.pub`);
    await fs.writeFile(teamKeyPath, publicKeyPem, { mode: 0o644 });

    // 6. Save encrypted master key
    const encKeyPath = path.join(this.keyPath, 'team', `${email.replace('@', '_at_')}.key.enc`);
    await fs.writeFile(encKeyPath, encryptedMasterKey.toString('base64'), { mode: 0o644 });

    // 7. Update metadata
    await this.saveTeamKeys();

    // 8. Commit changes
    if (this.autoCommit) {
      await this.commitChanges(`team: add member ${email}`);
    }

    // 9. Log audit event
    await this.logAudit('team-add', undefined, { member: email, permissions });
  }

  /**
   * Remove a team member and rotate keys
   */
  async removeTeamMember(email: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.teamKeys.has(email)) {
      throw new SecretError(
        `Team member ${email} not found`,
        'TEAM_MEMBER_NOT_FOUND'
      );
    }

    // 1. Remove member's encrypted master key
    this.teamKeys.delete(email);

    // 2. Remove key files
    const teamKeyPath = path.join(this.keyPath, 'team', `${email.replace('@', '_at_')}.pub`);
    const encKeyPath = path.join(this.keyPath, 'team', `${email.replace('@', '_at_')}.key.enc`);

    if (existsSync(teamKeyPath)) {
      await fs.unlink(teamKeyPath);
    }
    if (existsSync(encKeyPath)) {
      await fs.unlink(encKeyPath);
    }

    // 3. Update metadata
    await this.saveTeamKeys();

    // 4. Rotate master key (security best practice)
    await this.rotateMasterKey();

    // 5. Commit changes
    if (this.autoCommit) {
      await this.commitChanges(`team: remove member ${email} and rotate keys`);
    }

    // 6. Log audit event
    await this.logAudit('team-remove', undefined, { member: email });
  }

  /**
   * List team members
   */
  async listTeamMembers(): Promise<TeamKeyInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.teamKeys.values());
  }

  /**
   * Rotate the master encryption key
   */
  async rotateMasterKey(): Promise<void> {
    await this.ensureInitialized();

    // 1. Generate new master key
    const newMasterKey = crypto.randomBytes(32);
    const newSalt = crypto.randomBytes(32);

    // 2. Decrypt all secrets with old key
    const allSecrets: Record<string, Record<string, string>> = {};
    const environments = ['development', 'staging', 'production'];

    for (const env of environments) {
      const currentEnv = this.environment;
      this.environment = env;

      const data = await this.loadEncryptedSecrets();
      if (data) {
        allSecrets[env] = {};
        for (const [key, secret] of Object.entries(data.secrets)) {
          allSecrets[env][key] = this.decryptValue(secret, this.encryptionKey!);
        }
      }

      this.environment = currentEnv;
    }

    // 3. Backup old key (encrypted)
    await this.backupOldKey(this.encryptionKey!);

    // 4. Update master key
    const oldKey = this.encryptionKey;
    this.encryptionKey = newMasterKey;

    // 5. Re-encrypt all secrets with new key
    for (const [env, secrets] of Object.entries(allSecrets)) {
      const currentEnv = this.environment;
      this.environment = env;

      const data = await this.loadOrCreateSecrets();

      for (const [key, value] of Object.entries(secrets)) {
        const encrypted = await this.encryptValue(value, newMasterKey);
        const gitUser = await this.getGitUser();

        encrypted.metadata = {
          ...data.secrets[key]?.metadata,
          updatedAt: new Date(),
          updatedBy: gitUser
        };

        data.secrets[key] = encrypted;
      }

      await this.saveEncryptedSecrets(data);
      this.environment = currentEnv;
    }

    // 6. Update team members' encrypted keys
    for (const member of this.teamKeys.values()) {
      const publicKey = crypto.createPublicKey(member.publicKey);

      const encryptedMasterKey = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        newMasterKey
      );

      member.encryptedMasterKey = encryptedMasterKey.toString('base64');

      // Save updated encrypted key
      const encKeyPath = path.join(this.keyPath, 'team', `${member.userId.replace('@', '_at_')}.key.enc`);
      await fs.writeFile(encKeyPath, member.encryptedMasterKey, { mode: 0o644 });
    }

    // 7. Update metadata
    await this.saveTeamKeys();

    // 8. Save new master key (encrypted with machine ID)
    const machineId = await getCachedMachineId();
    const { encrypted, salt: encSalt, iv, authTag } = await encrypt(
      JSON.stringify({
        key: newMasterKey.toString('base64'),
        salt: newSalt.toString('base64')
      }),
      machineId
    );

    const encryptedMasterKey = {
      version: 1,
      encrypted: encode(encrypted),
      salt: encode(encSalt),
      iv: encode(iv),
      authTag: encode(authTag),
      metadata: {
        createdAt: new Date(),
        createdBy: await this.getGitUser(),
        rotatedAt: new Date()
      }
    };

    const masterKeyPath = path.join(this.keyPath, 'master.key');
    await fs.writeFile(
      masterKeyPath,
      JSON.stringify(encryptedMasterKey, null, 2),
      { mode: 0o600 }
    );

    // 9. Commit rotation
    if (this.autoCommit) {
      await this.commitChanges('security: rotate master encryption key');
    }

    // 10. Log audit event
    await this.logAudit('rotate', undefined, { reason: 'manual rotation' });
  }

  /**
   * Backup old encryption key
   */
  private async backupOldKey(key: Buffer): Promise<void> {
    const backupDir = path.join(this.keyPath, 'backups');
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `master-${timestamp}.key.bak`);

    // Encrypt backup with machine ID
    const machineId = await getCachedMachineId();
    const { encrypted, salt, iv, authTag } = await encrypt(
      key.toString('base64'),
      machineId
    );

    const backupData = {
      encrypted: encode(encrypted),
      salt: encode(salt),
      iv: encode(iv),
      authTag: encode(authTag),
      backedUpAt: new Date(),
      backedUpBy: await this.getGitUser()
    };

    await fs.writeFile(
      backupPath,
      JSON.stringify(backupData, null, 2),
      { mode: 0o600 }
    );
  }

  /**
   * Decrypt master key using user's private key (for team members)
   */
  private async decryptMasterKeyWithUserKey(): Promise<Buffer | null> {
    const userEmail = await this.getGitUser();
    const teamMember = this.teamKeys.get(userEmail);

    if (!teamMember) {
      return null;
    }

    if (!this.userPrivateKey) {
      await this.setupUserKey();
    }

    if (!this.userPrivateKey) {
      throw new SecretError('User private key not available', 'ACCESS_DENIED');
    }

    try {
      const decryptedKey = crypto.privateDecrypt(
        {
          key: this.userPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(teamMember.encryptedMasterKey, 'base64')
      );

      return decryptedKey;
    } catch (error) {
      throw new SecretError(
        'Failed to decrypt master key with user key',
        'DECRYPTION_FAILED'
      );
    }
  }

  // ==================== Audit Logging ====================

  /**
   * Log an audit event
   */
  private async logAudit(
    action: AuditLog['action'],
    key?: string,
    details?: Record<string, any>
  ): Promise<void> {
    if (!this.auditLogEnabled) {
      return;
    }

    const auditEntry: AuditLog = {
      timestamp: new Date(),
      action,
      user: await this.getGitUser(),
      environment: this.environment,
      key,
      details
    };

    // Add git commit hash if available
    try {
      const gitCommit = execSync('git rev-parse HEAD', {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim();
      auditEntry.gitCommit = gitCommit;
    } catch { }

    // Save audit log
    await this.saveAuditLog(auditEntry);
  }

  /**
   * Save audit log entry
   */
  private async saveAuditLog(entry: AuditLog): Promise<void> {
    const auditDir = path.join(this.secretsPath, 'audit');
    const date = entry.timestamp.toISOString().split('T')[0];
    const auditFile = path.join(auditDir, `${date}.log`);

    const logLine = JSON.stringify(entry) + '\n';

    await fs.appendFile(auditFile, logLine, { mode: 0o600 });
  }

  /**
   * Read audit logs
   */
  async getAuditLogs(
    startDate?: Date,
    endDate?: Date,
    action?: AuditLog['action']
  ): Promise<AuditLog[]> {
    const auditDir = path.join(this.secretsPath, 'audit');
    const logs: AuditLog[] = [];

    if (!existsSync(auditDir)) {
      return logs;
    }

    const files = await fs.readdir(auditDir);

    for (const file of files) {
      if (!file.endsWith('.log')) continue;

      const content = await fs.readFile(path.join(auditDir, file), 'utf8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        try {
          const log = JSON.parse(line) as AuditLog;
          log.timestamp = new Date(log.timestamp);

          // Filter by date range
          if (startDate && log.timestamp < startDate) continue;
          if (endDate && log.timestamp > endDate) continue;

          // Filter by action
          if (action && log.action !== action) continue;

          logs.push(log);
        } catch { }
      }
    }

    return logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ==================== Phase 3: Backup & Restore ====================

  /**
   * Create a complete backup of all secrets across all environments
   */
  async backup(outputPath?: string): Promise<SecretsBackup> {
    await this.ensureInitialized();

    const environments = ['development', 'staging', 'production'];
    const backup: SecretsBackup = {
      version: 1,
      format: 'git-secrets-backup',
      createdAt: new Date(),
      createdBy: await this.getGitUser(),
      environments: {},
      checksum: ''
    };

    const currentEnv = this.environment;

    try {
      // Backup all environments
      for (const env of environments) {
        this.environment = env;
        const data = await this.loadEncryptedSecrets();

        if (data) {
          const secrets: Record<string, string> = {};
          const masterKey = await this.getMasterKey();

          // Decrypt all secrets for this environment
          for (const [key, secret] of Object.entries(data.secrets)) {
            secrets[key] = this.decryptValue(secret, masterKey);
          }

          const firstKey = Object.keys(data.secrets)[0];
          backup.environments[env] = {
            secrets,
            metadata: {
              secretCount: Object.keys(secrets).length,
              lastModified: firstKey ? data.secrets[firstKey]?.metadata?.updatedAt : undefined
            }
          };
        }
      }

      // Compress backup if large
      if (JSON.stringify(backup).length > 10 * 1024) { // 10KB threshold
        backup.compressed = true;
      }

      // Calculate checksum
      backup.checksum = this.calculateChecksum(backup as any);

      // Save to file if path provided
      if (outputPath) {
        const backupData = backup.compressed
          ? await gzipAsync(JSON.stringify(backup))
          : JSON.stringify(backup, null, 2);

        await fs.writeFile(
          outputPath,
          backupData,
          backup.compressed ? undefined : 'utf8'
        );
      }

      // Log audit event
      await this.logAudit('export', undefined, {
        type: 'backup',
        environments: Object.keys(backup.environments),
        totalSecrets: Object.values(backup.environments)
          .reduce((sum, env) => sum + Object.keys(env.secrets).length, 0)
      });

      return backup;
    } finally {
      // Restore original environment
      this.environment = currentEnv;
    }
  }

  /**
   * Restore secrets from a backup
   */
  async restore(backup: SecretsBackup | string): Promise<void> {
    await this.ensureInitialized();

    let backupData: SecretsBackup;

    // Load backup from file if path provided
    if (typeof backup === 'string') {
      const fileContent = await fs.readFile(backup);

      try {
        // Try to parse as JSON first
        backupData = JSON.parse(fileContent.toString('utf8'));
      } catch {
        // Try to decompress and parse
        const decompressed = await gunzipAsync(fileContent);
        backupData = JSON.parse(decompressed.toString('utf8'));
      }
    } else {
      backupData = backup;
    }

    // Verify backup format
    if (backupData.format !== 'git-secrets-backup') {
      throw new SecretError('Invalid backup format', 'INVALID_BACKUP');
    }

    // Verify checksum
    const checksum = this.calculateChecksum({ ...backupData, checksum: '' } as any);
    if (checksum !== backupData.checksum) {
      throw new SecretError('Backup checksum verification failed', 'INVALID_BACKUP');
    }

    const currentEnv = this.environment;

    try {
      // Restore each environment
      for (const [env, envData] of Object.entries(backupData.environments)) {
        this.environment = env;

        // Clear existing secrets (optional - could be configurable)
        const existingData = await this.loadEncryptedSecrets();
        if (existingData) {
          existingData.secrets = {};
          await this.saveEncryptedSecrets(existingData);
        }

        // Restore secrets
        for (const [key, value] of Object.entries(envData.secrets)) {
          await this.set(key, value);
        }
      }

      // Commit the restore
      if (this.autoCommit) {
        await this.commitChanges(
          `secrets: restore from backup (${Object.keys(backupData.environments).join(', ')})`
        );
      }

      // Log audit event
      await this.logAudit('import', undefined, {
        type: 'restore',
        environments: Object.keys(backupData.environments),
        totalSecrets: Object.values(backupData.environments)
          .reduce((sum, env) => sum + Object.keys(env.secrets).length, 0)
      });
    } finally {
      // Restore original environment
      this.environment = currentEnv;
    }
  }

  // ==================== Phase 3: Bulk Operations ====================

  /**
   * Set multiple secrets at once (optimized for performance)
   */
  async setBulk(secrets: Record<string, string>): Promise<void> {
    await this.ensureInitialized();

    try {
      // Load current secrets once
      const data = await this.loadOrCreateSecrets();
      const masterKey = await this.getMasterKey();
      const gitUser = await this.getGitUser();

      // Process all secrets
      for (const [key, value] of Object.entries(secrets)) {
        // Invalidate cache
        const cacheKey = `${this.environment}:${key}`;
        this.secretsCache.delete(cacheKey);

        // Encrypt value
        const encrypted = await this.encryptValue(value, masterKey);

        encrypted.metadata = {
          updatedAt: new Date(),
          updatedBy: gitUser
        };

        if (!data.secrets[key]) {
          encrypted.metadata.addedAt = new Date();
          encrypted.metadata.addedBy = gitUser;
        } else {
          encrypted.metadata.addedAt = data.secrets[key].metadata.addedAt;
          encrypted.metadata.addedBy = data.secrets[key].metadata.addedBy;
        }

        data.secrets[key] = encrypted;
      }

      // Save all at once
      await this.saveEncryptedSecrets(data);

      // Single commit for all changes
      if (this.autoCommit) {
        await this.commitChanges(
          `secrets: bulk update ${Object.keys(secrets).length} secrets`
        );
      }

      // Log audit event
      await this.logAudit('set', undefined, {
        type: 'bulk',
        keys: Object.keys(secrets),
        count: Object.keys(secrets).length
      });
    } catch (error) {
      throw new SecretError(
        `Failed to set bulk secrets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SET_ERROR'
      );
    }
  }

  /**
   * Get multiple secrets at once (optimized with caching)
   */
  async getBulk(keys: string[]): Promise<Record<string, string | null>> {
    await this.ensureInitialized();

    const results: Record<string, string | null> = {};
    const uncachedKeys: string[] = [];

    // Check cache first
    for (const key of keys) {
      const cacheKey = `${this.environment}:${key}`;
      const cached = this.secretsCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        results[key] = cached.value;
      } else {
        uncachedKeys.push(key);
      }
    }

    // Load uncached secrets
    if (uncachedKeys.length > 0) {
      const data = await this.loadEncryptedSecrets();

      if (data) {
        const masterKey = await this.getMasterKey();

        for (const key of uncachedKeys) {
          if (data.secrets[key]) {
            const value = this.decryptValue(data.secrets[key], masterKey);
            results[key] = value;

            // Cache the value
            const cacheKey = `${this.environment}:${key}`;
            this.secretsCache.set(cacheKey, {
              value,
              timestamp: Date.now(),
              ttl: this.cacheTTL
            });
          } else {
            results[key] = null;
          }
        }
      } else {
        // No secrets file, all keys are null
        for (const key of uncachedKeys) {
          results[key] = null;
        }
      }
    }

    // Log audit event
    await this.logAudit('get', undefined, {
      type: 'bulk',
      keys,
      count: keys.length
    });

    return results;
  }

  /**
   * Clear the secrets cache (useful after external changes)
   */
  clearCache(): void {
    this.secretsCache.clear();
  }

  /**
   * Set cache TTL (time to live) in milliseconds
   */
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number; entries: string[] } {
    return {
      size: this.secretsCache.size,
      ttl: this.cacheTTL,
      entries: Array.from(this.secretsCache.keys())
    };
  }
}