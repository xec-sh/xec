# Local Debugging Techniques

Comprehensive debugging strategies for local command execution, including output inspection, error analysis, and performance profiling.

## Debug Output

### Enable Verbose Logging
Activate detailed logging for command execution:

```javascript
import { $, configure } from '@xec-sh/core';

// Enable global debug mode
configure({
  debug: true,
  verbose: true
});

// Per-command debugging
const result = await $.with({ 
  debug: true,
  verbose: true 
})`ls -la`;

console.log('Command:', result.command);
console.log('Exit code:', result.exitCode);
console.log('Duration:', result.duration, 'ms');
console.log('Stdout length:', result.stdout.length);
console.log('Stderr length:', result.stderr.length);
```

### Shell Debug Modes
Use shell-specific debugging features:

```javascript
// Bash trace mode - shows each command
await $.with({ shell: '/bin/bash -x' })`
  VAR="hello"
  echo "$VAR world"
  for i in 1 2 3; do
    echo "Number: $i"
  done
`;
// Output shows:
// + VAR=hello
// + echo 'hello world'
// + for i in 1 2 3
// + echo 'Number: 1'
// ...

// Verbose mode - shows commands as parsed
await $.with({ shell: '/bin/bash -v' })`
  if [ -f /etc/passwd ]; then
    echo "File exists"
  fi
`;

// Strict error mode for debugging
await $.with({ shell: '/bin/bash' })`
  set -euxo pipefail
  # -e: Exit on error
  # -u: Error on undefined variables  
  # -x: Print commands
  # -o pipefail: Pipe failures cause exit
  
  command1 | command2 | command3
`;
```

### Command Inspection
Inspect command details before and after execution:

```javascript
// Pre-execution inspection
const command = {
  command: 'ls',
  args: ['-la', '/tmp'],
  cwd: '/home/user',
  env: { DEBUG: 'true' }
};

console.log('Executing:', JSON.stringify(command, null, 2));

const result = await $(command)``;

// Post-execution inspection
console.log({
  command: result.command,
  exitCode: result.exitCode,
  signal: result.signal,
  duration: result.duration,
  startTime: result.startTime,
  endTime: result.endTime,
  failed: result.failed
});
```

## Output Analysis

### Stream Monitoring
Monitor output streams in real-time:

```javascript
// Real-time stdout monitoring
const proc = $`find / -name "*.log" 2>/dev/null`;

proc.stdout.on('data', (chunk) => {
  console.log('[STDOUT]', chunk.toString());
});

proc.stderr.on('data', (chunk) => {
  console.error('[STDERR]', chunk.toString());
});

await proc.catch(err => {
  console.error('Process failed:', err.message);
});
```

### Output Buffering
Debug buffer-related issues:

```javascript
// Test buffer limits
const testBufferLimits = async (size) => {
  try {
    const result = await $.with({ 
      maxBuffer: size 
    })`dd if=/dev/zero bs=1024 count=${size / 1024}`;
    
    console.log(`Buffer size ${size}: OK`);
    console.log(`Output size: ${result.stdout.length}`);
  } catch (error) {
    console.error(`Buffer size ${size}: FAILED`);
    console.error(`Error: ${error.message}`);
  }
};

// Test different buffer sizes
await testBufferLimits(1024 * 1024);      // 1MB
await testBufferLimits(10 * 1024 * 1024); // 10MB
await testBufferLimits(100 * 1024 * 1024); // 100MB
```

### Output Parsing
Parse and analyze command output:

```javascript
// Structured output parsing
const result = await $`ps aux`;

const processes = result.stdout
  .split('\n')
  .slice(1) // Skip header
  .filter(line => line.trim())
  .map(line => {
    const parts = line.split(/\s+/);
    return {
      user: parts[0],
      pid: parts[1],
      cpu: parts[2],
      mem: parts[3],
      command: parts.slice(10).join(' ')
    };
  });

// Find high CPU processes
const highCpu = processes.filter(p => parseFloat(p.cpu) > 50);
console.log('High CPU processes:', highCpu);

// Debug JSON output
const jsonResult = await $`echo '{"key": "value"}' | jq .`;
try {
  const parsed = JSON.parse(jsonResult.stdout);
  console.log('Parsed JSON:', parsed);
} catch (error) {
  console.error('JSON parse error:', error);
  console.error('Raw output:', jsonResult.stdout);
}
```

## Error Diagnostics

