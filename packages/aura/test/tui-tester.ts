import fs from 'fs/promises';
import { createTester, type Snapshot } from "tui-tester";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


async function main() {
  const terexTester = createTester('npx tsx ./test/unicode-width-test.ts', {
    cwd: '/Users/taaliman/projects/xec-sh/xec/packages/aura',
    cols: 120,
    rows: 24,
    shell: '/bin/zsh',
  });

  await terexTester.start();
  await delay(500);

  const terexSnapshot: Snapshot = await terexTester.takeSnapshot(`editor`);
  const terexOutput = terexSnapshot.capture.raw;

  await terexTester.stop();

  // Write detailed logs
  await fs.writeFile(`./editor.log`, terexOutput);

}

main().catch(console.error);