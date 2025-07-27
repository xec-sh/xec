---
sidebar_position: 8
---

# Progress Tracking

@xec-sh/core provides comprehensive progress tracking utilities for monitoring long-running operations.

## Overview

Progress tracking helps users understand:
- How much work has been completed
- Estimated time remaining
- Current operation status
- Success or failure states

## Available Progress Utilities

### ProgressReporter

The `ProgressReporter` class provides a flexible way to track and report progress with custom handlers.

```typescript
import { ProgressReporter } from '@xec-sh/core';

const reporter = new ProgressReporter({
  enabled: true,
  updateInterval: 500, // Update every 500ms
  onProgress: (event) => {
    console.log(`[${event.type}] ${event.message}`);
  }
});
```

#### Basic Usage

```typescript
// Start tracking
reporter.start('Processing files...');

// Report progress
for (let i = 0; i < files.length; i++) {
  await processFile(files[i]);
  reporter.progress('Processing', i + 1, files.length);
}

// Complete
reporter.complete('All files processed');
```

#### With Error Handling

```typescript
try {
  reporter.start('Downloading data...');
  const data = await fetchData();
  reporter.complete('Download successful');
} catch (error) {
  reporter.error(error, 'Download failed');
}
```

#### Tracking Output

```typescript
// Track command output
const cmd = $`npm install`;

cmd.stdout.on('data', (chunk) => {
  reporter.reportOutput(chunk);
});

await cmd;
reporter.complete('Installation complete');
```

### Progress Bars

Visual progress bars for determinate operations.

```typescript
import { createProgressBar } from '@xec-sh/core';

const bar = createProgressBar({
  total: 100,
  width: 40,
  format: ':bar :percent :etas',
  complete: '█',
  incomplete: '░'
});
```

#### Simple Progress Bar

```typescript
for (let i = 0; i <= 100; i++) {
  bar.update(i);
  await delay(50);
}
bar.complete();
```

#### Custom Format

```typescript
const bar = createProgressBar({
  format: 'Downloading [:bar] :percent :current/:total :etas',
  tokens: {
    filename: 'data.zip'
  }
});

// Use custom tokens in format
const customBar = createProgressBar({
  format: ':filename [:bar] :percent',
  tokens: {
    filename: 'large-file.zip'
  }
});
```

#### Incremental Updates

```typescript
const bar = createProgressBar({ total: 1000 });

// Increment by 1
bar.increment();

// Increment by custom amount
bar.increment(10);
```

### Spinners

Animated spinners for indeterminate operations.

```typescript
import { createSpinner } from '@xec-sh/core';

const spinner = createSpinner({
  text: 'Loading...',
  interval: 80
});
```

#### Basic Spinner

```typescript
spinner.start('Connecting to server...');

try {
  await connectToServer();
  spinner.succeed('Connected!');
} catch (error) {
  spinner.fail('Connection failed');
}
```

#### Different States

```typescript
// Success
spinner.succeed('Task completed');

// Failure
spinner.fail('Task failed');

// Information
spinner.info('Please wait...');

// Warning
spinner.warn('Check configuration');
```

#### Dynamic Text

```typescript
spinner.start('Processing...');

for (let i = 0; i < 10; i++) {
  spinner.start(`Processing item ${i + 1}/10...`);
  await processItem(i);
}

spinner.succeed('All items processed');
```

### MultiProgress

Manage multiple progress indicators simultaneously.

```typescript
import { MultiProgress } from '@xec-sh/core';

const multi = new MultiProgress();
```

#### Multiple Progress Bars

```typescript
// Create multiple bars
const downloadBar = multi.create('download', { 
  total: 100,
  format: 'Download [:bar] :percent'
});

const processBar = multi.create('process', { 
  total: 50,
  format: 'Process  [:bar] :percent'
});

// Update independently
downloadBar.update(30);
processBar.update(10);

// Remove when done
multi.remove('download');
```

#### Mixed Indicators

```typescript
// Mix progress bars and spinners
const uploadBar = multi.create('upload', { total: 100 });
const verifySpinner = multi.createSpinner('verify', { 
  text: 'Verifying...' 
});

uploadBar.update(50);
verifySpinner.start();

// Clean up all
multi.clear();
```

