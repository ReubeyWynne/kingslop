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


def crazy_golf(sizes, limits):
    plan = Plan(sizes, limits)
    walkways(plan, "whispering_path")
    blocks = [(0, 0), (0, 20), (0, 40), (20, 0), (20, 40), (40, 0), (40, 20), (40, 40)]
    holes = [  # waypoints inside a block, then an obstacle on the fairway and a hazard
        ([(3, 3), (3, 14), (14, 14)], ("build_7008", 2, 7), [(12, 4), (13, 4), (12, 5)]),        # the windmill
        ([(3, 3), (3, 9), (14, 9), (14, 15)], ("build_7032", 7, 9), [(5, 13), (6, 13)]),           # over the slide
        ([(3, 3), (14, 3), (14, 14), (3, 14)], ("build_7096", 7, 13), [(8, 7), (8, 8), (9, 7), (9, 8)]),  # loop the loop
        ([(3, 14), (3, 3), (14, 3)], ("build_7012", 2, 7), [(9, 9), (9, 10)]),                    # past the fossils
        ([(3, 3), (3, 15), (9, 15), (9, 3), (15, 3), (15, 15)], ("build_7044", 9, 9), [(12, 7)]),  # the long snake
        ([(14, 3), (3, 3), (3, 15)], ("build_7101", 7, 2), [(9, 10), (10, 10), (9, 11)]),          # the dinosaur fort
        ([(3, 3), (14, 3), (14, 9), (3, 9), (3, 15)], ("build_7013", 7, 8), [(10, 13)]),           # round the icicle
        ([(3, 3), (14, 14)], ("build_7102", 6, 6), [(10, 4), (11, 4)]),                            # the ball trainer
    ]
    for hole, ((br, bc), (points, (obstacle, orr, occ_), sand)) in enumerate(zip(blocks, holes)):
        legs = []
        for (r0, c0), (r1, c1) in zip(points, points[1:]):
            legs.append((r0, c0))
            if r0 != r1 and c0 != c1:
                legs.append((r1, c0))  # a diagonal becomes a dog-leg
        legs.append(points[-1])
        fairway = {(br + r, bc + c) for r, c in route(legs)}
        plan.ground("meadow", fairway)
        plan.ground("paved_road", rect(br + legs[0][0], bc + legs[0][1], br + legs[0][0] + 1, bc + legs[0][1] + 1))  # the tee
        plan.ground("gravel_road", [(br + r, bc + c) for r, c in sand if (br + r, bc + c) not in fairway])
        plan.ground("pond", [(br + r + 1, bc + c + 1) for r, c in sand[:2] if (br + r + 1, bc + c + 1) not in fairway])
        plan.put(obstacle, br + orr, bc + occ_)
        end = legs[-1]
        plan.first(["build_7039", "streetlight"], br + end[0], bc + end[1] + 1)  # the pin: five banners, then lamps
        hedge = HEDGES[hole % 3]
        for r, c in sorted(edge(fairway)):
            if br <= r < br + 19 and bc <= c < bc + 19:
                plan.first([hedge] + HEDGES, r, c)
    # The clubhouse round the Fountain.
    for slug, r, c in [("build_7005", 21, 21), ("build_7009", 21, 35), ("build_7021", 35, 21), ("build_7031", 36, 36),
                       ("build_7030", 25, 22), ("build_7029", 33, 33), ("build_7048", 24, 26), ("build_7048", 24, 33),
                       ("build_7049", 34, 26), ("build_7043", 26, 34)]:
        plan.put(slug, r, c)
    for i in range(0, 60, 6):
        for r, c in ((18, i), (i, 18), (41, i), (i, 41)):
            plan.put("streetlight", r, c)
    return plan.done()


def harbour(sizes, limits):
    plan = Plan(sizes, limits)
    plan.ground("pond", rect(0, 0, 7, 59))  # one shore: 480 ponds, inside the 100,000-gem budget
    plan.ground("paved_road", rect(10, 8, 11, 59) + rect(10, 8, 59, 9) + rect(38, 8, 39, 59) + rect(10, 38, 59, 39))
    plan.ground("garden_path", rect(20, 8, 21, 59) + rect(10, 18, 59, 19) + rect(48, 8, 49, 59) + rect(10, 48, 59, 49))
    plan.ground("gravel_road", rect(25, 25, 33, 26) + rect(25, 32, 33, 33) + rect(25, 25, 26, 33) + rect(32, 25, 33, 33))
    for slug, c in [("build_7036", 4), ("build_7028", 14), ("build_7107", 24), ("build_7022", 40), ("build_7006", 50)]:
        plan.put(slug, 3 if slug != "build_7107" else 2, c)
    market = ["build_7019", "build_7059", "build_7014", "build_7018", "build_7033", "build_7024", "build_7035", "build_7034",
              "build_7031", "build_7041", "build_7042", "build_7050", "build_7020", "build_7015", "build_7009", "build_7021", "build_7005"]
    for r in (13, 23, 41, 51):
        for c in (11, 14, 22, 26, 29, 34, 41, 44, 51, 54):
            plan.first(market, r, c)
    for slug, r, c in [("build_7023", 13, 2), ("build_7001", 22, 2), ("build_7043", 12, 12)]:
        plan.put(slug, r, c)
    for i in range(10, 60, 4):
        for r, c in ((12, i), (i, 10), (40, i), (i, 40)):
            plan.put("streetlight", r, c)
    return plan.done()


