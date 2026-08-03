import { userInfo } from 'node:os';

import type { SSHAdapterOptions, KubernetesAdapterOptions } from '../types/command.js';

/**
 * Parse an SSH target shorthand into adapter options.
 *
 * Accepts the form `[user@]host[:port]`, mirroring the syntax people already
 * type into `ssh` itself, so the common case does not require an options
 * object.
 *
 * @param target - The shorthand string, e.g. `deploy@web-1:2222`.
 * @returns The equivalent adapter options.
 * @throws {TypeError} If the target is empty or the port is not a valid number.
 *
 * @example
 * ```typescript
 * parseSSHTarget('web-1');            // { host: 'web-1' }
 * parseSSHTarget('deploy@web-1');     // { host: 'web-1', username: 'deploy' }
 * parseSSHTarget('deploy@web-1:2222');// { host: 'web-1', username: 'deploy', port: 2222 }
 * ```
 */
export function parseSSHTarget(target: string): Omit<SSHAdapterOptions, 'type'> {
  const trimmed = target.trim();

  if (trimmed.length === 0) {
    throw new TypeError('SSH target must not be empty');
  }

  // Split on the LAST `@` so passwords or usernames containing `@` still work.
  const separator = trimmed.lastIndexOf('@');
  const username = separator === -1 ? undefined : trimmed.slice(0, separator);
  const hostPart = separator === -1 ? trimmed : trimmed.slice(separator + 1);

  if (separator !== -1 && username!.length === 0) {
    throw new TypeError(`SSH target has an empty username: ${JSON.stringify(target)}`);
  }

  let host = hostPart;
  let port: number | undefined;

  if (hostPart.startsWith('[')) {
    // Bracketed IPv6 literal: `[2001:db8::1]` optionally followed by `:port`.
    const closing = hostPart.indexOf(']');

    if (closing === -1) {
      throw new TypeError(`SSH target has an unterminated IPv6 literal: ${JSON.stringify(target)}`);
    }

    host = hostPart.slice(1, closing);
    const remainder = hostPart.slice(closing + 1);

    if (remainder.startsWith(':')) {
      port = parsePort(remainder.slice(1));
    } else if (remainder.length > 0) {
      throw new TypeError(`SSH target is malformed after the IPv6 literal: ${JSON.stringify(target)}`);
    }
  } else {
    // A single colon separates host from port. Several colons mean a bare IPv6
    // literal, whose final group must not be mistaken for a port.
    const firstColon = hostPart.indexOf(':');

    if (firstColon !== -1 && firstColon === hostPart.lastIndexOf(':')) {
      host = hostPart.slice(0, firstColon);
      port = parsePort(hostPart.slice(firstColon + 1));
    }
  }

  if (host.length === 0) {
    throw new TypeError(`SSH target has an empty host: ${JSON.stringify(target)}`);
  }

  return {
    host,
    // Match `ssh` itself: with no explicit user, connect as the local user.
    username: username ?? currentUsername(),
    ...(port === undefined ? {} : { port }),
  };
}

/**
 * Parse and range-check a TCP port from a target shorthand.
 *
 * @param raw - The text following the port separator.
 * @returns The port number.
 * @throws {TypeError} If the value is not an integer in 1–65535.
 */
function parsePort(raw: string): number {
  const port = Number(raw);

  if (raw.trim().length === 0 || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError(`SSH target has an invalid port: ${JSON.stringify(raw)}`);
  }

  return port;
}

/**
 * Resolve the local user name for SSH targets that omit one.
 *
 * @returns The current OS user, or `root` if the platform cannot report one.
 */
function currentUsername(): string {
  try {
    return userInfo().username;
  } catch {
    // userInfo() throws when there is no passwd entry (some containers).
    return process.env['USER'] ?? process.env['LOGNAME'] ?? 'root';
  }
}

/**
 * Parse a Kubernetes target shorthand into adapter options.
 *
 * Accepts `[namespace/]pod[:container]`, matching how pods are referred to in
 * `kubectl` output.
 *
 * @param target - The shorthand string, e.g. `prod/api-7d9f:sidecar`.
 * @returns The equivalent adapter options.
 * @throws {TypeError} If the target is empty or malformed.
 *
 * @example
 * ```typescript
 * parseK8sTarget('api-pod');              // { pod: 'api-pod' }
 * parseK8sTarget('prod/api-pod');         // { namespace: 'prod', pod: 'api-pod' }
 * parseK8sTarget('prod/api-pod:sidecar'); // { namespace: 'prod', pod: 'api-pod', container: 'sidecar' }
 * ```
 */
export function parseK8sTarget(target: string): Omit<KubernetesAdapterOptions, 'type'> {
  const trimmed = target.trim();

  if (trimmed.length === 0) {
    throw new TypeError('Kubernetes target must not be empty');
  }

  const slash = trimmed.indexOf('/');
  const namespace = slash === -1 ? undefined : trimmed.slice(0, slash);
  const rest = slash === -1 ? trimmed : trimmed.slice(slash + 1);

  const colon = rest.indexOf(':');
  const pod = colon === -1 ? rest : rest.slice(0, colon);
  const container = colon === -1 ? undefined : rest.slice(colon + 1);

  if (pod.length === 0) {
    throw new TypeError(`Kubernetes target has an empty pod name: ${JSON.stringify(target)}`);
  }

  if (namespace !== undefined && namespace.length === 0) {
    throw new TypeError(`Kubernetes target has an empty namespace: ${JSON.stringify(target)}`);
  }

  if (container !== undefined && container.length === 0) {
    throw new TypeError(`Kubernetes target has an empty container name: ${JSON.stringify(target)}`);
  }

  return {
    pod,
    ...(namespace === undefined ? {} : { namespace }),
    ...(container === undefined ? {} : { container }),
  };
}
