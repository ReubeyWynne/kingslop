#!/usr/bin/env python3
"""Write _data/buildings.json from the progression research draft.

Usage: python3 .dsh/build-buildings.py [path/to/research/progression]

The draft (research/progression/data/buildings.json and sources/buildings_compare.json in
the project files) holds every level from Kingshot Optimizer, Kingshot Data and KS h5joy.
This keeps only the Truegold-era buildings and the Academy their prerequisites name, up
to TG 8, and publishes a cost cell only where a second source agrees with it. Cells only
one site has are listed in the row's `unverified` and left out, so the published table
never rests on one site alone. Levels past TG 8 keep their ids but carry no cost."""
import json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/research/progression')
OUT = Path(__file__).resolve().parent.parent / '_data' / 'buildings.json'
KEEP = ['town-center', 'embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy', 'academy']
NAMES = {'Town Center': 'town-center', 'TC': 'town-center', 'Embassy': 'embassy', 'Barracks': 'barracks', 'Range': 'range', 'Stable': 'stable', 'Command Center': 'command-center', 'Infirmary': 'infirmary', 'War Academy': 'war-academy', 'Academy': 'academy'}
COST = {'bread': 'bread', 'wood': 'wood', 'stone': 'stone', 'iron': 'iron', 'truegold': 'truegold', 'temperedTruegold': 'tempered-truegold'}
TG_ONLY = {'truegold', 'tempered-truegold'}
CELL = {'Bread': 'bread', 'Wood': 'wood', 'Stone': 'stone', 'Iron': 'iron', 'Truegold': 'truegold', 'Tempered Truegold': 'tempered-truegold'}
LAST = 'TG 8'

draft = json.loads((ROOT / 'data' / 'buildings.json').read_text())
compare = json.loads((ROOT / 'sources' / 'buildings_compare.json').read_text())


def level_id(text):
    text = text.strip()
    m = re.fullmatch(r'TG ?(\d+)', text)
    return 'TG ' + m.group(1) if m else text


def requirement(text):
    """'Embassy Lv. 29', 'Stable TG 7', 'TC TG 1' -> {building, level}; other buildings are dropped."""
    m = re.fullmatch(r'(.+?) (?:Lv\. )?(\d+(?:-\d)?|TG ?\d+(?:-\d)?)', text.strip())
    if not m or m.group(1) not in NAMES:
        return None
    return {'building': NAMES[m.group(1)], 'level': level_id(m.group(2))}


def disputed(building, level):
    """Cost cells Kingshot Data reports differently from the optimizer."""
    out = set()
    report = compare.get(building)
    for row in report['issues'] if isinstance(report, dict) else []:
        if level_id(row[0]) == level and row[1] in CELL:
            out.add(CELL[row[1]])
    return out


buildings = []
for b in draft['buildings']:
    if b['id'] not in KEEP:
        continue
    levels, past = [], False
    for row in b['levels']:
        lid = level_id(row['level'])
        requires = [r for r in (requirement(x) for x in row['requires']) if r]
        tc = row['tcRequired']
        if isinstance(tc, int):
            requires.append({'building': 'town-center', 'level': str(tc)})
        elif isinstance(tc, str):
            requires += [r for r in (requirement(x) for x in tc.split(',')) if r]
        entry = {'id': lid}
        if past:
            levels.append(entry)
            continue
        sources = set(row['sources'])
        cost = {COST[k]: v for k, v in row['cost'].items()}
        report = compare.get(b['id'])
        compared = isinstance(report, dict) and report['compared'] > 0 and lid not in [level_id(x) for x in report['opt_only']]
        if compared:
            # Kingshot Data read this row; only the cells it reports differently are in doubt,
            # and KS h5joy settles a Truegold cell when it agrees with the optimizer.
            confirmed = set(cost) - disputed(b['id'], lid)
            if 'h5joy' in sources:
                confirmed |= set(cost) & TG_ONLY
        elif 'h5joy' in sources:
            confirmed = set(cost) & TG_ONLY
        else:
            confirmed = set()
        entry['cost'] = {k: cost[k] for k in COST.values() if k in confirmed}
        unverified = [k for k in COST.values() if k in cost and k not in confirmed]
        # Range and Stable level 1 Wood: the optimizer has 95, Kingshot Data a blank.
        for cell in disputed(b['id'], lid):
            if cell not in cost and cell not in unverified:
                unverified.append(cell)
        if unverified:
            entry['unverified'] = unverified
        if requires:
            entry['requires'] = requires
        entry['sources'] = sorted(sources)
        levels.append(entry)
        if lid == LAST:
            past = True
    buildings.append({'id': b['id'], 'name': b['name'], 'levels': levels})

buildings.sort(key=lambda b: KEEP.index(b['id']))
out = {
    'checkedAt': draft['checkedAt'],
    'note': 'Truegold-era buildings and the Academy. cost is the price of that one step, published only where two sources agree; unverified lists cost cells only one site has. Levels past TG 8 carry no cost. requires lists the prerequisites among these buildings, with the Town Centre level each step needs. Generated by .dsh/build-buildings.py.',
    'sources': {k: {'label': v['label'], 'url': v['url']} for k, v in draft['sources'].items()},
    'buildings': buildings,
}
OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print('wrote', OUT, sum(len(b['levels']) for b in buildings), 'levels')