def woods(sizes, limits):
    plan = Plan(sizes, limits)
    clearings = [(10, 10, 5), (12, 45, 4), (44, 12, 4), (46, 46, 5), (29, 29, 6)]
    trail = route([(13, 13), (13, 47), (47, 47), (47, 13), (13, 13)], 1) | route([(13, 29), (47, 29)], 1) | route([(29, 13), (29, 47)], 1)
    plan.ground("garden_path", trail)
    for cr, cc, rad in clearings:
        plan.ground("meadow", [(r, c) for r, c in rect(cr - rad, cc - rad, cr + rad, cc + rad) if (r - cr) ** 2 + (c - cc) ** 2 <= rad * rad])
    plan.ground("pond", [(r, c) for r, c in rect(36, 30, 46, 40) if ((r - 41) / 5) ** 2 + ((c - 35) / 5.5) ** 2 <= 1])
    for slug, r, c in [("build_7016", 8, 8), ("build_7046", 12, 12), ("build_7047", 10, 13), ("build_7048", 11, 15),
                       ("build_7023", 11, 44), ("build_7010", 44, 10), ("build_7046", 47, 14), ("build_7047", 45, 15),
                       ("build_7028", 39, 41), ("build_7098", 44, 46), ("build_7091", 21, 29), ("build_7045", 48, 49)]:
        plan.put(slug, r, c)
    taken = set(plan.surfaces)
    for r in range(60):
        for c in range(60):
            if r * 60 + c in taken:
                continue
            h = (r * 73856093 ^ c * 19349663) % 100
            if h < 62:
                plan.first(TREES[(r * 7 + c * 3) % 5:] + TREES, r, c)
    return plan.done()


def royal(sizes, limits):
    plan = Plan(sizes, limits)
    plan.ground("garden_path", rect(29, 0, 29, 59) + rect(0, 29, 59, 29) + rect(25, 25, 33, 33))
    plan.ground("garden_path", [(i, i) for i in range(60)] + [(i, 59 - i) for i in range(60)])
    for q in ((0, 0), (0, 31), (31, 0), (31, 31)):
        r0, c0 = q
        bed = set(rect(r0 + 9, c0 + 9, r0 + 18, c0 + 18))  # lawns are meadow, so four 10-cell beds stay under 500
        plan.ground("meadow", bed)
        plan.ground("pond", rect(r0 + 12, c0 + 12, r0 + 15, c0 + 15))
        for r, c in sorted(edge(bed)):
            plan.put("song_of_the_sun" if (r + c) % 2 else "purple_fantasy", r, c)
        for r, c in sorted(edge(set(rect(r0 + 11, c0 + 11, r0 + 16, c0 + 16)))):
            plan.first(["build_7038", "lush_elegy"], r, c)  # five Exquisite Hedges, then Lush Elegy
    for slug, r, c in [("build_7090", 20, 20), ("build_7105", 20, 37), ("build_7091", 37, 20), ("build_7104", 37, 37),
                       ("build_7017", 2, 28), ("build_7080", 55, 28), ("build_7002", 27, 1), ("build_7093", 28, 55)]:
        plan.put(slug, r, c)
    for i in range(1, 60, 3):
        for r, c in ((28, i), (30, i), (i, 28), (i, 30)):
            plan.first(["build_7037", "tree_round"], r, c)  # five Lush Shubberries, then clipped round trees
    return plan.done()


AUTHORED = [  # slug, name, what it looks like, builder
    ("crazy-golf", "Crazy golf", "eight holes round a clubhouse: a windmill, a loop and a dinosaur", crazy_golf),
    ("harbour", "Harbour market", "docks on two shores and market stalls on a paved grid", harbour),
    ("woods", "Deep woods", "a forest of evergreens, five clearings and a lake", woods),
    ("royal", "Royal gardens", "formal hedged beds, statues and long allées", royal),
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
