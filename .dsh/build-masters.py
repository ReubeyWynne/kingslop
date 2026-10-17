#!/usr/bin/env python3
"""Write _data/masters.json from the progression research draft.

Usage: python3 .dsh/build-masters.py [path/to/research/progression]

The draft (research/progression/data/masters.json in the project files) holds the eight
masters from Kingshot Optimizer, with Kingshot Data compared row by row. Their affinity
ladders, talents and skills agree exactly for the six masters both list; Aena and Isnor
are on Kingshot Optimizer only, so they keep `verified: false` and the pages say so.
Special Research is left out: its emblem cost per research disagrees between the two
sites (25,000 or 14,000 a master), so nothing here rests on it. Power values are dropped;
the pages and the spending plan only need the steps, their prices and their effects."""
import json, sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/research/progression')
OUT = Path(__file__).resolve().parent.parent / '_data' / 'masters.json'
ORDER = ['valora', 'pan', 'roman', 'cassia', 'guinevere', 'wilson', 'aena', 'isnor']
KEEP_SOURCES = ['optimizer', 'kingshotdata']
# When each master's wave reaches a kingdom, in the kingdom timeline's own terms
# (_data/kingdom_progression.json): generation 3 heroes (server day ~113), Truegold 5 (~155),
# generation 4 (~197) and generation 5 (~281).
KINGDOM = {'valora': {'generation': 3}, 'pan': {'generation': 3}, 'roman': {'generation': 3}, 'cassia': {'truegold': 5},
           'guinevere': {'generation': 4}, 'wilson': {'generation': 4}, 'aena': {'generation': 5}, 'isnor': {'generation': 5}}

draft = json.loads((ROOT / 'data' / 'masters.json').read_text())
by_id = {m['id']: m for m in draft['masters']}
assert sorted(by_id) == sorted(ORDER), sorted(by_id)


def number(value):
    return int(value) if float(value).is_integer() else value


def effect_text(stat, value, percent):
    value = number(value)
    return f"{stat} +{value:,}{'%' if percent else ''}" if isinstance(value, int) else f"{stat} +{value}{'%' if percent else ''}"


def effects(rows):
    return [{'stat': e['stat'], 'value': number(e['value']), 'percent': bool(e['percent']), 'text': effect_text(e['stat'], e['value'], e['percent'])} for e in rows]


def requirement(req):
    if not req:
        return None
    if req['kind'] == 'affinity':
        return {'affinity': req['masterLevel']}
    if req['kind'] == 'totalSkillLevel':
        return {'total': req['value']}
    raise ValueError(req)


def master(m):
    unlock = [u['value'] for u in m['unlock'] if u['type'] == 11]
    assert len(unlock) == 1, m['unlock']
    ladder = m['affinity']
    assert [a['level'] for a in ladder] == list(range(101))
    attrs = [s['attr'] for s in ladder[100]['stats']]
    classes = []
    for a in ladder:
        assert [s['attr'] for s in a['stats']] in ([], attrs), (m['id'], a['level'])
        if a['advancement']:
            classes.append({'level': a['level'], 'name': a['advancement']['class'], 'emblems': a['advancement']['emblems']})
    assert [c['level'] for c in classes] == [1] + list(range(10, 101, 10)), classes
    talent = m['talent']['levels']
    assert [t['level'] for t in talent] == list(range(1, 12))
    skills = []
    for s in m['skills']:
        levels = s['levels']
        assert [l['level'] for l in levels] == list(range(1, s['maxLevel'] + 1)), (m['id'], s['name'])
        assert levels[0]['manuscripts'] == 0 and levels[0]['learningXp'] == 0
        skills.append({'name': s['name'], 'max': s['maxLevel'],
                       'manuscripts': sum(l['manuscripts'] for l in levels), 'learningXp': sum(l['learningXp'] for l in levels), 'levels': [
            {'effects': effects(l['effects']), 'manuscripts': l['manuscripts'], 'learningXp': l['learningXp'], 'requires': requirement(l['requirement'])}
            for l in levels]})
        assert skills[-1]['levels'][0]['requires'] and 'affinity' in skills[-1]['levels'][0]['requires']
    return {
        'id': m['id'], 'name': m['name'], 'title': m['title'], 'unlockDay': unlock[0], 'emblem': m['emblem'],
        'focus': m['researchTroopFocus'] or 'all', 'kingdom': KINGDOM[m['id']], 'sources': [s for s in m['sources'] if s in KEEP_SOURCES],
        'verified': len([s for s in m['sources'] if s in KEEP_SOURCES]) >= 2,
        'kindredSoul': [{'stat': b['attr'], 'percent': number(b['percent']), 'text': effect_text(b['attr'], b['percent'], True)} for b in m['maxAffinityBuff']],
        'emblemsToMax': sum(c['emblems'] for c in classes),
        'pointsToMax': sum(a['toNext'] or 0 for a in ladder),
        'affinity': {
            'stats': attrs,
            # toNext[L]: affinity points from level L to L + 1; percent[L]: each stat at level L.
            'toNext': [a['toNext'] for a in ladder],
            'percent': [number(a['stats'][0]['percent']) if a['stats'] else 0 for a in ladder],
            'classes': classes,
        },
        'talent': {'name': m['talent']['name'], 'levels': [effects(t['effects']) for t in talent]},
        'skills': skills,
    }


# Every stat of a level shares one percentage, so one list carries them all.
for m in draft['masters']:
    for a in m['affinity']:
        assert len({s['percent'] for s in a['stats']}) <= 1, (m['id'], a['level'])

out = {
    'checkedAt': draft['checkedAt'],
    'note': ('Affinity ladders, talents and skills where Kingshot Optimizer and Kingshot Data agree; Aena and Isnor are '
             'Kingshot Optimizer only (verified: false). A class costs its emblems when the master reaches its level. '
             'A skill level costs its manuscripts and learning XP and needs its requirement: an affinity level, or a total of '
             "the master's four skill levels. Special Research is left out until its emblem cost is confirmed. "
             'Generated by .dsh/build-masters.py.'),
    'sources': {k: {'label': draft['sources'][k]['label'], 'url': draft['sources'][k]['url']} for k in KEEP_SOURCES},
    'classes': [draft['classes'][str(n)] for n in range(1, 12)],
    'masters': [master(by_id[i]) for i in ORDER],
}
OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print(f'{OUT.relative_to(OUT.parent.parent)}: {len(out["masters"])} masters, {OUT.stat().st_size:,} bytes')
