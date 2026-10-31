#!/usr/bin/env python3
"""Write _data/combat.json from the KingShot Battle Helper's game data.

Usage: python3 .dsh/build-combat.py [path/to/research/ksbattlehelp]

The research folder in the project files holds a copy of the files this reads from
Absy's KingShot Battle Helper (github.com/Absyyyyyyy/ksbattlehelp_public, MIT), pinned
to the commit named in COMMIT. Its testers check values in game where they can. The
Python is parsed, never run. Where the site already publishes a value from another
source (hero ceilings, battle-pet ladders, widget roles, troop base stats up to TG5)
the build checks the two agree and stops if they do not, so combat.json never
contradicts the rest of _data. Values only this source has are kept, and the few it
gives without any stated basis are listed under `unverified`."""
import ast, json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/research/ksbattlehelp')
SITE = Path(__file__).resolve().parent.parent
OUT = SITE / '_data' / 'combat.json'
SRC = ROOT / 'kingshot_sim'
TROOP = {'Inf': 'inf', 'Cav': 'cav', 'Arc': 'arc', 'INFANTRY': 'inf', 'CAVALRY': 'cav', 'ARCHER': 'arc'}
SETS = {'ALL_SQ': ['inf', 'cav', 'arc'], 'INF_ARC': ['inf', 'arc'], 'INF_ONLY': ['inf'],
        'CAV_ONLY': ['cav'], 'ARC_ONLY': ['arc']}
EFFECT = {'Atk': 'attack', 'Let': 'lethality', 'HP': 'health', 'Def': 'defense'}

heroes = json.loads((SITE / '_data' / 'heroes.json').read_text())['heroes']
pets = {p['id']: p for p in json.loads((SITE / '_data' / 'pets.json').read_text())['pets']}
key_of = {h['name']: h['key'] for h in heroes}


def module(path):
    return ast.parse((SRC / path).read_text())


def literal(node):
    """ast.literal_eval, plus dict(key=value) calls, which reference.py uses for its tier table."""
    if isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'dict' and not node.args:
        return {k.arg: literal(k.value) for k in node.keywords}
    if isinstance(node, ast.Dict):
        return {literal(k): literal(v) for k, v in zip(node.keys, node.values)}
    return ast.literal_eval(node)


def constants(tree):
    out = {}
    for node in tree.body:
        target = node.targets[0] if isinstance(node, ast.Assign) else node.target if isinstance(node, ast.AnnAssign) else None
        if isinstance(target, ast.Name) and node.value is not None:
            try:
                out[target.id] = literal(node.value)
            except ValueError:
                if isinstance(node.value, ast.Name) and node.value.id in out:
                    out[target.id] = out[node.value.id]
    return out


def check(ok, what):
    if not ok:
        sys.exit('combat: %s disagrees with the site' % what)


ref = constants(module('data/reference.py'))
skills = constants(module('data/troop_skills.py'))
buffs = constants(module('config/buffs.py'))
labels = constants(module('webui/tabs/skillmod.py'))
economy = constants(module('benchmark/economy.py'))
enums = (SRC / 'domain/enums.py').read_text()
catalog_tree = module('data/catalog.py')
catalog = constants(catalog_tree)

# Skill codes. The labels come from the helper's SkillMod tab, the families from its
# enums; resolver.py adds codes of one kind before multiplying across kinds.
families = dict(re.findall(r'(\d{3}): Family\.(\w+)', enums))
family_id = {'DAMAGE_UP': 'damageUp', 'DEFENSE_UP': 'defenseUp', 'OPP_DAMAGE_DOWN': 'enemyDamageDown', 'OPP_DEFENSE_DOWN': 'enemyDefenseDown'}
op_labels = next(v for v in labels.values() if isinstance(v, dict) and 101 in v and v[101] == 'Lethality up')
codes = [{'code': c, 'label': op_labels[c], 'family': family_id[families[str(c)]]} for c in sorted(op_labels)]

# Hero ceilings must match heroes.json to the hundredth.
for name, ceiling in ref['HERO_LEADER_MAX'].items():
    hero = next((h for h in heroes if h['name'] == name), None)
    check(hero and abs(hero['ceiling'] - ceiling) < 0.01, 'ceiling for %s' % name)

