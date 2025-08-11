import { it, expect, describe } from 'vitest';

describe('Minimal Test', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should work with async', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(true).toBe(true);
  });
});