/** A transport failure never implies that a dispatched remote operation was undone. */
export class SSHError extends Error {
  constructor(message: string, readonly code = 'SSH_ERROR', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SSHError';
  }
}

export class SSHOutcomeUnknownError extends SSHError {
  readonly outcome = 'unknown' as const;
  constructor(options: ErrorOptions = {}) {
    super('SSH operation outcome is unknown; reconcile remote state before retrying', 'SSH_OUTCOME_UNKNOWN', options);
    this.name = 'SSHOutcomeUnknownError';
  }
}

export class SSHOutputLimitError extends SSHError {
  readonly outcome = 'unknown' as const;
  constructor(readonly limit: number, readonly stream: 'stdout' | 'stderr', readonly partialStdout = '', readonly partialStderr = '') {
    super(`SSH ${stream} exceeded the ${limit} byte output limit`, 'SSH_OUTPUT_LIMIT');
    this.name = 'SSHOutputLimitError';
  }
}
