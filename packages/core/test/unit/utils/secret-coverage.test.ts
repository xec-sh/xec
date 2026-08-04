import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import {
  DEFAULT_REDACTION,
  createDefaultSensitivePatterns,
} from '../../../src/utils/sensitive-patterns.js';

const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

/**
 * Masking has two failure modes and both matter.
 *
 * Missing a secret leaks it into logs, errors and events. Matching too
 * eagerly corrupts real output — a pattern broad enough to catch a bare
 * 40-character AWS secret also redacts every git SHA, which silently
 * destroys the output of ordinary commands. These tests pin both sides.
 */
describe('secrets that must be masked', () => {
  it.each([
    ['credentials in a postgres URL', 'postgres://admin:Sup3rSecret@db.internal:5432/app', 'Sup3rSecret'],
    ['credentials in a redis URL', 'redis://user:r3dispass@cache:6379', 'r3dispass'],
    ['credentials in a mongodb+srv URL', 'mongodb+srv://u:M0ngoPw@cluster.mongodb.net', 'M0ngoPw'],
    ['a Google API key', 'key=AIzaSyD-1234567890abcdefghijklmnopqrs', 'AIzaSyD'],
    ['a Slack bot token', 'xoxb-123456789012-abcdefghijklmnop', 'xoxb-'],
    ['a Stripe live key', 'sk_live_51H8abcdefghijklmnopqrstuv', 'sk_live_'],
    ['a GitLab token', 'glpat-abcdefghij1234567890', 'glpat-'],
    ['an AWS access key id', 'AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
    ['basic auth on a command line', 'curl -u admin:hunter2 https://api.example.com', 'hunter2'],
    ['an npm token', 'npm_abcdefghijklmnopqrstuvwxyz0123456789', 'npm_abcdefghij'],
  ])('masks %s', (_label, input, secret) => {
    const masked = mask(input);

    expect(masked).not.toContain(secret);
    expect(masked).toContain(DEFAULT_REDACTION);
  });

  it('masks a PEM private key of any algorithm, not just RSA', () => {
    for (const kind of ['RSA PRIVATE KEY', 'OPENSSH PRIVATE KEY', 'PGP PRIVATE KEY BLOCK', 'PRIVATE KEY']) {
      const pem = `-----BEGIN ${kind}-----\nMIIEowIBAAKCAQEA\n-----END ${kind}-----`;
      expect(mask(pem)).not.toContain('MIIEowIBAAKCAQEA');
    }
  });
});

describe('output that must survive untouched', () => {
  it.each([
    ['a git commit SHA', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['a git log line', 'commit 5f8a2b1c9d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70'],
    ['a SHA-1 checksum', '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'],
    ['a plain sentence', 'Deployed 42 services to production in 12s'],
    ['a file listing', '-rw-r--r-- 1 deploy staff 4096 Aug  4 09:12 config.yaml'],
  ])('leaves %s alone', (_label, input) => {
    // Corrupting ordinary output is worse than missing a context-free secret:
    // it breaks scripts that parse it, silently.
    expect(mask(input)).toBe(input);
  });
});
