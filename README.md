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

The Bear Hunt guide and simulator use a documented damage model. Read [MATHS.md](MATHS.md) for the equations and [KINGSHOT-SOURCES.md](KINGSHOT-SOURCES.md) for the research trail. The Hero Gear planner's costs and its implementation notes live in [HERO-GEAR-SOURCES.md](HERO-GEAR-SOURCES.md).

Figures tied to a particular server, alliance, or account are examples. The underlying rules and calculators are intended to transfer.

## Development

This is a static [Jekyll](https://jekyllrb.com/) site with plain HTML, CSS, and JavaScript. GitHub Pages builds and publishes the site.

Install Ruby and Jekyll, then run:

```sh
jekyll serve
```

Open [http://localhost:4000](http://localhost:4000). To build without running the server:

```sh
jekyll build
```

The generated site is written to `_site/`.

### Repository layout

| Path | Purpose |
| --- | --- |
| `_data/` | Page metadata and the site navigation. |
| `_includes/`, `_layouts/` | Shared Jekyll page chrome. |
| `bear-hunt/`, `vikings-vengeance/`, `swordland-showdown/`, `events/` | Event guide pages. |
| `battle-simulator/`, `hero-gear/`, `vip-calculator/` | Interactive tools. |
| `css/`, `js/` | Shared and page-specific client assets. |
| `i18n/` | English source copy and 16 client-side translations. |
| `.dsh/` | Site validation and visual-check scripts. |

## Checks

The **Site check** GitHub Actions workflow runs JavaScript syntax checks, validates JSON data, builds the Jekyll site, and runs calculator and browser checks. **Visual preview** is a manual workflow that captures the pages for review.

Before opening a pull request, run the relevant checks for the page or tool you changed. For example:

```sh
node .dsh/bear-allocator-check.cjs
node .dsh/hero-gear-check.cjs
jekyll build
```

## Translations

English is the source language. Text is translated client-side into 16 additional languages; see [i18n/README.md](i18n/README.md) before changing copy. Keep translation keys, markup, numbers, formulas, and game names consistent across dictionaries.

## Contributing

Issues and pull requests are welcome for corrections, missing sources, reproducible in-game evidence, and improvements to the guides or tools. Include the event, game version where relevant, and screenshots or battle reports when they support a gameplay claim.
