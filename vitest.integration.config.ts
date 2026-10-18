import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/database/tests/*.integration.test.ts'], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false } });
