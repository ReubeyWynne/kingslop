# Repository guidance

Read [DESIGN.md](DESIGN.md), especially its "Animation style" section, before changing UI or animations.

All authored animations must follow the established ASCII character-frame style: CSS `steps(1, end)`, coherent glyph silhouettes, and movement in whole character cells. The campfire (`campfire()` in [.dsh/build-ascii.py](.dsh/build-ascii.py), rendered by [_includes/ascii/campfire.html](_includes/ascii/campfire.html)) is the reference.

Every ASCII frame is generated. To add or change a scene, edit `.dsh/build-ascii.py`, run `python3 .dsh/build-ascii.py`, and commit the regenerated `css/ascii-frames.css` and `_includes/ascii/campfire.html`. Never hand-edit those two files. Layout, colour and placement go in `css/ascii.css`. Run `node .dsh/ascii-style-check.cjs` before you push. CI runs it and rejects stale frames, transforms, smooth easing, fractional-cell movement, script-driven animation, frames that overflow their box, doubled backslashes, slow marchers and hard-coded scene colours.

Every scene must also meet the quality bar in DESIGN.md's "Animation quality" section. After changing a scene, build the site and run `node .dsh/ascii-capture.cjs --frames`, then look at every frame in `.dsh/ascii-preview/` before pushing. CI runs the same capture in check mode.

Never skew, rotate, stretch, squash, scale, bend, bob, bounce or smoothly drift ASCII art or its layers. Do not replace character animation with animated transforms, scroll-driven scaling, or JavaScript animation loops. Runtime animation uses HTML and CSS; offline frame generation is allowed.

Keep roulette scenes centred in their cards. Ambient twinkles change glyphs at fixed positions. Smooth background colour blending remains allowed. Preserve static frames for reduced motion.