## Real-World Examples

### File Upload with Progress

```typescript
async function uploadFiles(files: string[]) {
  const reporter = new ProgressReporter();
  reporter.start(`Uploading ${files.length} files...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const size = await getFileSize(file);
    
    reporter.progress(`Uploading ${file}`, i, files.length);
    
    await uploadFile(file, {
      onProgress: (bytes) => {
        const percent = (bytes / size) * 100;
        reporter.progress(`${file}: ${percent.toFixed(1)}%`, i, files.length);
      }
    });
  }

  reporter.complete('All files uploaded');
}
```

### Parallel Operations with Progress

```typescript
import { parallel, MultiProgress } from '@xec-sh/core';

async function processInParallel(items: string[]) {
  const multi = new MultiProgress();
  const bars = new Map();

  // Create progress bar for each item
  items.forEach((item, i) => {
    const bar = multi.create(`item-${i}`, {
      total: 100,
      format: `${item} [:bar] :percent`
    });
    bars.set(item, bar);
  });

  // Process with progress updates
  await parallel(
    items.map(item => async () => {
      const bar = bars.get(item);
      
      for (let progress = 0; progress <= 100; progress += 10) {
        await processChunk(item, progress);
        bar.update(progress);
      }
      
      bar.complete();
    }),
    { maxConcurrent: 3 }
  );

  multi.clear();
}
```

### Build Process with Stages

```typescript
async function buildProject() {
  const stages = [
    { name: 'Clean', weight: 10 },
    { name: 'Install', weight: 30 },
    { name: 'Compile', weight: 40 },
    { name: 'Test', weight: 15 },
    { name: 'Package', weight: 5 }
  ];

  const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
  const bar = createProgressBar({
    total: totalWeight,
    format: 'Build [:bar] :percent :current/:total'
  });

  let completed = 0;

  for (const stage of stages) {
    const spinner = createSpinner({ text: `${stage.name}...` });
    spinner.start();

    try {
      await runStage(stage.name);
      spinner.succeed(`${stage.name} complete`);
      
      completed += stage.weight;
      bar.update(completed);
    } catch (error) {
      spinner.fail(`${stage.name} failed`);
      throw error;
    }
  }

  bar.complete();
  console.log('Build completed successfully!');
}
```

### Command Execution with Live Progress

```typescript
async function runWithProgress(command: string) {
  const spinner = createSpinner({ text: 'Starting...' });
  spinner.start();

  const reporter = new ProgressReporter({
    reportLines: true,
    onProgress: (event) => {
      if (event.data?.linesProcessed) {
        spinner.start(`Processing... (${event.data.linesProcessed} lines)`);
      }
    }
  });

  try {
    const result = await $`${command}`.stream({
      stdout: (chunk) => reporter.reportOutput(chunk)
    });

    spinner.succeed('Command completed');
    return result;
  } catch (error) {
    spinner.fail('Command failed');
    throw error;
  }
}
```

## Best Practices

### 1. Choose the Right Indicator

```typescript
// Use progress bar for determinate operations
if (totalItems > 0) {
  const bar = createProgressBar({ total: totalItems });
  // Update with actual progress
}

// Use spinner for indeterminate operations
else {
  const spinner = createSpinner({ text: 'Processing...' });
  // Show activity without specific progress
}
```

### 2. Provide Meaningful Messages

```typescript
// Good - specific and informative
reporter.progress('Uploading user-data.json (2.5MB)', 1, 5);

// Less helpful - too generic
reporter.progress('Processing...', 1, 5);
```

### 3. Handle Cleanup

```typescript
const spinner = createSpinner();

try {
  spinner.start('Working...');
  await doWork();
  spinner.succeed('Done');
} catch (error) {
  spinner.fail('Failed');
  throw error;
} finally {
  // Ensure spinner is stopped
  spinner.stop();
}
```

### 4. Update Frequency

```typescript
// Throttle updates for performance
const reporter = new ProgressReporter({
  updateInterval: 100 // Update at most every 100ms
});

