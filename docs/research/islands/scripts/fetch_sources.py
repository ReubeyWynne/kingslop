import argparse
import hashlib
import json
import pathlib
import subprocess


root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("destination", type=pathlib.Path)
parser.add_argument("--group", choices=["data", "art", "tiles", "animations"], default="data")
args = parser.parse_args()
manifest = json.loads((root / "data/asset-manifest.json").read_text())
sources = json.loads((root / "data/sources.json").read_text())

if args.group == "data":
    rows = [x for x in sources["sources"] if x["kind"] == "data"]
elif args.group == "art":
    rows = [dict(x, sha256=x["source_sha256"]) for x in manifest["assets"]]
elif args.group == "tiles":
    tiles = json.loads((root / "data/tile-atlases.json").read_text())
    rows = [dict(x, sha256=x["source_sha256"]) for x in tiles["frames"]]
else:
    rows = [{"source_url": x} for x in manifest["animation_references"]]

for row in rows:
    url = row["source_url"]
    relative = url.split("/assets/assets/", 1)[-1]
    if relative == url:
        relative = url.rsplit("/", 1)[-1]
    target = args.destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".download")
    subprocess.run(["curl", "-fsSL", "--max-time", "60", url, "-o", str(temporary)], check=True)
    expected = row.get("sha256")
    if expected and hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Source changed: {url}; retained {temporary}")
    temporary.replace(target)
    print(target)
