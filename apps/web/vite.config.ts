import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveApiBaseUrl } from './config/api-url.js';
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const env = loadEnv(mode, root, 'VITE_');
  const apiUrl = resolveApiBaseUrl(env.VITE_API_BASE_URL, mode === 'production');
  return { envDir: root, define: { __API_BASE_URL__: JSON.stringify(apiUrl) }, server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } } };
});
