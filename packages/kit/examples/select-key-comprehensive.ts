#!/usr/bin/env tsx
/**
 * SelectKey Component Comprehensive Example
 *
 * Demonstrates all features of the select-key prompt:
 * - Quick selection using single key press
 * - Options with custom labels and hints
 * - Different value types
 * - Initial value selection
 * - Cancel handling
 * - Multiple use cases
 */

import { note , intro, outro, cancel, isCancel, selectKey, prism as color } from '../src/index.js';


async function main() {
  intro(color.bgCyan(color.black(' SelectKey Component Demo ')));

  // Example 1: Basic Usage - File Operations
  note(
    'Example 1: File Operations Menu\nPress the first letter of your choice for quick selection!'
  );

  const fileOperation = await selectKey({
    message: 'What would you like to do with the file?',
    options: [
      { value: 'open', label: 'Open file', hint: 'Opens in default editor' },
      { value: 'copy', label: 'Copy file', hint: 'Ctrl+C' },
      { value: 'move', label: 'Move file', hint: 'Ctrl+X' },
      { value: 'delete', label: 'Delete file', hint: 'Permanently remove' },
      { value: 'rename', label: 'Rename file', hint: 'Change filename' },
    ],
  });

  if (isCancel(fileOperation)) {
    cancel('File operation cancelled');
    process.exit(0);
  }

  console.log(color.green(`✓ Selected operation: ${fileOperation}`));

  // Example 2: Quick Yes/No/Maybe Selection
  note('\nExample 2: Quick Decision\nPress Y, N, or M for instant selection!');

  const decision = await selectKey({
    message: 'Do you want to proceed with the changes?',
    options: [
      { value: 'yes', label: 'Yes - Apply all changes' },
      { value: 'no', label: 'No - Discard changes' },
      { value: 'maybe', label: 'Maybe - Review changes first' },
    ],
    initialValue: 'yes', // Pre-select 'yes' option
  });

  if (isCancel(decision)) {
    cancel('Decision cancelled');
    process.exit(0);
  }

  console.log(color.cyan(`✓ Decision: ${decision}`));

  // Example 3: Priority Selection with Hints
  note('\nExample 3: Priority Level\nPress H, M, L, or C for quick priority selection!');

  const priority = await selectKey({
    message: 'Set task priority:',
    options: [
      { value: 'high', label: 'High Priority', hint: '🔴 Urgent' },
      { value: 'medium', label: 'Medium Priority', hint: '🟡 Normal' },
      { value: 'low', label: 'Low Priority', hint: '🟢 Can wait' },
      { value: 'critical', label: 'Critical', hint: '🚨 Emergency' },
    ],
  });

  if (isCancel(priority)) {
    cancel('Priority selection cancelled');
    process.exit(0);
  }

  console.log(color.yellow(`✓ Priority set to: ${priority}`));

  // Example 4: Build Tool Selection
  note('\nExample 4: Build Tool Selection\nPress the first letter to select your build tool!');

  const buildTool = await selectKey({
    message: 'Choose your build tool:',
    options: [
      { value: 'webpack', label: 'Webpack', hint: 'Module bundler' },
      { value: 'rollup', label: 'Rollup', hint: 'ES modules bundler' },
      { value: 'parcel', label: 'Parcel', hint: 'Zero-config bundler' },
      { value: 'esbuild', label: 'ESBuild', hint: 'Super fast bundler' },
      { value: 'vite', label: 'Vite', hint: 'Next generation tooling' },
    ],
  });

  if (isCancel(buildTool)) {
    cancel('Build tool selection cancelled');
    process.exit(0);
  }

  console.log(color.magenta(`✓ Build tool: ${buildTool}`));

  // Example 5: Navigation Menu
  note('\nExample 5: Navigation Menu\nSingle key navigation - Press H, S, A, P, or Q!');

  const navigation = await selectKey({
    message: 'Navigate to:',
    options: [
      { value: 'home', label: 'Home', hint: '🏠 Main dashboard' },
      { value: 'settings', label: 'Settings', hint: '⚙️ Configure app' },
      { value: 'about', label: 'About', hint: 'ℹ️ App information' },
      { value: 'profile', label: 'Profile', hint: '👤 User profile' },
      { value: 'quit', label: 'Quit', hint: '🚪 Exit application' },
    ],
  });

  if (isCancel(navigation)) {
    cancel('Navigation cancelled');
    process.exit(0);
  }

  if (navigation === 'quit') {
    outro(color.red('Goodbye! 👋'));
    process.exit(0);
  }

  console.log(color.blue(`✓ Navigating to: ${navigation}`));

  // Example 6: Quick Actions with Numeric Values
  note('\nExample 6: Quick Actions\nPress 1, 2, 3, 4, or 5 for instant action!');

  const action = await selectKey({
    message: 'Select quick action:',
    options: [
      { value: '1', label: '1. Run tests', hint: 'npm test' },
      { value: '2', label: '2. Build project', hint: 'npm run build' },
      { value: '3', label: '3. Deploy', hint: 'npm run deploy' },
      { value: '4', label: '4. Clean cache', hint: 'Clear all caches' },
      { value: '5', label: '5. Update deps', hint: 'npm update' },
    ],
  });

  if (isCancel(action)) {
    cancel('Quick action cancelled');
    process.exit(0);
  }

  console.log(color.green(`✓ Executing action ${action}`));

  // Example 7: Environment Selection
  note('\nExample 7: Environment Selection\nPress D, S, or P for environment!');

  const environment = await selectKey({
    message: 'Select deployment environment:',
    options: [
      { value: 'development', label: 'Development', hint: 'Local development' },
      { value: 'staging', label: 'Staging', hint: 'Testing environment' },
      { value: 'production', label: 'Production', hint: '⚠️ Live environment' },
    ],
    initialValue: 'development',
  });

  if (isCancel(environment)) {
    cancel('Environment selection cancelled');
    process.exit(0);
  }

  console.log(color.bgGreen(color.black(` Deploying to ${environment} `)));

  // Example 8: Git Operations
  note('\nExample 8: Git Operations\nPress A, C, P, F, or B for git action!');

  const gitOp = await selectKey({
    message: 'Select git operation:',
    options: [
      { value: 'add', label: 'Add files', hint: 'git add' },
      { value: 'commit', label: 'Commit changes', hint: 'git commit' },
      { value: 'push', label: 'Push to remote', hint: 'git push' },
      { value: 'fetch', label: 'Fetch updates', hint: 'git fetch' },
      { value: 'branch', label: 'Branch operations', hint: 'git branch' },
    ],
  });

  if (isCancel(gitOp)) {
    cancel('Git operation cancelled');
    process.exit(0);
  }

  console.log(color.cyan(`✓ Git operation: ${gitOp}`));

  // Summary
  outro(color.bgGreen(color.black(' All selections completed successfully! ')));

  console.log('\n' + color.dim('Summary of selections:'));
  console.log(color.dim('─'.repeat(40)));
  console.log(`File Operation: ${color.green(fileOperation)}`);
  console.log(`Decision: ${color.cyan(decision)}`);
  console.log(`Priority: ${color.yellow(priority)}`);
  console.log(`Build Tool: ${color.magenta(buildTool)}`);
  console.log(`Navigation: ${color.blue(navigation)}`);
  console.log(`Quick Action: ${color.green(action)}`);
  console.log(`Environment: ${color.bgGreen(color.black(` ${environment} `))}`);
  console.log(`Git Operation: ${color.cyan(gitOp)}`);
  console.log(color.dim('─'.repeat(40)));

  console.log('\n' + color.green('✨ SelectKey Features Demonstrated:'));
  console.log('• Single key press selection for fast navigation');
  console.log('• Custom labels for better UX');
  console.log('• Hints for additional context');
  console.log('• Initial value pre-selection');
  console.log('• Cancel handling');
  console.log('• Various use cases (menus, decisions, navigation)');
  console.log('• Works with different value types');
}

main().catch(console.error);
