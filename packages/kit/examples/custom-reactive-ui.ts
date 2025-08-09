#!/usr/bin/env node
/**
 * Example: Custom reactive UI using renderOnly() and handleInputOnly()
 * 
 * This example demonstrates the new prompt lifecycle methods that enable
 * building complex reactive UIs without blocking the event loop.
 */

import { 
  Key,
  TextPrompt,
  SelectPrompt,
  StreamHandler,
  MultiSelectPrompt
} from '../src/index.js';

/**
 * Custom reactive dashboard that shows multiple prompts simultaneously
 */
class ReactiveDashboard {
  private stream: StreamHandler;
  private prompts: Map<string, any>;
  private activePromptId: string;
  private values: Map<string, any>;
  private isRunning: boolean = false;

  constructor() {
    this.stream = new StreamHandler({ shared: true });
    this.prompts = new Map();
    this.values = new Map();
    this.activePromptId = '';
    
    // Initialize prompts
    this.setupPrompts();
  }

  private setupPrompts() {
    // Search prompt
    const searchPrompt = new TextPrompt({
      message: '🔍 Search:',
      placeholder: 'Type to search...',
      stream: this.stream
    });
    this.prompts.set('search', searchPrompt);
    
    // Filter prompt
    const filterPrompt = new MultiSelectPrompt({
      message: '🏷️ Filters:',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'archived', label: 'Archived' }
      ],
      stream: this.stream
    });
    this.prompts.set('filter', filterPrompt);
    
    // Sort prompt
    const sortPrompt = new SelectPrompt({
      message: '📊 Sort by:',
      options: [
        { value: 'date', label: 'Date' },
        { value: 'name', label: 'Name' },
        { value: 'priority', label: 'Priority' }
      ],
      stream: this.stream
    });
    this.prompts.set('sort', sortPrompt);
    
    // Command prompt
    const commandPrompt = new TextPrompt({
      message: '> Command:',
      placeholder: 'Enter command (help for list)...',
      stream: this.stream
    });
    this.prompts.set('command', commandPrompt);
  }

  async render(): Promise<string> {
    const lines: string[] = [];
    
    // Header
    lines.push('╔════════════════════════════════════════════════╗');
    lines.push('║           REACTIVE DASHBOARD DEMO              ║');
    lines.push('╚════════════════════════════════════════════════╝');
    lines.push('');
    lines.push('Navigate: Tab/Shift+Tab | Select: Space/Enter | Quit: Ctrl+C');
    lines.push('─'.repeat(50));
    lines.push('');
    
    // Render each prompt
    for (const [id, prompt] of this.prompts) {
      const isActive = id === this.activePromptId;
      
      // Add active indicator
      if (isActive) {
        lines.push('▶ ' + (await prompt.renderOnly()));
      } else {
        const rendered = await prompt.renderOnly();
        lines.push('  ' + rendered.replace(/\n/g, '\n  '));
      }
      
      // Show current value if any
      const value = prompt.getValue();
      if (value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          lines.push(`    Current: [${value.join(', ')}]`);
        } else {
          lines.push(`    Current: ${value}`);
        }
      }
      
      lines.push('');
    }
    
    // Status bar
    lines.push('─'.repeat(50));
    lines.push('Status: ' + (this.isRunning ? '🟢 Active' : '🔴 Stopped'));
    
    // Results section
    if (this.values.size > 0) {
      lines.push('');
      lines.push('Results:');
      for (const [key, value] of this.values) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
    
    return lines.join('\n');
  }

  async handleKeyPress(key: Key): Promise<boolean> {
    // Handle navigation
    if (key.name === 'tab') {
      this.navigateNext(key.shift || false);
      return true;
    }
    
    // Handle quit
    if (key.ctrl && key.name === 'c') {
      return false; // Signal to quit
    }
    
    // Handle enter - save current value
    if (key.name === 'enter' || key.name === 'return') {
      const activePrompt = this.prompts.get(this.activePromptId);
      if (activePrompt) {
        const value = activePrompt.getValue();
        if (value !== undefined) {
          this.values.set(this.activePromptId, value);
          
          // Special handling for command prompt
          if (this.activePromptId === 'command') {
            await this.executeCommand(value);
          }
        }
      }
      return true;
    }
    
    // Pass key to active prompt
    const activePrompt = this.prompts.get(this.activePromptId);
    if (activePrompt) {
      await activePrompt.handleInputOnly(key);
    }
    
    return true;
  }

  private navigateNext(reverse: boolean = false) {
    const ids = Array.from(this.prompts.keys());
    const currentIndex = ids.indexOf(this.activePromptId);
    
    let nextIndex;
    if (reverse) {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = ids.length - 1;
    } else {
      nextIndex = (currentIndex + 1) % ids.length;
    }
    
    this.activePromptId = ids[nextIndex];
  }

  private async executeCommand(command: string) {
    const cmd = command.toLowerCase().trim();
    
    switch (cmd) {
      case 'help':
        console.log('\nAvailable commands:');
        console.log('  clear - Clear all values');
        console.log('  save  - Save current state');
        console.log('  load  - Load saved state');
        console.log('  help  - Show this help');
        break;
        
      case 'clear':
        this.values.clear();
        for (const prompt of this.prompts.values()) {
          // Reset prompt values
          const state = (prompt as any).state.getState();
          state.value = undefined;
          (prompt as any).state.setState(state);
        }
        break;
        
      case 'save':
        const state: any = {};
        for (const [id, prompt] of this.prompts) {
          state[id] = prompt.getValue();
        }
        console.log('\nSaved state:', JSON.stringify(state, null, 2));
        break;
        
      case 'load':
        console.log('\nLoad functionality not implemented in demo');
        break;
        
      default:
        if (cmd) {
          console.log(`\nUnknown command: ${command}`);
        }
    }
  }

  async run(): Promise<void> {
    this.isRunning = true;
    this.activePromptId = 'search'; // Start with search
    
    // Start the stream
    this.stream.start();
    this.stream.hideCursor();
    
    try {
      // Initial render
      console.clear();
      console.log(await this.render());
      
      // Handle input
      await new Promise<void>((resolve, reject) => {
        const handleKey = async (key: Key) => {
          try {
            const shouldContinue = await this.handleKeyPress(key);
            
            if (!shouldContinue) {
              resolve();
              return;
            }
            
            // Re-render
            console.clear();
            console.log(await this.render());
          } catch (error) {
            reject(error);
          }
        };
        
        this.stream.on('key', handleKey);
      });
    } finally {
      this.stream.showCursor();
      this.stream.stop();
      this.isRunning = false;
    }
  }
}

async function main() {
  console.log('Starting Reactive Dashboard Demo...');
  console.log('This demonstrates the new renderOnly() and handleInputOnly() methods\n');
  
  const dashboard = new ReactiveDashboard();
  
  try {
    await dashboard.run();
    console.log('\n✅ Dashboard closed successfully');
  } catch (error) {
    console.error('\n❌ Dashboard error:', error);
  }
  
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the demo
main();