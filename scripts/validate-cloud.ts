import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseDocument } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';

async function json(path: string) { return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8')); }
async function yaml(path: string) {
  const document = parseDocument(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
  assert.equal(document.errors.length, 0, `${path}: YAML parse failed`);
  return document.toJS();
}
const blueprint = await yaml('render.yaml');
const schema = await json('docs/schemas/render.schema.json');
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
interface Service {
  type: string; name: string; runtime: string; branch: string; autoDeployTrigger: string;
  rootDir?: string; preDeployCommand?: string; initialDeployHook?: string;
  buildCommand: string; startCommand?: string; staticPublishPath?: string;
  plan?: string; healthCheckPath?: string;
  envVars: { key: string; sync?: boolean; value?: string }[];
}
assert(ajv.validate<{ services: Service[]; databases?: unknown }>(schema, blueprint), JSON.stringify(ajv.errors));
assert.equal(blueprint.services.length, 2);
assert(!blueprint.databases, 'Use Neon, not a Render database');
const manifest = await json('package.json');
for (const service of blueprint.services) {
  assert.equal(service.type, 'web');
  assert.equal(service.branch, 'main');
  assert.equal(service.autoDeployTrigger, 'checksPass');
  assert(!service.rootDir, 'Workspace dependencies require the repository root');
  assert(!service.preDeployCommand && !service.initialDeployHook);
  for (const match of service.buildCommand.matchAll(/pnpm (?!install)([\w:]+)/g)) {
    const command = match[1]; assert(command); assert(manifest.scripts[command], `Unknown build script: ${command}`);
  }
  for (const variable of service.envVars) {
    if (['DATABASE_URL', 'VITE_API_BASE_URL', 'CORS_ORIGINS'].includes(variable.key)) assert.equal(variable.sync, false);
  }
  if (service.runtime === 'node') {
    assert(service.buildCommand.includes('build:cloud:unified')); assert.equal(service.plan, 'free'); assert.equal(service.healthCheckPath, '/health');
    assert.equal(service.startCommand, 'node apps/api/dist/main.js');
  } else {
    assert.equal(service.runtime, 'static'); assert(!service.plan);
    assert.equal(service.staticPublishPath, 'apps/web/dist');
    assert(!service.envVars.some((item: { key: string }) => /DATABASE|TOKEN|SECRET/.test(item.key)));
  }
}
const verify = await yaml('.github/workflows/verify.yml');
assert('push' in verify.on && 'pull_request' in verify.on && 'workflow_call' in verify.on);
assert(verify.jobs.verify.services.postgres);
assert(!verify.jobs.verify.if && !verify.jobs.verify['continue-on-error']);
const commands = verify.jobs.verify.steps.map((step: { run?: string }) => step.run).filter(Boolean);
for (const command of ['pnpm install --frozen-lockfile', 'pnpm build', 'pnpm typecheck', 'pnpm db:validate', 'pnpm test', 'pnpm test:integration', 'pnpm build:cloud:web', 'pnpm cloud:validate', 'pnpm verify:web-artifact']) assert(commands.includes(command), `CI missing ${command}`);
const migration = await yaml('.github/workflows/cloud-database.yml');
assert.deepEqual(Object.keys(migration.on), ['workflow_dispatch']);
assert.equal(migration.jobs.migrate.needs, 'verify');
assert.equal(migration.jobs.verify.uses, './.github/workflows/verify.yml');
assert(!migration.jobs.migrate.environment, 'Repository secrets avoid paid private-environment dependencies');
assert.equal(migration.concurrency['cancel-in-progress'], false);
assert(String(migration.jobs.migrate.if).includes('default_branch'));
console.log('Render YAML: official JSON Schema valid. Cloud build commands and workflow safety checks passed.');
