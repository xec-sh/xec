/**
 * 21 - Multi-line Text Input
 *
 * Multi-line text input: Enter inserts a newline, pressing Enter twice
 * at the end submits. With showSubmit, submission goes through a
 * [ submit ] button focused with Tab instead.
 */
import { log, intro, outro, cancel, isCancel, multiline } from '../src/index.js';

async function main() {
  intro('Multi-line Input Examples');

  // Basic multi-line input: Enter adds a line, double Enter submits
  const bio = await multiline({
    message: 'Tell us about yourself (Enter twice to finish)',
    placeholder: 'I am a...',
  });
  if (isCancel(bio)) { cancel('Cancelled.'); process.exit(0); }

  // Multi-line input with a submit button and validation
  const commitMessage = await multiline({
    message: 'Write a commit message (Tab focuses [ submit ])',
    initialValue: 'feat: ',
    showSubmit: true,
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'A commit message is required.';
      return undefined;
    },
  });
  if (isCancel(commitMessage)) { cancel('Cancelled.'); process.exit(0); }

  log.success(`Bio: ${(bio as string).split('\n').length} line(s)`);
  outro(`Commit message:\n${commitMessage as string}`);
}

main().catch(console.error);