### Error Classification
Identify and classify different error types:

```javascript
async function diagnoseError(command) {
  try {
    return await $`${command}`;
  } catch (error) {
    console.log('Error Diagnosis:');
    console.log('================');
    
    // Command not found
    if (error.code === 'ENOENT') {
      console.log('Type: Command not found');
      console.log('Command:', error.path || error.command);
      console.log('Solution: Check if command is installed and in PATH');
    }
    
    // Permission denied
    else if (error.code === 'EACCES') {
      console.log('Type: Permission denied');
      console.log('Path:', error.path);
      console.log('Solution: Check file permissions or run with appropriate privileges');
    }
    
    // Working directory error
    else if (error.code === 'ENOTDIR' || error.message.includes('cwd')) {
      console.log('Type: Working directory error');
      console.log('CWD:', error.cwd);
      console.log('Solution: Ensure working directory exists');
    }
    
    // Timeout
    else if (error.name === 'TimeoutError') {
      console.log('Type: Command timeout');
      console.log('Timeout:', error.timeout, 'ms');
      console.log('Solution: Increase timeout or optimize command');
    }
    
    // Non-zero exit code
    else if (error.exitCode) {
      console.log('Type: Non-zero exit code');
      console.log('Exit code:', error.exitCode);
      console.log('Signal:', error.signal);
      console.log('Stderr:', error.stderr);
    }
    
    console.log('\nFull error:', error);
    throw error;
  }
}

// Test error diagnosis
await diagnoseError('nonexistent-command');
await diagnoseError('cat /etc/shadow'); // Permission denied
await diagnoseError('cd /nonexistent && ls'); // Directory error
```

### Exit Code Analysis
Understand command exit codes:

```javascript
// Common exit codes reference
const exitCodes = {
  0: 'Success',
  1: 'General error',
  2: 'Misuse of shell command',
  126: 'Command cannot execute',
  127: 'Command not found',
  128: 'Invalid exit argument',
  130: 'Terminated by Ctrl+C',
  255: 'Exit status out of range'
};

// Analyze exit code
async function analyzeExitCode(command) {
  const result = await $.with({ throwOnNonZeroExit: false })`${command}`;
  
  console.log(`Command: ${command}`);
  console.log(`Exit code: ${result.exitCode}`);
  console.log(`Meaning: ${exitCodes[result.exitCode] || 'Application-specific'}`);
  
  if (result.exitCode > 128 && result.exitCode < 255) {
    const signal = result.exitCode - 128;
    console.log(`Terminated by signal: ${signal}`);
  }
  
  return result;
}

// Test different exit codes
await analyzeExitCode('true');           // 0
await analyzeExitCode('false');          // 1
await analyzeExitCode('exit 42');        // 42
await analyzeExitCode('kill -9 $$');     // 137 (128 + 9)
```

### Stack Trace Enhancement
Improve error stack traces for better debugging:

```javascript
// Enhance error with context
class CommandDebugger {
  constructor() {
    this.history = [];
  }
  
  async execute(command, context = {}) {
    const startTime = Date.now();
    const entry = {
      command,
      context,
      startTime,
      stack: new Error().stack
    };
    
    this.history.push(entry);
    
    try {
      const result = await $`${command}`;
      entry.endTime = Date.now();
      entry.duration = entry.endTime - entry.startTime;
      entry.success = true;
      return result;
    } catch (error) {
      entry.endTime = Date.now();
      entry.duration = entry.endTime - entry.startTime;
      entry.success = false;
      entry.error = error;
      
      // Enhanced error
      error.debugInfo = {
        command,
        context,
        duration: entry.duration,
        history: this.history.slice(-5), // Last 5 commands
        originalStack: entry.stack
      };
      
      throw error;
    }
  }
  
  printHistory() {
    console.log('Command History:');
    this.history.forEach((entry, i) => {
      console.log(`${i + 1}. ${entry.command}`);
      console.log(`   Success: ${entry.success}`);
      console.log(`   Duration: ${entry.duration}ms`);
      if (entry.error) {
        console.log(`   Error: ${entry.error.message}`);
      }
    });
  }
}

const debugger = new CommandDebugger();
try {
  await debugger.execute('ls -la', { step: 'list files' });
  await debugger.execute('grep "pattern" file.txt', { step: 'search' });
} catch (error) {
  console.error('Enhanced error info:', error.debugInfo);
  debugger.printHistory();
}
```

## Performance Profiling

