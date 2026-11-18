# Repository guidance

Read [DESIGN.md](DESIGN.md), especially its "Animation style" section, before changing UI or animations.

All authored animations must follow the established ASCII character-frame style: CSS `steps(1, end)`, coherent glyph silhouettes, and movement in whole character cells. The campfire (`campfire()` in [.dsh/build-ascii.py](.dsh/build-ascii.py), rendered by [_includes/ascii/campfire.html](_includes/ascii/campfire.html)) is the reference.

Every ASCII frame is generated. Edit `.dsh/build-ascii.py` and regenerate the sheets and `_includes/ascii/campfire.html`; never hand-edit them. `_includes/head.html` loads shared stills and defers the motion parts listed in `_data/ascii_motion.json`; it skips motion under reduced motion. Layout belongs in `css/ascii.css`. CI runs `python3 .dsh/build-ascii.py --check` and `node .dsh/ascii-style-check.cjs`.

Every scene must also meet the quality bar in DESIGN.md's "Animation quality" section. After changing a scene, build the site and run `node .dsh/ascii-capture.cjs --frames`, then look at every frame in `.dsh/ascii-preview/` before pushing. CI runs the same capture in check mode.

Never skew, rotate, stretch, squash, scale, bend, bob, bounce or smoothly drift ASCII art or its layers. Do not replace character animation with animated transforms, scroll-driven scaling, or JavaScript animation loops. Runtime animation uses HTML and CSS; offline frame generation is allowed.

The one exception is the 3D pet habitat (`js/pet-habitat.js`), which animates models in its own canvas, separate from the ASCII wolf on the Pets deck cover. See "Pet habitat" in DESIGN.md.

Every disclosure is a link. Give each static `details` a stable readable id, and mark custom disclosure buttons with `data-deep-link`; see "Deep links" in [INTERACTIONS.md](INTERACTIONS.md). Do not add page-specific hash handlers.

Keep roulette scenes centred in their cards. Ambient twinkles change glyphs at fixed positions. Smooth background colour blending remains allowed. Preserve static frames for reduced motion.

Write English copy to [docs/prose-standard.md](docs/prose-standard.md). Show, don't tell: the interface explains itself through its visual motifs, and copy never describes how the site works. Only the game's screens may be described. Each line does only the job of the spot it sits in.
