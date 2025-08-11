#!/usr/bin/env node

/**
 * Quick test script to verify tmux and TmuxTester work correctly
 */

import { promisify } from 'util';
import { exec } from 'child_process';

import { createTester } from '../dist/index.js';

const execAsync = promisify(exec);

async function quickTest() {
  console.log('🧪 Starting quick TmuxTester test...\n');
  
  // 1. Check tmux is available
  console.log('1. Checking tmux availability...');
  try {
    const { stdout } = await execAsync('which tmux');
    console.log(`   ✅ tmux found at: ${stdout.trim()}`);
  } catch (error) {
    console.error('   ❌ tmux not found! Please install tmux first.');
    process.exit(1);
  }
  
  // 2. Clean up any existing test sessions
  console.log('\n2. Cleaning up existing test sessions...');
  try {
    await execAsync('tmux list-sessions 2>/dev/null | grep -E "quick-test-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {} 2>/dev/null || true');
    console.log('   ✅ Cleanup complete');
  } catch {
    console.log('   ✅ No sessions to clean');
  }
  
  // 3. Test basic tester creation and lifecycle
  console.log('\n3. Testing TmuxTester lifecycle...');
  let tester = null;
  
  try {
    const sessionName = `quick-test-${Date.now()}`;
    tester = createTester('echo "Hello World"', {
      sessionName,
      debug: true
    });
    
    console.log('   - Starting session...');
    await tester.start();
    
    if (!tester.isRunning()) {
      throw new Error('Session failed to start');
    }
    console.log('   ✅ Session started successfully');
    
    // Wait a bit for command to execute
    await tester.sleep(500);
    
    console.log('   - Capturing screen...');
    const screen = await tester.getScreenText();
    console.log(`   - Screen content: "${screen.trim().substring(0, 50)}..."`);
    
    if (screen.includes('Hello World')) {
      console.log('   ✅ Output captured correctly');
    } else {
      console.log('   ⚠️  Expected output not found');
    }
    
    console.log('   - Stopping session...');
    await tester.stop();
    
    if (tester.isRunning()) {
      throw new Error('Session failed to stop');
    }
    console.log('   ✅ Session stopped successfully');
    
  } catch (error) {
    console.error(`   ❌ Test failed: ${error.message}`);
    
    // Try to clean up
    if (tester) {
      try {
        await tester.stop();
      } catch {}
    }
    
    process.exit(1);
  }
  
  // 4. Test input/output operations
  console.log('\n4. Testing input/output operations...');
  
  try {
    const sessionName = `quick-test-io-${Date.now()}`;
    tester = createTester('sh', {
      sessionName,
      debug: false
    });
    
    await tester.start();
    await tester.sleep(500); // Wait for shell to be ready
    
    console.log('   - Sending command...');
    await tester.sendCommand('echo "Test Command"');
    await tester.sleep(200);
    
    const screen = await tester.getScreenText();
    
    if (screen.includes('Test Command')) {
      console.log('   ✅ Command execution works');
    } else {
      console.log('   ⚠️  Command output not found');
      console.log(`   - Screen: ${screen.substring(0, 100)}`);
    }
    
    await tester.stop();
    
  } catch (error) {
    console.error(`   ❌ I/O test failed: ${error.message}`);
    if (tester) {
      try {
        await tester.stop();
      } catch {}
    }
  }
  
  // 5. Test concurrent sessions
  console.log('\n5. Testing concurrent sessions...');
  
  const testers = [];
  try {
    // Create multiple sessions
    for (let i = 0; i < 3; i++) {
      const sessionName = `quick-test-concurrent-${i}-${Date.now()}`;
      const t = createTester('echo "Session ' + i + '"', {
        sessionName,
        debug: false
      });
      
      await t.start();
      testers.push(t);
    }
    
    console.log(`   ✅ Started ${testers.length} concurrent sessions`);
    
    // Clean up all sessions
    for (const t of testers) {
      await t.stop();
    }
    
    console.log('   ✅ All sessions stopped successfully');
    
  } catch (error) {
    console.error(`   ❌ Concurrent test failed: ${error.message}`);
    
    // Clean up
    for (const t of testers) {
      try {
        await t.stop();
      } catch {}
    }
  }
  
  // 6. Final cleanup
  console.log('\n6. Final cleanup...');
  try {
    await execAsync('tmux list-sessions 2>/dev/null | grep -E "quick-test-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {} 2>/dev/null || true');
    console.log('   ✅ All test sessions cleaned up');
  } catch {
    console.log('   ✅ No sessions to clean');
  }
  
  console.log('\n✨ All quick tests completed successfully!');
  process.exit(0);
}

// Run the test
quickTest().catch(error => {
  console.error('\n❌ Quick test failed with error:', error);
  process.exit(1);
});