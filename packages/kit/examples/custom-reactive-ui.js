#!/usr/bin/env node
import { TextPrompt, SelectPrompt, StreamHandler, MultiSelectPrompt } from '../src/index.js';
class ReactiveDashboard {
    constructor() {
        this.isRunning = false;
        this.stream = new StreamHandler({ shared: true });
        this.prompts = new Map();
        this.values = new Map();
        this.activePromptId = '';
        this.setupPrompts();
    }
    setupPrompts() {
        const searchPrompt = new TextPrompt({
            message: '🔍 Search:',
            placeholder: 'Type to search...',
            stream: this.stream
        });
        this.prompts.set('search', searchPrompt);
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
        const commandPrompt = new TextPrompt({
            message: '> Command:',
            placeholder: 'Enter command (help for list)...',
            stream: this.stream
        });
        this.prompts.set('command', commandPrompt);
    }
    async render() {
        const lines = [];
        lines.push('╔════════════════════════════════════════════════╗');
        lines.push('║           REACTIVE DASHBOARD DEMO              ║');
        lines.push('╚════════════════════════════════════════════════╝');
        lines.push('');
        lines.push('Navigate: Tab/Shift+Tab | Select: Space/Enter | Quit: Ctrl+C');
        lines.push('─'.repeat(50));
        lines.push('');
        for (const [id, prompt] of this.prompts) {
            const isActive = id === this.activePromptId;
            if (isActive) {
                lines.push('▶ ' + (await prompt.renderOnly()));
            }
            else {
                const rendered = await prompt.renderOnly();
                lines.push('  ' + rendered.replace(/\n/g, '\n  '));
            }
            const value = prompt.getValue();
            if (value !== undefined && value !== '') {
                if (Array.isArray(value)) {
                    lines.push(`    Current: [${value.join(', ')}]`);
                }
                else {
                    lines.push(`    Current: ${value}`);
                }
            }
            lines.push('');
        }
        lines.push('─'.repeat(50));
        lines.push('Status: ' + (this.isRunning ? '🟢 Active' : '🔴 Stopped'));
        if (this.values.size > 0) {
            lines.push('');
            lines.push('Results:');
            for (const [key, value] of this.values) {
                lines.push(`  ${key}: ${JSON.stringify(value)}`);
            }
        }
        return lines.join('\n');
    }
    async handleKeyPress(key) {
        if (key.name === 'tab') {
            this.navigateNext(key.shift || false);
            return true;
        }
        if (key.ctrl && key.name === 'c') {
            return false;
        }
        if (key.name === 'enter' || key.name === 'return') {
            const activePrompt = this.prompts.get(this.activePromptId);
            if (activePrompt) {
                const value = activePrompt.getValue();
                if (value !== undefined) {
                    this.values.set(this.activePromptId, value);
                    if (this.activePromptId === 'command') {
                        await this.executeCommand(value);
                    }
                }
            }
            return true;
        }
        const activePrompt = this.prompts.get(this.activePromptId);
        if (activePrompt) {
            await activePrompt.handleInputOnly(key);
        }
        return true;
    }
    navigateNext(reverse = false) {
        const ids = Array.from(this.prompts.keys());
        const currentIndex = ids.indexOf(this.activePromptId);
        let nextIndex;
        if (reverse) {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0)
                nextIndex = ids.length - 1;
        }
        else {
            nextIndex = (currentIndex + 1) % ids.length;
        }
        this.activePromptId = ids[nextIndex];
    }
    async executeCommand(command) {
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
                    const state = prompt.state.getState();
                    state.value = undefined;
                    prompt.state.setState(state);
                }
                break;
            case 'save':
                const state = {};
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
    async run() {
        this.isRunning = true;
        this.activePromptId = 'search';
        this.stream.start();
        this.stream.hideCursor();
        try {
            console.clear();
            console.log(await this.render());
            await new Promise((resolve, reject) => {
                const handleKey = async (key) => {
                    try {
                        const shouldContinue = await this.handleKeyPress(key);
                        if (!shouldContinue) {
                            resolve();
                            return;
                        }
                        console.clear();
                        console.log(await this.render());
                    }
                    catch (error) {
                        reject(error);
                    }
                };
                this.stream.on('key', handleKey);
            });
        }
        finally {
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
    }
    catch (error) {
        console.error('\n❌ Dashboard error:', error);
    }
    process.exit(0);
}
process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
});
main();
//# sourceMappingURL=custom-reactive-ui.js.map