### Execution Timing
Measure and analyze execution times:

```javascript
// Simple timing
const start = Date.now();
const result = await $`sleep 1 && echo "Done"`;
console.log(`Execution time: ${Date.now() - start}ms`);
console.log(`Internal duration: ${result.duration}ms`);

// Detailed profiling
class CommandProfiler {
  constructor() {
    this.profiles = [];
  }
  
  async profile(name, command) {
    const profile = {
      name,
      command,
      startTime: Date.now(),
      memBefore: process.memoryUsage()
    };
    
    try {
      const result = await $`${command}`;
      
      profile.endTime = Date.now();
      profile.duration = profile.endTime - profile.startTime;
      profile.memAfter = process.memoryUsage();
      profile.memDelta = {
        rss: profile.memAfter.rss - profile.memBefore.rss,
        heapUsed: profile.memAfter.heapUsed - profile.memBefore.heapUsed
      };
      profile.outputSize = result.stdout.length + result.stderr.length;
      
      this.profiles.push(profile);
      return result;
    } catch (error) {
      profile.error = error;
      this.profiles.push(profile);
      throw error;
    }
  }
  
  report() {
    console.table(this.profiles.map(p => ({
      name: p.name,
      duration: `${p.duration}ms`,
      memory: `${Math.round(p.memDelta.rss / 1024)}KB`,
      output: `${p.outputSize} bytes`,
      status: p.error ? 'Failed' : 'Success'
    })));
  }
}

const profiler = new CommandProfiler();
await profiler.profile('List files', 'ls -la');
await profiler.profile('Find logs', 'find /var/log -name "*.log" | head -10');
await profiler.profile('Process check', 'ps aux | wc -l');
profiler.report();
```

### Resource Monitoring
Monitor system resources during execution:

```javascript
// Monitor CPU and memory during execution
async function monitorResources(command) {
  const monitors = [];
  let monitoring = true;
  
  // Start monitoring
  const monitorInterval = setInterval(() => {
    if (!monitoring) return;
    
    $.with({ throwOnNonZeroExit: false })`ps aux | grep ${process.pid} | grep -v grep`
      .then(result => {
        const parts = result.stdout.split(/\s+/);
        monitors.push({
          time: Date.now(),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parseInt(parts[4]),
          rss: parseInt(parts[5])
        });
      });
  }, 100);
  
  try {
    const result = await $`${command}`;
    monitoring = false;
    clearInterval(monitorInterval);
    
    // Analyze resource usage
    const maxCpu = Math.max(...monitors.map(m => m.cpu));
    const maxMem = Math.max(...monitors.map(m => m.mem));
    const avgCpu = monitors.reduce((sum, m) => sum + m.cpu, 0) / monitors.length;
    
    console.log('Resource Usage:');
    console.log(`  Max CPU: ${maxCpu}%`);
    console.log(`  Max Memory: ${maxMem}%`);
    console.log(`  Avg CPU: ${avgCpu.toFixed(2)}%`);
    console.log(`  Samples: ${monitors.length}`);
    
    return result;
  } finally {
    monitoring = false;
    clearInterval(monitorInterval);
  }
}

await monitorResources('find / -name "*.txt" 2>/dev/null | head -100');
```

## Interactive Debugging

### REPL Integration
Create an interactive debugging environment:

```javascript
import { createInterface } from 'readline';

class InteractiveDebugger {
  constructor() {
    this.context = {
      cwd: process.cwd(),
      env: { ...process.env },
      lastResult: null,
      history: []
    };
  }
  
  async start() {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'debug> '
    });
    
    console.log('Interactive Command Debugger');
    console.log('Commands: .exit, .env, .cwd, .history, .last');
    console.log('');
    
    rl.prompt();
    
    rl.on('line', async (line) => {
      line = line.trim();
      
      if (line === '.exit') {
        rl.close();
        return;
      }
      
      if (line === '.env') {
        console.log('Environment:', this.context.env);
      } else if (line === '.cwd') {
        console.log('Working directory:', this.context.cwd);
      } else if (line === '.history') {
        this.context.history.forEach((cmd, i) => {
          console.log(`${i + 1}: ${cmd}`);
        });
      } else if (line === '.last') {
        console.log('Last result:', this.context.lastResult);
      } else if (line.startsWith('cd ')) {
        const dir = line.substring(3);
        this.context.cwd = dir;
        console.log(`Changed directory to: ${dir}`);
      } else if (line) {
        await this.executeDebug(line);
      }
      
      rl.prompt();
    });
  }
  
  async executeDebug(command) {
    console.log(`\n[Executing: ${command}]`);
    this.context.history.push(command);
    
    try {
      const start = Date.now();
      const result = await $.with({ 
        cwd: this.context.cwd,
        env: this.context.env,
        throwOnNonZeroExit: false
      })`${command}`;
      
      const duration = Date.now() - start;
      
      console.log('[Output]');
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error('[Stderr]', result.stderr);
      
      console.log('[Metadata]');
      console.log(`  Exit code: ${result.exitCode}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Success: ${!result.failed}`);
      
      this.context.lastResult = result;
    } catch (error) {
      console.error('[Error]', error.message);
      console.error('[Exit Code]', error.exitCode);
      if (error.stderr) console.error('[Stderr]', error.stderr);
    }
    
    console.log('');
  }
}

// Start interactive debugger
const debugger = new InteractiveDebugger();
await debugger.start();
```

