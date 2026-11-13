/**
 * 20 - Full Application
 *
 * An in-memory project setup preview combining text, password, select,
 * multiselect, confirm, date, spinner, progress, note, group flow,
 * and cancellation. No files are created and no dependencies are installed.
 */
import { setTimeout } from 'node:timers/promises';

import {
  log,
  note,
  text,
  date,
  intro,
  outro,
  prism,
  group,
  cancel,
  select,
  confirm,
  spinner,
  password,
  progress,
  isCancel,
  multiselect,
} from '../src/index.js';

async function main() {
  intro(prism.bgCyan(prism.black(' Kit · project setup preview ')));
  log.info('Use sample values. This preview does not write files or install dependencies.');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

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
                      { value: 'xec', label: 'Xec', hint: 'TypeScript commands and automation' },
                      { value: 'kit', label: 'Kit', hint: 'interactive terminal application' },
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
          initialValue: today,
          minDate: today,
        }),

      install: () =>
        confirm({
          message: 'Show the dependency-installation preview?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Setup cancelled.');
        return;
      },
    }
  );

  if (isCancel(project)) return;

  // Simulated installation phase
  if (project.install) {
    const s = spinner({ indicator: 'timer' });
    s.start('Previewing dependency installation');
    try {
      await setTimeout(350);
      s.stop('Installation preview complete');
    } finally {
      s.clear();
    }
  }

  // Simulated scaffolding phase
  const p = progress({ style: 'heavy', max: 100 });
  p.start('Previewing project setup');
  const steps = [
    'Creating directories',
    'Writing configs',
    'Generating code',
    'Setting up tests',
    'Finalizing',
  ];
  for (let i = 0; i < steps.length; i++) {
    await setTimeout(100);
    p.advance(20, steps[i]);
  }
  p.stop('Setup preview complete');

  // Summary
  const features = project.features;
  const deadline = project.deadline;
  note(
    [
      `Name:      ${project.name}`,
      `Type:      ${project.type}`,
      project.framework ? `Framework: ${project.framework}` : null,
      `Features:  ${features.join(', ')}`,
      `Deadline:  ${deadline.toISOString().slice(0, 10)}`,
      '',
      'No project was created. This is the configuration your own generator could consume.',
      'The password is excluded from this summary.',
    ]
      .filter((line) => line !== null)
      .join('\n'),
    'Configuration preview'
  );

  outro(`Problems? ${prism.underline(prism.cyan('https://github.com/xec-sh/xec/issues'))}`);
}

await main();
