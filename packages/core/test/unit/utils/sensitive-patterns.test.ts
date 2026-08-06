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

  /**
   * A masker over one rule, found by a fragment of its source.
   *
   * The rules overlap on purpose — `api_key=` is caught by the api-key rule
   * and again by the environment-variable rule — which is good for
   * redaction and useless for testing: a mistake in one rule is hidden by
   * the next, and a survey of what these expressions actually match reads
   * as complete when half of them are dead code.
   */
  const only = (fragment: string): ((text: string) => string) => {
    const rules = defaultSensitiveRules().filter(rule => rule.pattern.source.includes(fragment));
    expect(rules, `no rule contains ${fragment}`).toHaveLength(1);
    return createOptimizedMasker(rules, DEFAULT_REDACTION);
  };

  /** The value must not survive, redacted by that rule alone. */
  const hiddenBy = (fragment: string, text: string, secret: string): void => {
    expect(only(fragment)(text), `"${text}" was not redacted by ${fragment}`).not.toContain(secret);
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
  describe('every spelling of every optional separator', () => {
    /**
     * A name whose parts may be joined by `_`, by `-`, or by nothing, in
     * every combination.
     *
     * The rules spell these as `api[_-]?key`, one optional separator per
     * gap, and each of them is a separate way to be wrong: making one
     * required loses `apikey`, negating one loses `api_key`, and either
     * mistake is invisible while the other spellings still work. Testing a
     * uniform spelling per name checks one gap and leaves the rest.
     */
    const spellings = (parts: readonly string[]): string[] => {
      let out = [parts[0]!];
      for (const part of parts.slice(1)) {
        out = out.flatMap(prefix => ['', '_', '-'].map(sep => prefix + sep + part));
      }
      return out;
    };

    const named: Array<{ rule: string; parts: string[] }> = [
      { rule: 'api key', parts: ['api', 'key'] },
      { rule: 'access token', parts: ['access', 'token'] },
      { rule: 'auth token', parts: ['auth', 'token'] },
      { rule: 'authentication token', parts: ['authentication', 'token'] },
      { rule: 'private key', parts: ['private', 'key'] },
      { rule: 'secret key', parts: ['secret', 'key'] },
      { rule: 'aws access key id', parts: ['aws', 'access', 'key', 'id'] },
      { rule: 'aws secret access key', parts: ['aws', 'secret', 'access', 'key'] },
      { rule: 'github token', parts: ['github', 'token'] },
      { rule: 'client secret', parts: ['client', 'secret'] },
    ];

    for (const { rule, parts } of named) {
      it(`redacts ${rule} however it is spelled`, () => {
        for (const name of spellings(parts)) {
          hides(`${name}=s3cr3t-value-here`, 's3cr3t-value-here');
        }
      });
    }

    it('redacts a client secret flag however it is spelled', () => {
      for (const name of spellings(['client', 'secret'])) {
        hides(`app --${name} s3cr3t-value-here`, 's3cr3t-value-here');
      }
    });

    it('redacts a json key however it is spelled', () => {
      for (const parts of [['api', 'key'], ['client', 'secret']]) {
        for (const name of spellings(parts)) {
          hides(`{"${name}": "s3cr3t-value"}`, 's3cr3t-value');
        }
      }
    });
  });

  describe('the provider prefixes, each letter of them', () => {
    it('takes every slack prefix it claims and no other', () => {
      for (const letter of 'abposr') {
        hides(`xox${letter}-1234567890-abcdefghij`, `xox${letter}-1234567890-abcdefghij`);
      }
      for (const letter of 'cdefgh') {
        keeps(`xox${letter}-1234567890-abcdefghij`);
      }
    });

    it('takes every stripe key prefix and environment', () => {
      for (const kind of ['sk', 'pk', 'rk']) {
        for (const env of ['live', 'test']) {
          hides(`${kind}_${env}_0123456789abcdef`, `${kind}_${env}_0123456789abcdef`);
        }
      }
      keeps('xk_live_0123456789abcdef');
      keeps('sk_prod_0123456789abcdef');
    });

    it('takes both aws key id prefixes and no other', () => {
      hides('AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE');
      hides('ASIAIOSFODNN7EXAMPLE', 'ASIAIOSFODNN7EXAMPLE');
      keeps('AKIBIOSFODNN7EXAMPLE');
    });

    it('takes both github token prefixes and no other', () => {
      hides('ghp_0123456789abcdefghij', 'ghp_0123456789abcdefghij');
      hides('ghs_0123456789abcdefghij', 'ghs_0123456789abcdefghij');
      keeps('ghx_0123456789abcdefghij');
    });
  });

  describe('the environment-variable rule, component by component', () => {
    const words = ['SECRET', 'TOKEN', 'KEY', 'PASSWORD', 'PASSWD', 'PWD', 'APIKEY'];

    for (const word of words) {
      it(`redacts a name ending in ${word}`, () => {
        hides(`SERVICE_${word}=s3cr3t-value`, 's3cr3t-value');
      });

      it(`redacts a name beginning with ${word}`, () => {
        hides(`${word}_FOR_SERVICE=s3cr3t-value`, 's3cr3t-value');
      });

      it(`redacts a name with ${word} in the middle`, () => {
        hides(`APP_${word}_V2=s3cr3t-value`, 's3cr3t-value');
      });
    }

    it('accepts a hyphen as well as an underscore between components', () => {
      hides('SERVICE-TOKEN=s3cr3t-value', 's3cr3t-value');
    });

    it('leaves a name whose components say nothing alone', () => {
      keeps('SERVICE_NAME=api');
      keeps('APP_VERSION=2');
    });
  });
  describe('each rule on its own', () => {
    // Overlap means a rule can be entirely broken and every combined test
    // still passes. These check one expression at a time.

    const spellings = (parts: readonly string[]): string[] => {
      let out = [parts[0]!];
      for (const part of parts.slice(1)) {
        out = out.flatMap(prefix => ['', '_', '-'].map(sep => prefix + sep + part));
      }
      return out;
    };

    const cases: Array<{ fragment: string; parts: string[]; text: (name: string) => string }> = [
      { fragment: 'access[_-]?token', parts: ['api', 'key'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'access[_-]?token', parts: ['access', 'token'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'access[_-]?token', parts: ['auth', 'token'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'access[_-]?token', parts: ['authentication', 'token'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'access[_-]?token', parts: ['private', 'key'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'access[_-]?token', parts: ['secret', 'key'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'aws[_-]?access', parts: ['aws', 'access', 'key', 'id'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'aws[_-]?access', parts: ['aws', 'secret', 'access', 'key'], text: n => `${n}=s3cr3t-value` },
      { fragment: 'github[_-]?token', parts: ['github', 'token'], text: n => `${n}=s3cr3t-value` },
      { fragment: '--client[_-]?secret', parts: ['client', 'secret'], text: n => `app --${n} s3cr3t-value` },
      { fragment: '\\b(secret|client[_-]?secret)', parts: ['client', 'secret'], text: n => `${n}=s3cr3t-value` },
    ];

    for (const { fragment, parts, text } of cases) {
      it(`${parts.join(' ')} is caught by its own rule, however spelled`, () => {
        for (const name of spellings(parts)) {
          hiddenBy(fragment, text(name), 's3cr3t-value');
        }
      });
    }

    it('the json rule catches each key on its own', () => {
      for (const parts of [['api', 'key'], ['client', 'secret']]) {
        for (const name of spellings(parts)) {
          hiddenBy('":\\s*"', `{"${name}": "s3cr3t-value"}`, 's3cr3t-value');
        }
      }
      for (const key of ['password', 'token', 'secret']) {
        hiddenBy('":\\s*"', `{"${key}": "s3cr3t-value"}`, 's3cr3t-value');
      }
    });

    it('the password rule catches each of its names on its own', () => {
      for (const name of ['password', 'passwd', 'pwd']) {
        hiddenBy('passwd|pwd', `${name}=s3cr3t-value`, 's3cr3t-value');
      }
    });

    it('the token rule catches a bare token on its own', () => {
      hiddenBy('\\b(token)', 'token=s3cr3t-value', 's3cr3t-value');
    });

    it('the environment rule catches each secret word on its own', () => {
      for (const word of ['SECRET', 'TOKEN', 'KEY', 'PASSWORD', 'PASSWD', 'PWD', 'APIKEY']) {
        hiddenBy('APIKEY', `SERVICE_${word}=s3cr3t-value`, 's3cr3t-value');
        hiddenBy('APIKEY', `${word}_V2=s3cr3t-value`, 's3cr3t-value');
      }
    });

    it('the password flag rule catches its flag on its own', () => {
      hiddenBy('(--password)', 'mysql --password s3cr3t-value', 's3cr3t-value');
    });

    it('the url rule catches credentials on its own', () => {
      hiddenBy(':\\/\\/', 'postgres://user:s3cr3t-value@host/db', 's3cr3t-value');
    });

    it('the basic-auth rule catches both flags on its own', () => {
      hiddenBy('(-u|--user)', 'curl -u alice:s3cr3t-value x', 's3cr3t-value');
      hiddenBy('(-u|--user)', 'curl --user alice:s3cr3t-value x', 's3cr3t-value');
    });

    it('the bearer rule catches a standalone token on its own', () => {
      hiddenBy('\\b(Bearer)', 'sent Bearer abc123def456 on', 'abc123def456');
    });

    it('the private key rule catches each algorithm on its own', () => {
      for (const algorithm of ['', 'RSA ', 'EC ', 'DSA ', 'OPENSSH ', 'PGP ']) {
        const block = [
          `-----BEGIN ${algorithm}PRIVATE KEY-----`,
          'MIIEowIBAAKCAQEAx0hV1sV0Kg9y1NsxUZ4kFSVRk2xAvUdQZbBRxHZ0Rp0Yq6WF',
          `-----END ${algorithm}PRIVATE KEY-----`,
        ].join('\n');

        hiddenBy('PRIVATE', block, 'MIIEowIBAAKCAQEA');
      }
    });

    it('the github prefix rule catches each prefix on its own', () => {
      hiddenBy('gh[ps]_', 'ghp_0123456789abcdefghij', 'ghp_0123456789abcdefghij');
      hiddenBy('gh[ps]_', 'ghs_0123456789abcdefghij', 'ghs_0123456789abcdefghij');
    });
  });
  describe('a quoted value is consumed with its quotes', () => {
    // `"([^"]+)"` narrowed to `"([^"])"` still hides the secret — the
    // unquoted branch catches what is left inside — so a test that only
    // asks whether the secret survived reads as passing while the rule no
    // longer understands quoting. The output is asserted exactly.
    const exactly = (fragment: string, text: string, expected: string): void => {
      expect(only(fragment)(text)).toBe(expected);
    };

    const rules: Array<[string, (value: string) => string]> = [
      ['access[_-]?token', v => `api_key=${v}`],
      ['aws[_-]?access', v => `aws_access_key_id=${v}`],
      ['github[_-]?token', v => `github_token=${v}`],
      ['\\b(token)', v => `token=${v}`],
      ['passwd|pwd', v => `password=${v}`],
      ['\\b(secret|client[_-]?secret)', v => `secret=${v}`],
      ['APIKEY', v => `SERVICE_TOKEN=${v}`],
    ];

    for (const [fragment, form] of rules) {
      it(`${fragment} consumes a double-quoted value whole`, () => {
        exactly(fragment, form('"s3cr3t value"'), form(DEFAULT_REDACTION));
      });

      it(`${fragment} consumes a single-quoted value whole`, () => {
        exactly(fragment, form("'s3cr3t value'"), form(DEFAULT_REDACTION));
      });

      it(`${fragment} consumes an unquoted value whole`, () => {
        exactly(fragment, form('s3cr3t-value'), form(DEFAULT_REDACTION));
      });
    }

    it('a flag consumes its quoted value whole', () => {
      expect(only('(--password)')('mysql --password "s3cr3t value"'))
        .toBe(`mysql --password ${DEFAULT_REDACTION}`);
      expect(only('--client[_-]?secret')("app --secret 's3cr3t value'"))
        .toBe(`app --secret ${DEFAULT_REDACTION}`);
    });

    it('a json value is consumed with its quotes', () => {
      expect(only('":\\s*"')('{"password": "s3cr3t value"}'))
        .toBe(`{"password": ${DEFAULT_REDACTION}}`);
    });

    it('an authorization token is consumed whole', () => {
      expect(only('(Authorization:')('Authorization: Bearer abc-123_x/y.z+w='))
        .toBe(`Authorization: Bearer ${DEFAULT_REDACTION}`);
    });

    it('a url password is consumed whole', () => {
      expect(only(':\\/\\/')('postgres://user:s3cr3t-value@host/db'))
        .toBe(`postgres://user:${DEFAULT_REDACTION}@host/db`);
    });

    it('a basic-auth password is consumed whole', () => {
      expect(only('(-u|--user)')('curl -u alice:s3cr3t-value https://x'))
        .toBe(`curl -u alice:${DEFAULT_REDACTION} https://x`);
    });
  });
});
