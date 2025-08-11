import { it, expect, describe } from 'vitest';
import { getAdapter } from '@xec-sh/tui-tester';

describe('Debug Environment', () => {
  it('should have proper environment variables', async () => {
    console.log('Process exists:', typeof process !== 'undefined');
    console.log('Process.env exists:', typeof process?.env !== 'undefined');
    console.log('PATH:', process?.env?.PATH);
    console.log('PATH includes homebrew:', process?.env?.PATH?.includes('/opt/homebrew/bin'));
    
    const adapter = getAdapter();
    console.log('Adapter type:', adapter.constructor.name);
    
    if (adapter.commandExists) {
      const tmuxExists = await adapter.commandExists('tmux');
      console.log('tmux exists via adapter:', tmuxExists);
    }
    
    // Also test exec directly
    if (adapter.exec) {
      try {
        const result = await adapter.exec('which tmux');
        console.log('which tmux result:', result);
      } catch (err) {
        console.log('which tmux error:', err);
      }
    }
    
    expect(true).toBe(true); // Dummy assertion
  });
});