// For loops, update less frequently
for (let i = 0; i < 10000; i++) {
  await process(i);
  
  // Update every 100 items
  if (i % 100 === 0) {
    reporter.progress('Processing', i, 10000);
  }
}
```

### 5. Combine with Events

```typescript
// Listen to command events for automatic progress
$.on('command:start', (event) => {
  spinner.start(`Running: ${event.command}`);
});

$.on('command:complete', (event) => {
  spinner.succeed(`Completed in ${event.duration}ms`);
});

$.on('command:error', (event) => {
  spinner.fail(`Failed: ${event.error.message}`);
});
```

## Advanced Patterns

### Custom Progress Handler

```typescript
class CustomProgressHandler {
  private startTime = Date.now();

  handleProgress(event: ProgressEvent) {
    switch (event.type) {
      case 'start':
        console.clear();
        console.log('┌─ ' + event.message);
        break;
        
      case 'progress':
        const elapsed = Date.now() - this.startTime;
        const speed = event.current ? event.current / (elapsed / 1000) : 0;
        
        console.log(`├─ ${event.message}`);
        console.log(`│  Speed: ${speed.toFixed(2)}/sec`);
        
        if (event.eta) {
          console.log(`│  ETA: ${formatTime(event.eta)}`);
        }
        break;
        
      case 'complete':
        console.log('└─ ✓ ' + event.message);
        break;
        
      case 'error':
        console.log('└─ ✗ ' + event.message);
        break;
    }
  }
}

const handler = new CustomProgressHandler();
const reporter = new ProgressReporter({
  onProgress: (e) => handler.handleProgress(e)
});
```

### Progress with Retry

```typescript
async function downloadWithRetry(url: string, maxRetries = 3) {
  const spinner = createSpinner({ text: 'Downloading...' });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    spinner.start(`Download attempt ${attempt}/${maxRetries}...`);
    
    try {
      const result = await download(url);
      spinner.succeed('Download complete');
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        spinner.fail('Download failed after all retries');
        throw error;
      }
      
      spinner.warn(`Attempt ${attempt} failed, retrying...`);
      await delay(1000 * attempt); // Exponential backoff
    }
  }
}
```

### Nested Progress

```typescript
async function complexOperation() {
  const mainBar = createProgressBar({
    total: 3,
    format: 'Main [:bar] :current/:total'
  });

  // Stage 1: Download
  mainBar.update(0);
  const downloadBar = createProgressBar({
    total: 100,
    format: '  Download [:bar] :percent'
  });
  
  for (let i = 0; i <= 100; i += 10) {
    downloadBar.update(i);
    await delay(100);
  }
  
  // Stage 2: Process
  mainBar.update(1);
  const processSpinner = createSpinner({ 
    text: '  Processing data...' 
  });
  processSpinner.start();
  await processData();
  processSpinner.succeed('  Processing complete');
  
  // Stage 3: Upload
  mainBar.update(2);
  const uploadBar = createProgressBar({
    total: 100,
    format: '  Upload [:bar] :percent'
  });
  
  for (let i = 0; i <= 100; i += 5) {
    uploadBar.update(i);
    await delay(50);
  }
  
  mainBar.update(3);
  console.log('\nAll operations completed!');
}
```

## Integration with Commands

### Stream Progress

```typescript
// Track output lines
let lineCount = 0;
const spinner = createSpinner();

await $`find . -type f -name "*.js"`.stream({
  stdout: (chunk) => {
    lineCount += chunk.split('\n').length - 1;
    spinner.start(`Found ${lineCount} JavaScript files...`);
  }
});

spinner.succeed(`Total: ${lineCount} JavaScript files`);
```

### Parallel Commands with Progress

```typescript
const commands = [
  'npm install',
  'npm run build',
  'npm test'
];

const multi = new MultiProgress();

await parallel(
  commands.map((cmd, i) => async () => {
    const spinner = multi.createSpinner(`cmd-${i}`, {
      text: `Running: ${cmd}`
    });
    
    spinner.start();
    
    try {
      await $`${cmd}`;
      spinner.succeed(`✓ ${cmd}`);
    } catch (error) {
      spinner.fail(`✗ ${cmd}`);
      throw error;
    }
  }),
  { 
    maxConcurrent: 2,
    onProgress: (completed, total) => {
      console.log(`\nOverall progress: ${completed}/${total}`);
    }
  }
);
```