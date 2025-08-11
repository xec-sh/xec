#!/usr/bin/env node

import { createTester } from '@xec-sh/tui-tester';

async function debugTmux() {
  console.log('Testing tmux TTY...');
  
  // Create a simple script that checks TTY
  const testScript = `
    if (process.stdout.isTTY) {
      console.log('YES TTY');
    } else {
      console.log('NO TTY');
    }
    console.log('Columns:', process.stdout.columns);
    console.log('Rows:', process.stdout.rows);
  `;
  
  const fs = await import('fs/promises');
  const tempFile = './test-tty.js';
  await fs.writeFile(tempFile, testScript);
  
  try {
    const tester = createTester(`node ${tempFile}`, {
      sessionName: `debug-tty-${Date.now()}`
    });
    
    await tester.start();
    await tester.sleep(1000);
    
    const screen = await tester.getScreenText();
    console.log('=== Output ===');
    console.log(screen);
    console.log('=============');
    
    await tester.stop();
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

debugTmux().catch(console.error);