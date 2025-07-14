import { task, recipe, executeRecipe } from './dist/index.js';

// Создаем простой рецепт
const myRecipe = recipe('test-recipe')
  .name('Test Recipe')
  .description('A simple test recipe')
  .var('greeting', 'Hello')
  .task(
    task('task1')
      .description('First task')
      .handler(async (context) => {
        console.log(`${context.vars.greeting} from task 1!`);
        return { message: 'Task 1 completed' };
      })
  )
  .task(
    task('task2')
      .description('Second task')
      .depends('task1')
      .handler(async (context) => {
        console.log('Task 2 running after task 1');
        return { message: 'Task 2 completed' };
      })
  )
  .build();

// Выполняем рецепт
console.log('Executing recipe...');
const result = await executeRecipe(myRecipe, {
  dryRun: false,
  verbose: true
});

console.log('\nExecution result:');
console.log('Success:', result.success);
console.log('Duration:', result.duration, 'ms');
console.log('Tasks completed:', result.status.completed);
console.log('Tasks failed:', result.status.failed);