# Troop stats. Base stats for TG0 to TG5 are already on the site (js/battle-engine.js,
# from sos.battle); the helper's TG multipliers reproduce them, and extend to TG8.
engine = (SITE / 'js' / 'battle-engine.js').read_text()
inf_atk = [int(n) for n in re.search(r'var ATK = \[\s*\[([\d,\s]+)\]', engine).group(1).split(',')]
for tier in range(1, 12):
    base = ref['TIER_BASE_STATS']['T%d' % tier]['inf_atk']
    check(inf_atk[(tier - 1) * 6] == base, 'T%d infantry attack' % tier)
    for tg in range(1, 6):
        check(abs(inf_atk[(tier - 1) * 6 + tg] - base * ref['TG_MULTIPLIERS'][tg]) <= 1, 'T%d TG%d infantry attack' % (tier, tg))

# Battle pets: the helper's ladders must be the in-game ladders pets.json carries.
PET_LAYER = [('giant-rhino', 'RHINO_LEVEL_PCT', 'attack', 'own'), ('regal-white-lion', 'LION_LEVEL_PCT', 'defense', 'own'),
             ('alpha-black-panther', 'PANTHER_LEVEL_PCT', 'lethality', 'own'), ('ironclad-war-elephant', 'ELEPHANT_LEVEL_PCT', 'health', 'own'),
             ('grizzly-bear', 'GRIZZLY_LEVEL_PCT', 'lethality', 'enemy'), ('moose', 'MOOSE_LEVEL_PCT', 'health', 'enemy')]
for pet_id, const, _, side in PET_LAYER:
    ladder = next(l for l in pets[pet_id]['skill']['ladder'] if l['label'].lower().find('speed') < 0)
    published = [float(v.rstrip('%')) for v in ladder['values']]
    ours = [v for k, v in sorted(buffs[const].items()) if k]
    check(published == ours, '%s ladder' % pet_id)

# Widgets: role and stat agree with heroes.json, name and max come from the helper.
widgets = {}
for name, widget in ref['HERO_WIDGET'].items():
    role, code, stat = catalog['WIDGET_SKILL_SPEC'][widget]
    hero = next(h for h in heroes if h['name'] == name)
    check(hero['widget'] and hero['widget']['role'] == role and hero['widget']['effect'] == EFFECT[stat], 'widget for %s' % name)
    widgets[key_of[name]] = {'name': widget, 'maxPct': ref['WIDGET_MAX'][widget], 'skill': {'role': role, 'code': code}}


# Hero skills, read from the helper's catalog without running it.
def num(node):
    """A literal, or the max of _scale(v, s)/_scale_chance(p, s), with whether it scales."""
    if isinstance(node, ast.Call) and getattr(node.func, 'id', '') in ('_scale', '_scale_chance'):
        return ast.literal_eval(node.args[0]), True
    return ast.literal_eval(node), False


def squads(node):
    if isinstance(node, ast.Name):
        return SETS[node.id]
    return sorted({TROOP[e.attr] for e in node.args[0].elts}, key=['inf', 'cav', 'arc'].index)


def trigger(call):
    kind = call.func.attr
    out = {'kind': {'passive': 'passive', 'rng_round': 'perRound', 'rng_attack': 'perAttack', 'periodic': 'everyN', 'pity': 'pity'}[kind]}
    args = {k.arg: k.value for k in call.keywords}
    for k, v in zip(['p'] if kind != 'pity' else ['base_chance'], call.args):
        args[k] = v
    if 'p' in args or 'base_chance' in args:
        value, scales = num(args.get('p') or args['base_chance'])
        out['chance'] = value
        if scales:
            out['chanceScales'] = True
    for k, name in (('period', 'every'), ('offset', 'offset'), ('duration', 'turns')):
        if k in args:
            out[name] = ast.literal_eval(args[k])
    return out


def effect(call):
    value, scales = num(call.args[1])
    out = {'code': ast.literal_eval(call.args[0]), 'pct': value}
    if not scales:
        out['fixed'] = True
    kw = {k.arg: k.value for k in call.keywords}
    if 'target_squads' in kw:
        out['troops'] = squads(kw['target_squads'])
    if 'target_enemy_squads' in kw:
        out['vs'] = squads(kw['target_enemy_squads'])
    return out


