import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    snapshotSerializers: ['vitest-ansi-serializer'],

    // The snapshots record styled output, so colour support must be pinned
    // rather than auto-detected. Without this the suite passes on a
    // developer's TTY and fails wherever stdout is a pipe — CI, a redirected
    // log, any nested runner — with hundreds of snapshot mismatches that say
    // nothing about correctness.
    env: {
      FORCE_COLOR: '1',
    },
  },
});
