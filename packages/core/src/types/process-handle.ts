import type { Readable, Writable } from 'node:stream';

/**
 * Live access to a command while it runs.
 *
 * `ProcessPromise.child` used to be a hardcoded `undefined` and `stdin` a
 * hardcoded `null`: the type advertised access to the running process and
 * delivered nothing, so writing to a prompt, tailing output as it arrives or
 * inspecting the pid was impossible.
 *
 * The handle is uniform across environments rather than being a raw
 * `ChildProcess`, because "the process" is not the same thing everywhere:
 *
 * | Environment | What the handle wraps                               |
 * |-------------|-----------------------------------------------------|
 * | local       | the spawned child process                            |
 * | docker      | the CLI transport; run mode also owns its container  |
 * | kubernetes  | the `kubectl exec` CLI process                       |
 * | ssh         | the exec channel on the pooled connection            |
 *
 * A raw `ChildProcess` would have leaked the local shape into every adapter
 * and been a lie for SSH, where there is no local child at all.
 */
export interface ProcessHandle {
  /**
   * Process id, where the environment has one.
   *
   * Absent for SSH: the remote process id is not knowable from the channel,
   * and returning the local pid would invite signalling the wrong machine.
   */
  readonly pid?: number;

  /** Immutable remote resource owned by this execution, never an exec target. */
  readonly resource?: { readonly type: 'docker-container'; readonly id: string };

  /** Input stream, for commands that read from stdin. */
  readonly stdin: Writable | null;

  /** Output stream, as it arrives. */
  readonly stdout: Readable | null;

  /** Error stream, as it arrives. */
  readonly stderr: Readable | null;

  /**
   * Terminate the command.
   *
   * Local execution signals its process tree. Docker run mode also stops its
   * owned container; await the command to confirm remote termination. Failure
   * to confirm remains an error, including with nothrow. Docker/kubernetes exec
   * only stop their local transport: the existing container is not owned, and
   * its remote process termination cannot be inferred from the transport exit.
   *
   * @param signal - Signal to deliver; defaults to SIGTERM.
   */
  kill(signal?: NodeJS.Signals): void;
}
