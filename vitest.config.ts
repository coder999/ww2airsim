import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // Hooks get the same allowance: the furball soak runs in beforeAll and hit
    // the 10 s default under full-suite contention on ryzen (R1 and R2 handoffs;
    // 2.7 s alone), so a heavy setup is not held to a stricter bound than a test.
    hookTimeout: 30_000,
  },
})
