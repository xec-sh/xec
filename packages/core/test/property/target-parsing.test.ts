import {
  parseTarget,
  formatTarget,
  parseTargetUri,
  describeTarget,
  isConfigReference,
  type Target,
} from '../../src/types/target.js';

/**
 * The target parser exists to make a class of bug impossible rather than to
 * fix its instances, so it is tested by its invariants: what must hold for
 * every input, not for the handful anyone thought to list.
 *
 * The failures it replaces are all in here as named cases, because a parser
 * is only as good as the inputs its author was willing to imagine — and the
 * previous one could not read the example printed in the CLI's own help.
 */
describe('target parsing invariants', () => {
  /** Deterministic generator: a counterexample reproduces on the first retry. */
  function prng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const HOSTS = ['h', 'web-1', 'server.example.com', 'a.b.c.d.example.org', '10.0.0.7', '::1'];
  const USERS = ['deploy', 'root', 'ci-runner'];
  const PORTS = [22, 2222, 1, 65535];

  it('round-trips every target it produces', () => {
    const rand = prng(0x7a46e7);
    const samples: Target[] = [
      { kind: 'local' },
      ...HOSTS.map(host => ({ kind: 'ssh', host }) as Target),
      ...HOSTS.flatMap(host =>
        USERS.map(user => ({ kind: 'ssh', host, user }) as Target)
      ),
      ...HOSTS.flatMap(host =>
        PORTS.map(port => ({ kind: 'ssh', host, port }) as Target)
      ),
      { kind: 'docker', container: 'api' },
      { kind: 'kubernetes', namespace: 'prod', pod: 'api-7f9d' },
      { kind: 'kubernetes', namespace: 'prod', pod: 'api-7f9d', container: 'sidecar' },
    ];

    for (let i = 0; i < 400; i++) {
      const target = samples[Math.floor(rand() * samples.length)]!;
      const printed = formatTarget(target);
      const reparsed = parseTargetUri(printed);

      expect(reparsed.ok, `${printed} did not parse back`).toBe(true);
      if (reparsed.ok) {
        expect(formatTarget(reparsed.target), `round trip changed ${printed}`).toBe(printed);
      }
    }
  });

  it('never throws, whatever it is given', () => {
    const rand = prng(0xbad1);
    const alphabet = 'abc@:/[]. -0123456789ssh://docker://k8s://';

    for (let i = 0; i < 3000; i++) {
      const length = Math.floor(rand() * 24);
      let candidate = '';
      for (let j = 0; j < length; j++) {
        candidate += alphabet[Math.floor(rand() * alphabet.length)];
      }

      // A parser that throws on malformed input turns a typo into a stack
      // trace; every answer here is a value.
      expect(() => parseTarget(candidate)).not.toThrow();
      expect(() => parseTargetUri(candidate)).not.toThrow();
    }
  });

  it('a rejection always says why', () => {
    const rejected = ['', '   ', 'ssh://', 'docker://', 'k8s://', 'ftp://host', 'web-1', 'deploy@'];

    for (const input of rejected) {
      const result = parseTarget(input);
      expect(result.ok, `${JSON.stringify(input)} was accepted`).toBe(false);
      if (!result.ok) {
        expect(result.reason.length, `${JSON.stringify(input)} gave an empty reason`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the failures this parser replaces', () => {
  it('reads the example from the CLI\'s own help', () => {
    // `deploy@server.com` used to resolve to a machine literally named
    // "deploy@server.com", reached as the local user, because the parser
    // refused any hostname containing a dot.
    const result = parseTarget('deploy@server.com');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toEqual({ kind: 'ssh', host: 'server.com', user: 'deploy' });
    }
  });

  it('takes a port where a port was written', () => {
    const result = parseTarget('deploy@server.example.com:2222');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toEqual({
        kind: 'ssh',
        host: 'server.example.com',
        user: 'deploy',
        port: 2222,
      });
    }
  });

  it('keeps an IPv6 address whole', () => {
    const result = parseTarget('root@[2001:db8::1]:22');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target).toEqual({ kind: 'ssh', host: '2001:db8::1', user: 'root', port: 22 });
    }
  });

  it('refuses to guess at a bare word', () => {
    // `xec on local 'x'` reached an SSH host named "local"; a bare word is
    // a configured name, a task or a command, and the parser is not the
    // place to decide which.
    expect(parseTarget('web-1').ok).toBe(false);
    expect(parseTarget('deploy').ok).toBe(false);
  });

  it('knows `local` names this machine', () => {
    const result = parseTarget('local');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.target.kind).toBe('local');
  });

  it('hands a configured reference back to the configuration', () => {
    // `hosts.deploy@server.example.com` is a key that happens to contain an
    // @. Parsing it as a direct specification threw away the port and
    // credentials the operator had configured for that host.
    const result = parseTarget('hosts.deploy@server.example.com');

    expect(result.ok).toBe(false);
    expect(isConfigReference('hosts.deploy@server.example.com')).toBe(true);
    expect(isConfigReference('containers.api')).toBe(true);
    expect(isConfigReference('pods.web')).toBe(true);
    expect(isConfigReference('deploy@example.com')).toBe(false);
  });

  it('rejects a port that is not one', () => {
    expect(parseTarget('ssh://host:22abc').ok).toBe(false);
    expect(parseTarget('ssh://host:0').ok).toBe(false);
    expect(parseTarget('ssh://host:99999').ok).toBe(false);
  });

  it('defaults a kubernetes namespace rather than inventing one', () => {
    const bare = parseTargetUri('k8s://api-pod');
    expect(bare.ok).toBe(true);
    if (bare.ok && bare.target.kind === 'kubernetes') {
      expect(bare.target.namespace).toBe('default');
      expect(bare.target.pod).toBe('api-pod');
    }

    const full = parseTargetUri('k8s://prod/api-7f9d/sidecar');
    expect(full.ok).toBe(true);
    if (full.ok && full.target.kind === 'kubernetes') {
      expect(full.target).toEqual({
        kind: 'kubernetes',
        namespace: 'prod',
        pod: 'api-7f9d',
        container: 'sidecar',
      });
    }
  });

  it('describes a target the way a person would say it', () => {
    expect(describeTarget({ kind: 'local' })).toBe('local');
    expect(describeTarget({ kind: 'ssh', host: 'web-1', user: 'deploy' })).toBe('deploy@web-1');
    expect(describeTarget({ kind: 'docker', container: 'api' })).toBe('api');
    expect(describeTarget({ kind: 'kubernetes', namespace: 'prod', pod: 'api' })).toBe('prod/api');
  });
});
