#!/usr/bin/env node
import { pipe, within, expBackoff, withSpinner, createExecutionEngine } from '../src/index.js';

async function main() {
  // Create an execution engine with all features
  const $ = createExecutionEngine();

  console.log('=== USH Core Features Demo ===\n');

  // 1. Retry with exponential backoff
  console.log('1. Retry with exponential backoff:');
  const retryEngine = $.withRetry({
    attempts: 3,
    delay: expBackoff(5, 0.1, 2, 100),
    onRetry: (error, attempt) => console.log(`  Retry attempt ${attempt}: ${error.message}`)
  });

  try {
    // This would retry 3 times with exponential backoff
    await retryEngine.execute('exit 1');
  } catch (e) {
    console.log('  Command failed after retries\n');
  }

  // 2. Within - Local context execution
  console.log('2. Local context execution:');
  await within({ env: { DEMO_VAR: 'Hello from context!' } }, async () => {
    const result = await $.execute('echo $DEMO_VAR');
    console.log(`  ${result.stdout}\n`);
  });

  // 3. Pipe operations
  console.log('3. Pipe operations:');
  const pipeResult = await pipe(
    ['echo "The quick brown fox"', 'grep -o "quick"'],
    $
  );
  console.log(`  Piped result: ${await pipeResult.text()}\n`);

  // 4. Parallel execution
  console.log('4. Parallel execution:');
  const parallelResult = await $.parallel.all([
    'echo "Task 1 complete"',
    'echo "Task 2 complete"',
    'echo "Task 3 complete"'
  ]);
  console.log(`  Completed ${parallelResult.length} tasks in parallel\n`);

  // 5. Command templates
  console.log('5. Command templates:');
  const echoTemplate = $.template('echo "{{greeting}} {{name}}!"', {
    defaults: { greeting: 'Hello' }
  });

  const result1 = await echoTemplate.execute($, { name: 'World' });
  const result2 = await echoTemplate.execute($, { greeting: 'Hi', name: 'USH' });

  console.log(`  Template 1: ${result1.stdout.trim()}`);
  console.log(`  Template 2: ${result2.stdout.trim()}\n`);

  // 6. Streaming execution
  console.log('6. Streaming execution:');
  const stream = $.stream('for i in 1 2 3; do echo "Line $i"; sleep 0.1; done', { lineMode: true });

  stream.on('line', (line, type) => {
    console.log(`  Stream [${type}]: ${line}`);
  });

  await stream.start();
  await stream.wait();
  console.log();

  // 7. Temporary files
  console.log('7. Temporary files:');
  await $.withTempFile(async (file) => {
    await file.write('Temporary content');
    const content = await file.read();
    console.log(`  Temp file content: ${content.trim()}`);
    console.log(`  Temp file path: ${file.path}\n`);
  });

  // 8. Interactive features (commented out for non-interactive demo)
  console.log('8. Interactive features (skipped in demo)');
  // const answer = await $.question('What is your name?');
  // const confirmed = await $.confirm('Continue?', true);
  // const choice = await $.select('Choose an option:', ['Option 1', 'Option 2']);

  // 9. Progress tracking with spinner
  console.log('\n9. Progress tracking:');
  await withSpinner('Processing data...', async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  // 10. Advanced example: Deploy script with all features
  console.log('\n10. Advanced deployment example:');

  // Create deployment engine with retry and specific config
  const deployEngine = $.withRetry({ attempts: 3 })
    .env({ NODE_ENV: 'production' })
    .timeout(30000);

  // Use templates for common commands
  const gitPull = deployEngine.template('cd {{dir}} && git pull origin {{branch}}', {
    defaults: { branch: 'main' }
  });

  // Parallel deployment to multiple servers
  const servers = ['server1', 'server2', 'server3'];

  await deployEngine.parallel.map(
    servers,
    (server) => `echo "Deploying to ${server}..."`,
    { maxConcurrency: 2 }
  );

  console.log('  Deployment simulation complete!\n');

  // Clean up
  await $.dispose();
}

// Run the demo
main().catch(console.error);