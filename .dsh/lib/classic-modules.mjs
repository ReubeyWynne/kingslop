// Prints modules bundled as one classic script, the way a page runs them (see classic-modules.cjs).
import fs from 'node:fs';
import path from 'node:path';
import { bundleModules } from '../../.eleventy/bundles.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const boot = JSON.parse(fs.readFileSync(path.join(root, '_data/boot.json'), 'utf8'));
const mods = process.argv.slice(2);
// Every data script counts as already run, so the modules read the data from its global.
const before = Object.values(boot.data || {}).map(entry => entry.script);
process.stdout.write(await bundleModules({ root, boot, mods, before }));
