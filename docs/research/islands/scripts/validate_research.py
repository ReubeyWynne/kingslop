import collections
import csv
import hashlib
import json
import pathlib


root = pathlib.Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((root / "data" / name).read_text())


for path in (root / "data").glob("*.json"):
    json.loads(path.read_text())

catalogue = read("garden_catalogue.json")
slugs = {x["slug"] for x in catalogue}
assert len(slugs) == len(catalogue) == 104
assert collections.Counter(x["category"] for x in catalogue)["building"] == 87
assert sum(bool(x.get("retired")) for x in catalogue) == 10
for piece in catalogue:
    cells = set(map(tuple, piece["mask_cells"]))
    rectangle = {(x, y) for y in range(piece["height"]) for x in range(piece["width"])}
    assert cells == rectangle, piece["slug"]
    assert not piece["block_cells"], piece["slug"]

with (root / "data/pieces.csv").open() as stream:
    assert len(list(csv.DictReader(stream))) == len(catalogue)
index = read("piece-index.json")["pieces"]
assert {piece["slug"] for piece in index} == slugs
for piece in index:
    for key in ["icon", "sprite"]:
        assert piece[key] is None or (root / piece[key]).is_file()

for layout in read("source-game-layouts.json"):
    assert layout["grid_width"] == layout["grid_height"] == 60
    runs = [tuple(map(int, run.split("x"))) for run in layout["cells_rle"].removeprefix("rle:").split(",")]
    assert sum(count for count, _ in runs) == 3600
    assert all(value == 255 for _, value in runs)
    assert not layout["island_template_roles"]
    for key in ["default_pieces", "default_surfaces"]:
        assert all(0 <= int(cell) < 3600 for cell in layout[key])
        assert all(slug in slugs for slug in layout[key].values())

terrain = read("kingshot_playable_terrain.json")
assert len(terrain["trees"]) == 3479
assert all(0 <= row[0] < 60 and 0 <= row[1] < 60 for row in terrain["trees"])

chests = {(x["x"], x["y"]) for x in read("chest-coordinates.json")["chests"]}
assert len(chests) == 55
assert all(1 <= x <= 60 and 1 <= y <= 60 for x, y in chests)
for case in read("route-fixtures.json")["cases"]:
    steps = [step for row in case["rounds"] for step in row]
    assert {tuple(step["target"]) for step in steps} == chests
    assert len(steps) == 55
    assert len(case["rounds"]) == case["round_count"]
    assert sum(step["distance"] for step in steps) == case["total_grid_distance"]
    for step in steps:
        assert sum(abs(a - b) for a, b in zip(step["from"], step["target"])) == step["distance"]

art = read("asset-manifest.json")
atlases = read("tile-atlases.json")
for asset in art["assets"] + atlases["pages"]:
    path = root / asset["path"]
    assert path.stat().st_size == asset["bytes"], path
    assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"], path

frames = {x["source_asset"]: x for x in atlases["frames"]}
rules = read("garden_road_rules.json")
assert len(frames) == len(atlases["frames"]) == 275
assert all(sprite["asset"] in frames for sprite in rules["sprites"].values())
for family in rules["families"].values():
    assert family["defaultSprite"] is None or family["defaultSprite"] in rules["sprites"]
    for rule in family["rules"]:
        assert all(name in rules["sprites"] for name in rule["sprites"])
    for mask in range(256):
        assert any(mask & rule["required"] == rule["required"] and mask & rule["empty"] == 0
                   for rule in family["rules"])

try:
    from PIL import Image
except ImportError:
    print("Pillow unavailable; skipped image decoding and atlas pixel checks")
else:
    for asset in art["assets"]:
        with Image.open(root / asset["path"]) as image:
            assert image.size == (asset["width"], asset["height"])
            image.verify()
    images = {page["path"]: Image.open(root / page["path"]).convert("RGBA") for page in atlases["pages"]}
    for frame in frames.values():
        image = images[frame["atlas"]]
        x, y, width, height = [frame[key] for key in ["x", "y", "width", "height"]]
        assert 0 <= x < x + width <= image.width
        assert 0 <= y < y + height <= image.height
        pixels = image.crop((x, y, x + width, y + height)).tobytes()
        assert hashlib.sha256(pixels).hexdigest() == frame["pixel_sha256"], frame["source_asset"]

print(f"Validated {len(catalogue)} pieces, 5 maps, 3,479 terrain records, 55 chests, "
      f"{len(art['assets'])} art files, {len(frames)} packed frames and all road-rule references")
