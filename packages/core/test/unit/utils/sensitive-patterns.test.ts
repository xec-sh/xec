import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import { DEFAULT_REDACTION, defaultSensitiveRules } from '../../../src/utils/sensitive-patterns.js';

/**
 * What the redaction patterns catch, spelling by spelling.
 *
 * These rules decide whether a credential reaches a log, and until now
 * they were exercised only incidentally, by tests that happened to run
 * text through a masker on the way to checking something else. A mutation
 * survey put the file at 42%: of 207 ways to change these expressions, 120
 * changed nothing any test could see.
 *
 * Almost all of those changes were to an optional separator — `[_-]?`
 * becoming required, or its character class inverted — which is exactly
 * the class of mistake that leaves `apikey=` matching and `api_key=`
 * silently not. So each rule is checked here in every spelling it claims
 * to accept, and against text it must leave alone: a pattern that is too
 * broad corrupts ordinary output, which is its own kind of failure.
 */
describe('the redaction rules', () => {
  const mask = createOptimizedMasker(defaultSensitiveRules(), DEFAULT_REDACTION);

  /** The value must not survive anywhere in the output. */
  const hides = (text: string, secret: string): void => {
    const masked = mask(text);
    expect(masked, `"${text}" was not redacted`).not.toContain(secret);
  };

  /** The text must come through untouched. */
  const keeps = (text: string): void => {
    expect(mask(text), `"${text}" was rewritten`).toBe(text);
  };

  describe('keys named in an assignment', () => {
    // The separator is optional in the pattern, so all three spellings of
    // every name have to be caught. A mutant making it required leaves the
    // unseparated form matching and the others not.
    const names = [
      'api_key', 'api-key', 'apikey',
      'access_token', 'access-token', 'accesstoken',
      'auth_token', 'auth-token', 'authtoken',
      'authentication_token', 'authentication-token', 'authenticationtoken',
      'private_key', 'private-key', 'privatekey',
      'secret_key', 'secret-key', 'secretkey',
    ];

    for (const name of names) {
      it(`redacts ${name}=`, () => {
        hides(`${name}=s3cr3t-value-here`, 's3cr3t-value-here');
      });
    }

    it('accepts a colon as well as an equals sign', () => {
      hides('api_key: s3cr3t-value-here', 's3cr3t-value-here');
      hides('apikey : s3cr3t-value-here', 's3cr3t-value-here');
    });

    it('handles a quoted value', () => {
      hides('api_key="s3cr3t-value-here"', 's3cr3t-value-here');
      hides("api_key='s3cr3t-value-here'", 's3cr3t-value-here');
    });

    it('leaves an unrelated key alone', () => {
      // A rule broad enough to catch `monkey=` would rewrite output that
      // has nothing to do with credentials.
      keeps('monkey=banana');
      keeps('keyboard=mechanical');
      keeps('donkey=grey');
    });
  });

  describe('passwords', () => {
    for (const name of ['password', 'passwd', 'pwd']) {
      it(`redacts ${name}=`, () => {
        hides(`${name}=hunter2-and-more`, 'hunter2-and-more');
      });
    }

    it('redacts a value containing spaces only up to the space', () => {
      // The unquoted branch is `[^\\s]+`, so the value ends at whitespace.
      const masked = mask('password=hunter2 next-argument');
      expect(masked).not.toContain('hunter2');
      expect(masked).toContain('next-argument');
    });

    it('redacts the command-line form', () => {
      hides('mysql --password hunter2-and-more', 'hunter2-and-more');
      hides('mysql --password "hunter2 with spaces"', 'hunter2 with spaces');
    });

    it('leaves a word that merely contains one alone', () => {
      keeps('passwords are stored hashed');
    });
  });

  describe('aws credentials', () => {
    const names = [
      'aws_access_key_id', 'aws-access-key-id', 'awsaccesskeyid',
      'aws_secret_access_key', 'aws-secret-access-key', 'awssecretaccesskey',
    ];

    for (const name of names) {
      it(`redacts ${name}=`, () => {
        hides(`${name}=AKIAIOSFODNN7EXAMPLE`, 'AKIAIOSFODNN7EXAMPLE');
      });
    }

    it('redacts a bare access key id by its prefix', () => {
      hides('using AKIAIOSFODNN7EXAMPLE today', 'AKIAIOSFODNN7EXAMPLE');
      hides('using ASIAIOSFODNN7EXAMPLE today', 'ASIAIOSFODNN7EXAMPLE');
    });

    it('leaves a shorter lookalike alone', () => {
      keeps('AKIASHORT');
    });
  });

  describe('github tokens', () => {
    it('redacts each prefix it claims', () => {
      hides('ghp_0123456789abcdefghij', 'ghp_0123456789abcdefghij');
      hides('ghs_0123456789abcdefghij', 'ghs_0123456789abcdefghij');
    });

    it('leaves a prefix it does not claim alone', () => {
      // `gh[ps]_` — not `gha_`. A widened character class would start
      // rewriting text this rule was never meant to touch.
      keeps('gha_0123456789abcdefghij');
    });

    it('redacts an assignment in every spelling', () => {
      for (const name of ['github_token', 'github-token', 'githubtoken']) {
        hides(`${name}=abcdefghijklmnop`, 'abcdefghijklmnop');
      }
    });

    it('needs the documented length', () => {
      keeps('ghp_tooshort');
    });
  });

  describe('provider tokens matched by prefix', () => {
    const cases: Array<[string, string]> = [
      ['google', 'AIzaSyD-0123456789abcdefghijklmnop'],
      ['slack bot', 'xoxb-1234567890-abcdefghij'],
      ['slack app', 'xoxa-1234567890-abcdefghij'],
      ['slack user', 'xoxp-1234567890-abcdefghij'],
      ['slack refresh', 'xoxr-1234567890-abcdefghij'],
      ['slack legacy', 'xoxs-1234567890-abcdefghij'],
      ['slack bot other', 'xoxo-1234567890-abcdefghij'],
      ['stripe live secret', 'sk_live_0123456789abcdef'],
      ['stripe test secret', 'sk_test_0123456789abcdef'],
      ['stripe live public', 'pk_live_0123456789abcdef'],
      ['stripe restricted', 'rk_live_0123456789abcdef'],
      ['gitlab', 'glpat-0123456789abcdefgh'],
      ['npm', 'npm_0123456789abcdefghij0123456789abcd'],
    ];

    for (const [who, token] of cases) {
      it(`redacts a ${who} token`, () => {
        hides(`token seen: ${token}`, token);
      });
    }

    it('leaves an undocumented slack-looking prefix alone', () => {
      keeps('xoxq-1234567890-abcdefghij');
    });

    it('leaves a stripe-looking prefix with no environment alone', () => {
      keeps('sk_other_0123456789abcdef');
    });

    it('leaves a short gitlab lookalike alone', () => {
      keeps('glpat-short');
    });
  });

  describe('authorization headers', () => {
    it('keeps the scheme and hides the credential', () => {
      const masked = mask('Authorization: Bearer abc123def456');
      expect(masked).toContain('Bearer');
      expect(masked).not.toContain('abc123def456');
    });

    it('handles Basic as well as Bearer', () => {
      const masked = mask('Authorization: Basic dXNlcjpwYXNz');
      expect(masked).toContain('Basic');
      expect(masked).not.toContain('dXNlcjpwYXNz');
    });

    it('redacts a standalone Bearer token', () => {
      hides('sent Bearer abc123def456 upstream', 'abc123def456');
    });

    it('leaves an unrelated scheme alone', () => {
      keeps('Authorization: Negotiate');
    });
  });

  describe('credentials inside a url', () => {
    it('redacts the password of any scheme', () => {
      hides('postgres://user:hunter2@db.example.com/app', 'hunter2');
      hides('redis://user:hunter2@cache:6379', 'hunter2');
      hides('mongodb+srv://user:hunter2@cluster.example.net', 'hunter2');
    });

    it('leaves a url with no credentials alone', () => {
      keeps('https://example.com/path?q=1');
    });

    it('leaves a bare host:port alone', () => {
      keeps('connecting to db.example.com:5432');
    });
  });

  describe('basic auth on a command line', () => {
    it('redacts both spellings of the flag', () => {
      hides('curl -u alice:hunter2 https://x', 'hunter2');
      hides('curl --user alice:hunter2 https://x', 'hunter2');
    });
  });

  describe('secret arguments', () => {
    it('redacts every spelling of the flag', () => {
      hides('app --secret s3cr3t-value', 's3cr3t-value');
      hides('app --client-secret s3cr3t-value', 's3cr3t-value');
      hides('app --client_secret s3cr3t-value', 's3cr3t-value');
      hides('app --clientsecret s3cr3t-value', 's3cr3t-value');
    });

    it('redacts an assignment in every spelling', () => {
      hides('secret=s3cr3t-value', 's3cr3t-value');
      hides('client_secret=s3cr3t-value', 's3cr3t-value');
      hides('client-secret=s3cr3t-value', 's3cr3t-value');
      hides('clientsecret=s3cr3t-value', 's3cr3t-value');
    });
  });

  describe('json values', () => {
    const keys = ['api_key', 'api-key', 'apikey', 'password', 'token', 'secret', 'client_secret', 'client-secret', 'clientsecret'];

    for (const key of keys) {
      it(`redacts "${key}" in a document`, () => {
        hides(`{"${key}": "s3cr3t-value"}`, 's3cr3t-value');
      });
    }

    it('leaves an unrelated key alone', () => {
      keeps('{"name": "production"}');
    });
  });

  describe('environment variables named for what they hold', () => {
    const names = [
      'DB_PASSWORD', 'API_TOKEN', 'SIGNING_KEY', 'MY_SECRET',
      'SERVICE_PASSWD', 'ADMIN_PWD', 'STRIPE_APIKEY', 'GOOGLE_API_KEY',
    ];

    for (const name of names) {
      it(`redacts ${name}`, () => {
        hides(`${name}=s3cr3t-value`, 's3cr3t-value');
      });
    }

    it('reads the secret word as a component, not as a substring', () => {
      // `monkey`, `donkey`, `whiskey` all contain "key". Matching those had
      // their values replaced with [REDACTED] — output corrupted on every
      // command that happened to print one.
      keeps('monkey=banana');
      keeps('donkey=grey');
      keeps('whiskey=irish');
      keeps('turkey=roast');
      keeps('keyboard=mechanical');
    });

    it('still redacts a name whose component says secret', () => {
      hides('my_secret_plan=documented', 'documented');
      hides('PROD_SECRET_VALUE=s3cr3t', 's3cr3t');
      hides('SECRET_KEY=s3cr3t', 's3cr3t');
    });

    it('leaves an unrelated uppercase variable alone', () => {
      keeps('NODE_ENV=production');
      keeps('LOG_LEVEL=debug');
    });

    it('needs a composite name', () => {
      // `key=value` is the canonical generic pair, printed by every
      // configuration dump there is. The secrets actually spelled that way
      // — token, secret, password — each have a rule of their own.
      keeps('key=value');
      hides('token=s3cr3t', 's3cr3t');
      hides('secret=s3cr3t', 's3cr3t');
      hides('password=s3cr3t', 's3cr3t');
    });
  });

  describe('private keys', () => {
    const key = (algorithm: string): string => [
      `-----BEGIN ${algorithm}PRIVATE KEY-----`,
      'MIIEowIBAAKCAQEAx0hV1sV0Kg9y1NsxUZ4kFSVRk2xAvUdQZbBRxHZ0Rp0Yq6WF',
      `-----END ${algorithm}PRIVATE KEY-----`,
    ].join('\n');

    for (const algorithm of ['', 'RSA ', 'EC ', 'DSA ', 'OPENSSH ', 'PGP ']) {
      it(`redacts a ${algorithm || 'plain '}key whole`, () => {
        const block = key(algorithm);
        const masked = mask(`before\n${block}\nafter`);

        expect(masked).not.toContain('MIIEowIBAAKCAQEA');
        expect(masked).toContain('before');
        expect(masked).toContain('after');
      });
    }

    it('leaves a certificate alone', () => {
      // A certificate is public by construction; redacting it destroys
      // output that was safe and useful.
      const cert = [
        '-----BEGIN CERTIFICATE-----',
        'MIIEowIBAAKCAQEAx0hV1sV0Kg9y1NsxUZ4kFSVRk2xAvUdQZbBRxHZ0Rp0Yq6WF',
        '-----END CERTIFICATE-----',
      ].join('\n');

      expect(mask(cert)).toContain('MIIEowIBAAKCAQEA');
    });

    it('leaves a public key alone', () => {
      const pub = [
        '-----BEGIN PUBLIC KEY-----',
        'MIIEowIBAAKCAQEAx0hV1sV0Kg9y1NsxUZ4kFSVRk2xAvUdQZbBRxHZ0Rp0Yq6WF',
        '-----END PUBLIC KEY-----',
      ].join('\n');

      expect(mask(pub)).toContain('MIIEowIBAAKCAQEA');
    });

    it('does not scan to end of input on a header with no footer', () => {
      // A truncated block used to make every candidate start position scan
      // the whole remaining text: 800 KB of such output took 6.8 seconds.
      const truncated = `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(200_000)}`;

      const started = Date.now();
      mask(truncated);

      expect(Date.now() - started).toBeLessThan(2000);
    });
  });

  describe('ordinary output', () => {
    it('passes through untouched', () => {
      // The cost of a rule that is too broad is paid on every command that
      // never had a credential in it.
      keeps('total 48\ndrwxr-xr-x  6 deploy staff  192 Aug  5 21:46 .');
      keeps('commit 8a26d89f1c0e4b7a9d3f2e1c0b9a8d7f6e5c4b3a');
      keeps('Listening on http://localhost:3000');
      keeps('2 passed, 0 failed in 1.23s');
    });
  });
});
