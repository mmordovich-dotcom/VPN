export function resolveApiBaseUrl(input: string | undefined, production: boolean): string {
  const value = input?.trim() || (production ? '' : 'http://127.0.0.1:3000');
  const fail = () => { throw new Error('VITE_API_BASE_URL must be an API origin; production requires a public HTTPS URL without credentials, path or query.'); };
  let url: URL;
  try { url = new URL(value); } catch { return fail(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return fail();
  const host = url.hostname.toLowerCase();
  const privateHost = ['localhost', '[::1]', '[::]', '0.0.0.0', 'host.docker.internal'].includes(host)
    || /\.(localhost|local|internal)$/.test(host)
    || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    || host.startsWith('[') || !host.includes('.');
  if (production && (url.protocol !== 'https:' || privateHost)) return fail();
  return url.origin;
}
