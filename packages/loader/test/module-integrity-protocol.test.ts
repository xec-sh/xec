import { IntegrityError, ModuleIntegrityVerifier } from '../src/module/module-integrity.js';

/**
 * A remote module becomes code the instant it is fetched, so a cleartext hop is
 * a machine-in-the-middle's chance to substitute their own — and pinning a
 * digest afterwards only locks in whatever they served. These tests pin that
 * http is refused for anything but the local machine, before a request is made.
 */
describe('ModuleIntegrityVerifier host protocol', () => {
  // `[::1]` is listed in bracketed form because that is how `URL.hostname`
  // renders an IPv6 literal, which is what the allowlist is compared against.
  const opts = { allowedHosts: ['esm.sh', '127.0.0.1', 'localhost', '[::1]'] };

  it('refuses http for a non-loopback host, even an allowlisted one', () => {
    const verifier = new ModuleIntegrityVerifier('/tmp/xec-integrity-protocol', opts);

    expect(() => verifier.assertHostAllowed('http://esm.sh/lodash@4')).toThrow(IntegrityError);
    expect(() => verifier.assertHostAllowed('http://esm.sh/lodash@4')).toThrow(/https/);
  });

  it('allows https for an allowlisted host', () => {
    const verifier = new ModuleIntegrityVerifier('/tmp/xec-integrity-protocol', opts);

    expect(() => verifier.assertHostAllowed('https://esm.sh/lodash@4')).not.toThrow();
  });

  it('allows http only for loopback hosts, so a local registry keeps working', () => {
    const verifier = new ModuleIntegrityVerifier('/tmp/xec-integrity-protocol', opts);

    expect(() => verifier.assertHostAllowed('http://127.0.0.1:4873/x.js')).not.toThrow();
    expect(() => verifier.assertHostAllowed('http://localhost:4873/x.js')).not.toThrow();
    expect(() => verifier.assertHostAllowed('http://[::1]:4873/x.js')).not.toThrow();
  });

  it('rejects a cleartext fetch to a public host regardless of the allowlist', () => {
    const verifier = new ModuleIntegrityVerifier('/tmp/xec-integrity-protocol', opts);

    expect(() => verifier.assertHostAllowed('http://evil.example.com/x.js')).toThrow(IntegrityError);
  });
});
