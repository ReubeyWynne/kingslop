# Repository guidance

Read [DESIGN.md](DESIGN.md), especially its "Animation style" section, before changing UI or animations.

All authored animations must follow the established ASCII character-frame style: CSS `steps(1, end)`, coherent glyph silhouettes, and movement in whole character cells. The campfire (`campfire()` in [.dsh/build-ascii.py](.dsh/build-ascii.py), rendered by [_includes/ascii/campfire.html](_includes/ascii/campfire.html)) is the reference.

Every ASCII frame is generated. To add or change a scene, edit `.dsh/build-ascii.py`, run `python3 .dsh/build-ascii.py`, and commit all regenerated `css/ascii-frames*.css` files and `_includes/ascii/campfire.html`. Never hand-edit generated files. `css/ascii-frames.css` carries every shared deck scene, footer and the gray wolf's complete portrait; `css/ascii-frames-pets.css` carries the other pets' portraits and loads only on Pets through `_includes/head.html`. Each of the two is split by the generator: the sheet itself holds every scene's still (frame 0) and blocks first paint, and its `-motion` twin holds the `@keyframes`, which `_includes/head.html` loads after the page's `load` event and never for reduced motion. Never move keyframes back into the still sheets; they are over a megabyte and cost the page its first paint. Do not duplicate the wolf or load the Pets file globally or through `@import`. Layout, colour and placement go in `css/ascii.css`. Run `python3 .dsh/build-ascii.py --check` to check every generated file without overwriting stale output, then `node .dsh/ascii-style-check.cjs` before you push. CI must run both checks; they reject stale or missing generated files, unexpected frame stylesheets, transforms, smooth easing, fractional-cell movement, script-driven animation, frames that overflow their box, doubled backslashes, slow marchers and hard-coded scene colours.

Every scene must also meet the quality bar in DESIGN.md's "Animation quality" section. After changing a scene, build the site and run `node .dsh/ascii-capture.cjs --frames`, then look at every frame in `.dsh/ascii-preview/` before pushing. CI runs the same capture in check mode.

Never skew, rotate, stretch, squash, scale, bend, bob, bounce or smoothly drift ASCII art or its layers. Do not replace character animation with animated transforms, scroll-driven scaling, or JavaScript animation loops. Runtime animation uses HTML and CSS; offline frame generation is allowed.

The one exception is a live pet: `js/pet-live.js` may draw a pet's model as character cells in a WebGL canvas, at a fixed 12 fps in a fixed grid, with the baked frames kept as its fallback. See "Live pets" in DESIGN.md. No other script animates.

Every disclosure is a link. Give each static `details` a stable readable id, and mark custom disclosure buttons with `data-deep-link`; see "Deep links" in [INTERACTIONS.md](INTERACTIONS.md). Do not add page-specific hash handlers.

Keep roulette scenes centred in their cards. Ambient twinkles change glyphs at fixed positions. Smooth background colour blending remains allowed. Preserve static frames for reduced motion.
