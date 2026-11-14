import { $ } from '@xec-sh/core';

await $`lumen build`.timeout('10m').stdout('inherit').stderr('inherit');
await $`node scripts/check-routes.js`.timeout('2m').stdout('inherit').stderr('inherit');
