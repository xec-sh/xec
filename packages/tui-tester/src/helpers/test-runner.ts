/**
 * Test Runner
 * High-level utilities for running terminal UI tests
 */

import { sleep } from '../core/utils.js';
import { TmuxTester } from '../tmux-tester.js';

import type {
  TestStep,
  TestResult,
  StepResult,
  TestScenario,
  TesterConfig,
  TerminalTester
} from '../core/types.js';

export interface TestRunnerOptions {
  beforeAll?: () => Promise<void>;
  afterAll?: () => Promise<void>;
  beforeEach?: (tester: TerminalTester) => Promise<void>;
  afterEach?: (tester: TerminalTester) => Promise<void>;
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  debug?: boolean;
}

export class TestRunner {
  private options: Required<TestRunnerOptions>;
  private results: TestResult[] = [];

  constructor(options: TestRunnerOptions = {}) {
    this.options = {
      beforeAll: options.beforeAll || (() => Promise.resolve()),
      afterAll: options.afterAll || (() => Promise.resolve()),
      beforeEach: options.beforeEach || (() => Promise.resolve()),
      afterEach: options.afterEach || (() => Promise.resolve()),
      timeout: options.timeout ?? 30000,
      retries: options.retries ?? 0,
      parallel: options.parallel ?? false,
      debug: options.debug ?? false
    };
  }

  /**
   * Run a single test scenario
   */
  async runScenario(scenario: TestScenario, config: TesterConfig): Promise<TestResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let tester: TerminalTester | null = null;
    let error: Error | undefined;

    try {
      // Create tester
      tester = new TmuxTester({ ...config, debug: this.options.debug });
      
      // Setup
      if (scenario.setup) {
        await scenario.setup();
      }
      
      await tester.start();
      await this.options.beforeEach(tester);

      // Run steps
      for (const step of scenario.steps) {
        const stepResult = await this.runStep(step, tester);
        stepResults.push(stepResult);
        
        if (!stepResult.passed) {
          error = stepResult.error;
          break;
        }
      }
    } catch (err) {
      error = err as Error;
    } finally {
      // Cleanup
      if (tester) {
        try {
          await this.options.afterEach(tester);
          await tester.stop();
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
      
      if (scenario.teardown) {
        try {
          await scenario.teardown();
        } catch (teardownError) {
          console.error('Teardown error:', teardownError);
        }
      }
    }

    const result: TestResult = {
      scenario: scenario.name,
      passed: !error && stepResults.every(r => r.passed),
      duration: Date.now() - startTime,
      steps: stepResults,
      error
    };

    this.results.push(result);
    return result;
  }

  /**
   * Run a single test step
   */
  private async runStep(step: TestStep, tester: TerminalTester): Promise<StepResult> {
    const startTime = Date.now();
    let error: Error | undefined;
    let capture: any;

    try {
      // Check if step should be skipped
      if (step.skipOn) {
        const runtime = this.detectRuntime();
        if (step.skipOn.includes(runtime)) {
          return {
            name: step.name,
            passed: true,
            duration: 0,
            capture: await tester.captureScreen()
          };
        }
      }

      // Run with timeout
      const timeout = step.timeout ?? this.options.timeout;
      await this.withTimeout(
        async () => {
          // Execute action
          await step.action(tester);
          
          // Capture screen after action
          capture = await tester.captureScreen();
          
          // Run assertion if provided
          if (step.assertion) {
            await step.assertion(tester);
          }
        },
        timeout,
        `Step "${step.name}" timed out after ${timeout}ms`
      );
    } catch (err) {
      error = err as Error;
      
      // Capture screen on error
      try {
        capture = await tester.captureScreen();
      } catch {
        // Ignore capture errors
      }
    }

    return {
      name: step.name,
      passed: !error,
      duration: Date.now() - startTime,
      error,
      capture
    };
  }

  /**
   * Run multiple scenarios
   */
  async runScenarios(
    scenarios: TestScenario[],
    config: TesterConfig
  ): Promise<TestResult[]> {
    await this.options.beforeAll();

    try {
      if (this.options.parallel) {
        // Run scenarios in parallel
        const promises = scenarios.map(scenario => 
          this.runScenarioWithRetries(scenario, config)
        );
        await Promise.all(promises);
      } else {
        // Run scenarios sequentially
        for (const scenario of scenarios) {
          await this.runScenarioWithRetries(scenario, config);
        }
      }
    } finally {
      await this.options.afterAll();
    }

    return this.results;
  }

  /**
   * Run scenario with retries
   */
  private async runScenarioWithRetries(
    scenario: TestScenario,
    config: TesterConfig
  ): Promise<TestResult> {
    let lastResult: TestResult | null = null;
    
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      if (attempt > 0) {
        console.log(`Retrying scenario "${scenario.name}" (attempt ${attempt + 1}/${this.options.retries + 1})`);
        await sleep(1000); // Wait before retry
      }
      
      lastResult = await this.runScenario(scenario, config);
      
      if (lastResult.passed) {
        return lastResult;
      }
    }
    
    return lastResult!;
  }

