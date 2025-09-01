#!/usr/bin/env tsx
/**
 * SelectKey Component Quick Start
 *
 * Simple example showing the key feature of select-key:
 * Instant selection with a single key press!
 */

import { intro , outro, cancel, isCancel, selectKey, prism as color } from '../src/index.js';


async function main() {
  intro(color.bgCyan(color.black(' Quick Select Demo ')));

  console.log(color.dim('\nSelectKey allows instant selection with a single key press!'));
  console.log(color.dim('No need to navigate with arrows and press Enter.\n'));

  // Simple Yes/No selection
  const proceed = await selectKey({
    message: 'Continue with installation?',
    options: [
      { value: 'yes', label: 'Yes', hint: 'Press Y' },
      { value: 'no', label: 'No', hint: 'Press N' },
    ],
  });

  if (isCancel(proceed)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  if (proceed === 'no') {
    outro(color.red('Installation cancelled'));
    process.exit(0);
  }

  console.log(color.green('✓ Proceeding with installation...\n'));

  // Package manager selection
  const packageManager = await selectKey({
    message: 'Select package manager:',
    options: [
      { value: 'npm', label: 'NPM', hint: 'Node Package Manager' },
      { value: 'yarn', label: 'Yarn', hint: 'Fast, reliable, secure' },
      { value: 'pnpm', label: 'PNPM', hint: 'Fast, disk space efficient' },
      { value: 'bun', label: 'Bun', hint: 'All-in-one toolkit' },
    ],
    initialValue: 'npm',
  });

  if (isCancel(packageManager)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  console.log(color.cyan(`✓ Using ${packageManager}\n`));

  // Action selection
  const action = await selectKey({
    message: 'What would you like to do?',
    options: [
      { value: 'install', label: 'Install dependencies' },
      { value: 'update', label: 'Update packages' },
      { value: 'audit', label: 'Audit for vulnerabilities' },
      { value: 'clean', label: 'Clean cache' },
    ],
  });

  if (isCancel(action)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  outro(color.green(`✓ Running: ${packageManager} ${action}`));

  console.log('\n' + color.dim('💡 Tip: SelectKey is perfect for:'));
  console.log(color.dim('   • Quick yes/no confirmations'));
  console.log(color.dim('   • Menu navigation with hotkeys'));
  console.log(color.dim('   • Single-letter command selection'));
  console.log(color.dim('   • Any prompt where speed matters!\n'));
}

main().catch(console.error);
