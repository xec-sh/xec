#!/usr/bin/env node
import { log, text, select, confirm, multiselect } from '../../src/index.js';
class TodoApp {
    constructor() {
        this.todos = [];
        this.nextId = 1;
    }
    async run() {
        log.success('Welcome to TODO CLI!');
        while (true) {
            const action = await this.showMainMenu();
            if (action === 'exit') {
                log.info('Goodbye!');
                break;
            }
            await this.handleAction(action);
        }
    }
    async showMainMenu() {
        const options = [
            { value: 'add', label: '➕ Add new todo' },
            { value: 'list', label: '📋 List todos' },
            { value: 'complete', label: '✅ Mark todo as complete' },
            { value: 'delete', label: '🗑️  Delete todo' },
            { value: 'filter', label: '🔍 Filter by tags' },
            { value: 'exit', label: '👋 Exit' }
        ];
        if (this.todos.length === 0) {
            options.splice(1, 4);
        }
        return await select('What would you like to do?', { options });
    }
    async handleAction(action) {
        switch (action) {
            case 'add':
                await this.addTodo();
                break;
            case 'list':
                await this.listTodos();
                break;
            case 'complete':
                await this.completeTodo();
                break;
            case 'delete':
                await this.deleteTodo();
                break;
            case 'filter':
                await this.filterByTags();
                break;
        }
    }
    async addTodo() {
        const todoText = await text('What do you need to do?', {
            placeholder: 'e.g., Buy groceries',
            validate: (value) => {
                if (!value.trim())
                    return 'Todo cannot be empty';
                return undefined;
            }
        });
        const priority = await select('Priority:', {
            options: [
                { value: 'low', label: '🟢 Low', hint: 'Can be done anytime' },
                { value: 'medium', label: '🟡 Medium', hint: 'Should be done soon' },
                { value: 'high', label: '🔴 High', hint: 'Urgent!' }
            ]
        });
        const availableTags = ['work', 'personal', 'shopping', 'health', 'finance'];
        const tags = await multiselect('Tags (optional):', {
            options: availableTags
        });
        const todo = {
            id: this.nextId++,
            text: todoText,
            completed: false,
            priority,
            tags
        };
        this.todos.push(todo);
        log.success(`Added: "${todo.text}"`);
    }
    async listTodos(todos) {
        const items = todos || this.todos;
        if (items.length === 0) {
            log.info('No todos found.');
            return;
        }
        console.log('\n📋 Your Todos:\n');
        const incomplete = items.filter(t => !t.completed);
        const completed = items.filter(t => t.completed);
        if (incomplete.length > 0) {
            console.log('📌 Pending:');
            incomplete.forEach(todo => {
                const priorityIcon = this.getPriorityIcon(todo.priority);
                const tags = todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';
                console.log(`  ${priorityIcon} ${todo.id}. ${todo.text}${tags}`);
            });
        }
        if (completed.length > 0) {
            console.log('\n✅ Completed:');
            completed.forEach(todo => {
                const tags = todo.tags.length > 0 ? ` [${todo.tags.join(', ')}]` : '';
                console.log(`  ✓ ${todo.id}. ${todo.text}${tags}`);
            });
        }
        console.log();
        await confirm('Continue?', { defaultValue: true });
    }
    async completeTodo() {
        const incompleteTodos = this.todos.filter(t => !t.completed);
        if (incompleteTodos.length === 0) {
            log.info('No incomplete todos.');
            return;
        }
        const options = incompleteTodos.map(todo => ({
            value: todo.id,
            label: `${this.getPriorityIcon(todo.priority)} ${todo.text}`,
            hint: todo.tags.join(', ') || undefined
        }));
        const todoId = await select('Which todo did you complete?', { options });
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            todo.completed = true;
            log.success(`Completed: "${todo.text}"`);
        }
    }
    async deleteTodo() {
        const options = this.todos.map(todo => ({
            value: todo.id,
            label: `${todo.completed ? '✓' : this.getPriorityIcon(todo.priority)} ${todo.text}`,
            hint: todo.tags.join(', ') || undefined
        }));
        const todoId = await select('Which todo to delete?', { options });
        const index = this.todos.findIndex(t => t.id === todoId);
        if (index !== -1) {
            const deleted = this.todos.splice(index, 1)[0];
            log.warning(`Deleted: "${deleted?.text}"`);
        }
    }
    async filterByTags() {
        const allTags = Array.from(new Set(this.todos.flatMap(t => t.tags)));
        if (allTags.length === 0) {
            log.info('No tags found in todos.');
            return;
        }
        const selectedTags = await multiselect('Filter by tags:', {
            options: allTags
        });
        if (selectedTags.length === 0) {
            await this.listTodos();
            return;
        }
        const filtered = this.todos.filter(todo => selectedTags.some(tag => todo.tags.includes(tag)));
        console.log(`\n🔍 Todos with tags: ${selectedTags.join(', ')}`);
        await this.listTodos(filtered);
    }
    getPriorityIcon(priority) {
        switch (priority) {
            case 'low': return '🟢';
            case 'medium': return '🟡';
            case 'high': return '🔴';
        }
        return '';
    }
}
async function main() {
    try {
        const app = new TodoApp();
        await app.run();
        process.exit(0);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'Cancelled') {
            log.info('Operation cancelled.');
        }
        else {
            log.error(`An error occurred: ${error}`);
        }
        process.exit(1);
    }
}
process.on('SIGINT', () => {
    console.log('\n');
    log.info('Interrupted. Goodbye!');
    process.exit(0);
});
main();
//# sourceMappingURL=todo-cli.js.map