### Breakpoint Simulation
Add breakpoints in command sequences:

```javascript
class CommandDebuggerWithBreakpoints {
  constructor() {
    this.breakpoints = new Set();
    this.stepMode = false;
  }
  
  setBreakpoint(lineNumber) {
    this.breakpoints.add(lineNumber);
  }
  
  async executeScript(script) {
    const lines = script.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      
      // Check for breakpoint
      if (this.breakpoints.has(i + 1) || this.stepMode) {
        console.log(`\n[Breakpoint at line ${i + 1}]: ${line}`);
        const action = await this.prompt('(c)ontinue, (s)tep, (v)ars, (q)uit: ');
        
        if (action === 'q') {
          console.log('Debugging terminated');
          break;
        } else if (action === 's') {
          this.stepMode = true;
        } else if (action === 'c') {
          this.stepMode = false;
        } else if (action === 'v') {
          console.log('Environment:', process.env);
          i--; // Repeat this iteration
          continue;
        }
      }
      
      console.log(`[${i + 1}] Executing: ${line}`);
      try {
        const result = await $`${line}`;
        if (result.stdout) console.log('Output:', result.stdout.trim());
      } catch (error) {
        console.error(`Error at line ${i + 1}: ${error.message}`);
        if (this.stepMode) {
          const action = await this.prompt('(c)ontinue, (q)uit: ');
          if (action === 'q') break;
        }
      }
    }
  }
  
  async prompt(message) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise(resolve => {
      rl.question(message, answer => {
        rl.close();
        resolve(answer);
      });
    });
  }
}

// Use debugger with breakpoints
const dbg = new CommandDebuggerWithBreakpoints();
dbg.setBreakpoint(3);
dbg.setBreakpoint(5);

await dbg.executeScript(`
  echo "Starting script"
  VAR="test"
  echo "Variable set to: $VAR"
  ls -la
  echo "Script complete"
`);
```

## Logging and Tracing

### Custom Logger
Implement detailed logging for command execution:

```javascript
class CommandLogger {
  constructor(logFile = 'commands.log') {
    this.logFile = logFile;
    this.sessionId = Date.now();
  }
  
  async execute(command, metadata = {}) {
    const logEntry = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      command,
      metadata,
      environment: {
        platform: process.platform,
        node: process.version,
        cwd: process.cwd(),
        user: process.env.USER
      }
    };
    
    try {
      const start = Date.now();
      const result = await $`${command}`;
      
      logEntry.success = true;
      logEntry.duration = Date.now() - start;
      logEntry.exitCode = result.exitCode;
      logEntry.outputSize = {
        stdout: result.stdout.length,
        stderr: result.stderr.length
      };
      
      await this.writeLog(logEntry);
      return result;
    } catch (error) {
      logEntry.success = false;
      logEntry.error = {
        message: error.message,
        code: error.code,
        exitCode: error.exitCode
      };
      
      await this.writeLog(logEntry);
      throw error;
    }
  }
  
  async writeLog(entry) {
    const line = JSON.stringify(entry) + '\n';
    await $`echo '${line}' >> ${this.logFile}`;
  }
  
  async analyze() {
    const logs = await $`cat ${this.logFile}`;
    const entries = logs.stdout
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));
    
    const stats = {
      total: entries.length,
      success: entries.filter(e => e.success).length,
      failed: entries.filter(e => !e.success).length,
      avgDuration: entries
        .filter(e => e.duration)
        .reduce((sum, e) => sum + e.duration, 0) / entries.length,
      errors: entries
        .filter(e => e.error)
        .map(e => e.error.message)
    };
    
    console.log('Execution Statistics:', stats);
    return stats;
  }
}

const logger = new CommandLogger();
await logger.execute('ls -la', { purpose: 'list files' });
await logger.execute('grep "test" file.txt', { purpose: 'search' });
await logger.analyze();
```

