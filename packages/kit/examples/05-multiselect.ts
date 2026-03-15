/**
 * 05 - Multi-Select Prompt
 *
 * Multiple selection with space to toggle, 'a' to select all,
 * 'i' to invert, disabled options, and required validation.
 */
import { intro, multiselect, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Multi-Select Prompt Examples');

  // Basic multiselect with initial values
  const tools = await multiselect({
    message: 'Select your development tools',
    initialValues: ['eslint'],
    options: [
      { value: 'prettier', label: 'Prettier', hint: 'code formatting' },
      { value: 'eslint', label: 'ESLint', hint: 'linting' },
      { value: 'stylelint', label: 'Stylelint' },
      { value: 'husky', label: 'Husky', hint: 'git hooks' },
      { value: 'lint-staged', label: 'lint-staged' },
    ],
  });
  if (isCancel(tools)) { cancel('Cancelled.'); process.exit(0); }

  // Multiselect with disabled options
  const features = await multiselect({
    message: 'Select features for your project',
    options: [
      { value: 'auth', label: 'Authentication' },
      { value: 'db', label: 'Database' },
      { value: 'api', label: 'REST API' },
      { value: 'graphql', label: 'GraphQL', disabled: true },
      { value: 'websockets', label: 'WebSockets', disabled: true },
      { value: 'cron', label: 'Scheduled Jobs' },
    ],
  });
  if (isCancel(features)) { cancel('Cancelled.'); process.exit(0); }

  // Optional multiselect (not required)
  const extras = await multiselect({
    message: 'Any extras? (optional, press Enter to skip)',
    required: false,
    options: [
      { value: 'docker', label: 'Docker', hint: 'containerization' },
      { value: 'ci', label: 'CI/CD pipeline' },
      { value: 'monitoring', label: 'Monitoring' },
    ],
  });
  if (isCancel(extras)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Tools: ${(tools as string[]).join(', ')}`);
  log.success(`Features: ${(features as string[]).join(', ')}`);
  log.success(`Extras: ${(extras as string[]).length > 0 ? (extras as string[]).join(', ') : 'none'}`);
  outro('Project configured!');
}

main().catch(console.error);
