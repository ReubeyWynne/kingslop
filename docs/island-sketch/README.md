# Island page UI sketch

An interactive sketch of the island editor page in the site's style. It is not wired into Jekyll or the site navigation.

Serve the repository root (`python3 -m http.server`) and open `/docs/island-sketch/`. `export.py` rebuilds `layouts.js` from `docs/research/islands/data`; icons load from `docs/research/islands/assets/icons`.

What it tries out:

- Board-first workspace that fills one screen, with the tray in thumb reach on phones and a side panel from 56rem up.
- Four named tools (Look, Place, Paint, Clear) with undo and redo. One finger acts with the tool; two fingers always pan and pinch, and a second finger cancels a half-drawn paint stroke.
- Place by tapping, or drag to aim a ghost footprint and lift to drop. Blocked spots show in rubric red and never displace anything.
- Selecting a piece floats Turn, Move, Copy and Remove beside it, and swaps the palette for a short inspector that says whether extra copies still add a buff.
- Examples open as a labelled copy, separate from "Your island".
- At a glance flags path types over 500 tiles instead of trimming them. The chat-line count is a rough placeholder for the real codec.
- Shallows blue (`#7DBDF0`) as the page's signal hue, an unused slot between Mithril and War-Map Blue.