  /**
   * Get test results
   */
  getResults(): TestResult[] {
    return [...this.results];
  }

  /**
   * Get summary of test results
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    failures: Array<{ scenario: string; error: string }>;
  } {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const duration = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    const failures = this.results
      .filter(r => !r.passed)
      .map(r => ({
        scenario: r.scenario,
        error: r.error?.message || 'Unknown error'
      }));

    return { total, passed, failed, duration, failures };
  }

  /**
   * Print test results to console
   */
  printResults(): void {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(60));
    console.log('Test Results');
    console.log('='.repeat(60));
    
    for (const result of this.results) {
      const status = result.passed ? '✓' : '✗';
      const color = result.passed ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';
      
      console.log(`${color}${status}${reset} ${result.scenario} (${result.duration}ms)`);
      
      if (!result.passed && result.error) {
        console.log(`  Error: ${result.error.message}`);
      }
      
      for (const step of result.steps) {
        const stepStatus = step.passed ? '  ✓' : '  ✗';
        const stepColor = step.passed ? '\x1b[32m' : '\x1b[31m';
        
        console.log(`  ${stepColor}${stepStatus}${reset} ${step.name} (${step.duration}ms)`);
        
        if (!step.passed && step.error) {
          console.log(`    ${step.error.message}`);
        }
      }
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
    console.log(`Duration: ${summary.duration}ms`);
    
    if (summary.failed > 0) {
      console.log('\nFailed scenarios:');
      for (const failure of summary.failures) {
        console.log(`  - ${failure.scenario}: ${failure.error}`);
      }
    }
  }

  /**
   * Reset results
   */
  reset(): void {
    this.results = [];
  }

  // Private helper methods

  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    
    return Promise.race([fn(), timeoutPromise]);
  }

  private detectRuntime(): 'node' | 'deno' | 'bun' {
    // @ts-ignore
    if (typeof Deno !== 'undefined') return 'deno';
    // @ts-ignore
    if (typeof Bun !== 'undefined') return 'bun';
    return 'node';
  }
}

/**
 * Create and run a test scenario
 */
export async function runTest(
  nameOrConfig: string | (TesterConfig & { scenarios?: TestScenario[] }),
  config?: TesterConfig,
  steps?: TestStep[],
  options?: TestRunnerOptions
): Promise<TestResult | { passed: number; failed: number; scenarios: TestResult[] }> {
  // Handle object-style call with scenarios
  if (typeof nameOrConfig === 'object' && 'scenarios' in nameOrConfig && nameOrConfig.scenarios) {
    const runner = new TestRunner(options);
    const results: TestResult[] = [];
    
    for (const scenario of nameOrConfig.scenarios) {
      const result = await runner.runScenario(scenario, nameOrConfig);
      results.push(result);
    }
    
    runner.printResults();
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    return {
      passed,
      failed,
      scenarios: results
    };
  }
  
  // Handle traditional call
  const name = nameOrConfig as string;
  const runner = new TestRunner(options);
  const scenario: TestScenario = { name, steps: steps || [] };
  
  const result = await runner.runScenario(scenario, config!);
  runner.printResults();
  
  return result;
}

/**
 * Create a test step
 */
export function step(
  name: string,
  action: (tester: TerminalTester) => Promise<void>,
  assertion?: (tester: TerminalTester) => Promise<void>
): TestStep {
  return { name, action, assertion };
}

/**
 * Create a test scenario
 */
export function scenario(
  name: string,
  steps: TestStep[],
  options?: {
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
  }
): TestScenario {
  return {
    name,
    steps,
    setup: options?.setup,
    teardown: options?.teardown
  };
}