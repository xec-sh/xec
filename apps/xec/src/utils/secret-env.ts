import type { SecretManager } from '@xec-sh/ops';

import { UserError } from '@xec-sh/ops';
import { registerSecret } from '@xec-sh/core';

/**
 * Environment values that name a secret instead of carrying one.
 *
 * `--env PGPASSWORD=secret://pg` resolves `pg` from the store on *this*
 * machine and delivers the value through the environment of the remote
 * process. The distinction matters more than it looks.
 *
 * A secret written literally — `--env PGPASSWORD=hunter2` — is in the
 * operator's shell history, in any log that echoes the invocation, and, for
 * the interactive paths that build a `docker exec` command line, in the
 * output of `ps` on the local machine. `op run` and `doppler run` solve
 * this for local commands; across a machine boundary nobody does, so the
 * usual practice is to paste the secret and hope.
 *
 * A reference never becomes part of a command line. It is read here,
 * registered with the masker so it cannot surface in output, events or
 * errors, and handed to the adapter as an environment entry — which SSH,
 * docker and kubectl all transmit out of band.
 *
 * @module
 */

/** The scheme that marks a value as a reference rather than a secret. */
const SECRET_SCHEME = 'secret://';

/** Whether a value names a secret instead of being one. */
export function isSecretReference(value: string): boolean {
  return value.startsWith(SECRET_SCHEME);
}

/** The key a reference names. */
export function secretReferenceKey(value: string): string {
  return value.slice(SECRET_SCHEME.length);
}

/** The environment to hand to the adapter, and what could not be protected. */
export interface ResolvedEnv {
  readonly env: Record<string, string>;
  /**
   * Keys whose resolved value was too short to redact safely.
   *
   * Reported rather than silently accepted: the operator asked for a secret
   * and is owed the news that it will be visible if the command prints it.
   */
  readonly unprotected: readonly string[];
}

/**
 * Read `KEY=VALUE` pairs, resolving any `secret://` references.
 *
 * Three spellings are accepted, following the convention `docker run -e`
 * established:
 *
 * - `KEY=value` — a literal value.
 * - `KEY=secret://name` — read `name` from the secret store.
 * - `KEY` — take `KEY` from the current environment.
 *
 * Resolution happens before anything is executed anywhere, so a reference
 * to a key that does not exist fails here, naming the key, rather than
 * after a connection is open and half a deployment has run.
 *
 * @param pairs - The `--env` values as given.
 * @param secrets - Opens the secret store; called only if a reference uses it.
 * @returns The resolved environment.
 * @throws When a pair is malformed, or names a key nothing holds.
 */
export async function resolveEnvPairs(
  pairs: readonly string[],
  secrets: () => Promise<SecretManager>
): Promise<ResolvedEnv> {
  const env: Record<string, string> = {};
  const unprotected: string[] = [];
  let manager: SecretManager | null = null;

  for (const pair of pairs) {
    const separator = pair.indexOf('=');

    if (separator === 0) {
      throw new UserError(`--env needs a name before the '=': ${JSON.stringify(pair)}`);
    }

    // No '=' at all: pass the variable through from this environment, the
    // way `docker run -e KEY` does. Silently ignoring it — the previous
    // behaviour — left the far side without a variable the operator had
    // explicitly asked to forward.
    if (separator === -1) {
      const inherited = process.env[pair];
      if (inherited === undefined) {
        throw new UserError(
          `--env ${pair} forwards ${pair} from this environment, but it is not set. ` +
          `Give it a value with --env ${pair}=...`
        );
      }
      env[pair] = inherited;
      continue;
    }

    const key = pair.slice(0, separator);
    // slice, not split: `split('=')` truncated at the first '=', which
    // silently corrupted every base64 value with '=' padding and every
    // connection string.
    const value = pair.slice(separator + 1);

    if (!isSecretReference(value)) {
      env[key] = value;
      continue;
    }

    // The store is opened only when a reference is actually used, so an
    // ordinary command pays nothing for the feature.
    manager ??= await secrets();

    const name = secretReferenceKey(value);
    if (name === '') {
      throw new UserError(`secret:// needs a name: ${key}=${value}`);
    }

    const resolved = await manager.get(name);
    if (resolved === null || resolved === undefined) {
      throw new UserError(
        `No secret named '${name}' (referenced by ${key}).\n` +
        `  Store it with: xec secrets set ${name}`
      );
    }

    // Registered before it travels: from here it is redacted in command
    // echoes, streamed output, events and error messages alike.
    if (!registerSecret(resolved)) {
      unprotected.push(key);
    }
    env[key] = resolved;
  }

  return { env, unprotected };
}