# _data/building_paths.json: every building's whole level path for the Building requirements
# page. Unlike the planner table above it keeps every prerequisite, every building and every
# level, so it can answer "what does Town Center 3 need?" (House 1 at 2). A cell one source
# alone gives is still shown, named in the row's `unverified`, and the page marks it.
PATHS = Path(__file__).resolve().parent.parent / '_data' / 'building_paths.json'
ORDER = ['town-center', 'embassy', 'barracks', 'range', 'stable', 'command-center', 'infirmary', 'war-academy', 'academy',
         'storehouse', 'guard-station', 'sawmill', 'mill', 'quarry', 'iron-mine', 'house', 'kitchen', 'clinic', 'defense-tower', 'barricade']
# Buildings a prerequisite names that have no levels of their own: they only need building.
SINGLE = {'Hero Hall': 'hero-hall', 'Watchtower': 'watchtower'}
ALL = {b['name']: b['id'] for b in draft['buildings']}
ALL['TC'] = 'town-center'


def seconds(text):
    if text is None or text == '-':
        return None
    if isinstance(text, (int, float)):
        return int(text)
    m = re.fullmatch(r'(\d+):(\d+):(\d+)', text)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    total = 0
    for n, unit in re.findall(r'(\d+)\s*([dhms])', text):
        total += int(n) * {'d': 86400, 'h': 3600, 'm': 60, 's': 1}[unit]
    return total


def need(text):
    """'House 1 Lv. 2' -> ['house', '2', 1]; 'Embassy TG 1' -> ['embassy', 'TG 1']; 'Hero Hall' -> ['hero-hall']."""
    text = text.strip()
    if text in SINGLE:
        return [SINGLE[text]]
    m = re.fullmatch(r'(.+?)(?: (\d))? (?:Lv\. )?(\d+(?:-\d)?|TG ?\d+(?:-\d)?)', text)
    if not m or m.group(1) not in ALL:
        raise SystemExit('unknown prerequisite: ' + text)
    out = [ALL[m.group(1)], level_id(m.group(3))]
    if m.group(2):
        out.append(int(m.group(2)))
    return out


paths = []
for b in sorted((b for b in draft['buildings'] if b['id'] in ORDER), key=lambda b: ORDER.index(b['id'])):
    report = compare.get(b['id'])
    report = report if isinstance(report, dict) and report['compared'] > 0 else None
    times = {}
    for row in report['issues'] if report else []:
        if row[1] == 'time':
            times[level_id(row[0])] = (seconds(row[2]), seconds(row[3]))
    levels = []
    for row in b['levels']:
        lid = level_id(row['level'])
        sources = set(row['sources'])
        compared = report is not None and lid not in [level_id(x) for x in report['opt_only']]
        cost = {COST[k]: v for k, v in row['cost'].items() if v}
        if compared:
            confirmed = set(cost) - disputed(b['id'], lid)
            if 'h5joy' in sources:
                confirmed |= set(cost) & TG_ONLY
        elif 'h5joy' in sources:
            confirmed = set(cost) & TG_ONLY
        else:
            confirmed = set()
        unverified = [k for k in COST.values() if k in cost and k not in confirmed]
        for cell in disputed(b['id'], lid):
            if cell not in cost and cell not in unverified:
                unverified.append(cell)
        # Kingshot Data's times differ from the optimizer's only by rounding, except where named.
        opt, kd = times.get(lid, (None, None))
        if not compared or (opt is not None and kd is not None and abs(opt - kd) > 60):
            unverified.append('time')
        needs = [need(x) for x in row['requires']]
        tc = row['tcRequired']
        if isinstance(tc, int) and tc > 1:
            needs.insert(0, ['town-center', str(tc)])
        elif isinstance(tc, str):
            needs = [need(x) for x in tc.split(',')] + needs
        entry = {'id': lid}
        if needs:
            entry['needs'] = needs
        entry['cost'] = {k: cost[k] for k in COST.values() if k in cost}
        entry['time'] = row['timeSeconds']
        if unverified:
            entry['unverified'] = unverified
        entry['sources'] = sorted(sources)
        levels.append(entry)
    paths.append({'id': b['id'], 'name': b['name'], 'levels': levels})

PATHS.write_text(json.dumps({
    'checkedAt': draft['checkedAt'],
    'note': 'Every level of every upgradable building: needs lists [building, level] (and a House or other numbered copy as a third item; a single-level building such as the Hero Hall has no level), cost is that one step, time its base seconds before any speed. unverified names the cells only one source gives (the page marks them); levels past TG 8 are Kingshot Optimizer only. Generated by .dsh/build-buildings.py.',
    'sources': {k: {'label': v['label'], 'url': v['url']} for k, v in draft['sources'].items()},
    'single': sorted(SINGLE.values()),
    'buildings': paths,
}, ensure_ascii=False, separators=(',', ':')) + '\n')
print('wrote', PATHS, sum(len(b['levels']) for b in paths), 'levels', PATHS.stat().st_size, 'bytes')
