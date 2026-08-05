/**
 * The codes a failure can be identified by.
 *
 * `-o json` puts a `code` on every error, and it is the only part of a
 * failure a script or an agent should match on: the message is written for
 * a person and will be reworded, the code is a promise.
 *
 * Deliberately words, not numbers. `XE0417` would need this table open in
 * another window to mean anything, and renaming `VALIDATION_ERROR` to a
 * number would break every matcher already written against it in exchange
 * for nothing. Codes are read far more often than they are looked up.
 *
 * System error numbers — `ENOENT`, `EACCES`, `ECONNREFUSED` — are passed
 * through unchanged rather than translated. They are already a standard
 * vocabulary that every operator and every language knows, and inventing
 * a parallel one for them would be worse in every direction.
 *
 * @module
 */

/** Codes this project defines. */
export const XEC_ERROR_CODES = [
  // The caller asked for something that cannot be done
  'USER_ERROR',
  'VALIDATION_ERROR',
  'CONFIG_ERROR',
  'RESOURCE_NOT_FOUND',

  // Something ran and did not succeed
  'COMMAND_FAILED',
  'TIMEOUT_ERROR',
  'MAX_BUFFER_EXCEEDED',
  'OPERATION_FAILED',

  // A target could not be reached or used
  'CONNECTION_FAILED',
  'ADAPTER_ERROR',
  'DOCKER_ERROR',
  'KUBERNETES_ERROR',
  'NETWORK_ERROR',
  'CONTEXT_ERROR',

  // The project's own machinery
  'TASK_ERROR',
  'RECIPE_ERROR',
  'MODULE_ERROR',
  'FILESYSTEM_ERROR',

  // Secrets. These arrive on a `SecretError`, whose name is emitted
  // alongside the code, so `GET_ERROR` is never ambiguous in context.
  'SECRET_NOT_FOUND',
  'GET_ERROR',
  'SET_ERROR',
  'DELETE_ERROR',
  'LIST_ERROR',
  'DECRYPTION_FAILED',
  'STORAGE_ACCESS_ERROR',
  'GIT_OPERATION_FAILED',
  'TEAM_MEMBER_NOT_FOUND',

  // Nothing more specific was known
  'UNKNOWN_ERROR',
] as const;

/** A code this project defines. */
export type XecErrorCode = (typeof XEC_ERROR_CODES)[number];

/**
 * What each code means, for the catalogue and for `--explain`.
 *
 * One sentence each. A code whose meaning takes a paragraph is two codes.
 */
export const XEC_ERROR_MEANINGS: Readonly<Record<XecErrorCode, string>> = {
  USER_ERROR: 'The command was asked to do something it cannot; the message is the whole story.',
  VALIDATION_ERROR: 'An option or argument was not of the shape the command accepts.',
  CONFIG_ERROR: 'The project configuration is missing, unreadable, or describes something impossible.',
  RESOURCE_NOT_FOUND: 'A named target, task or file does not exist.',

  COMMAND_FAILED: 'The command ran on the target and exited non-zero.',
  TIMEOUT_ERROR: 'The command was still running when its time ran out.',
  MAX_BUFFER_EXCEEDED: 'The command produced more output than the buffer allows; stream it instead.',
  OPERATION_FAILED: 'An operation this tool performs itself — a copy, a transfer — did not complete.',

  CONNECTION_FAILED: 'The target could not be reached, or refused the connection.',
  ADAPTER_ERROR: 'The adapter for this kind of target could not carry out the request.',
  DOCKER_ERROR: 'Docker refused the operation, or the daemon is not reachable.',
  KUBERNETES_ERROR: 'The cluster refused the operation, or kubectl could not reach it.',
  NETWORK_ERROR: 'A network operation failed for a reason the adapter could not classify.',
  CONTEXT_ERROR: 'The target names a cluster context or kubeconfig that does not exist.',

  TASK_ERROR: 'A configured task failed, or is defined in a way that cannot run.',
  RECIPE_ERROR: 'A recipe failed, or is defined in a way that cannot run.',
  MODULE_ERROR: 'A script or module could not be loaded.',
  FILESYSTEM_ERROR: 'A file operation failed for a reason with no more specific code.',

  SECRET_NOT_FOUND: 'No secret is stored under that name.',
  GET_ERROR: 'The secret exists but could not be read from the store.',
  SET_ERROR: 'The secret could not be written to the store.',
  DELETE_ERROR: 'The secret could not be removed from the store.',
  LIST_ERROR: 'The store could not be enumerated.',
  DECRYPTION_FAILED: 'The record was found but could not be decrypted; the passphrase or the machine differs.',
  STORAGE_ACCESS_ERROR: 'The secret store directory cannot be read or written.',
  GIT_OPERATION_FAILED: 'The git secret provider could not complete a git operation.',
  TEAM_MEMBER_NOT_FOUND: 'No team member is registered under that name.',

  UNKNOWN_ERROR: 'The failure was not recognised; the message and, with --verbose, the stack are all there is.',
};

/** Whether a code is one this project defines, rather than a system errno. */
export function isXecErrorCode(code: string): code is XecErrorCode {
  return (XEC_ERROR_CODES as readonly string[]).includes(code);
}
