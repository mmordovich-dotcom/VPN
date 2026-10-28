import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'axon.spec.mjs', workers: 1, retries: 0, timeout: 45000,
  outputDir: fileURLToPath(new URL('../../ui-results',import.meta.url)),
  reporter: [['list'],['html',{open:'never',outputFolder:fileURLToPath(new URL('../../playwright-report',import.meta.url))}]],
  use: { baseURL:'http://127.0.0.1:4173', headless:true, trace:'retain-on-failure', screenshot:'only-on-failure', viewport:{width:1360,height:950} },
});
