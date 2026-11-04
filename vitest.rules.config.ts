import { defineConfig } from 'vitest/config';

// Security-rules tests need the Firestore emulator; run them with `npm run test:rules`.
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    // One shared emulator: files must not clear each other's data.
    fileParallelism: false,
  },
});
