"""Write layouts.js for the island UI sketch from the research data pack."""
import json
from pathlib import Path

here = Path(__file__).resolve().parent
data = here.parent / "research" / "islands" / "data"
cat = json.loads((data / "garden_catalogue.json").read_text())
layouts = json.loads((data / "source-game-layouts.json").read_text())

pieces = {}
for r in cat:
    pieces[r["slug"]] = {
        "id": r["build_id"], "name": r.get("display_name") or r["slug"].replace("_", " ").capitalize(),
        "cat": r["category"], "w": r["width"], "h": r["height"],
        "swatch": r.get("swatch") or "#777", "prosper": r.get("prosper") or 0,
        "limit": r.get("build_limit") or 0, "effect": r.get("effect_limit") or 0,
        "art": bool(r.get("has_artwork")), "retired": bool(r.get("retired")),
    }

out = {"pieces": pieces, "layouts": [
    {"slug": l["slug"], "name": l["name"],
     "pieces": {int(k): v for k, v in l["default_pieces"].items()},
     "surfaces": {int(k): v for k, v in l["default_surfaces"].items()}}
    for l in layouts]}
(here / "layouts.js").write_text("window.ISLAND = " + json.dumps(out, separators=(",", ":")) + ";\n")
