import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function run(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  return result.stdout;
}

function databases() {
  const output = run(['d1', 'list', '--json'], true);
  try { return JSON.parse(output); }
  catch {
    const start = output.search(/^\s*\[/m);
    if (start < 0) throw new Error('Wrangler did not return a database list.');
    return JSON.parse(output.slice(start));
  }
}

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const name = config.d1_databases[0].database_name;
let database = databases().find(row => row.name === name);
if (!database) {
  run(['d1', 'create', name]);
  database = databases().find(row => row.name === name);
}
if (!database?.uuid) throw new Error('Could not find the Vikings database.');
config.d1_databases[0].database_id = database.uuid;
writeFileSync('wrangler.deploy.json', JSON.stringify(config, null, 2) + '\n');
try {
  run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.deploy.json']);
  run(['deploy', '--config', 'wrangler.deploy.json']);
} finally { rmSync('wrangler.deploy.json', { force: true }); }
