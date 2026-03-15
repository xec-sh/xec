/**
 * 20 - Full Application
 *
 * A complete CLI app combining all features: text, password, select,
 * multiselect, confirm, date, spinner, progress, note, group flow,
 * and error handling. Demonstrates real-world usage patterns.
 */
import { setTimeout } from 'node:timers/promises';

import {
  intro, outro, cancel, note, log, prism,
  group, text, password, select, multiselect, confirm, date,
  spinner, progress, isCancel,
} from '../src/index.js';

async function main() {
  console.clear();
  await setTimeout(500);

  intro(`${prism.bgCyan(prism.black(' create-app '))} v2.0`);

  const project = await group(
    {
      name: () =>
        text({
          message: 'Project name',
          placeholder: 'my-awesome-app',
          validate: (value) => {
            if (!value) return 'Name is required.';
            if (!/^[a-z0-9-]+$/.test(value)) return 'Only lowercase letters, numbers, and hyphens.';
            return undefined;
          },
        }),

      type: () =>
        select({
          message: 'Project type',
          options: [
            { value: 'app', label: 'Web Application', hint: 'full-stack' },
            { value: 'api', label: 'API Service', hint: 'backend only' },
            { value: 'lib', label: 'Library', hint: 'npm package' },
            { value: 'cli', label: 'CLI Tool', hint: 'command-line' },
          ],
        }),

      framework: ({ results }) =>
        results.type === 'lib'
          ? undefined
          : select({
              message: `Framework for your ${results.type}`,
              options:
                results.type === 'cli'
                  ? [
                      { value: 'commander', label: 'Commander' },
                      { value: 'yargs', label: 'Yargs' },
                      { value: 'custom', label: 'Custom (no framework)' },
                    ]
                  : [
                      { value: 'next', label: 'Next.js' },
                      { value: 'nuxt', label: 'Nuxt' },
                      { value: 'astro', label: 'Astro' },
                      { value: 'hono', label: 'Hono', hint: 'lightweight' },
                    ],
            }),

      features: () =>
        multiselect({
          message: 'Select features',
          initialValues: ['typescript', 'testing'],
          options: [
            { value: 'typescript', label: 'TypeScript', hint: 'recommended' },
            { value: 'testing', label: 'Testing (Vitest)', hint: 'recommended' },
            { value: 'linting', label: 'ESLint + Prettier' },
            { value: 'docker', label: 'Docker' },
            { value: 'ci', label: 'CI/CD (GitHub Actions)' },
            { value: 'monitoring', label: 'Monitoring', disabled: true },
          ],
        }),

      dbPassword: ({ results }) =>
        results.type === 'lib'
          ? undefined
          : password({
              message: 'Database password',
              validate: (value) => {
                if (!value) return 'Password is required.';
                if (value.length < 6) return 'At least 6 characters.';
                return undefined;
              },
            }),

      deadline: () =>
        date({
          message: 'Target launch date',
          format: 'YYYY/MM/DD',
          minDate: new Date(),
        }),

      install: () =>
        confirm({
          message: 'Install dependencies now?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Setup cancelled.');
        process.exit(0);
      },
    }
  );

  // Installation phase
  if (project.install) {
    const s = spinner({ indicator: 'timer' });
    s.start('Installing dependencies');
    await setTimeout(2000);
    s.stop('Dependencies installed');
  }

  // Build phase
  const p = progress({ style: 'heavy', max: 100 });
  p.start('Scaffolding project');
  const steps = ['Creating directories', 'Writing configs', 'Generating code', 'Setting up tests', 'Finalizing'];
  for (let i = 0; i < steps.length; i++) {
    await setTimeout(600);
    p.advance(20, steps[i]);
  }
  p.stop('Project scaffolded');

  // Summary
  const features = project.features as string[];
  const deadline = project.deadline as Date;
  note(
    [
      `Name:      ${project.name}`,
      `Type:      ${project.type}`,
      project.framework ? `Framework: ${project.framework}` : null,
      `Features:  ${features.join(', ')}`,
      `Deadline:  ${deadline.toISOString().slice(0, 10)}`,
      '',
      `${prism.dim('cd')} ${project.name}`,
      project.install ? '' : `${prism.dim('npm install')}`,
      `${prism.dim('npm run dev')}`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
    'Project created!'
  );

  outro(`Problems? ${prism.underline(prism.cyan('https://github.com/xec-sh/kit/issues'))}`);
}

main().catch(console.error);
