/**
 * 05 - Multi-Select Prompt
 *
 * Multiple selection with space to toggle, 'a' to select all,
 * 'i' to invert, disabled options, and required validation.
 */
import { log, intro, outro, cancel, isCancel, multiselect } from '../src/index.js';

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
  if (isCancel(tools)) {
    cancel('Cancelled.');
    return;
  }

  // Multiselect with disabled options; one enabled choice is required.
  const features = await multiselect({
    message: 'Select features for your project',
    initialValues: ['auth'],
    options: [
      { value: 'auth', label: 'Authentication' },
      { value: 'db', label: 'Database' },
      { value: 'api', label: 'REST API' },
      { value: 'graphql', label: 'GraphQL', disabled: true },
      { value: 'websockets', label: 'WebSockets', disabled: true },
      { value: 'cron', label: 'Scheduled Jobs' },
    ],
  });
  if (isCancel(features)) {
    cancel('Cancelled.');
    return;
  }

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
  if (isCancel(extras)) {
    cancel('Cancelled.');
    return;
  }

  log.success(`Tools: ${tools.join(', ')}`);
  log.success(`Features: ${features.join(', ')}`);
  log.success(`Extras: ${extras.length > 0 ? extras.join(', ') : 'none'}`);
  outro('Configuration preview complete.');
}

await main();
