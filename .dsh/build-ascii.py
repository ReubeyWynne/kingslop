"""Offline generator for every ASCII animation on the site.

    python3 .dsh/build-ascii.py

Writes css/ascii-frames.css and _includes/ascii/campfire.html. Do not edit
those by hand: change the scene here and regenerate.

The house style (DESIGN.md, "Animation style"):
  * every scene is a stack of character frames swapped with steps(1, end);
  * silhouettes stay coherent from frame to frame;
  * marks that travel (sparks, marchers, the scout) jump whole cells;
  * nothing is skewed, rotated, scaled, bobbed or smoothly drifted, and
    nothing is driven by JavaScript at runtime.

Hand-written layout, colours and placement live in css/ascii.css.
"""
import html
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau


# ── toolkit ──────────────────────────────────────────────────────────────

def hash2(x, y):
    h = ((x * 0x27d4eb2d) ^ (y * 0x165667b1)) & 0xffffffff
    h = ((h ^ (h >> 15)) * 0x85ebca6b) & 0xffffffff
    h = ((h ^ (h >> 13)) * 0xc2b2ae35) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296


def noise(x, y):
    i, j = math.floor(x), math.floor(y)
    u, v = x - i, y - j
    u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
    a, b, c, d = hash2(i, j), hash2(i + 1, j), hash2(i, j + 1), hash2(i + 1, j + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def grid(w, h):
    return [[' '] * w for _ in range(h)]


def put(arr, x, y, text, keep=''):
    """Write text at cell (x, y); characters in `keep` are transparent."""
    if 0 <= y < len(arr):
        for j, ch in enumerate(text):
            if ch not in keep and 0 <= x + j < len(arr[y]):
                arr[y][x + j] = ch


def art(text):
    """A drawing as rows of characters; a leading newline is ignored."""
    rows = text.split('\n')
    if rows and rows[0] == '':
        rows = rows[1:]
    return rows


def stamp(arr, x, y, drawing, keep=' '):
    for r, row in enumerate(art(drawing)):
        put(arr, x, y + r, row, keep)


def content(rows):
    lines = [''.join(row).rstrip() for row in rows]
    while lines and not lines[-1]:
        lines.pop()
    return '"' + r'\A '.join(l.replace('\\', '\\\\').replace('"', r'\"') for l in lines) + '"'


def animation(selector, name, frames, duration, holds=None):
    """One stepped animation; `holds` weights how long each frame stays up.

    The selector's resting content is frame 0, which is also the frame shown
    when motion is reduced, so frame 0 should always be a good still."""
    holds = holds or [1] * len(frames)
    total = sum(holds)
    out = [f'{selector}{{content:{content(frames[0])};animation:{name} {duration}s steps(1,end) infinite}}',
           f'@keyframes {name}{{']
    at = 0
    previous = None
    for frame, hold in zip(frames, holds):
        body = content(frame)
        if body != previous:
            out.append(f'{100 * at / total:.4f}%{{content:{body}}}')
        previous = body
        at += hold
    out.append('}')
    return '\n'.join(out) + '\n'


def pre(cls, arr):
    text = '\n'.join(''.join(row).rstrip() for row in arr).rstrip('\n')
    return f'<pre class="{cls}" aria-hidden="true">{html.escape(text)}</pre>\n'


def write(path, text):
    (ROOT / path).write_text(text)


# ── campfire: the reference scene ────────────────────────────────────────
# The reference flame from the original hand-tuned generator, made to loop:
# every slow term travels a circle in noise space and the rising turbulence
# is cross-faded with itself one loop earlier, so frame 72 is frame 0.

W, H = 52, 22
FIRE = ' .,:;=+*#%@'
TONGUES = [(-7.4, 9.5, 3.4, 2.4), (-4.4, 12.5, 3.5, 0), (-1.4, 15, 3.5, 1.7),
           (1.7, 15.5, 3.5, 3.1), (4.7, 12.5, 3.5, 4.4), (7.6, 10, 3.4, 5.6)]
LOOP = 6.0
FPS = 12


def orbit(t, speed):
    """A point that travels `speed` units per second and returns after LOOP."""
    r = speed * LOOP / TAU
    a = TAU * t / LOOP
    return r * math.cos(a), r * math.sin(a)


def tone(t, rate):
    """An angle advancing at roughly `rate` rad/s that completes whole turns."""
    return max(1, round(rate * LOOP / TAU)) * TAU / LOOP * t


def turbulence(x, h, t):
    def at(s):
        return noise(x * .45, (h - s * 6) * .35) * .6 + noise(x * .9 + 9, (h - s * 8) * .7) * .4
    a = t / LOOP
    n = (1 - a) * at(t) + a * at(t - LOOP)
    return .5 + (n - .5) / math.hypot(1 - a, a)


def flame_heat(x, h, t):
    bx, by = orbit(t, 3)
    breath = .85 + .3 * noise(bx, 7.5 + by)
    low = h / (5.5 * breath)
    m = (1 - (x / (10.5 * math.sqrt(1 - low) + .5)) ** 2) * (.85 - low * .5) if 0 <= low < 1 else 0
    top = low * .5 if 0 <= low < 1 else 0
    lx, ly = orbit(t, 1.6)
    for x0, h0, w0, ph in TONGUES:
        lift = h / (h0 * (.72 + .5 * noise(lx + ph * 3, ly + ph * 5)) * breath)
        if lift >= 1:
            continue
        sway = 1.4 * max(0, lift) ** 1.4 * math.sin(h * .55 - tone(t, 5.5) + ph) + .5 * lift * math.sin(tone(t, 8.3) + ph * 2)
        q = (x - x0 * (1 - .45 * lift) - sway) / (w0 * max(.0001, 1 - lift) ** .6 + .5)
        f = (1 - q * q) * (1 - lift * .6)
        if f > m:
            m, top = f, lift
    return m - .55 * turbulence(x, h, t) * (.35 + top * .65)


def heat_glyph(v):
    if v <= .035:
        return ' '
    return FIRE[max(1, min(len(FIRE) - 1, 1 + int(((v - .03) / .85) * (len(FIRE) - 1))))]


def fire(t):
    arr = grid(W, H)
    for r in range(19):
        for c in range(W):
            x = c + .5 - W / 2
            v = sum(flame_heat(x, 18.4 - (r + sub), t) for sub in (.25, .75)) / 2
            arr[r][c] = heat_glyph(v)
    return arr


def logs():
    far, near = grid(W, H), grid(W, H)
    for side in (1, -1):
        for c in range(4, 48):
            x = c + .5 - W / 2
            y = 16.8 + .115 * x * side
            layer = near if x * side > 0 else far
            r0, r1 = math.floor(y - 1.4), math.floor(y + 1.4)
            e = min(c - 4, 47 - c)
            for r in range(max(0, r0), min(H - 1, r1) + 1):
                if r in (r0, r1):
                    ch = '_' if r == r1 else '.'
                elif e <= 1:
                    ch = '\\' if x > 0 else '/'
                else:
                    n = hash2(math.floor((x * side + 40) / 2.6), 3 if side > 0 else 8)
                    ch = ('#' if n < .45 else '=') if r == r0 + 1 else ('=' if n < .5 else '-')
                layer[r][c] = ch
    return far, near


def campfire():
    rng = random.Random(17)
    css = ['/* campfire — the reference scene */']
    frames = [fire(i / FPS) for i in range(int(LOOP * FPS))]
    css.append(animation('.ascii-campfire .flame::before', 'ascii-fire', [[row[8:44] for row in f[:19]] for f in frames], LOOP))

    # Sparse disturbances: fixed windows onto other moments of the same fire
    # that only ever add hot glyphs, so they flicker without moving the outline.
    patches = [(13, 9, 3, 7, 2.11), (19, 5, 3, 9, 2.63), (25, 7, 3, 8, 1.91),
               (31, 8, 3, 8, 2.47), (36, 10, 3, 6, 2.89), (22, 12, 4, 6, 1.73)]
    patch_markup = []
    for i, (x, y, w, h, duration) in enumerate(patches):
        pf = []
        for j in range(16):
            arr = fire((1.9 + i * 2.1 + j * .079) % LOOP)
            pf.append([[v if v not in ' .,:' and hash2(x + k + j * 2, i * 19 + j) > .42 else ' '
                        for k, v in enumerate(row[x:x + w])] for row in arr[y:y + h]])
        css.append(animation(f'.ascii-campfire .patch-{i}::before', f'ascii-fire-patch-{i}', pf, duration).replace(
            'infinite}', f'infinite;animation-delay:-{i * .27:.2f}s}}', 1))
        patch_markup.append(f'<span class="patch patch-{i}" style="--col:{x};--row:{y}" aria-hidden="true"></span>')

    far, near = logs()

    # The coal bed glows by changing glyphs in place, only in the pit the logs
    # enclose: a coal under or beside the logs reads as debris, not embers.
    def enclosed(r, c):
        logs_on = lambda cols: any(far[r][k] != ' ' or near[r][k] != ' ' for k in cols)
        return logs_on(range(c - 16, c)) and logs_on(range(c + 1, c + 17))
    bed = [(r, c) for r in range(18, 22) for c in range(16, 36)
           if far[r][c] == ' ' and near[r][c] == ' ' and enclosed(r, c) and hash2(c, r + 60) < .8]
    ramp = ' .:;+*#'
    coal_frames = []
    for j in range(16):
        arr = grid(W, H)
        for r, c in bed:
            base = 2 + int(hash2(c, r) * 4)
            wobble = math.sin(TAU * j / 16 * (1 + int(hash2(r, c) * 2)) + hash2(c * 3, r) * TAU)
            arr[r][c] = ramp[max(1, min(len(ramp) - 1, base + round(wobble * 1.2)))]
        coal_frames.append([row for row in arr[18:22]])
    css.append(animation('.ascii-campfire .coals::before', 'ascii-coals', coal_frames, 3.2))

    sparks = []
    for i in range(18):
        c, r = rng.randrange(19, 34), rng.randrange(9, 16)
        dur, phase = 4.8 + (i % 7) * .61, i * .79
        glyph = rng.choice(['.', "'", '+', '*'])
        keys = []
        for j in range(11):
            u = j / 10
            dc = round(2.4 * math.sin(u * 5.5 + i * 1.7) + u * (i % 5 - 2))
            opacity = 0 if j == 0 or j >= 9 else (1 if j < 5 else .65)
            keys.append(f'{j * 10}%{{left:{c + dc}ch;top:{r - round(10 * u)}em;opacity:{opacity}}}')
        css.append(f'@keyframes ascii-spark-{i}{{' + ''.join(keys) + '}')
        sparks.append(f'<span class="spark" style="--dur:{dur:.2f}s;--delay:-{phase:.2f}s;animation-name:ascii-spark-{i}" aria-hidden="true">{html.escape(glyph)}</span>')

    markup = ['<!-- Generated by .dsh/build-ascii.py — edit the generator, not this file. -->',
              '<div class="ascii ascii-campfire" role="img" aria-label="A campfire: flames flicker over two crossed logs and sparks rise">',
              pre('logs-back', far).rstrip(),
              '<span class="coals" aria-hidden="true"></span>',
              '<span class="flame" aria-hidden="true"></span>' + ''.join(patch_markup),
              pre('logs-front', near).rstrip(),
              ''.join(sparks),
              '</div>', '']
    write('_includes/ascii/campfire.html', '\n'.join(markup))
    return '\n'.join(css) + '\n'


# ── hearth: the campfire in miniature, signing off every page ────────────

def hearth():
    """The same flame field, sampled 2 x 3 cells at a time.

    The window sits three rows above the log line: lower down every sample is
    saturated and the base collapses into a flat row of '@'."""
    w, rows = 13, 5
    frames = []
    for i in range(int(LOOP * FPS / 2)):
        t = i * 2 / FPS
        arr = grid(w, rows)
        for r in range(rows):
            for c in range(w):
                heat = sorted(flame_heat(26 - w + c * 2 + dc + .5 - W / 2, 18.4 - (16 - rows * 3 + r * 3 + dr + .5), t)
                              for dc in range(2) for dr in range(3))
                arr[r][c] = heat_glyph(heat[4])
        frames.append(arr)
    return ('/* hearth */\n' + animation('.ascii-hearth .flame::before', 'ascii-hearth', frames, LOOP)
            + '.ascii-hearth .log::before{content:' + content([list(" '=#=---=#='")]) + '}\n')


# ── forge: hammer, anvil and a hot bar ───────────────────────────────────
# The hammer is hand-drawn in three poses on a fixed wrist (the grip "o"),
# the way a flip-book is drawn, rather than rasterised at an angle. Every
# pose uses the same four-row head. The handle is rigid: each pose draws it
# as one glyph run repeated at a constant step, ending on GRIP, so it can
# never bend; mixing runs (`. then `--) is what made the old handle curve.

GRIP = (27, 5)
HAMMER = {  # head placements, then the handle as (start, step, run, count)
    'up': ([(20, 0, '.--.'), (19, 1, '/##/'), (18, 2, '/##/'), (18, 3, "'--'")],
           ((23, 1), (1, 1), '\\', 5)),
    'mid': ([(12, 1, '.--.'), (12, 2, '|##|'), (12, 3, '|##|'), (12, 4, "'--'")],
            ((16, 2), (3, 1), '`-.', 4)),
    'down': ([(11, 3, '.--.'), (11, 4, '|##|'), (11, 5, '|##|'), (11, 6, "'--'")],
             ((15, 5), (1, 0), '-', 13)),
}


def hammer_pose(pose, w=34, h=13):
    head, ((x, y), (dx, dy), run, count) = HAMMER[pose]
    arr = grid(w, h)
    for hx, hy, text in head:
        put(arr, hx, hy, text)
    for k in range(count):
        put(arr, x + k * dx, y + k * dy, run)
    end = (x + (count - 1) * dx + len(run) - 1, y + (count - 1) * dy)
    assert end == GRIP, f'forge: the {pose} handle ends at {end}, not on the grip'
    put(arr, *GRIP, 'o')
    return arr


BAR = (11, 7)  # the hot bar sits directly under the head's striking face

ANVIL = r"""
     .-----------------.
  -==|_________________|
         \_________/
         _|#######|_
       _|___________|_"""


def forge():
    w, h = 34, 13
    for pose in HAMMER:
        assert '\\\\' not in ''.join(''.join(row) for row in hammer_pose(pose)), f'forge: the {pose} pose draws a doubled backslash'
    script = ['up'] * 9 + ['mid', 'down', 'down', 'down', 'down', 'down', 'mid', 'mid'] + ['up'] * 7
    # Sparks leave the strike point on both sides of the head. Those on the
    # open side rise and fall; those under the handle skim the anvil, so no
    # spark is ever drawn across the hammer.
    burst = [(-1, 1, 1), (-1, 2, 1), (-1, 1, 2), (1, 1, 1), (1, 2, 1), (1, 1, 2)]
    hammer, sparks, bar = [], [], []
    for i, pose in enumerate(script):
        hammer.append(hammer_pose(pose, w, h))
        s = grid(w, h)
        k = i - 10
        if k == 0:
            put(s, BAR[0] - 1, BAR[1] - 1, '-', '')
            put(s, BAR[0] + 4, BAR[1] - 1, '-', '')
        elif 0 < k < 7:
            for side, speed, rise in burst:
                if k <= 6 - speed:
                    x = (BAR[0] - 1 if side < 0 else BAR[0] + 4) + side * speed * k
                    y = BAR[1] - 1 - (rise * min(k, 2) if side < 0 else 0) + max(0, k - 3)
                    put(s, x, y, '*' if k < 3 else '+' if k < 5 else '.')
        sparks.append(s)
        b = grid(w, h)
        put(b, *BAR, '=@@=' if 0 <= k < 2 else '=##=' if 0 <= k < 7 else '=**=')
        bar.append(b)
    for i, (hm, sp) in enumerate(zip(hammer, sparks)):
        assert not any(sp[y][x] != ' ' and hm[y][x] != ' ' for y in range(h) for x in range(w)), \
            f'forge: frame {i} draws a spark across the hammer'
    anvil = grid(w, h)
    stamp(anvil, 1, 8, ANVIL)
    css = ['/* forge */',
           animation('.ascii-forge .hammer::before', 'ascii-forge-hammer', hammer, 2.4),
           animation('.ascii-forge .sparks::before', 'ascii-forge-sparks', sparks, 2.4),
           animation('.ascii-forge .bar::before', 'ascii-forge-bar', bar, 2.4),
           '.ascii-forge .anvil::before{content:' + content(anvil) + '}']
    return '\n'.join(css) + '\n'


# ── the small emblems ────────────────────────────────────────────────────
# Each is 29 cells wide, 9 rows tall (crown and charm 10, bear and seal 11), set at line-height 1.25.
# The helm stands over the hero directory; the seal over governor gear.

MW = 29

CHARM = r'''
              |
       .------+------.
       |# # # # # # #|
       | # # # # # # |
       |# # # # # # #|
 ,_    '------+------'    _,
(o \__________|__________/ o)
  \ (@)(@)(@)(@)(@)(@)(@) /
   \_____________________/ '''
BEAR = r'''
   .--.               .--.
  / .. \.-"""""""""-./ .. \
  \  .-'             '-.  /
   '/                   \'
   |                     |
   |      (o)   (o)      |
   |        .---.        |
    \      / (_) \      /
     '.    '._Y_.'    .'
       '-.         .-'
          '-.___.-' '''
CROWN = r'''
              o
             /^\
     o      /   \      o
    /^\    /     \    /^\
   /   \  /       \  /   \
  /     \/         \/     \
  |                       |
  |   <>     (o)     <>   |
  |=======================|
  '-----------------------' '''
# A die seen from above and to one side. The top and front faces carry pips;
# the narrow right face is left in shadow.
DIE = r'''
    ________
   /       /|
  /       / |
 /       /  |
+-------+   |
|       |   +
|       |  /
|       | /
+-------+/ '''
DIE_ON_CORNER = r'''
      .
    .' '.
  .'  o  '.
 |'.     .'|
 | o '.' o |
 |    |    |
 | o  |  o |
  '.  |  .'
    '.|.' '''
HELM = r'''
        _,;;;;;;;;;,_
     ,;;;;;;;;;;;;;;;;;,
   ,;;'  _.-"""""-._  ';;,
        /           \
       |             |
       |        .----'
       |       (__
       |   |\     \
      _/___| \_____\ '''
# The governor's seal: a heater shield, quartered, the way a coat of arms
# is drawn. The field is counterchanged, so only the outline is mirrored.
SEAL = r'''
   .---------------------.
   |##########|          |
   |##########|          |
   |##########|          |
   |----------+----------|
   |          |##########|
    \         |#########/
     \        |########/
      '.      |######.'
        '-.   |###.-'
           '-.|.-' '''
PIPS = {1: [(2, 1)], 2: [(0, 0), (4, 2)], 3: [(0, 0), (2, 1), (4, 2)],
        4: [(0, 0), (4, 0), (0, 2), (4, 2)], 5: [(0, 0), (4, 0), (2, 1), (0, 2), (4, 2)],
        6: [(0, 0), (4, 0), (0, 1), (4, 1), (0, 2), (4, 2)]}


def mini_frames(kind):
    frames, holds = [], None
    if kind == 'charm':
        # A longship under a chequered sail, shields along the rail. The sea
        # rolls past a cell at a time, the pennant snaps, and a glint runs
        # down the shields.
        base = [list(r.ljust(MW)) for r in art(CHARM)] + [[' '] * MW]
        swell = '~~^~~   '
        for i in range(32):
            arr = [r[:] for r in base]
            put(arr, 1, 9, ''.join(swell[(c + i // 4) % len(swell)] for c in range(1, MW - 1)))
            put(arr, 15, 0, '>' if (i // 2) % 2 == 0 else '~')
            if 12 <= i < 26:
                put(arr, 5 + 3 * ((i - 12) // 2), 7, '*')
            frames.append(arr)
    elif kind == 'bear':
        base = [list(r.ljust(MW)) for r in art(BEAR)]
        for i in range(36):
            arr = [r[:] for r in base]
            if i in (22, 23, 30):
                put(arr, 10, 5, '(-)'); put(arr, 16, 5, '(-)')
            if i in (7, 8, 10, 11):  # a sniff: the nostrils flare
                put(arr, 13, 7, '{_}')
            if i in (26, 27, 29):  # an ear flick, drawn on the ear itself
                put(arr, 3, 0, ".-'.")
            for n, (r, c) in enumerate([(4, 0), (0, 28), (8, 27), (10, 2)]):
                cycle = (i + n * 9) % 36
                put(arr, c, r, '.+*+.'[cycle - 2] if 2 <= cycle < 7 else ' ')
            frames.append(arr)
    elif kind == 'crown':
        # A glint runs along the band, then the three tips catch the light
        # in turn, the tallest first.
        base = [list(r.ljust(MW)) for r in art(CROWN)]
        for i in range(32):
            arr = [r[:] for r in base]
            if 6 <= i < 22:
                col = 3 + (i - 6) * 3 // 2
                for cc in (col, col + 1):
                    if cc < MW and arr[8][cc] == '=':
                        arr[8][cc] = '+' if (i + cc) % 3 else '*'
            for start, (c, r) in zip((23, 26, 29), ((14, 0), (5, 2), (23, 2))):
                if start <= i < start + 2:
                    put(arr, c, r, '*' if i == start else '+')
            frames.append(arr)
    elif kind == 'helm':
        # A crested Spartan helm in profile. Wind runs back through the
        # horsehair crest, the dome catches the light, and stars come and go.
        base = [list(r.ljust(MW)) for r in art(HELM)]
        for i in range(32):
            arr = [r[:] for r in base]
            if 4 <= i < 20:
                gust = 25 - (i - 4) * 3 // 2
                for r in range(3):
                    for cc in (gust, gust + 1):
                        if 0 <= cc < MW and arr[r][cc] == ';':
                            arr[r][cc] = ','
            if i in (22, 23):
                put(arr, 10, 3, '*' if i == 22 else '+')
            for n, (r, c) in enumerate([(4, 3), (0, 25), (7, 24), (8, 2)]):
                cycle = (i + n * 8) % 32
                put(arr, c, r, '.+*+.'[cycle - 2] if 2 <= cycle < 7 else ' ')
            frames.append(arr)
    elif kind == 'seal':
        # A shine sweeps across the shield on a slant: a '/' streak over the
        # plain quarters and a gap through the filled ones. Then the corners
        # and the point catch the light in turn.
        base = [list(r.ljust(MW)) for r in art(SEAL)]
        def edges(row):
            text = ''.join(row).rstrip()
            return len(text) - len(text.lstrip()), len(text) - 1
        inside = {(r, c) for r in range(1, 10) for c in range(edges(base[r])[0] + 1, edges(base[r])[1])
                  if base[r][c] in ' #'}
        for i in range(32):
            arr = [r[:] for r in base]
            if 4 <= i < 22:
                lead = (i - 4) * 2 - 4
                for r, c in inside:
                    if c - 2 * (9 - r) in (lead, lead + 1):
                        arr[r][c] = '/' if base[r][c] == ' ' else ' '
            for start, (c, r) in zip((24, 26, 28), ((3, 0), (25, 0), (14, 10))):
                if start <= i < start + 2:
                    put(arr, c, r, '*' if i == start else '+')
            frames.append(arr)
    elif kind == 'dice':
        # Two dice tumble side over side, each through a pose balanced on a
        # corner, out of step with each other, and land with a puff of dust.
        def die(front, top):
            arr = [list(r.ljust(13)) for r in art(DIE)]
            for dx, dy in PIPS[front]:
                arr[5 + dy][2 + dx] = 'o'
            for dx, dy in PIPS[top]:
                arr[1 + dy][5 + dx - dy] = 'o'
            return [''.join(r) for r in arr]

        landed = ((5, 1), (3, 2))
        # One pose per beat; None is the die up on its corner.
        rolls = [((2, 4), None), (None, (6, 2)), ((4, 5), None), (None, (1, 3)),
                 ((6, 3), None), (None, (5, 4)), ((1, 2), None), (None, (2, 6))]
        holds = []
        for i, poses in enumerate([landed] + rolls + [landed]):
            arr = [[' '] * MW for _ in range(9)]
            for n, (x, pose) in enumerate(zip((0, 16), poses)):
                for r, row in enumerate(art(DIE_ON_CORNER) if pose is None else die(*pose)):
                    put(arr, x, r, row, ' ')
            if i == len(rolls) + 1:  # the landing kicks up dust
                for c, r, g in ((11, 8, '.'), (15, 8, ','), (27, 8, '.'), (13, 7, "'")):
                    put(arr, c, r, g)
            frames.append(arr)
            holds.append(16 if i == 0 else 1)
    elif kind == 'banner':
        for i in range(24):
            frames.append(banner(TAU * i / 24))
    elif kind == 'moon':
        frames = moon_frames()
    return frames, holds


def banner(phase):
    """A war banner rippling in four glyph heights: ' - . _"""
    arr = grid(MW, 9)
    put(arr, 6, 0, 'o')
    for r in range(1, 7):
        put(arr, 6, r, '||')
    put(arr, 5, 7, '_||_')
    put(arr, 4, 8, '|____|')
    level = lambda c: math.sin(phase - (c - 8) * .6) * min(1, (c - 7) / 4)
    glyph = lambda v: "'" if v > .5 else '-' if v > -.05 else '.' if v > -.6 else '_'
    end = 22
    for c in range(8, end):
        put(arr, c, 1, glyph(level(c)))
        put(arr, c, 5, glyph(level(c)))
    put(arr, 13, 2, '\\ /')
    put(arr, 14, 3, 'X')
    put(arr, 13, 4, '/ \\')
    tail = level(end)
    reach = 1 if tail > .5 else 0
    put(arr, end + reach, 2, '\\')
    put(arr, end + reach - 1, 3, '>')
    put(arr, end + reach, 4, '/')
    if reach:
        put(arr, end, 1, glyph(tail))
        put(arr, end, 5, glyph(tail))
    return arr


def moon_frames():
    """The 28-day clock as a moon passing through its phases."""
    ramp = " .:-=+*#"
    rows, rx, ry = 9, 9.4, 4.4
    cx, cy = 14, 4
    frames = []
    for day in range(28):
        phi = TAU * ((day + 11) % 28) / 28
        arr = grid(MW, rows)
        for r in range(rows):
            for c in range(MW):
                u, v = (c - cx) / rx, (r - cy) / ry
                d = u * u + v * v
                if d > 1:
                    continue
                z = math.sqrt(1 - d)
                lit = u * math.sin(phi) - z * math.cos(phi)
                mare = .25 * noise(c * .55 + 3, r * .9 + 5)
                if lit > 0:
                    arr[r][c] = ramp[max(2, min(len(ramp) - 1, int((lit - mare + .2) * 6.5)))]
                elif d > .72:
                    arr[r][c] = '.'
        for n, (r, c) in enumerate([(0, 2), (2, 26), (7, 1), (8, 25), (5, 27)]):
            k = (day + n * 6) % 14
            put(arr, c, r, '.+*+.'[k] if k < 5 else ' ')
        frames.append(arr)
    return frames


MIRROR = str.maketrans('/\\()<>[]{}', '\\/)(><][}{')


def symmetrical(drawing):
    """True when the drawing mirrors about the emblem's centre column."""
    rows = [r.ljust(MW) for r in art(drawing)]
    return all(r == r[::-1].translate(MIRROR) for r in rows)


def minis():
    # Emblems that face the viewer are drawn symmetrical (DESIGN.md, "Animation quality").
    # The helm is drawn in profile, the way a Spartan helm is best known, and
    # the seal's quartered field is counterchanged rather than mirrored.
    for name, drawing in (('bear', BEAR), ('crown', CROWN), ('charm', CHARM)):
        assert symmetrical(drawing), f'{name}: the emblem is not symmetrical about column {MW // 2}'
    css = ['/* emblems */']
    durations = {'charm': 6.4, 'bear': 7.2, 'crown': 8, 'dice': 5.6, 'banner': 3.6, 'moon': 19.6, 'helm': 8, 'seal': 8}
    for kind, duration in durations.items():
        frames, holds = mini_frames(kind)
        css.append(animation(f'.ascii-mini--{kind}::before', f'ascii-mini-{kind}', frames, duration, holds))
    return '\n'.join(css) + '\n'


# ── the march ────────────────────────────────────────────────────────────
# A column walking left in step. Each figure stands on a hip column; its legs
# are a four-pose walk drawn so that the planted foot never slides: the body
# advances one cell per pose and the planted foot recedes one cell, so it
# stays on the same ground cell from contact to contact. Every third figure
# carries a pennant, so a band of repeated tiles still reads as a column.

MARCH_W, MARCH_H, MARCH_GAP = 48, 8, 16
MARCH_FPS = 8
STRIDE = [  # (dx from the hip, row below the hip, glyph): contact, push, passing, reach
    [(-1, 0, '/'), (1, 0, '\\'), (-2, 1, '/'), (2, 1, '\\')],
    [(0, 0, '|'), (1, 0, '\\'), (-1, 1, '/'), (1, 1, '|')],
    [(-1, 0, '/'), (0, 0, '|'), (-1, 1, '\\'), (0, 1, '|')],
    [(-1, 0, '/'), (0, 0, '\\'), (-2, 1, '/'), (1, 1, '\\')],
]
PLANTED = [-2, -1, 0, 1]  # where the weight-bearing foot is, relative to the hip
MARCHERS = {
    'hunt': [(-1, 1, '.-.'), (-1, 2, '(o)'), (-5, 3, '<---/|\\'), (0, 4, '|')],
    'raid': [(-1, 1, '/^\\'), (-1, 2, '(o)'), (-3, 3, '[#]|\\'), (0, 4, '|')],
}
BEARER = [(0, 4, '|'), (2, 0, 'o')] + [(2, r, '|') for r in range(1, 5)]


def pennant(arr, x, i):
    """A two-edged pennant trailing behind the pole, rippling away from it."""
    phase = TAU * i / (MARCH_GAP * 2)
    level = lambda c: math.sin(phase - c * .9) * min(1, (c + 1) / 2)
    glyph = lambda v: "'" if v > .5 else '-' if v > -.05 else '.' if v > -.6 else '_'
    put(arr, x, 1, ''.join(glyph(level(c)) for c in range(5)), '')
    put(arr, x, 2, ''.join(glyph(level(c)) for c in range(4)), '')


def march_frame(kind, i):
    arr = grid(MARCH_W, MARCH_H)
    for c in range(MARCH_W):  # the ground repeats with the tile, so the band has no seams
        if c % 16 in (5, 12):
            arr[MARCH_H - 1][c] = '.' if c % 16 == 5 else '_'
    for origin in range(-MARCH_GAP, MARCH_W + 2 * MARCH_GAP, MARCH_GAP):
        hip = origin - i
        if origin % MARCH_W == 0:
            for dx, r, text in MARCHERS[kind][:2] + [(-1, 3, '/|\\')] + BEARER:
                put(arr, hip + dx, r, text)
            pennant(arr, hip + 3, i)
        else:
            for dx, r, text in MARCHERS[kind]:
                put(arr, hip + dx, r, text)
        for dx, r, glyph in STRIDE[i % 4]:
            put(arr, hip + dx, 5 + r, glyph)
    return arr


def march():
    # The planted foot stays on its ground cell for a whole step: as the hip
    # advances one cell per pose, the foot recedes one cell, and the step
    # ends with it as the trailing foot of the next contact pose.
    for pose, planted in enumerate(PLANTED):
        feet = {dx for dx, row, _ in STRIDE[pose] if row == 1}
        assert planted in feet and planted - pose == PLANTED[0], f'march pose {pose} slides'
    assert PLANTED[-1] + 1 in {dx for dx, row, _ in STRIDE[0] if row == 1}, 'march loop slides'
    css = ['/* march */']
    loop = MARCH_W  # every figure has moved one tile on, so the band repeats exactly
    for kind, selector, name in (('raid', '.ascii-march::before', 'ascii-march'),
                                 ('hunt', '.ascii-march--hunt::before', 'ascii-hunt-march')):
        frames = [march_frame(kind, i) for i in range(loop)]
        css.append(animation(selector, name, frames, loop / MARCH_FPS))
    return '\n'.join(css) + '\n'


if __name__ == '__main__':
    header = '/* Generated by .dsh/build-ascii.py — edit the generator, not this file.\n   Layout and colour for these scenes live in css/ascii.css. */\n'
    write('css/ascii-frames.css', header + campfire() + hearth() + forge() + minis() + march())
    print('wrote css/ascii-frames.css and _includes/ascii/campfire.html')
