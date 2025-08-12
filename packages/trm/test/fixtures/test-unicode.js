
import { createTerminal } from '../../dist/index.js';

async function main() {
  const term = createTerminal();
  await term.init();

  term.screen.clear();
  term.screen.writeAt(0, 0, 'Unicode Test');

  // Test various Unicode characters
  term.screen.writeAt(0, 2, 'Emoji: 😀 🎉 🚀');
  term.screen.writeAt(0, 3, 'Symbols: ♠ ♣ ♥ ♦');
  term.screen.writeAt(0, 4, 'Math: ∑ ∏ √ ∞');
  term.screen.writeAt(0, 5, 'Arrows: ← → ↑ ↓');
  term.screen.writeAt(0, 6, 'Box: ┌─┐│└┘');
  term.screen.writeAt(0, 7, 'CJK: 你好 こんにちは 안녕하세요');

  // Test escape sequences
  term.screen.writeAt(0, 9, 'Escaped: \\n \\t \\r');

  setTimeout(() => {
    term.close();
    process.exit(0);
  }, 1000);
}

main();
