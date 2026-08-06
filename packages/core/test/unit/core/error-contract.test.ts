import {
  DockerError,
  AdapterError,
  CommandError,
  TimeoutError,
  ConnectionError,
  ExecutionError,
  KubernetesError,
  explainExitCode,
  MaxBufferExceededError,
} from '../../../src/core/error.js';

/**
 * What an error carries, beyond its message.
 *
 * A mutation survey put this file at 55%: the `details` object handed to
 * every constructor could be replaced with `{}` and nothing noticed, the
 * exit-code explanations could all be blanked, and the stderr head could
 * lose its five-line cap. All of those are the parts a caller actually
 * reads — `details` is the machine-readable half of a failure, and the
 * explanation is the difference between "exit 137" and knowing the kernel
 * killed it for memory.
 */
describe('what an error carries', () => {
  describe('a failed command', () => {
    const failure = (overrides: Partial<{
      command: string; exitCode: number; signal: string | undefined;
      stdout: string; stderr: string; duration: number; callSite: string;
    }> = {}): CommandError =>
      new CommandError(
        overrides.command ?? 'deploy.sh',
        overrides.exitCode ?? 1,
        overrides.signal,
        overrides.stdout ?? '',
        overrides.stderr ?? '',
        overrides.duration ?? 42,
        overrides.callSite ?? ''
      );

    it('records everything a caller would otherwise re-derive', () => {
      const error = failure({ exitCode: 3, signal: 'SIGTERM', stdout: 'out', stderr: 'err', duration: 120, callSite: 'a.ts:1' });

      expect(error.details).toEqual({
        exitCode: 3,
        signal: 'SIGTERM',
        stdout: 'out',
        stderr: 'err',
        duration: 120,
        callSite: 'a.ts:1',
      });
    });

    it('classifies itself without being told', () => {
      expect(failure().kind).toBe('command-failed');
      expect(failure().code).toBe('COMMAND_FAILED');
      expect(failure().name).toBe('CommandError');
    });

    it('puts the head of stderr in the message', () => {
      // Without it the message names the command and the code but not the
      // reason, and every caller printed error.stderr by hand.
      const error = failure({ stderr: 'permission denied\n' });

      expect(error.message).toContain('permission denied');
    });

    it('stops at five lines of stderr', () => {
      // A message is read in a terminal. Forty lines of a stack trace from
      // the far side is not a message, it is the output again.
      const error = failure({ stderr: Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n') });

      expect(error.message).toContain('line4');
      expect(error.message).not.toContain('line5');
    });

    it('ignores stderr that is only whitespace', () => {
      const error = failure({ stderr: '   \n\n  ' });

      expect(error.message).toBe('Command failed with exit code 1: deploy.sh');
    });

    it('names the call site when one was captured', () => {
      const error = failure({ callSite: 'deploy.ts:12:3' });

      expect(error.message).toContain('at deploy.ts:12:3');
    });

    it('says nothing about a call site that was not', () => {
      expect(failure().message).not.toContain('    at ');
    });

    it('redacts a credential in the command', () => {
      const error = failure({ command: 'mysql --password hunter2-secret' });

      expect(error.message).not.toContain('hunter2-secret');
      expect(error.message).toContain('--password');
    });
  });

  describe('explaining an exit code', () => {
    // Each of these is a lookup the reader was about to perform. Blanking
    // any one of them survived every test this file had.
    const known: Array<[number, RegExp]> = [
      [2, /shell builtins/],
      [126, /not executable/],
      [127, /not found/],
      [128, /invalid exit argument/],
      [130, /SIGINT/],
      [134, /SIGABRT/],
      [137, /SIGKILL/],
      [139, /segmentation/],
      [141, /SIGPIPE/],
      [143, /SIGTERM/],
    ];

    for (const [code, expected] of known) {
      it(`explains ${code}`, () => {
        expect(explainExitCode(code)).toMatch(expected);
      });
    }

    it('says nothing about a code that carries no information', () => {
      // Deliberately not exhaustive: an explanation that adds nothing is
      // noise in every message that carries it.
      expect(explainExitCode(1)).toBe('');
      expect(explainExitCode(0)).toBe('');
      expect(explainExitCode(42)).toBe('');
    });

    it('puts the explanation in the message it was written for', () => {
      const error = new CommandError('build', 137, undefined, '', '', 1);

      expect(error.message).toContain('137 (killed');
    });
  });

  describe('a connection that failed', () => {
    it('records the host and the underlying message', () => {
      const error = new ConnectionError('db.example.com', new Error('ECONNREFUSED'));

      expect(error.details).toEqual({
        host: 'db.example.com',
        originalError: 'ECONNREFUSED',
      });
      expect(error.code).toBe('CONNECTION_FAILED');
    });

    it('assumes a refusal when the cause says nothing', () => {
      // `unknown` on a connection error is not a useful verdict: something
      // stopped the connection, and refused is the case a retry can fix.
      const error = new ConnectionError('h', new Error('something inscrutable'));

      expect(error.kind).toBe('connection-refused');
      expect(error.recoverable).toBe(true);
    });

    it('keeps a cause that classified itself', () => {
      const authFailure = new ConnectionError('h', new Error('Authentication failed'));

      expect(authFailure.kind).toBe('authentication');
      expect(authFailure.recoverable).toBe(false);
    });
  });

  describe('a timeout', () => {
    it('records the command and the limit it passed', () => {
      const error = new TimeoutError('sleep 60', 5000);

      expect(error.details).toEqual({ command: 'sleep 60', timeout: 5000 });
      expect(error.kind).toBe('timeout');
      expect(error.code).toBe('TIMEOUT_ERROR');
    });

    it('redacts the command in both the message and the details', () => {
      const error = new TimeoutError('curl -u alice:hunter2-secret https://x', 1000);

      expect(error.message).not.toContain('hunter2-secret');
      expect(String(error.details?.['command'])).not.toContain('hunter2-secret');
    });
  });

  describe('output past the buffer limit', () => {
    it('records which stream and what the cap was', () => {
      const error = new MaxBufferExceededError(1024, 'stderr');

      expect(error.details).toEqual({ limit: 1024, stream: 'stderr' });
      expect(error.code).toBe('MAX_BUFFER_EXCEEDED');
      expect(error.name).toBe('MaxBufferExceededError');
    });

    it('says which stream in the message', () => {
      expect(new MaxBufferExceededError(1024, 'stdout').message).toContain('stdout');
      expect(new MaxBufferExceededError(1024, 'stderr').message).toContain('stderr');
    });

    it('keeps what was collected before the cap', () => {
      const error = new MaxBufferExceededError(10, 'stdout', 'head of it', 'and stderr');

      expect(error.partialStdout).toBe('head of it');
      expect(error.partialStderr).toBe('and stderr');
    });

    it('defaults the partial output to empty, not undefined', () => {
      // A caller reads `.partialStdout` to show what the command produced;
      // undefined there is a second failure on top of the first.
      const error = new MaxBufferExceededError(10, 'stdout');

      expect(error.partialStdout).toBe('');
      expect(error.partialStderr).toBe('');
    });
  });

  describe('docker and kubernetes', () => {
    it('records the container and the operation', () => {
      const error = new DockerError('api', 'exec', new Error('daemon not running'));

      expect(error.details).toEqual({
        container: 'api',
        operation: 'exec',
        originalError: 'daemon not running',
      });
      expect(error.message).toContain("'exec'");
      expect(error.message).toContain('api');
    });

    it('records the pod, namespace and container', () => {
      const error = new KubernetesError('exec failed', 'api-7f9d', 'prod', 'sidecar', { extra: 1 });

      expect(error.details).toEqual({
        pod: 'api-7f9d',
        namespace: 'prod',
        container: 'sidecar',
        extra: 1,
      });
      expect(error.code).toBe('KUBERNETES_ERROR');
    });
  });

  describe('an adapter that could not run something', () => {
    it('records the adapter and the operation', () => {
      const error = new AdapterError('ssh', 'connect', new Error('boom'));

      expect(error.details).toEqual({
        adapter: 'ssh',
        operation: 'connect',
        originalError: 'boom',
      });
    });

    it('names both when there is no underlying error', () => {
      const error = new AdapterError('docker', 'start');

      expect(error.message).toBe("Adapter 'docker' failed during 'start'");
      expect(error.details?.['originalError']).toBeUndefined();
    });

    it('keeps a spawn failure that already says which path', () => {
      // `spawn ENOENT` on its own does not say what was missing. When the
      // cause names the path, that message is the more useful one.
      const cause = Object.assign(new Error('spawn /no/such/dir: No such file or directory'), {
        code: 'ENOENT',
        syscall: 'spawn',
      });

      expect(new AdapterError('local', 'exec', cause).message).toContain('/no/such/dir');
    });

    it('gives a bare spawn failure a readable message', () => {
      const cause = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT', syscall: 'spawn' });

      expect(new AdapterError('local', 'exec', cause).message)
        .toBe('spawn ENOENT: No such file or directory');
    });

    it('treats an ENOENT that is not a spawn as an ordinary failure', () => {
      const cause = Object.assign(new Error('open failed'), { code: 'ENOENT', syscall: 'open' });

      expect(new AdapterError('local', 'exec', cause).message)
        .toContain("Adapter 'local' failed during 'exec'");
    });
  });

  describe('the base class', () => {
    it('keeps the details it was given', () => {
      const error = new ExecutionError('boom', 'SOME_CODE', { field: 'value' });

      expect(error.details).toEqual({ field: 'value' });
    });

    it('classifies from the code and message when not told', () => {
      expect(new ExecutionError('connection refused', 'X').kind).toBe('connection-refused');
    });

    it('takes the kind it was told', () => {
      expect(new ExecutionError('anything', 'X', {}, 'timeout').kind).toBe('timeout');
    });
  });
});
