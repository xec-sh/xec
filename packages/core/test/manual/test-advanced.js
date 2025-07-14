import { 
  task, 
  shell, 
  recipe, 
  phaseRecipe,
  parallelTask,
  executeRecipe
} from './dist/index.js';

// Пример с фазами
const deployRecipe = phaseRecipe('deploy-app', {
  prepare: [
    shell('check-deps', 'echo "Checking dependencies..."'),
    shell('lint', 'echo "Running linter..."')
  ],
  build: [
    shell('compile', 'echo "Compiling application..."'),
    shell('test', 'echo "Running tests..."')
  ],
  deploy: [
    shell('upload', 'echo "Uploading to server..."'),
    shell('restart', 'echo "Restarting services..."')
  ]
}, {
  name: 'Application Deployment',
  description: 'Deploy application with multiple phases'
});

console.log('Executing phased deployment...\n');
const result1 = await executeRecipe(deployRecipe, {
  verbose: true
});

console.log('\n\nPhased deployment result:');
console.log('Success:', result1.success);
console.log('Duration:', result1.duration, 'ms');
console.log('Tasks completed:', result1.status.completed);

// Пример с параллельным выполнением
const parallelRecipe = recipe('parallel-tasks')
  .name('Parallel Execution Example')
  .task(
    task('setup')
      .handler(async () => {
        console.log('Setting up environment...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return { message: 'Setup complete' };
      })
  )
  .task(
    parallelTask('parallel-group', [
      task('worker1').handler(async () => {
        console.log('Worker 1 started');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Worker 1 finished');
        return { worker: 1 };
      }).build(),
      task('worker2').handler(async () => {
        console.log('Worker 2 started');
        await new Promise(resolve => setTimeout(resolve, 150));
        console.log('Worker 2 finished');
        return { worker: 2 };
      }).build(),
      task('worker3').handler(async () => {
        console.log('Worker 3 started');
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('Worker 3 finished');
        return { worker: 3 };
      }).build()
    ])
    .depends('setup')
  )
  .task(
    task('finalize')
      .depends('parallel-group')
      .handler(async () => {
        console.log('Finalizing...');
        return { message: 'All done!' };
      })
  )
  .build();

console.log('\n\nExecuting parallel tasks...\n');
const result2 = await executeRecipe(parallelRecipe, {
  verbose: false,
  parallel: true,
  maxConcurrency: 3
});

console.log('\n\nParallel execution result:');
console.log('Success:', result2.success);
console.log('Duration:', result2.duration, 'ms');
console.log('Tasks completed:', result2.status.completed);

// Пример с обработкой ошибок и retry
const retryRecipe = recipe('retry-example')
  .name('Retry Example')
  .task(
    task('flaky-task')
      .description('A task that might fail')
      .retry({ maxAttempts: 3, delay: 100 })
      .handler(async (context) => {
        const random = Math.random();
        console.log(`Attempt ${context.attempt}: random=${random.toFixed(2)}`);
        if (random < 0.7) {
          throw new Error('Random failure!');
        }
        return { success: true, attempt: context.attempt };
      })
  )
  .build();

console.log('\n\nExecuting task with retry...\n');
try {
  const result3 = await executeRecipe(retryRecipe, {
    verbose: false
  });
  console.log('\n\nRetry execution result:');
  console.log('Success:', result3.success);
  console.log('Final result:', result3.results.get('flaky-task'));
} catch (error) {
  console.log('\n\nTask failed after all retries:', error.message);
}