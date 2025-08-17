import { store, computed, effect } from '../src/index.js';

// Create reactive state
const todos = store<{ items: { text: string; completed: boolean }[], filter: 'all' | 'active' | 'completed' }>({
  items: [],
  filter: 'all' // 'all', 'active', 'completed'
});

// Computed values
const activeTodos = computed(() =>
  todos.items.filter(todo => !todo.completed)
);

const completedTodos = computed(() =>
  todos.items.filter(todo => todo.completed)
);

const visibleTodos = computed(() => {
  switch (todos.filter) {
    case 'active': return activeTodos();
    case 'completed': return completedTodos();
    default: return todos.items;
  }
});

// Side effects
effect(() => {
  console.log(`You have ${activeTodos().length} active todos`);
});

// Add a todo
todos.items.push({ text: 'Learn NeoFlux', completed: false });
// Logs: "You have 1 active todos"

// Complete it
todos.items[0].completed = true;
// Logs: "You have 0 active todos"