/**
 * 06 - Select Key Prompt
 *
 * Instant selection via keyboard shortcuts. Each option is triggered
 * by pressing its first character. Supports caseSensitive mode.
 */
import { intro, selectKey, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Select Key Prompt Examples');

  // Basic selectKey - press a single key to select
  const action = await selectKey({
    message: 'What would you like to do?',
    options: [
      { value: 'create', label: 'Create a new project' },
      { value: 'delete', label: 'Delete a project' },
      { value: 'update', label: 'Update a project' },
      { value: 'quit', label: 'Quit' },
    ],
  });
  if (isCancel(action)) { cancel('Cancelled.'); process.exit(0); }

  // Case-sensitive keys (Shift+key = uppercase)
  const severity = await selectKey({
    message: 'Set log level (case-sensitive)',
    caseSensitive: true,
    options: [
      { value: 'Debug', label: 'Debug - verbose output', hint: 'Shift+D' },
      { value: 'info', label: 'Info - general messages', hint: 'i' },
      { value: 'warn', label: 'Warn - warnings only', hint: 'w' },
      { value: 'Error', label: 'Error - errors only', hint: 'Shift+E' },
    ],
  });
  if (isCancel(severity)) { cancel('Cancelled.'); process.exit(0); }

  log.info(`Action: ${action}, Log level: ${severity}`);
  outro('Done!');
}

main().catch(console.error);
