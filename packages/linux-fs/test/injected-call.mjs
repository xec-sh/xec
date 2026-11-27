import { open } from 'node:fs/promises';
import { renameNoReplace } from '@xec-sh/linux-fs';

const directory = await open(process.argv[2], 'r');
try {
  await renameNoReplace(directory, 'staged', 'result');
  throw new Error('Faulted publication unexpectedly acknowledged success');
} catch (error) {
  if (!error.outcome) throw error;
  console.log(JSON.stringify({ outcome: error.outcome, code: error.code }));
} finally { await directory.close(); }
