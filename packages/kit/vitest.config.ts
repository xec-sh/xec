import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Temporarily disable the serializer until the package is properly installed
    // snapshotSerializers: ['vitest-ansi-serializer'],
  },
});
