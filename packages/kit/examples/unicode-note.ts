import { prism as color } from '../src/index.js';
import { note } from '../src/components/note.js';

console.log(color.yellow('\nExample 6: Special characters and emojis'));
note('✨ Unicode support: ★ ✓ ✗ → ← ↑ ↓ 📝 🎉', 'Unicode & Emojis');

// Example 10: Different note styles for different purposes
console.log(color.yellow('\nExample 10: Different note styles'));

// Success note
note('Operation completed successfully!', '✅ Success', {
  format: (line: string) => color.green(line),
});

// Warning note
note('Please review the configuration before proceeding', '⚠️ Warning', {
  format: (line: string) => color.yellow(line),
});

// Error note
note('An error occurred during processing', '❌ Error', {
  format: (line: string) => color.red(line),
});

// Info note
note('Additional information about the process', 'ℹ️ Info', {
  format: (line: string) => color.blue(line),
});
