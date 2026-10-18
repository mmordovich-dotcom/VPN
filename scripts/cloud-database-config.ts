export function readMigrationUrl(env: NodeJS.ProcessEnv): string {
  const fail = () => { throw new Error('Set MIGRATION_DATABASE_URL to the direct Neon PostgreSQL URL with SSL enabled.'); };
  const value = env.MIGRATION_DATABASE_URL;
  if (!value) return fail();
  let url: URL;
  try { url = new URL(value); } catch { return fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.hostname.endsWith('.neon.tech') || url.hostname.includes('-pooler.')
    || !url.username || !url.password
    || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) return fail();
  return value;
}