hero_skills = {}
for fn in (n for n in catalog_tree.body if isinstance(n, ast.FunctionDef) and n.name in ('_mythic_skills', '_epic_skills')):
    for branch in ast.walk(fn):
        if not (isinstance(branch, ast.If) and isinstance(branch.test, ast.Compare) and isinstance(branch.test.comparators[0], ast.Constant)):
            continue
        name = branch.test.comparators[0].value
        rows = []
        for stmt in branch.body:
            for call in ast.walk(stmt):
                if isinstance(call, ast.Call) and getattr(call.func, 'id', '') == 'Skill':
                    kw = {k.arg: k.value for k in call.keywords}
                    row = {'slot': ast.literal_eval(kw['slot']), 'name': ast.literal_eval(call.args[0]),
                           'trigger': trigger(call.args[1]),
                           'effects': [effect(e) for e in call.args[2].elts if ast.literal_eval(e.args[0]) != 0]}
                    if 'special' in kw:
                        row['special'] = {'TARGET_DEBUFF_ON_HIT': 'debuffTargetOnHit', 'PITY_PROC': 'pity', 'DODGE': 'dodge',
                                          'CONDITIONAL_TERROR': 'vsTerror', 'APPLY_TERROR_ON_HIT': 'terrorOnHit'}[kw['special'].attr]
                        if row['special'] == 'dodge':
                            row['dodgePct'] = num(call.args[2].elts[0].args[1])[0]
                    if not row['effects'] and 'dodgePct' not in row:
                        row['combat'] = False
                    rows.append(row)
        if rows:
            hero_skills[key_of[name]] = rows
check(set(hero_skills) | {'diana'} >= {key_of[n] for n in ref['HERO_CLASS']}, 'hero skill list')

# Every value that scales with skill level must be the in-game top level heroes.json
# carries for that slot. The skill keeps the site's name; the helper's has typos.
for key, rows in hero_skills.items():
    published = next(h for h in heroes if h['key'] == key)['skills']
    for row in rows:
        skill = published[int(row['slot'][2]) - 1]
        top = {float(s['levels'][-1].rstrip('%')) for s in skill['scales'] if s['levels'][-1].rstrip('%').replace('.', '').isdigit()}
        scaled = [e['pct'] for e in row['effects'] if not e.get('fixed')] + [row.get('dodgePct')] * ('dodgePct' in row)
        if row['trigger'].get('chanceScales'):
            scaled.append(round(row['trigger']['chance'] * 100, 2))
        check(all(v in top for v in scaled), '%s %s value' % (key, row['slot']))
        row['name'] = skill['name']

tg = {
    'tg3': {'inf': {'chance': skills['_TG3_INF_PROC'], 'damageTakenDownPct': skills['_TG3_INF_RED'] * 100},
            'cav': {'chance': skills['_TG3_CAV_PROC'], 'damageUpPct': skills['_TG3_CAV_BONUS'] * 100},
            'arc': {'chance': skills['_TG3_ARC_PROC'], 'damageUpPct': skills['_TG3_ARC_BONUS'] * 100}},
    'tg5': {'inf': {'chance': skills['_TG5_INF_PROC'], 'damageTakenDownPct': skills['_TG5_INF_RED'] * 100},
            'cav': {'chance': skills['_TG5_CAV_PROC'], 'damageUpPct': skills['_TG5_CAV_BONUS'] * 100},
            'arc': {'chance': skills['_TG5_ARC_PROC'], 'damageUpPct': skills['_TG5_ARC_BONUS'] * 100}},
    'tg8': {'inf': {'extraDamageTakenDownPct': skills['_TG8_INF_EXTRA_RED'] * 100, 'defensePct': skills['TG8_INF_DEF_PCT_BONUS']},
            'cav': {'chance': skills['_TG8_CAV_DEF_PROC'], 'damageTakenDownPct': skills['_TG8_CAV_DEF_RED'] * 100},
            'arc': {'extraDamageUpPct': skills['_TG8_ARC_EXTRA_BONUS'] * 100, 'attackPct': skills['TG8_ARC_ATK_PCT_BONUS']}},
}

