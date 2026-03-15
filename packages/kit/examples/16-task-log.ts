/**
 * 16 - Task Log
 *
 * Real-time task output display with scrolling history,
 * group support, and success/error completion states.
 */
import { setTimeout } from 'node:timers/promises';

import { intro, taskLog, outro } from '../src/index.js';

async function main() {
  intro('Task Log Example');

  const tl = taskLog({ title: 'Build Pipeline', limit: 8 });

  // First task group
  const install = tl.group('Installing packages');

  const packages = [
    'typescript@5.4.0', 'vitest@2.0.0', 'eslint@9.0.0',
    '@types/node@20.0.0', 'prettier@3.2.0', 'tsx@4.7.0',
  ];

  for (const pkg of packages) {
    await setTimeout(400);
    install.message(`+ ${pkg}`);
  }
  install.success('Packages installed');

  await setTimeout(500);

  // Second task group
  const test = tl.group('Running tests');

  const tests = [
    'core/engine.test.ts ......... PASS',
    'core/result.test.ts ......... PASS',
    'adapters/local.test.ts ...... PASS',
    'adapters/ssh.test.ts ........ PASS',
    'adapters/docker.test.ts ..... PASS',
    'utils/stream.test.ts ........ PASS',
    'utils/cache.test.ts ......... PASS',
    'integration/pipe.test.ts .... PASS',
  ];

  for (const line of tests) {
    await setTimeout(300);
    test.message(line);
  }
  test.success('All 8 tests passed');

  outro('Build complete!');
}

main().catch(console.error);
