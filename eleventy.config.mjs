/* The site build. Eleventy renders the Liquid pages and data scripts as Jekyll did (same
   _layouts, _includes and _data, same Liquid dialect), copies every other public file as it
   is, and .eleventy/bundles.mjs bundles each page's scripts and modules with esbuild.

   npm run build   → _site/
   npm run serve   → _site/ on a local server, rebuilt on save
   npm run debug   → the same, with every script loaded on its own (no bundles) */
import fs from 'node:fs';
import path from 'node:path';
import { loadSiteData, publicFiles, allFiles, hasFrontMatter } from './.eleventy/site-files.mjs';
import { liquidOptions, filters } from './.eleventy/liquid.mjs';
import { buildScripts } from './.eleventy/bundles.mjs';

const SITE_URL = 'https://dey.ci';

export default function (eleventyConfig) {
  const root = process.cwd();
  const bundle = process.env.SITE_BUNDLE !== '0';

  // Only files with front matter are templates, as in Jekyll; every other public file is
  // copied byte for byte, so a static page that happens to contain "{{" is never rendered.
  const files = publicFiles(root);
  const templates = new Set(files.filter(f => hasFrontMatter(path.join(root, f))));
  for (const f of files) if (!templates.has(f)) eleventyConfig.addPassthroughCopy(f);
  eleventyConfig.setUseGitIgnore(false);
  for (const f of allFiles(root)) {
    if (!/\.(html|liquid)$/.test(f) || templates.has(f)) continue;
    if (f.startsWith('_includes/') || f.startsWith('_layouts/')) continue;
    eleventyConfig.ignores.add(f);
  }

  eleventyConfig.setLiquidOptions(liquidOptions);
  for (const [name, fn] of Object.entries(filters)) eleventyConfig.addFilter(name, fn);

  // `site.data`, `site.time` and `site.url` as the templates have always read them, plus
  // `site.scripts`: the script files each page loads, and `site.lateScripts` the ones it loads
  // after paint for a returning player (see .eleventy/bundles.mjs). Read afresh on every
  // build, so `npm run serve` picks up changes to _data and js/.
  let written = {};
  eleventyConfig.addGlobalData('site', async () => {
    const data = loadSiteData(path.join(root, '_data'));
    const time = new Date();
    const built = await buildScripts({ root, data, bundle, stamp: String(Math.floor(time.getTime() / 1000)) });
    written = built.files;
    return { url: SITE_URL, time, data, scripts: built.scripts, lateScripts: built.late };
  });

  eleventyConfig.on('eleventy.after', ({ directories }) => {
    const out = path.resolve(root, directories.output);
    for (const [file, code] of Object.entries(written)) {
      fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
      fs.writeFileSync(path.join(out, file), code);
    }
  });

  return {
    dir: { input: '.', output: '_site', includes: '_includes', layouts: '_layouts', data: '.eleventy/no-global-data' },
    htmlTemplateEngine: 'liquid',
    templateFormats: ['html', 'liquid']
  };
}