data = {
    'checkedAt': '2026-10-31',
    'note': 'How battle buffs stack, and the combat values the rest of _data does not carry. Read from the KingShot Battle Helper, whose testers check values in game where they can. Values the site already publishes from other sources were checked against it before this was written; unverified lists the ones the helper gives with no stated basis. Generated by .dsh/build-combat.py.',
    'source': {'label': 'KingShot Battle Helper', 'author': 'Absy', 'url': 'https://github.com/Absyyyyyyy/ksbattlehelp_public',
               'commit': (ROOT / 'COMMIT').read_text().strip(), 'licence': 'MIT', 'site': 'https://absy-simulator.streamlit.app/'},
    'codes': codes,
    'stacking': {
        'sameCode': 'add',
        'acrossCodes': 'multiply',
        'hit': '(damageUp × enemyDefenseDown) ÷ (target defenseUp × target enemyDamageDown), each family the product of (1 + sum of one code / 100)',
        'enemyDamageDown': 'divides the attacker by (1 + pct / 100) rather than multiplying by (1 − pct / 100)',
    },
    'layers': {
        'order': ['city', 'pet', 'turret', 'report'],
        'rule': 'Each layer is its own factor (1 + (own − enemy down in the same layer) / 100); the layers multiply. An enemy debuff only cancels a buff in its own layer: +20% against −20% is ×1.00, not ×0.96 (kingshotsim.com/stat-bonuses, marked probable).',
        'city': {'levelsPct': [0, 10, 20], 'stats': ['attack', 'defense', 'lethality', 'health'], 'enemyDown': ['attack', 'defense']},
        'pet': [{'pet': pet_id, 'stat': stat, 'side': side} for pet_id, _, stat, side in PET_LAYER],
        'turret': {'stat': 'lethality', 'byCountPct': [v for _, v in sorted(buffs['TURRET_LEVEL_PCT'].items())]},
    },
    'appointments': {
        'rule': 'Added into the visible stat totals, not a separate layer (kingshotsim.com/stat-bonuses).',
        'king': {'allPct': buffs['APPOINT_KING_PCT']},
        'marshal': {'attackPct': buffs['APPOINT_MARSHAL_ATK_PCT']},
        'fieldCommander': {'lethalityPct': 10.0, 'afterKvkWinPct': buffs['APPOINT_FIELD_COMMANDER_LET_PCT'],
                           'note': '+10% normally; +15% from a won KvK until Castle Battle (owner, 31 Oct). The helper only carries the 15.'},
    },
    'troopSkills': tg,
    'tgStatMultiplier': {str(k): v for k, v in sorted(ref['TG_MULTIPLIERS'].items())},
    'widgets': widgets,
    'widgetSkill': {'maxPct': ref['WIDGET_SKILL_MAX_PCT'], 'byLevel': [ref['WIDGET_SKILL_MULTIPLIER'][l] for l in range(11)]},
    'heroSkills': hero_skills,
    'starShards': [v for _, v in sorted(economy['STAR_SHARD_CUMULATIVE'].items())],
    'unverified': [
        'tgStatMultiplier 6 to 8: TG1 to TG5 reproduce the sos.battle stats; TG6 to TG8 continue at about 5% a step with no stated source.',
        'troopSkills: the helper has no in-game skill text for its Truegold chances.',
        'turret: single source.',
        'layers.rule is marked probable by its authors. For pets, turrets and consumables it replaces the divide-by rule in KINGSHOT-SOURCES.md (owner, 31 Oct).',
        'codes are marked probable by their authors: a few were matched by testing, not read from the game, and 211 for Vivian is by symmetry.',
        'codes are the helper\'s KingShot numbering, read from its report peeling. They are not the State of Survival effect ids in KINGSHOT-SOURCES.md, which reuse some of the same numbers for other effects.',
        'pet: the helper has no Ironclad War Bear (enemy defense down), so its layer is not placed.',
    ],
}
OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
print('wrote', OUT.relative_to(SITE), '-', len(widgets), 'widgets,', len(hero_skills), 'heroes,', len(codes), 'codes')
