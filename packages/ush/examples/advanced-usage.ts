import { MockAdapter, createExecutionEngine } from '../src/index.js';

// Example 1: Mock adapter for testing
async function exampleMockAdapter() {
  console.log('=== Example: Mock Adapter for Testing ===');
  
  const $ = createExecutionEngine();
  const mockAdapter = new MockAdapter();
  $.registerAdapter('mock', mockAdapter);
  
  // Set up mocks
  mockAdapter.mockSuccess('git status', 'On branch main\nnothing to commit');
  mockAdapter.mockFailure('npm test', 'Tests failed!', 1);
  mockAdapter.mockCommand(/^docker/, { stdout: 'Container running', exitCode: 0 });
  
  const $mock = $.with({ adapter: 'mock' as any });
  
  // Test git command
  const gitResult = await $mock.run`git status`;
  console.log('Git status:', gitResult.stdout);
  
  // Test npm command (will fail)
  try {
    await $mock.run`npm test`;
  } catch (error: any) {
    console.log('NPM test failed as expected:', error.stderr);
  }
  
  // Test docker commands
  const dockerPs = await $mock.run`docker ps`;
  const dockerImages = await $mock.run`docker images`;
  console.log('Docker ps:', dockerPs.stdout);
  console.log('Docker images:', dockerImages.stdout);
  
  // Check executed commands
  console.log('Executed commands:', mockAdapter.getExecutedCommands());
}

// Example 2: Parallel execution
async function exampleParallelExecution() {
  console.log('\n=== Example: Parallel Execution ===');
  
  const $ = createExecutionEngine();
  
  console.time('parallel');
  const results = await Promise.all([
    $.run`sleep 0.1 && echo "Task 1 done"`,
    $.run`sleep 0.1 && echo "Task 2 done"`,
    $.run`sleep 0.1 && echo "Task 3 done"`
  ]);
  console.timeEnd('parallel');
  
  results.forEach((result, i) => {
    console.log(`Result ${i + 1}:`, result.stdout.trim());
  });
}

// Example 3: Process utilities
async function exampleProcessUtils() {
  console.log('\n=== Example: Process Utilities ===');
  
  const $ = createExecutionEngine();
  
  // Check command availability
  const hasGit = await $.isCommandAvailable('git');
  const hasDocker = await $.isCommandAvailable('docker');
  console.log('Git available:', hasGit);
  console.log('Docker available:', hasDocker);
  
  // Find command path
  const nodePath = await $.which('node');
  console.log('Node.js path:', nodePath);
}

// Example 4: Complex pipeline simulation
async function examplePipeline() {
  console.log('\n=== Example: CI/CD Pipeline Simulation ===');
  
  const $ = createExecutionEngine();
  const mockAdapter = new MockAdapter({ recordCommands: true });
  $.registerAdapter('mock', mockAdapter);
  
  // Setup mock responses for CI pipeline
  mockAdapter.mockSuccess('git pull', 'Already up to date.');
  mockAdapter.mockSuccess('npm ci', 'added 150 packages in 3s');
  mockAdapter.mockSuccess('npm run lint', 'No linting errors found');
  mockAdapter.mockSuccess('npm test', '✓ 25 tests passed');
  mockAdapter.mockSuccess('npm run build', 'Build completed successfully');
  mockAdapter.mockSuccess(/^docker build/, 'Successfully built image');
  mockAdapter.mockSuccess(/^docker tag/, '');
  mockAdapter.mockSuccess(/^docker push/, 'Pushed image to registry');
  
  const $ci = $.with({ adapter: 'mock' as any });
  
  try {
    console.log('📦 Pulling latest changes...');
    await $ci.run`git pull`;
    
    console.log('📦 Installing dependencies...');
    await $ci.run`npm ci`;
    
    console.log('🔍 Running linter...');
    await $ci.run`npm run lint`;
    
    console.log('🧪 Running tests...');
    await $ci.run`npm test`;
    
    console.log('🔨 Building application...');
    await $ci.run`npm run build`;
    
    console.log('🐳 Building Docker image...');
    await $ci.run`docker build -t myapp:latest .`;
    
    console.log('🏷️  Tagging image...');
    await $ci.run`docker tag myapp:latest registry.example.com/myapp:latest`;
    
    console.log('📤 Pushing to registry...');
    await $ci.run`docker push registry.example.com/myapp:latest`;
    
    console.log('✅ Pipeline completed successfully!');
    
    // Show all executed commands
    console.log('\nExecuted commands:');
    mockAdapter.getExecutedCommands().forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd}`);
    });
  } catch (error: any) {
    console.error('❌ Pipeline failed:', error.message);
  }
}

// Example 5: Custom adapter registration
async function exampleCustomAdapter() {
  console.log('\n=== Example: Custom Configuration ===');
  
  // Create engine with custom configuration
  const $ = createExecutionEngine({
    defaultTimeout: 10000,
    defaultEnv: {
      CUSTOM_PREFIX: '[CUSTOM]'
    },
    throwOnNonZeroExit: true,
    encoding: 'utf8',
    runtime: {
      preferBun: true
    }
  });
  
  const result = await $.run`echo "$CUSTOM_PREFIX Hello from custom config"`;
  console.log('Output:', result.stdout.trim());
}

// Run all examples
async function main() {
  try {
    await exampleMockAdapter();
    await exampleParallelExecution();
    await exampleProcessUtils();
    await examplePipeline();
    await exampleCustomAdapter();
  } catch (error) {
    console.error('Error in examples:', error);
  }
}

main();