## Testing Commands

### Unit Testing Commands
Test command behavior systematically:

```javascript
class CommandTester {
  constructor() {
    this.tests = [];
  }
  
  test(description, command, expectations) {
    this.tests.push({ description, command, expectations });
  }
  
  async run() {
    console.log('Running Command Tests\n');
    let passed = 0;
    let failed = 0;
    
    for (const test of this.tests) {
      process.stdout.write(`Testing: ${test.description}... `);
      
      try {
        const result = await $.with({ throwOnNonZeroExit: false })`${test.command}`;
        let success = true;
        const failures = [];
        
        // Check expectations
        if ('exitCode' in test.expectations) {
          if (result.exitCode !== test.expectations.exitCode) {
            success = false;
            failures.push(`Expected exit code ${test.expectations.exitCode}, got ${result.exitCode}`);
          }
        }
        
        if ('stdout' in test.expectations) {
          if (typeof test.expectations.stdout === 'string') {
            if (!result.stdout.includes(test.expectations.stdout)) {
              success = false;
              failures.push(`Stdout doesn't contain "${test.expectations.stdout}"`);
            }
          } else if (test.expectations.stdout instanceof RegExp) {
            if (!test.expectations.stdout.test(result.stdout)) {
              success = false;
              failures.push(`Stdout doesn't match pattern ${test.expectations.stdout}`);
            }
          }
        }
        
        if ('stderr' in test.expectations) {
          if (!result.stderr.includes(test.expectations.stderr)) {
            success = false;
            failures.push(`Stderr doesn't contain "${test.expectations.stderr}"`);
          }
        }
        
        if (success) {
          console.log('✓');
          passed++;
        } else {
          console.log('✗');
          failures.forEach(f => console.log(`  ${f}`));
          failed++;
        }
      } catch (error) {
        console.log('✗');
        console.log(`  Error: ${error.message}`);
        failed++;
      }
    }
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
  }
}

const tester = new CommandTester();

tester.test(
  'Echo outputs text',
  'echo "Hello"',
  { exitCode: 0, stdout: 'Hello' }
);

tester.test(
  'False returns exit code 1',
  'false',
  { exitCode: 1 }
);

tester.test(
  'Grep finds pattern',
  'echo "test line" | grep "test"',
  { exitCode: 0, stdout: /test/ }
);

tester.test(
  'Command not found',
  'nonexistent-command 2>&1',
  { exitCode: 127, stdout: /not found|command not found/ }
);

await tester.run();
```

## Best Practices

### 1. Use Appropriate Debug Levels
```javascript
// Development - full debugging
const dev = { debug: true, verbose: true, shell: '/bin/bash -x' };

// Testing - moderate debugging
const test = { debug: true, throwOnNonZeroExit: false };

// Production - minimal debugging
const prod = { debug: false, timeout: 30000 };
```

### 2. Preserve Debug Context
```javascript
// Wrap commands with context
async function executeWithContext(command, context) {
  console.log(`[${context}] Starting: ${command}`);
  try {
    const result = await $`${command}`;
    console.log(`[${context}] Success`);
    return result;
  } catch (error) {
    console.error(`[${context}] Failed:`, error.message);
    throw error;
  }
}
```

### 3. Use Structured Logging
```javascript
// Structure logs for analysis
const structuredLog = {
  timestamp: new Date().toISOString(),
  level: 'debug',
  command,
  context: {
    file: __filename,
    function: 'processData',
    line: new Error().stack.split('\n')[2]
  },
  result: {
    success: true,
    duration: 123,
    output: 'truncated...'
  }
};
console.log(JSON.stringify(structuredLog));
```

## Next Steps

- [Shell Configuration](./shell-config.md) - Configure shell behavior
- [Local Setup](./setup.md) - Basic local environment setup
- [Error Handling](../../core/execution-engine/features/error-handling.md) - Advanced error handling
- [Performance Optimization](../../core/execution-engine/performance/optimization.md) - Optimize execution