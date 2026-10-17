#!/usr/bin/env python3
"""Write _data/pets.json from the progression research draft.

Usage: python3 .dsh/build-pets.py [path/to/research/progression]

The draft (research/progression/data/pets.json in the project files) holds the fourteen
pets and the five cost profiles they share, compared between Kingshot Optimizer, Kingshot
Data and KS h5joy. The profiles agree on every row but three cells, where the two sources
that agree win (see research/progression/pets.md). Ironclad War Bear has no KS h5joy page.

Left out on purpose: the passive attack and defence bonus (KS h5joy only; it needs an
in-game check first) and refinement (the guides disagree on the tiers and no source gives
roll odds). The pages only need the levels, their prices, the Advances and the skills."""
import json, sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/research/progression')
OUT = Path(__file__).resolve().parent.parent / '_data' / 'pets.json'
# Kingshot Data's unlock days, about, by generation.
UNLOCK = {1: 55, 2: 80, 3: 110, 4: 190, 5: 270, 6: 350, 7: 440}
KEYS = ['growthManual', 'nutrientPotion', 'promotionMedallion']

draft = json.loads((ROOT / 'data' / 'pets.json').read_text())
profiles = {}
for key, profile in draft['profiles'].items():
    levels = []
    for row in profile['levels']:
        advance = row['advance'] and {k: row['advance'][k] for k in KEYS}
        levels.append({'level': row['level'], 'petFood': row['petFood'], 'advance': advance, 'score': row['advancementScore']})
    assert [l['level'] for l in levels] == list(range(1, profile['maxLevel'] + 1)), key
    assert all((l['advance'] is not None) == (l['level'] % 10 == 0) for l in levels), key
    totals = {'petFood': sum(l['petFood'] for l in levels)}
    for k in KEYS:
        totals[k] = sum(l['advance'][k] for l in levels if l['advance'])
    profiles[key] = {'maxLevel': profile['maxLevel'], 'initialGrowthManual': profile.get('initialGrowthManual', 0), 'totals': totals, 'levels': levels}

# The research tables, spot-checked: level 1 to max.
assert profiles['gen1_50']['totals'] == {'petFood': 28865, 'growthManual': 240, 'nutrientPotion': 60, 'promotionMedallion': 10}
assert profiles['gen4_100']['totals'] == {'petFood': 834625, 'growthManual': 2990, 'nutrientPotion': 600, 'promotionMedallion': 310}

pets = []
for pet in draft['pets']:
    profile = profiles[pet['costProfile']]
    advances = profile['maxLevel'] // 10
    for ladder in pet['skill']['ladder']:
        assert len(ladder['values']) == advances, (pet['id'], ladder['label'])
    pets.append({
        'id': pet['id'], 'name': pet['name'], 'generation': pet['generation'], 'unlockDay': UNLOCK[pet['generation']],
        'maxLevel': pet['maxLevel'], 'profile': pet['costProfile'], 'advances': advances,
        'skill': {'name': pet['skill']['name'], 'say': pet['skill']['description'],
                  'ladder': [{'label': l['label'], 'values': l['values']} for l in pet['skill']['ladder']]},
        'sources': pet['sources'], 'verified': len(pet['sources']) >= 3,
    })
assert len(pets) == 14

points = {level: draft['eventPointsPerAdvance'][level] for level in sorted(draft['eventPointsPerAdvance'], key=int)}
for level, row in points.items():
    score = profiles['gen4_100']['levels'][int(level) - 1]['score']
    assert row['kvk'] == score * 50 and row['brawl'] == score * 30, level

data = {'checkedAt': draft['checkedAt'], 'sources': draft['sources'],
        'materials': [m for m in draft['materials'] if 'taming' not in m['id']],
        'points': points, 'profiles': profiles, 'pets': pets}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
print('wrote', OUT.relative_to(OUT.parent.parent), len(pets), 'pets')
