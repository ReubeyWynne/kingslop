# Kingshot, Demystified

A practical, multilingual reference for KingShot alliance events and progression. Each guide explains how an event works, how its scoring is calculated, and what you can do to prepare.

## Guides

- [Event cycle](https://dey.ci/events/) — the recurring 28-day schedule, what to save, and what to expect.
- [Bear Hunt](https://dey.ci/bear-hunt/) — rally setup, troop allocation, hero choices, timing, and scoring.
- [Vikings Vengeance](https://dey.ci/vikings-vengeance/) — wave strategy, reinforcements, and alliance coordination.
- [Swordland Showdown](https://dey.ci/swordland-showdown/) — match objectives, personal tiers, and preparation.

## Tools

- [Battle simulator](https://dey.ci/battle-simulator/) — compare battle outcomes and march setups.
- [Hero gear planner](https://dey.ci/hero-gear/) — plan upgrade costs and resource use.
- [VIP calculator](https://dey.ci/vip-calculator/) — estimate the experience needed for VIP progression.

## Run locally

The site is built with Jekyll and vanilla JavaScript. With Ruby and Jekyll installed:

```sh
jekyll serve
```

Then open http://localhost:4000. To build without starting a server, run `jekyll build`; the generated site is written to `_site/`.

The GitHub Actions **Site check** workflow validates site data and scripts, builds the site, and runs browser checks. **Visual preview** captures page previews on demand.

## Project notes

- `i18n/` contains the English source dictionary and translations.
- `MATHS.md` documents the formulas used in the guides and tools.
- `KINGSHOT-SOURCES.md`, `HERO-GEAR-SOURCES.md`, and `VIKINGS-MATHS.md` record gameplay research and source material.
- `DESIGN.md` describes the site's design system.
