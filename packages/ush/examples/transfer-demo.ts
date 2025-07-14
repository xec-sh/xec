#!/usr/bin/env node --experimental-modules
import { createExecutionEngine } from '../dist/index.js';

async function main() {
  const $ = createExecutionEngine();
  
  console.log('File Transfer Examples\n');
  
  // Example 1: Local to Local copy
  console.log('1. Local to Local copy:');
  try {
    const result = await $.transfer.copy('./README.md', '/tmp/README-copy.md');
    console.log(`  ✓ Copied ${result.filesTransferred} files (${result.bytesTransferred} bytes)`);
  } catch (error) {
    console.error('  ✗ Error:', error.message);
  }
  
  // Example 2: Local to Local move
  console.log('\n2. Local to Local move:');
  try {
    await $.transfer.move('/tmp/README-copy.md', '/tmp/README-moved.md');
    console.log('  ✓ File moved successfully');
  } catch (error) {
    console.error('  ✗ Error:', error.message);
  }
  
  // Example 3: Directory copy with options
  console.log('\n3. Directory copy with exclusions:');
  try {
    const result = await $.transfer.copy('./src', '/tmp/src-backup', {
      recursive: true,
      exclude: ['*.test.ts', 'node_modules'],
      onProgress: (progress) => {
        process.stdout.write(`\r  Progress: ${progress.completedFiles}/${progress.totalFiles} files`);
      }
    });
    console.log(`\n  ✓ Copied ${result.filesTransferred} files`);
  } catch (error) {
    console.error('  ✗ Error:', error.message);
  }
  
  // Example 4: SSH transfer (commented out - needs SSH setup)
  console.log('\n4. SSH transfers (examples - requires SSH setup):');
  console.log('  // Copy local to SSH');
  console.log('  await $.transfer.copy("./file.txt", "ssh://user@host/path/file.txt")');
  console.log('  ');
  console.log('  // Copy SSH to local');
  console.log('  await $.transfer.copy("ssh://user@host/remote.log", "./local.log")');
  console.log('  ');
  console.log('  // Copy between SSH hosts');
  console.log('  await $.transfer.copy("ssh://user1@host1/file", "ssh://user2@host2/file")');
  
  // Example 5: Docker transfer (commented out - needs Docker)
  console.log('\n5. Docker transfers (examples - requires Docker):');
  console.log('  // Copy from Docker container');
  console.log('  await $.transfer.copy("docker://mycontainer:/app/config.json", "./config.json")');
  console.log('  ');
  console.log('  // Copy to Docker container');
  console.log('  await $.transfer.copy("./data.csv", "docker://mycontainer:/data/input.csv")');
  console.log('  ');
  console.log('  // Copy between containers');
  console.log('  await $.transfer.copy("docker://container1:/logs", "docker://container2:/backup/logs")');
  
  // Example 6: Sync directories
  console.log('\n6. Directory sync (like rsync):');
  try {
    await $.transfer.sync('./examples', '/tmp/examples-sync', {
      recursive: true,
      deleteExtra: true
    });
    console.log('  ✓ Directories synchronized');
  } catch (error) {
    console.error('  ✗ Error:', error.message);
  }
  
  // Cleanup
  console.log('\n7. Cleanup:');
  await $`rm -rf /tmp/README-moved.md /tmp/src-backup /tmp/examples-sync`;
  console.log('  ✓ Cleaned up temporary files');
}

main().catch(console.error);