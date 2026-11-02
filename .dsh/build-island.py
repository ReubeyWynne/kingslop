"""Build the island page's data and art from the research pack in docs/research/islands.

Writes js/island-data.js (the catalogue the editor uses), js/island-examples.js (the
game-labelled example layouts, loaded only when one is opened) and img/island/<id>.webp.
Run with --check to compare without writing.
"""
import csv
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / "docs" / "research" / "islands"
DATA = RESEARCH / "data"
ICONS = RESEARCH / "assets" / "icons"
EXAMPLES = {  # layout id -> (name, what it looks like)
    "kingshot-8900": ("The default", "the Fountain on a grid of paths"),
    "kingshot-8901": ("Garden maze", "sun hedges and winding paths"),
    "kingshot-8902": ("Ponds and paving", "lily ponds and a paved square"),
    "kingshot-8903": ("Hedged lakes", "open water and few trees"),
    "kingshot-8904": ("Water garden", "pools edged in hedge"),
}


class Plan:
    """A small drawing kit for authored presets: surfaces under, pieces over, no overlaps."""

    def __init__(self, sizes, limits, n=60):
        self.n, self.sizes, self.limits = n, sizes, limits
        self.used = {}
        self.occ = [[False] * n for _ in range(n)]
        self.pieces, self.surfaces = [], {}
        self.put("build_7000", 27, 27)  # the Fountain sits in the middle of every island

    def inside(self, r, c):
        return 0 <= r < self.n and 0 <= c < self.n

    def free(self, slug, r, c):
        w, h = self.sizes[slug]
        return all(self.inside(y, x) and not self.occ[y][x] for y in range(r, r + h) for x in range(c, c + w))

    def room(self, slug):
        return (self.limits[slug] or 10 ** 9) - self.used.get(slug, 0)

    def put(self, slug, r, c):
        if self.room(slug) <= 0 or not self.free(slug, r, c):
            return False
        self.used[slug] = self.used.get(slug, 0) + 1
        w, h = self.sizes[slug]
        for y in range(r, r + h):
            for x in range(c, c + w):
                self.occ[y][x] = True
        self.pieces.append([r * self.n + c, slug])
        return True

    def first(self, slugs, r, c):
        """Puts the first of `slugs` that the island still has room for and that fits."""
        return next((s for s in slugs if self.put(s, r, c)), None)

    def ground(self, slug, cells):
        cells = [(r, c) for r, c in cells if self.inside(r, c) and self.surfaces.get(r * self.n + c) != slug]
        if len(cells) > self.room(slug):
            raise ValueError(f"{slug}: {len(cells)} more cells than the limit of {self.limits[slug]} allows")
        for r, c in cells:
            was = self.surfaces.get(r * self.n + c)
            if was:
                self.used[was] -= 1
            self.surfaces[r * self.n + c] = slug
            self.used[slug] = self.used.get(slug, 0) + 1

    def bare(self, cells):
        """Takes surfaces back off, leaving the sand."""
        for r, c in cells:
            was = self.surfaces.pop(r * self.n + c, None)
            if was:
                self.used[was] -= 1

    def done(self):
        return sorted(self.pieces), sorted(self.surfaces.items())


