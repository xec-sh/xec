/**
 * 16 - Task Logs & Task Groups
 *
 * Bounded live output, independent groups, raw text fragments and retained
 * failure details. All work below is local, deterministic demonstration data.
 */
import { setTimeout } from 'node:timers/promises';

import { log, intro, outro, tasks, taskLog } from '../src/index.js';

async function main() {
  intro('Task Logs & Task Groups');

  const transcript = taskLog({ title: 'Package plan preview', limit: 4, retainLog: true });
  const core = transcript.group('Core');
  const ui = transcript.group('UI');
  for (const name of ['core', 'ops', 'kit', 'xec']) {
    await setTimeout(80);
    const group = name === 'kit' ? ui : core;
    group.message(`Reviewing @xec-sh/${name}`);
  }
  // Raw fragments concatenate within their own group, including Unicode.
  ui.message('Interface ', { raw: true });
  ui.message('ready ✓', { raw: true });
  core.success('Core plan reviewed');
  ui.success('UI plan reviewed');
  transcript.success('Preview complete', { showLog: true });

  const diagnostic = taskLog({ title: 'Failure presentation preview', limit: 2 });
  diagnostic.message('Synthetic input: missing required field');
  diagnostic.error('Example validation failure', { showLog: true });

  // tasks runs enabled functions in order and stops before later work on error.
  const plan = { packages: ['core', 'ops', 'kit'], reviewed: false };
  await tasks([
    {
      title: 'Validate plan',
      task: async (message) => {
        message(`Checking ${plan.packages.length} package names`);
        await setTimeout(100);
        if (new Set(plan.packages).size !== plan.packages.length)
          throw new Error('Duplicate package');
        plan.reviewed = true;
        return 'Plan validated';
      },
    },
    {
      title: 'Report result',
      task: () => {
        if (!plan.reviewed) throw new Error('Plan was not validated');
        return 'Ready for review; no packages were published';
      },
    },
    {
      title: 'Publish',
      enabled: false,
      task: () => {
        throw new Error('Disabled task must not run');
      },
    },
  ]);
  log.info('The failure presentation above was synthetic; the task group succeeded.');
  outro('Task demonstration complete.');
}

await main();
