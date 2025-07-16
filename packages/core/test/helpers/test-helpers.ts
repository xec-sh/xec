import { vi } from 'vitest';

import type { Logger } from '../../src/core/types.js';

export function createMockLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  };
  
  // Make child return the same logger instance
  (logger.child as any).mockReturnValue(logger);
  
  return logger;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}