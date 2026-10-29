import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deploymentConfig } from '../scripts/deployment-config.mjs';
const source = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('preview migrations and runtime use the same staging database and separate rate limits', () => {
  const config = deploymentConfig(source, { name: 'kingslop-vikings-preview', uuid: 'staging-id' }, true);
  assert.equal(config.d1_databases[0].database_name, 'kingslop-vikings-preview');
  assert.equal(config.d1_databases[0].database_id, 'staging-id');
  assert.deepEqual(config.d1_databases, config.previews.d1_databases);
  for (const limit of config.previews.ratelimits) assert(!source.ratelimits.some(prod => prod.namespace_id === limit.namespace_id));
  assert.equal(config.previews.vars.ALLOWED_ORIGINS, source.vars.ALLOWED_ORIGINS);
  assert.equal(source.d1_databases[0].database_name, 'kingslop-vikings');
  assert(!source.previews.d1_databases[0].database_id);
});
test('production deployment resolves only the production binding', () => {
  const config = deploymentConfig(source, { name: 'kingslop-vikings', uuid: 'production-id' });
  assert.equal(config.d1_databases[0].database_id, 'production-id');
  assert.deepEqual(config.previews, source.previews);
});
test('a production database cannot be substituted into a preview deployment', () => {
  assert.throws(() => deploymentConfig(source, { name: 'kingslop-vikings', uuid: 'production-id' }, true), /does not match/);
  const unsafe = structuredClone(source); unsafe.previews.d1_databases[0].database_name = 'kingslop-vikings';
  assert.throws(() => deploymentConfig(unsafe, { name: 'kingslop-vikings', uuid: 'production-id' }, true), /separate database/);
});
