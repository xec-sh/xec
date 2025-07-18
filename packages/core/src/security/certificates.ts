/**
 * Certificate management for Xec Core
 * Provides certificate generation, validation, and management
 */

import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';

import { SecurityError } from '../core/errors.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('certificates');

export interface Certificate {
  id: string;
  name: string;
  type: 'self-signed' | 'ca-signed' | 'imported';
  subject: CertificateSubject;
  issuer: CertificateSubject;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  publicKey: string;
  privateKey?: string;
  certificatePem: string;
  fingerprint: string;
  isCA: boolean;
  metadata?: Record<string, any>;
}

export interface CertificateSubject {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  email?: string;
}

export interface CertificateOptions {
  subject: CertificateSubject;
  validityDays?: number;
  keySize?: number;
  isCA?: boolean;
  extensions?: Record<string, any>;
}

export interface CertificateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  chain?: Certificate[];
}

export class CertificateManager {
  private storePath: string;
  private certificates: Map<string, Certificate> = new Map();
  private initialized = false;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), '.xec', 'certificates');
  }

  /**
   * Initialize certificate store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storePath, { recursive: true, mode: 0o700 });
      await this.loadCertificates();
      this.initialized = true;
    } catch (error: any) {
      throw new SecurityError(`Failed to initialize certificate store: ${error.message}`);
    }
  }

  /**
   * Generate a self-signed certificate
   */
  async generateSelfSigned(
    name: string,
    options: CertificateOptions
  ): Promise<Certificate> {
    await this.initialize();

    logger.info(`Generating self-signed certificate: ${name}`);

    try {
      const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: options.keySize || 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      // Create certificate using Node.js crypto (simplified version)
      // In production, you might want to use a library like node-forge or OpenSSL
      const cert = this.createX509Certificate(
        keyPair,
        options.subject,
        options.subject, // Self-signed: issuer = subject
        options.validityDays || 365,
        options.isCA || false
      );

      const certificate: Certificate = {
        id: crypto.randomUUID(),
        name,
        type: 'self-signed',
        subject: options.subject,
        issuer: options.subject,
        serialNumber: this.generateSerialNumber(),
        validFrom: new Date(),
        validTo: new Date(Date.now() + (options.validityDays || 365) * 24 * 60 * 60 * 1000),
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        certificatePem: cert,
        fingerprint: this.calculateFingerprint(cert),
        isCA: options.isCA || false,
        metadata: options.extensions
      };

      // Save certificate
      this.certificates.set(certificate.id, certificate);
      await this.saveCertificate(certificate);

      logger.info(`Generated self-signed certificate: ${name} (${certificate.id})`);
      return certificate;

    } catch (error: any) {
      throw new SecurityError(`Failed to generate certificate: ${error.message}`);
    }
  }

  /**
   * Import an existing certificate
   */
  async importCertificate(
    name: string,
    certificatePem: string,
    privateKeyPem?: string
  ): Promise<Certificate> {
    await this.initialize();

    logger.info(`Importing certificate: ${name}`);

    try {
      // Parse certificate to extract information
      const certInfo = this.parseCertificate(certificatePem);

      const certificate: Certificate = {
        id: crypto.randomUUID(),
        name,
        type: 'imported',
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        serialNumber: certInfo.serialNumber,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        publicKey: certInfo.publicKey,
        privateKey: privateKeyPem,
        certificatePem,
        fingerprint: this.calculateFingerprint(certificatePem),
        isCA: certInfo.isCA
      };

      // Validate certificate
      const validation = await this.validateCertificate(certificate);
      if (!validation.valid) {
        throw new SecurityError(`Invalid certificate: ${validation.errors.join(', ')}`);
      }

      // Save certificate
      this.certificates.set(certificate.id, certificate);
      await this.saveCertificate(certificate);

      logger.info(`Imported certificate: ${name} (${certificate.id})`);
      return certificate;

    } catch (error: any) {
      throw new SecurityError(`Failed to import certificate: ${error.message}`);
    }
  }

  /**
   * Get certificate by ID
   */
  async get(certificateId: string): Promise<Certificate | undefined> {
    await this.initialize();
    return this.certificates.get(certificateId);
  }

  /**
   * Get certificate by name
   */
  async getByName(name: string): Promise<Certificate | undefined> {
    await this.initialize();
    for (const cert of this.certificates.values()) {
      if (cert.name === name) {
        return cert;
      }
    }
    return undefined;
  }

  /**
   * List all certificates
   */
  async list(): Promise<Certificate[]> {
    await this.initialize();
    return Array.from(this.certificates.values());
  }

  /**
   * Delete a certificate
   */
  async delete(certificateId: string): Promise<boolean> {
    await this.initialize();

    const cert = this.certificates.get(certificateId);
    if (!cert) return false;

    // Delete files
    const certPath = path.join(this.storePath, `${cert.name}.crt`);
    const keyPath = path.join(this.storePath, `${cert.name}.key`);

    try {
      await fs.unlink(certPath);
      if (cert.privateKey) {
        await fs.unlink(keyPath);
      }
    } catch (error) {
      // Files might not exist
    }

    this.certificates.delete(certificateId);
    logger.info(`Deleted certificate: ${cert.name} (${certificateId})`);
    return true;
  }

  /**
   * Validate a certificate
   */
  async validateCertificate(
    certificate: Certificate
  ): Promise<CertificateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check expiration
    const now = new Date();
    if (certificate.validTo < now) {
      errors.push('Certificate has expired');
    } else if (certificate.validTo.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000) {
      warnings.push('Certificate expires within 30 days');
    }

    // Check if not yet valid
    if (certificate.validFrom > now) {
      errors.push('Certificate is not yet valid');
    }

    // Check key size (simplified)
    if (certificate.publicKey.includes('1024')) {
      warnings.push('Key size appears to be 1024 bits, consider using 2048 or higher');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Export certificate and key
   */
  async export(
    certificateId: string,
    includePrivateKey = false
  ): Promise<{ certificate: string; privateKey?: string }> {
    await this.initialize();

    const cert = this.certificates.get(certificateId);
    if (!cert) {
      throw new SecurityError('Certificate not found');
    }

    const result: { certificate: string; privateKey?: string } = {
      certificate: cert.certificatePem
    };

    if (includePrivateKey && cert.privateKey) {
      result.privateKey = cert.privateKey;
    }

    return result;
  }

  /**
   * Generate a certificate signing request (CSR)
   */
  async generateCSR(
    name: string,
    options: CertificateOptions
  ): Promise<{ csr: string; privateKey: string }> {
    logger.info(`Generating CSR for: ${name}`);

    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: options.keySize || 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Simplified CSR generation
    // In production, use a proper library
    const csr = this.createCSR(keyPair, options.subject);

    return {
      csr,
      privateKey: keyPair.privateKey
    };
  }

  /**
   * Check if a certificate will expire soon
   */
  async checkExpiration(days = 30): Promise<Certificate[]> {
    await this.initialize();

    const expiringCerts: Certificate[] = [];
    const checkDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    for (const cert of this.certificates.values()) {
      if (cert.validTo <= checkDate) {
        expiringCerts.push(cert);
      }
    }

    return expiringCerts;
  }

  /**
   * Create X509 certificate (simplified implementation)
   */
  private createX509Certificate(
    keyPair: crypto.KeyPairSyncResult<string, string>,
    subject: CertificateSubject,
    issuer: CertificateSubject,
    validityDays: number,
    isCA: boolean
  ): string {
    // This is a simplified placeholder
    // In production, use node-forge or call OpenSSL
    const cert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKLdQRydPrtRMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
${Buffer.from(JSON.stringify({ subject, issuer, validityDays, isCA })).toString('base64')}
-----END CERTIFICATE-----`;

    return cert;
  }

  /**
   * Create CSR (simplified implementation)
   */
  private createCSR(
    keyPair: crypto.KeyPairSyncResult<string, string>,
    subject: CertificateSubject
  ): string {
    // This is a simplified placeholder
    // In production, use node-forge or call OpenSSL
    const csr = `-----BEGIN CERTIFICATE REQUEST-----
${Buffer.from(JSON.stringify(subject)).toString('base64')}
-----END CERTIFICATE REQUEST-----`;

    return csr;
  }

  /**
   * Parse certificate (simplified implementation)
   */
  private parseCertificate(pem: string): {
    subject: CertificateSubject;
    issuer: CertificateSubject;
    serialNumber: string;
    validFrom: Date;
    validTo: Date;
    publicKey: string;
    isCA: boolean;
  } {
    // This is a simplified placeholder
    // In production, use node-forge or x509 library
    return {
      subject: {
        commonName: 'example.com',
        organization: 'Example Org'
      },
      issuer: {
        commonName: 'Example CA',
        organization: 'Example CA Org'
      },
      serialNumber: '1234567890',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      publicKey: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
      isCA: false
    };
  }

  /**
   * Calculate certificate fingerprint
   */
  private calculateFingerprint(pem: string): string {
    return crypto
      .createHash('sha256')
      .update(pem)
      .digest('hex')
      .match(/.{2}/g)!
      .join(':')
      .toUpperCase();
  }

  /**
   * Generate serial number
   */
  private generateSerialNumber(): string {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Load certificates from disk
   */
  private async loadCertificates(): Promise<void> {
    try {
      const files = await fs.readdir(this.storePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(this.storePath, file), 'utf8');
            const cert = JSON.parse(data) as Certificate;
            
            // Convert dates
            cert.validFrom = new Date(cert.validFrom);
            cert.validTo = new Date(cert.validTo);
            
            this.certificates.set(cert.id, cert);
          } catch (error) {
            logger.warn(`Failed to load certificate ${file}: ${error}`);
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  /**
   * Save certificate to disk
   */
  private async saveCertificate(certificate: Certificate): Promise<void> {
    // Save certificate PEM
    const certPath = path.join(this.storePath, `${certificate.name}.crt`);
    await fs.writeFile(certPath, certificate.certificatePem, { mode: 0o644 });

    // Save private key if available
    if (certificate.privateKey) {
      const keyPath = path.join(this.storePath, `${certificate.name}.key`);
      await fs.writeFile(keyPath, certificate.privateKey, { mode: 0o600 });
    }

    // Save metadata
    const metaPath = path.join(this.storePath, `${certificate.name}.json`);
    const metadata = { ...certificate };
    delete metadata.privateKey; // Don't store private key in metadata
    
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  }
}

// Global certificate manager instance
let globalCertManager: CertificateManager | null = null;

export function getCertificateManager(storePath?: string): CertificateManager {
  if (!globalCertManager) {
    globalCertManager = new CertificateManager(storePath);
  }
  return globalCertManager;
}

// Helper functions
export async function generateSelfSignedCertificate(
  name: string,
  options: CertificateOptions
): Promise<Certificate> {
  const manager = getCertificateManager();
  return manager.generateSelfSigned(name, options);
}

export async function importCertificate(
  name: string,
  certificatePem: string,
  privateKeyPem?: string
): Promise<Certificate> {
  const manager = getCertificateManager();
  return manager.importCertificate(name, certificatePem, privateKeyPem);
}

export async function listCertificates(): Promise<Certificate[]> {
  const manager = getCertificateManager();
  return manager.list();
}

export async function getCertificate(certificateId: string): Promise<Certificate | undefined> {
  const manager = getCertificateManager();
  return manager.get(certificateId);
}

export async function deleteCertificate(certificateId: string): Promise<boolean> {
  const manager = getCertificateManager();
  return manager.delete(certificateId);
}

export async function validateCertificate(
  certificate: Certificate
): Promise<CertificateValidationResult> {
  const manager = getCertificateManager();
  return manager.validateCertificate(certificate);
}

export async function checkExpiringCertificates(days = 30): Promise<Certificate[]> {
  const manager = getCertificateManager();
  return manager.checkExpiration(days);
}