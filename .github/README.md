# Kingshot, Demystified

[**dey.ci**](https://dey.ci) is a community-built field guide for **KingShot**. It turns event mechanics, battle reports, and progression costs into guides and calculators that are useful while you are actually playing.

The site is written for alliance members who want to make better calls: which event is next, how to fill a Bear Hunt rally, where a gear upgrade gives the most value, and what to save for.

## What is here

### Event guides

| Guide | Covers |
| --- | --- |
| [Event Cycle](https://dey.ci/events/) | The 28-day event cycle, daily priorities, and what to bank ahead of time. |
| [Bear Hunt](https://dey.ci/bear-hunt/) | Rally leads, joiner skills, troop splits, marches, timing, rewards, and the damage model. |
| [Vikings Vengeance](https://dey.ci/vikings-vengeance/) | Waves, town reinforcements, alliance coordination, and scoring. |
| [Swordland Showdown](https://dey.ci/swordland-showdown/) | Personal and alliance scoring, battlefield objectives, and match preparation. |

### Calculators and planners

| Tool | Use it for |
| --- | --- |
| [Battle Simulator](https://dey.ci/battle-simulator/) | Compare marches and inspect the mechanics behind a result. |
| [Hero Gear Planner](https://dey.ci/hero-gear/) | Plan enhancements, mastery, ascension, and resource spending across your gear. |
| [VIP Calculator](https://dey.ci/vip-calculator/) | Work out the XP needed to reach your next VIP target. |

## The approach

Game claims should be explainable. The site separates known mechanics, community-tested models, and assumptions that still need in-game confirmation.

The Bear Hunt guide and simulator use a documented damage model. Read [MATHS.md](../MATHS.md) for the equations and [KINGSHOT-SOURCES.md](../KINGSHOT-SOURCES.md) for the research trail. The Hero Gear planner's costs and its implementation notes live in [HERO-GEAR-SOURCES.md](../HERO-GEAR-SOURCES.md).

Figures tied to a particular server, alliance, or account are examples. The underlying rules and calculators are intended to transfer.

## Development

This is a static site with plain HTML, CSS, and JavaScript, built with [Eleventy](https://www.11ty.dev/) (Liquid templates) and published to GitHub Pages by the **Pages** workflow on every push to `main`.

Install Node 22 or later, then run:

```sh
npm ci
npm run serve
```

Open [http://localhost:8080](http://localhost:8080). To build without running the server:

```sh
npm run build
```

The generated site is written to `../_site/`. Each page loads two minified bundles: `js/site.bundle.js`, which every page shares, and `js/page-<page>.bundle.js`. `npm run debug` serves the site with every classic script loaded on its own instead, which is easier to step through. [`.eleventy/bundles.mjs`](../.eleventy/bundles.mjs) explains how they are built.

### Scripts and modules

The scripts are moving from classic scripts that share globals (`window.BH`, `window.HeroGear` …) to ES modules, one slice at a time:

- A module ends in `.mjs`, imports what it needs, and lists its exports. Pages still name it in `_data/pages.json`, and the build bundles a page's modules together.
- While classic scripts still read a module's old global, `_data/boot.json` `globals` names it, and the module also exports one object as `'module.exports'`. That object is what the global holds and what `require()` returns to the `.dsh` checks. Drop both once nothing reads the global.
- A module never reads a classic script's global while it loads, so it can run where the page's first module is listed.
- A module imports the `_data` file it needs (`import data from '../_data/pets.json' with { type: 'json' }`), which is what Node reads. A page that already holds that data as a global, from a data script such as `js/pet-data.js`, must list that script before its first module; the build then reads the global instead, so the data is not loaded twice. `_data/boot.json` `data` names each data file's script and global, and the build stops with the page's name if a data script comes too late.
- Modules in the site bundle (`js/player-ledger.mjs`) are read through their global by the page's own modules, so there is one ledger on the page.
- A worker written as a module (`js/*-worker.mjs`) is bundled into the classic worker script the page starts (`js/*-worker.js`).

Modules so far: the player ledger (`js/player-ledger.mjs`); the battle, combat, hero gear and lead engines (`js/battle-engine.mjs`, `js/combat.mjs`, `js/hero-gear-engine.mjs`, `js/lead-engine.mjs`); the lead finder's inputs and account (`js/lead-inputs.mjs`, `js/lead-account.mjs`); the event rules and Governor gear (`js/event-rules.mjs`, `js/governor-engine.mjs`); the spend engines (`js/building-spend.mjs`, `js/hero-spend.mjs`, `js/master-spend.mjs`, `js/troop-spend.mjs`, `js/pet-plan.mjs`); the Town Centre and upgrade engines (`js/town-centre-engine.mjs`, `js/upgrade-goals.mjs`, `js/upgrade-priority.mjs`, `js/upgrade-savings.mjs`); the Bear Hunt allocator and plan (`js/bear-allocator.mjs`, `js/bear-hunt-plan.mjs`); and `js/hero-directory-engine.mjs`, `js/hero-gear-view.mjs`, `js/island-model.mjs`, `js/pet-care.mjs` `js/vikings-engine.mjs` (which the Vikings API imports too) and the VIP ladder (`js/vip-ladder.mjs`). Each has a default export, the same object as `'module.exports'`.

### Pages declared in markup (Alpine)

Pages are moving to [Alpine.js](https://alpinejs.dev/), one at a time: the page's template declares its view with `x-data`, `x-text`, `x-model` and the rest, and a small controller in `js/pages/` holds its state. So far: the VIP calculator, the Swordland calculator, the Vikings guide's wave map, Castle Battle, the KvK points on Heroes and Masters, the Event Cycle page (its clock, today's card and available points), Bear Hunt and the lead finder, the Vikings planner, the Island (its canvas board stays a widget in `js/island-board.mjs`), and the battle simulator.

- A controller registers its state with `Alpine.data` (or `shared` from `js/alpine.mjs`, for one state bound in several places) and calls the engines for the maths. It holds no DOM code, apart from a bridge to a shared widget that is still built in script.
- Expressions in attributes stay short: a field, or one call. Anything longer is a getter in the controller.
- `$store.i18n` changes on a language switch and `$store.ledger` holds the player ledger's latest snapshot. Static copy stays on `data-i18n`; only text that depends on state is bound, never on a node that also carries `data-i18n`.
- `js/alpine.mjs` starts Alpine when common.js boots the page. It is in the site bundle, so every page shares one cached copy.

### Repository layout

| Path | Purpose |
| --- | --- |
| `_data/` | Page metadata, the site navigation, and the scripts every page runs (`boot.json`). |
| `_includes/`, `_layouts/` | Shared page chrome (Liquid). |
| `eleventy.config.mjs`, `../.eleventy/` | The build: which files are published, the Liquid dialect, and the script bundles. |
| `bear-hunt/`, `vikings-vengeance/`, `swordland-showdown/`, `events/` | Event guide pages. |
| `battle-simulator/`, `hero-gear/`, `vip-calculator/` | Interactive tools. |
| `css/`, `js/` | Shared and page-specific client assets. |
| `i18n/` | English source copy and 16 client-side translations. |
| `../.dsh/` | Site validation and visual-check scripts. |

## Checks

The **Site check** GitHub Actions workflow runs JavaScript syntax checks, validates JSON data, builds the site, and runs calculator and browser checks. **Visual preview** is a manual workflow that captures the pages for review.

Before opening a pull request, run the relevant checks for the page or tool you changed. For example:

```sh
node ../.dsh/bear-allocator-check.cjs
node ../.dsh/hero-gear-check.cjs
npm run build
```

## Translations

English is the source language. Text is translated client-side into 16 additional languages; see [i18n/README.md](../i18n/README.md) before changing copy. Keep translation keys, markup, numbers, formulas, and game names consistent across dictionaries.

## Contributing

Issues and pull requests are welcome for corrections, missing sources, reproducible in-game evidence, and improvements to the guides or tools. Include the event, game version where relevant, and screenshots or battle reports when they support a gameplay claim.
