# Repository guidance

Read [DESIGN.md](DESIGN.md), especially its "Animation style" section, before changing UI or animations.

All authored animations must follow the established ASCII character-frame style: CSS `steps(1, end)`, coherent glyph silhouettes, and movement in whole character cells. The campfire in [_includes/ascii/deck-campfire.html](_includes/ascii/deck-campfire.html) is the reference.

Never skew, rotate, stretch, squash, scale, bend, bob, bounce or smoothly drift ASCII art or its layers. Do not replace character animation with animated transforms, scroll-driven scaling, or JavaScript animation loops. Runtime animation uses HTML and CSS; offline frame generation is allowed.

Keep roulette scenes centred in their cards. Ambient twinkles change glyphs at fixed positions. Smooth background colour blending remains allowed. Preserve static frames for reduced motion.