def rect(r0, c0, r1, c1):
    return [(r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]


def route(points, width=2):
    """Cells along axis-aligned legs between waypoints, `width` cells wide."""
    cells = set()
    for (r0, c0), (r1, c1) in zip(points, points[1:]):
        for r in range(min(r0, r1), max(r0, r1) + width):
            for c in range(min(c0, c1), max(c0, c1) + width):
                cells.add((r, c))
    return cells


def edge(cells):
    """The ring of cells touching `cells` from outside."""
    ring = set()
    for r, c in cells:
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if (r + dr, c + dc) not in cells:
                    ring.add((r + dr, c + dc))
    return ring


def walkways(plan, slug, square="paved_road"):
    """A two-cell path grid between the nine 20-cell blocks, with a paved square round the Fountain."""
    for a in (19, 39):
        plan.ground(slug, rect(a, 0, a + 1, 59) + rect(0, a, 59, a + 1))
    plan.ground(square, edge(set(rect(27, 27, 31, 31))) | edge(edge(set(rect(27, 27, 31, 31)))))


HEDGES = ["lush_elegy", "song_of_the_sun", "purple_fantasy"]
TREES = ["tree_fir", "tree_pine", "tree_pair", "tree_round", "tree_bush"]


FOUNTAIN = set(rect(27, 27, 31, 31))


def lawn(plan, r0, c0, r1, c1, hedge=None, gates=()):
    """A meadow pad on the sand. With `hedge`, its outer cells are clipped hedge, open at `gates`."""
    cells = [(r, c) for r, c in rect(r0, c0, r1, c1) if (r, c) not in FOUNTAIN]
    plan.ground("meadow", cells)
    if hedge:
        for r, c in cells:
            if (r in (r0, r1) or c in (c0, c1)) and (r, c) not in gates:
                plan.first([hedge] + HEDGES, r, c)


def gate(r0, c0, r1, c1, side):
    """The two middle cells of one side of a rectangle: 'n', 's', 'w' or 'e'."""
    mr, mc = (r0 + r1) // 2, (c0 + c1) // 2
    return {"n": {(r0, mc), (r0, mc + 1)}, "s": {(r1, mc), (r1, mc + 1)},
            "w": {(mr, c0), (mr + 1, c0)}, "e": {(mr, c1), (mr + 1, c1)}}[side]


def blocks(lines, n=60):
    """The blocks between two-cell roads that start at each of `lines`."""
    edges = [-2] + list(lines) + [n]
    spans = [(a + 2, b - 1) for a, b in zip(edges, edges[1:]) if b - 1 >= a + 2]
    return [(r0, c0, r1, c1) for r0, r1 in spans for c0, c1 in spans]


def roads(plan, slug, lines):
    for a in lines:
        plan.ground(slug, rect(a, 0, a + 1, 59) + rect(0, a, 59, a + 1))


def plaza(plan, slug="paved_road", rings=2):
    ring = set(FOUNTAIN)
    for _ in range(rings):
        ring = ring | edge(ring)
    plan.ground(slug, ring - FOUNTAIN)
    return ring


def scatter(plan, cells, slugs, every, salt=0):
    """Plants about one of `slugs` per `every` free cells, the same way on every build."""
    for r, c in sorted(cells):
        if (r * 73856093 ^ c * 19349663 ^ (salt + 1) * 83492791) % every == 0:
            plan.first(slugs[(r + c + salt) % len(slugs):] + slugs, r, c)


def crazy_golf(sizes, limits):
    """Beach crazy golf: green carpets with hedge walls on open sand, sand traps and water."""
    plan = Plan(sizes, limits)
    roads(plan, "garden_path", (19, 39))
    plaza(plan)
    holes = [  # block, waypoints inside it, the obstacle, sand traps, water
        ((0, 0), [(3, 3), (3, 13), (13, 13)], ("build_7008", 1, 6), [(4, 9), (5, 9)], [(9, 15), (10, 15)]),          # the windmill
        ((0, 20), [(3, 3), (3, 8), (13, 8), (13, 13)], ("build_7032", 7, 8), [(9, 9)], [(5, 12), (6, 12)]),            # over the slide
        ((0, 40), [(3, 3), (13, 3), (13, 13), (3, 13)], ("build_7096", 7, 13), [(13, 8)], [(7, 7), (7, 8), (8, 7), (8, 8)]),  # loop the loop
        ((20, 0), [(3, 13), (3, 3), (13, 3)], ("build_7012", 2, 7), [(9, 4)], [(9, 9), (9, 10), (10, 9)]),              # past the fossils
        ((20, 40), [(3, 3), (3, 13), (8, 13), (8, 3), (13, 3), (13, 13)], ("build_7044", 9, 8), [(14, 7)], []),         # the long snake
        ((40, 0), [(13, 3), (3, 3), (3, 13)], ("build_7101", 7, 1), [(4, 8)], [(9, 9), (10, 9), (9, 10)]),              # the dinosaur fort
        ((40, 20), [(3, 3), (13, 3), (13, 8), (3, 8), (3, 13)], ("build_7013", 7, 7), [(14, 5)], [(10, 12)]),           # round the icicle
        ((40, 40), [(3, 3), (13, 13)], ("build_7102", 5, 5), [(4, 10), (5, 10)], [(11, 3), (12, 3)]),                     # the ball trainer
    ]
    for hole, ((br, bc), points, (obstacle, orr, occ_), traps, water) in enumerate(holes):
        legs = []
        for (r0, c0), (r1, c1) in zip(points, points[1:]):
            legs.append((r0, c0))
            if r0 != r1 and c0 != c1:
                legs.append((r1, c0))  # a diagonal becomes a dog-leg
        legs.append(points[-1])
        carpet = {(br + r, bc + c) for r, c in route(legs, 3)}
        sand = {(br + r, bc + c) for r, c in traps}
        plan.ground("meadow", carpet - sand)  # a trap is the bare sand showing through
        plan.ground("paved_road", rect(br + legs[0][0], bc + legs[0][1], br + legs[0][0] + 1, bc + legs[0][1] + 1))  # the tee
        plan.ground("pond", [(br + r, bc + c) for r, c in water])
        plan.put(obstacle, br + orr, bc + occ_)
        end = legs[-1]
        plan.first(["build_7039", "streetlight"], br + end[0] + 1, bc + end[1] + 1)  # the pin: five banners, then lamps
        hedge = HEDGES[hole % 3]
        for r, c in sorted(edge(carpet)):
            if br <= r < br + 19 and bc <= c < bc + 19 and (r, c) not in sand:
                plan.first([hedge] + HEDGES, r, c)
        # A few palms' worth of shade on the sand round each course.
        open_sand = [(r, c) for r, c in rect(br, bc, br + 18, bc + 18) if (r, c) not in carpet and not edge(carpet) >= {(r, c)}]
        scatter(plan, open_sand, ["tree_round", "tree_bush", "tree_pair"], 9, hole)
    # The clubhouse: lawns round the Fountain plaza.
    for r0, c0, r1, c1, side in [(21, 21, 25, 37, "s"), (33, 21, 37, 37, "n"), (26, 21, 32, 25, "e"), (26, 33, 32, 37, "w")]:
        lawn(plan, r0, c0, r1, c1, "lush_elegy", gate(r0, c0, r1, c1, side))
    for slug, r, c in [("build_7005", 22, 22), ("build_7021", 22, 34), ("build_7009", 34, 22), ("build_7031", 34, 34),
                       ("build_7030", 22, 28), ("build_7048", 23, 32), ("build_7049", 35, 29), ("build_7043", 35, 31)]:
        plan.put(slug, r, c)
    return plan.done()


def village(sizes, limits):
    """A seaside village: paved streets, hedged gardens with one house each, a canal and quay."""
    plan = Plan(sizes, limits)
    lines = (9, 19, 39, 49)
    roads(plan, "paved_road", lines)
    plaza(plan, "paved_road", 3)
    plan.ground("pond", rect(0, 0, 1, 59))  # the canal along the north shore
    quay = ["build_7036", "build_7028", "build_7022", "build_7107", "build_7006"]
    houses = ["build_7019", "build_7059", "build_7018", "build_7020", "build_7015", "build_7016", "build_7005", "build_7021",
              "build_7009", "build_7017", "build_7007", "build_7010", "build_7095", "build_7094", "build_7092", "build_7082"]
    small = ["build_7035", "build_7034", "build_7033", "build_7024", "build_7031", "build_7001", "build_7029", "build_7027"]
    k = 0
    for r0, c0, r1, c1 in blocks(lines):
        if r0 <= 31 and r1 >= 27 and c0 <= 31 and c1 >= 27:
            continue  # the market square is the plaza
        if r0 == 0:
            # The quay: open sand by the water, boats and huts.
            plan.first(quay[k % len(quay):] + quay, 3, c0 + max(0, (c1 - c0 - 3) // 2))
            k += 1
            continue
        side = "n" if r0 > 31 else "s"
        lawn(plan, r0 + 1, c0 + 1, r1 - 1, c1 - 1, HEDGES[(r0 + c0) % 3], gate(r0 + 1, c0 + 1, r1 - 1, c1 - 1, side))
        h, w = r1 - r0 - 3, c1 - c0 - 3
        if h >= 3 and w >= 3:
            plan.first(houses[k % len(houses):] + houses, r0 + 2 + (h - 3) // 2, c0 + 2 + (w - 3) // 2)
            if h >= 7 or w >= 7:
                for dr, dc in ((0, 0), (0, w - 2), (h - 2, 0), (h - 2, w - 2)):
                    plan.first(small[(k + dr + dc) % len(small):] + small, r0 + 2 + dr, c0 + 2 + dc)
            k += 1
        scatter(plan, rect(r0 + 2, c0 + 2, r1 - 2, c1 - 2), ["tree_round", "tree_fir"], 5, k)
    # Market stalls round the square.
    for slug, r, c in [("build_7014", 21, 21), ("build_7041", 26, 26), ("build_7042", 26, 32), ("build_7050", 32, 26),
                       ("build_7043", 32, 32), ("build_7034", 33, 21), ("build_7033", 21, 33)]:
        plan.put(slug, r, c)
    return plan.done()


def woods(sizes, limits):
    """Deep woods: a meadow forest floor, a sandy-shored lake, a trail and cabins in the glades."""
    plan = Plan(sizes, limits)
    lake = [(r, c) for r, c in rect(34, 30, 50, 46) if ((r - 42) / 7) ** 2 + ((c - 38) / 7.5) ** 2 <= 1]
    shore = [(r, c) for r, c in rect(32, 28, 52, 48) if ((r - 42) / 9) ** 2 + ((c - 38) / 9.5) ** 2 <= 1]
    plan.ground("meadow", [cell for cell in rect(0, 0, 59, 59) if cell not in set(shore)])
    plan.ground("pond", lake)  # the beach round the lake is the sand left bare
    trail = route([(6, 6), (6, 50), (24, 50), (24, 10), (52, 10), (52, 24)], 1) | route([(24, 29), (31, 29)], 1)
    plan.ground("garden_path", trail)
    plaza(plan, "garden_path", 1)
    glades = [(10, 14, 6), (12, 40, 5), (40, 14, 6), (18, 28, 4)]
    clear = set()
    for cr, cc, rad in glades:
        clear |= {(r, c) for r, c in rect(cr - rad, cc - rad, cr + rad, cc + rad) if (r - cr) ** 2 + (c - cc) ** 2 <= rad * rad}
    for slug, r, c in [("build_7016", 9, 13), ("build_7046", 13, 12), ("build_7047", 12, 16), ("build_7048", 13, 16),
                       ("build_7023", 11, 39), ("build_7010", 39, 13), ("build_7046", 43, 13), ("build_7047", 42, 17),
                       ("build_7028", 39, 47), ("build_7098", 49, 44), ("build_7091", 17, 27), ("build_7045", 41, 11),
                       ("build_7036", 46, 35)]:
        plan.put(slug, r, c)
    taken = set(plan.surfaces)
    for r in range(60):
        for c in range(60):
            if (r, c) in clear or (r * 60 + c in taken and plan.surfaces[r * 60 + c] != "meadow"):
                continue
            if (r, c) in FOUNTAIN or any(abs(r - 29) <= 4 and abs(c - 29) <= 4 for _ in [0]):
                continue
            if (r * 73856093 ^ c * 19349663) % 100 < 58:
                plan.first(TREES[(r * 7 + c * 3) % 5:] + TREES, r, c)
    return plan.done()


def royal(sizes, limits):
    """Royal gardens: hedged lawn parterres round reflecting pools, statues, and sand allées."""
    plan = Plan(sizes, limits)
    lines = (14, 44)
    roads(plan, "paved_road", lines)
    plaza(plan, "paved_road", 3)
    statues = ["build_7090", "build_7105", "build_7091", "build_7104", "build_7080", "build_7093", "build_7017", "build_7064"]
    for i, (r0, c0, r1, c1) in enumerate(blocks(lines)):
        if r0 <= 31 and r1 >= 27 and c0 <= 31 and c1 >= 27:
            # The middle block: four lawns round the Fountain's square, cut by sand allées.
            for q0, p0, q1, p1 in [(r0 + 1, c0 + 1, 24, 24), (r0 + 1, 34, 24, c1 - 1), (34, c0 + 1, r1 - 1, 24), (34, 34, r1 - 1, c1 - 1)]:
                lawn(plan, q0, p0, q1, p1, "purple_fantasy")
                plan.ground("pond", rect((q0 + q1) // 2 - 1, (p0 + p1) // 2 - 1, (q0 + q1) // 2, (p0 + p1) // 2))
                for r, c in ((q0 + 2, p0 + 2), (q0 + 2, p1 - 2), (q1 - 2, p0 + 2), (q1 - 2, p1 - 2)):
                    plan.first(["tree_round"], r, c)
            continue
        # A parterre: an outer hedge, a sand walk, then four lawns round a statue and a pool.
        lawn(plan, r0 + 1, c0 + 1, r1 - 1, c1 - 1, "song_of_the_sun", gate(r0 + 1, c0 + 1, r1 - 1, c1 - 1, "n" if r0 > 30 else "s"))
        mr, mc = (r0 + r1) // 2, (c0 + c1) // 2
        plan.bare([(r, c) for r, c in rect(r0 + 2, c0 + 2, r1 - 2, c1 - 2) if abs(r - mr) <= 1 or abs(c - mc) <= 1])  # sand walks
        plan.ground("pond", rect(mr - 3, mc - 3, mr - 3, mc + 3) + rect(mr + 3, mc - 3, mr + 3, mc + 3))
        plan.put(statues[i % len(statues)], mr - 1, mc - 1) or plan.first(statues, mr - 1, mc - 1)
        for r, c in sorted(rect(r0 + 3, c0 + 3, r1 - 3, c1 - 3)):
            if abs(r - mr) > 1 and abs(c - mc) > 1 and (r - r0 + c - c0) % 4 == 0:
                plan.first(["tree_round", "build_7037", "tree_bush"], r, c)
    return plan.done()


AUTHORED = [  # slug, name, what it looks like, builder
    ("crazy-golf", "Crazy golf", "eight hedged holes on the sand, with traps, water, a windmill and a dinosaur", crazy_golf),
    ("village", "Seaside village", "hedged gardens on paved streets, a market square and a quay", village),
    ("woods", "Deep woods", "a meadow forest, cabins in the glades and a lake with a sandy shore", woods),
    ("royal", "Royal gardens", "hedged parterres round statues and pools, cut by sand walks", royal),
]


def kind(r):
    cat = r["category"]
    if cat in ("path", "water"):
        return "surface"
    if cat == "tree":
        return "tree"
    if cat in ("hedge", "fence", "accent"):
        return "hedge"
    return "building" if r["width"] * r["height"] >= 4 else "decor"


POND_GEMS = 200  # each pond is bought once with gems and stays; 100,000 gems buys all 500


def limit(r, k):
    """Decorations (trees, hedges, fences, lamps) cap at 500 each, and so do ponds, by their gem
    cost. Event buildings are generally one each; one whose buff counts several copies
    (effect_limit) allows that many. Paths have no cap: the game's own layouts use up to 1,255."""
    if r["category"] == "building":
        return max(1, r.get("effect_limit") or 0)
    return 0 if r["category"] == "path" else 500


def build():
    rows = {row["slug"]: row for row in csv.DictReader((DATA / "pieces.csv").open())}
    pieces = []
    for r in json.loads((DATA / "garden_catalogue.json").read_text()):
        row = rows.get(r["slug"], {})
        if row.get("retired") == "True":
            continue
        name = row.get("display_name") or r.get("display_name") or r["slug"].replace("_", " ").capitalize()
        if name.startswith("Building #"):
            continue
        k = kind(r)
        has_icon = (ICONS / f"{r['build_id']}.webp").exists()
        if not has_icon and k != "surface":
            continue
        pieces.append({
            "slug": r["slug"], "id": r["build_id"], "name": name, "kind": k,
            "w": r["width"], "h": r["height"], "swatch": r.get("swatch") or "#888888",
            "prosper": r.get("prosper") or 0, "effect": r.get("effect_limit") or 0,
            "limit": limit(r, k),
            "gems": POND_GEMS if r["slug"] == "pond" else 0,
            "icon": has_icon,
        })
    pieces.sort(key=lambda p: p["id"])
    known = {p["slug"] for p in pieces}
    examples = []
    for layout in json.loads((DATA / "source-game-layouts.json").read_text()):
        if layout["slug"] not in EXAMPLES:
            continue
        name, note = EXAMPLES[layout["slug"]]
        examples.append({
            "slug": layout["slug"], "name": name, "note": note,
            "pieces": [[int(i), s] for i, s in sorted(layout["default_pieces"].items(), key=lambda e: int(e[0])) if s in known],
            "surfaces": [[int(i), s] for i, s in sorted(layout["default_surfaces"].items(), key=lambda e: int(e[0])) if s in known],
        })
    sizes = {p["slug"]: (p["w"], p["h"]) for p in pieces}
    limits = {p["slug"]: p["limit"] for p in pieces}
    for slug, name, note, make in AUTHORED:
        placed, ground = make(sizes, limits)
        examples.append({"slug": slug, "name": name, "note": note, "authored": True,
                         "pieces": placed, "surfaces": [[i, s] for i, s in ground]})
    head = "/* Generated by .dsh/build-island.py from docs/research/islands. Do not edit. */\n"
    data = head + "window.ISLAND_DATA = " + json.dumps({"size": 60, "pieces": pieces}, separators=(",", ":")) + ";\n"
    ex = head + "window.ISLAND_EXAMPLES = " + json.dumps(examples, separators=(",", ":")) + ";\n"
    icons = {f"{p['id']}.webp" for p in pieces if p["icon"]}
    return {"js/island-data.js": data, "js/island-examples.js": ex}, icons


def main():
    files, icons = build()
    check = "--check" in sys.argv
    stale = []
    for rel, text in files.items():
        path = ROOT / rel
        if not path.exists() or path.read_text() != text:
            stale.append(rel)
            if not check:
                path.write_text(text)
    out = ROOT / "img" / "island"
    out.mkdir(parents=True, exist_ok=True)
    have = {p.name for p in out.glob("*.webp")}
    for name in sorted(icons - have):
        stale.append(f"img/island/{name}")
        if not check:
            shutil.copyfile(ICONS / name, out / name)
    for name in sorted(have - icons):
        stale.append(f"img/island/{name} (unexpected)")
        if not check:
            (out / name).unlink()
    if check and stale:
        sys.exit("Island output is stale: " + ", ".join(stale))
    print(("stale: " if check else "wrote: ") + (", ".join(stale) or "nothing"))


if __name__ == "__main__":
    main()
