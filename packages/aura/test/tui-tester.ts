import fs from 'fs/promises';
import { createTester, type Snapshot } from "tui-tester";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


async function main() {
  const terexTester = createTester('npx tsx ./examples/table-demo.ts', {
    cwd: '/Users/taaliman/projects/xec-sh/xec/packages/aura',
    cols: 220,
    rows: 64,
    shell: '/bin/zsh',
  });

  await terexTester.start();

  await terexTester.sendKey('b'); // uncomment to test with b key
  // for (let i = 0; i < 16; i++) {
  //   await terexTester.sendKey('down');
  // }

  await delay(500);

  const terexSnapshot: Snapshot = await terexTester.takeSnapshot(`table-file-browser`);
  const terexOutput = terexSnapshot.capture.raw;

  await terexTester.stop();

  // Write detailed logs
  await fs.writeFile(`./table-file-browser.log`, terexOutput);

}

main().catch(console.error);