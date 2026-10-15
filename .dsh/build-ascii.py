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
    elif kind == 'castle':
        frames = castle_frames()
    return frames, holds


CASTLE_W, CASTLE_H = 37, 17
CASTLE_CLOTH_FRAMES, CASTLE_LAMP_FRAMES, CASTLE_FRAMES = 97, 131, 733


def castle_surface():
    arr = grid(CASTLE_W, CASTLE_H)
    for x in (2, 26):
        put(arr, x, 8, '[_|_|_|_]')
        for r, row in enumerate(('|   _   |', '|  |_|  |', '| : : : |', '| : : : |', '| : : : |', '| : : : |', '|_______|'), 9):
            put(arr, x, r, row)
    for r, row in enumerate(('_|_|_|_', '| . . |', '|_____|', '| : : |'), 7):
        put(arr, 15, r, row)
    for r, row in enumerate(('_|_|_|_|_|_|_|_|_', '| : : : : : : : |', r'| : : /---\ : : |', '| : : | | | : : |', '|_____|_|_|_____|'), 11):
        put(arr, 10, r, row)
    put(arr, 1, 16, '__._________._________._________.__')
    for x in (6, 28):
        put(arr, x, 1, 'o')
        for r in range(2, 8):
            put(arr, x, r, '|')
    for x in (12, 24):
        put(arr, x - 1, 14, '[=]')
        put(arr, x, 15, '|')
    return arr


def castle_cloth(arr, x, width, t, phase):
    period = CASTLE_CLOTH_FRAMES / FPS
    gust = .8 + .35 * noise(math.cos(TAU * t / period) * 2 + phase, math.sin(TAU * t / period) * 2)
    for c in range(1, width + 1):
        reach = min(1, (c - 1) / 3)
        wave = reach * (gust * math.sin(TAU * t / period - c * .55 + phase) + .35 * math.sin(3 * TAU * t / period - c * .8 + phase))
        y = 2 + max(-1, min(1, round(wave)))
        edge = '_' if wave < -.35 else "'" if wave > .35 else '-'
        put(arr, x + c, y, edge)
        put(arr, x + c, y + 3, edge)
        for r in range(1, 3):
            fold = math.sin(TAU * t / period - c * .55 + phase + r * .4)
            put(arr, x + c, y + r, '=' if fold > .35 else '#' if fold < -.4 else ':')
        if c == width // 2:
            put(arr, x + c, y + 1, '#')
            put(arr, x + c, y + 2, '#')
        if c == width:
            put(arr, x + c, y + 1, '|')
            put(arr, x + c, y + 2, '|')


def castle_schedule():
    rng = random.Random(73)
    shots = []
    start = 17
    while start < CASTLE_FRAMES - 48:
        shots.append((start, rng.randrange(18, 22), rng.randrange(19, 29),
                      rng.uniform(.72, 1), rng.randrange(2, 5), rng.uniform(-.15, .3)))
        start += rng.choice((36, 47, 61, 83, 97))
    return shots


CASTLE_SHOTS = castle_schedule()


def castle_shot(beat, target, flight):
    u = beat / (flight - 1)
    c = round((target + 1) * u) - 1
    r = max(0, round(7 - 8 * math.sin(math.pi * u) ** .3))
    return c, 0 if 7 <= c <= 14 else r


def castle_cloth_frames():
    frames = []
    for i in range(CASTLE_CLOTH_FRAMES):
        arr = grid(CASTLE_W, CASTLE_H)
        for x, width, phase in ((6, 8, 0), (28, 7, 1.1)):
            castle_cloth(arr, x, width, i / FPS, phase)
        frames.append(arr)
    return frames


def castle_lamp_frames():
    frames = []
    for i in range(CASTLE_LAMP_FRAMES):
        arr = grid(CASTLE_W, CASTLE_H)
        t = i / CASTLE_LAMP_FRAMES * LOOP
        for x, offset in ((12, 0), (24, 1.9)):
            for r in range(11, 14):
                for c in range(x - 1, x + 2):
                    heat = flame_heat((c - x) * 5, (13.7 - r) * 5, (t + offset) % LOOP)
                    arr[r][c] = heat_glyph(heat * .72)
        frames.append(arr)
    return frames


def castle_frame(i):
    arr = grid(CASTLE_W, CASTLE_H)
    stone = castle_surface()
    for start, target, flight, strength, tail, drift in CASTLE_SHOTS:
        beat = i % CASTLE_FRAMES - start
        if not 0 <= beat < flight + 16:
            continue
        if beat < flight:
            for lag in range(tail, -1, -1):
                if beat >= lag:
                    c, r = castle_shot(beat - lag, target, flight)
                    if 0 <= c < CASTLE_W:
                        put(arr, c, r, '@' if lag == 0 else '*:.'[min(2, lag - 1)])
            c, r = castle_shot(beat, target, flight)
            for dx, dy, glyph in ((-1, 1, '*'), (-2, 1, ':'), (-3, 2, '.')):
                cc, rr = c + dx, r + dy
                if 0 <= cc < CASTLE_W and 0 <= rr < CASTLE_H and stone[rr][cc] == ' ' and not (7 <= cc <= 14 and 1 <= rr <= 6):
                    put(arr, cc, rr, glyph)
        else:
            age = beat - flight
            if age < 10:
                for r in range(2, 9):
                    for c in range(target - 6, target + 7):
                        if stone[r][c] != ' ' and r != 7:
                            continue
                        distance = ((c - target) / (1.4 + age * .55 * strength)) ** 2 + ((r - 7 + age * .15) / (1 + age * .28)) ** 2
                        heat = (1 - distance) * (1 - age / 10) * strength - .22 * noise(c * .8 + start, r * .9 + age * .25)
                        put(arr, c, r, heat_glyph(heat))
            for dx, lift in ((-4, 6), (-2, 8), (1, 9), (3, 7), (5, 5)):
                u = age / 12
                c, r = target + round(dx * u * strength), 7 - round(lift * u - 4 * u * u)
                if age < 14 and 0 <= c < CASTLE_W and 0 <= r < CASTLE_H and stone[r][c] == ' ':
                    put(arr, c, r, '*' if age < 3 else '+' if age < 6 else "'" if age < 10 else '.')
    return arr


def castle_frames():
    frames = [castle_frame(i) for i in range(CASTLE_FRAMES)]
    assert castle_frame(CASTLE_FRAMES) == frames[0], 'castle loop does not close'
    for start, target, flight, _, _, _ in CASTLE_SHOTS:
        for beat in range(1, flight):
            c, r = castle_shot(beat, target, flight)
            assert frames[start + beat][r][c] == '@', f'castle fireball vanishes in frame {start + beat}'
    return frames


def castle_smoke_frames():
    stone = castle_surface()
    frames = []
    for i in range(CASTLE_FRAMES):
        arr = grid(CASTLE_W, CASTLE_H)
        effects = castle_frame(i)
        for start, target, flight, strength, _, drift in CASTLE_SHOTS:
            age = i - start - flight
            if not 0 <= age < 16:
                continue
            for r in range(1, 9):
                for c in range(9, 28):
                    if stone[r][c] != ' ' or effects[r][c] != ' ':
                        continue
                    centre = target + age * drift + math.sin(age * .25 + start) * .6
                    distance = ((c - centre) / (2 + age * .22 * strength)) ** 2 + ((r - 6 + age * .28) / (1.5 + age * .12)) ** 2
                    density = (1 - distance) * (1 - age / 16) * strength - .3 * noise(c * .65 + start, (r + age * .25) * .9)
                    if density > .04:
                        put(arr, c, r, '.,:;o'[min(4, int(density * 7))])
        frames.append(arr)
    return frames


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


MOON_COLS, MOON_ROWS, MOON_FRAMES = 37, 13, 112


def moon_surface():
    samples = []
    shadow = grid(MOON_COLS, MOON_ROWS)
    maria = ((-.36, -.18, .43, .38), (.25, -.36, .32, .27),
             (.48, .06, .25, .32), (-.16, .34, .26, .20))
    craters = ((-.52, -.46, .14), (.12, -.08, .17), (.38, .42, .15),
               (-.30, .57, .13), (-.62, .22, .11), (.58, -.39, .09))
    for r in range(MOON_ROWS):
        for c in range(MOON_COLS):
            u, v = (c - 18) / 12.6, (r - 6) / 5.9
            d = u * u + v * v
            if d > 1:
                continue
            z = math.sqrt(1 - d)
            albedo = .84 + .12 * noise(c * .7 + 3, r * 1.1 + 5)
            for x, y, rx, ry in maria:
                basin = ((u - x) / rx) ** 2 + ((v - y) / ry) ** 2
                albedo -= .32 * math.exp(-basin * 1.8)
            relief_x = relief_y = 0
            for x, y, radius in craters:
                dx, dy = (u - x) / radius, (v - y) / radius
                distance = math.hypot(dx, dy)
                albedo += .22 * math.exp(-((distance - 1) / .25) ** 2)
                albedo -= .25 * math.exp(-distance * distance * 3)
                slope = math.exp(-((distance - .8) / .4) ** 2) * .22
                relief_x += dx * slope
                relief_y += dy * slope
            albedo = max(.25, min(1, albedo))
            shadow[r][c] = '.:o'[min(2, int(albedo * (z * .6 + .4) * 3))]
            samples.append((c, r, u, v, z, albedo, relief_x, relief_y))
    return shadow, samples


def moon_frames():
    ramp = ".,:;=+*#%@"
    _, samples = moon_surface()
    frames = []
    for frame in range(MOON_FRAMES):
        phi = TAU * (frame / MOON_FRAMES + 11 / 28)
        sx, sz = math.sin(phi), -math.cos(phi)
        arr = grid(MOON_COLS, MOON_ROWS)
        for c, r, u, v, z, albedo, relief_x, relief_y in samples:
            light = u * sx + z * sz
            if light <= 0:
                continue
            relief = -relief_x * sx - relief_y * .18
            brightness = albedo * (.20 + .80 * light ** .55) + relief
            index = max(0, min(len(ramp) - 1, int(brightness * (len(ramp) - 1))))
            arr[r][c] = ramp[index]
        for n, (c, r) in enumerate(((2, 1), (33, 3), (4, 10), (31, 11), (35, 7))):
            beat = (frame + n * 23) % MOON_FRAMES
            put(arr, c, r, '+' if 8 <= beat < 12 else '.' if beat < 20 else ' ')
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
    durations = {'charm': 6.4, 'bear': 7.2, 'crown': 8, 'dice': 5.6, 'banner': 3.6, 'moon': 19.6, 'helm': 8, 'seal': 8, 'castle': CASTLE_FRAMES / FPS}
    for kind, duration in durations.items():
        frames, holds = mini_frames(kind)
        if kind == 'moon':
            shadow, _ = moon_surface()
            css.append(f'.ascii-mini--moon::before{{content:{content(shadow)}}}\n')
            css.append(animation('.ascii-mini--moon::after', 'ascii-mini-moon', frames, duration))
        elif kind == 'castle':
            css.append(f'.ascii-mini--castle::before{{content:{content(castle_surface())}}}\n')
            css.append(animation('.ascii-mini--castle::after', 'ascii-castle-cloth', castle_cloth_frames(), CASTLE_CLOTH_FRAMES / FPS))
            css.append(animation('.ascii-mini--castle .castle-lamps::before', 'ascii-castle-lamps', castle_lamp_frames(), CASTLE_LAMP_FRAMES / FPS))
            css.append(animation('.ascii-mini--castle .castle-siege::before', 'ascii-castle-siege', frames, duration))
            css.append(animation('.ascii-mini--castle .castle-smoke::before', 'ascii-castle-smoke', castle_smoke_frames(), duration))
        else:
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
MARCH_PENNANT_FRAMES = MARCH_GAP * 2
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
    phase = TAU * i / MARCH_PENNANT_FRAMES
    level = lambda c: math.sin(phase - c * .9) * min(1, (c + 1) / 2)
    glyph = lambda v: "'" if v > .5 else '-' if v > -.05 else '.' if v > -.6 else '_'
    put(arr, x, 1, ''.join(glyph(level(c)) for c in range(5)), '')
    put(arr, x, 2, ''.join(glyph(level(c)) for c in range(4)), '')


def march_frame(kind, i):
    arr = grid(MARCH_W, MARCH_H)
    for c in range(MARCH_W):  # the ground repeats with the tile, so the band has no seams
        if c % 16 in (5, 12):
            arr[MARCH_H - 1][c] = '.' if c % 16 == 5 else '_'
    start = (i // MARCH_GAP - 1) * MARCH_GAP
    for origin in range(start, i + MARCH_W + 2 * MARCH_GAP, MARCH_GAP):
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
    loop = math.lcm(MARCH_W, MARCH_PENNANT_FRAMES, len(STRIDE))
    for kind, selector, name in (('raid', '.ascii-march::before', 'ascii-march'),
                                 ('hunt', '.ascii-march--hunt::before', 'ascii-hunt-march')):
        frames = [march_frame(kind, i) for i in range(loop)]
        assert march_frame(kind, loop) == frames[0], f'{kind}: march loop does not close'
        css.append(animation(selector, name, frames, loop / MARCH_FPS))
    return '\n'.join(css) + '\n'



# ── constellations: Bear Hunt's night sky ───────────────────────────────
# Stars sit on whole cells and twinkle by changing glyph in place; the lines
# between them are drawn and unwoven a cell at a time; a star that leaves its
# place steps one cell per frame. A row is about two columns tall, so slopes
# and distances are measured with ASPECT.

ASPECT = 2.08


def link_cells(a, b):
    """The cells of a line from star a to star b, in order, with its glyphs.

    A shallow line is a run of '-', a steep or diagonal one takes one glyph a
    row, so a slope reads as a dotted stroke rather than a stair of '///'.
    The cells beside each star in its own row are left clear."""
    (r0, c0), (r1, c1) = a, b
    dr, dc = r1 - r0, c1 - c0
    angle = math.degrees(math.atan2(abs(dr) * ASPECT, abs(dc)))
    glyph = '-' if angle < 28 else '|' if angle > 72 else '\\' if (dr > 0) == (dc > 0) else '/'
    steps = abs(dc) if glyph == '-' else abs(dr)
    if not steps:
        return []
    cells = [((round(r0 + dr * k / steps), round(c0 + dc * k / steps)), glyph) for k in range(1, steps)]
    clear = lambda cell, star: cell[0] == star[0] and abs(cell[1] - star[1]) <= 1
    return [(cell, g) for cell, g in cells if not clear(cell, a) and not clear(cell, b)]


# The bear in the stars: a walking bear, facing right, is a patch of sky where
# the stars crowd together. Its brightest stars sit on the shape a person
# would trace (nose, brow, ear, hump, back, rump, knees and paws, belly,
# throat) and only those are joined, the way a star chart joins a figure's
# brightest lights. Nothing moves: each star twinkles in place on its own slow
# beat, so from one frame to the next only a glyph or two changes.
URSA_W, URSA_H = 43, 15
URSA = {  # the bright stars: (row, column)
    'hind_paw': (13, 6), 'hind_knee': (9, 7), 'rump': (4, 4), 'back': (2, 12),
    'hump': (0, 21), 'ear': (2, 30), 'brow': (4, 35), 'nose': (6, 41),
    'throat': (8, 34), 'fore_knee': (10, 29), 'fore_paw': (13, 31), 'belly': (10, 18),
}
URSA_LINKS = [('hind_paw', 'hind_knee'), ('hind_knee', 'rump'), ('rump', 'back'), ('back', 'hump'),
              ('hump', 'ear'), ('ear', 'brow'), ('brow', 'nose'), ('nose', 'throat'),
              ('throat', 'fore_knee'), ('fore_knee', 'fore_paw'),
              ('hind_knee', 'belly'), ('belly', 'fore_knee')]
URSA_FRAMES, URSA_FPS = 60, 5


def ursa_body(r, c):
    """True inside the bear: a body, a head, and a fore and hind leg."""
    body = ((c - 19) / 15) ** 2 + ((r - 5.5) / 4.6) ** 2 <= 1
    head = ((c - 35) / 6) ** 2 + ((r - 4.5) / 3) ** 2 <= 1
    legs = 9 <= r <= 13 and (5 <= c <= 11 or 28 <= c <= 33)
    return body or head or legs


def ursa_sky():
    """The stars as (row, column, rest glyph, twinkle glyph, beat)."""
    lines = {cell for a, b in URSA_LINKS for cell, _ in link_cells(URSA[a], URSA[b])}
    bright = set(URSA.values())
    stars = [(r, c, '*', '+', 7 + n * 5) for n, (r, c) in enumerate(URSA.values())]
    taken = set()
    for r, c in bright | lines:
        taken |= {(r, c - 1), (r, c), (r, c + 1)}
    for r in range(URSA_H):
        for c in range(URSA_W):
            inside = ursa_body(r, c)
            roll = hash2(c + 101, r + 37)
            if (r, c) in taken or roll > (.16 if inside else .035):
                continue
            if any((r + dr, c + dc) in taken for dr in (-1, 0, 1) for dc in (-1, 0, 1)):
                continue
            mid = inside and roll < .05
            stars.append((r, c, '+' if mid else '.', '*' if mid else '+', int(hash2(c, r + 9) * URSA_FRAMES)))
            taken.add((r, c))
    return stars


def ursa_frames():
    lines = grid(URSA_W, URSA_H)
    for a, b in URSA_LINKS:
        for (r, c), g in link_cells(URSA[a], URSA[b]):
            put(lines, c, r, g)
    stars = ursa_sky()
    frames = []
    for i in range(URSA_FRAMES):
        sky = grid(URSA_W, URSA_H)
        for r, c, rest, flash, beat in stars:
            put(sky, c, r, flash if (i - beat) % URSA_FRAMES < 2 else rest)
        frames.append(sky)
    for i in range(URSA_FRAMES):  # a quiet sky: only a few glyphs change between frames
        changed = sum(x != y for r0, r1 in zip(frames[i], frames[(i + 1) % URSA_FRAMES]) for x, y in zip(r0, r1))
        assert changed <= 4, f'ursa: {changed} stars change at frame {i}'
    return [lines] * URSA_FRAMES, frames


# The sky band: stars in three depths wheel left across a repeating tile, the
# nearer faster, and each links to its nearest neighbours while they are close.
# A Dipper rides the middle depth as the band's landmark. Every depth crosses
# a whole number of tiles in one loop, so the band closes without a seam.
SKY_W, SKY_H, SKY_FRAMES, SKY_FPS = 48, 8, 288, 8


def sky_stars():
    rng = random.Random(41)
    stars = []
    for depth, count in ((1, 5), (2, 3), (3, 3)):
        for _ in range(count):
            stars.append((rng.uniform(0, SKY_W), rng.randrange(0, SKY_H), depth, rng.random() < .3))
    dipper = [(0, 0), (1, 5), (1, 9), (2, 13), (4, 13), (4, 18), (1, 18)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 3)]
    first = len(stars)
    for r, c in dipper:
        stars.append((c + 14, r + 1, 2, True))
    return stars, [(first + a, first + b) for a, b in edges]


def sky_frames():
    stars, dipper = sky_stars()
    lines, points = [], []
    for i in range(SKY_FRAMES):
        at = [((round(x - depth * SKY_W * i / SKY_FRAMES)) % SKY_W, r, depth, bright) for x, r, depth, bright in stars]
        arr = grid(SKY_W, SKY_H)
        links = set(dipper)
        for n, (c, r, depth, _) in enumerate(at):
            if n >= len(stars) - 7:
                continue
            near = []
            for m, (c2, r2, depth2, _) in enumerate(at):
                if m == n or m >= len(stars) - 7:
                    continue
                dc = (c2 - c + SKY_W // 2) % SKY_W - SKY_W // 2
                d = math.hypot(dc, (r2 - r) * ASPECT)
                if 5 <= d <= 13:
                    near.append((d, m))
            for _, m in sorted(near)[:1]:
                links.add((min(n, m), max(n, m)))
        taken = {(r, c) for c, r, _, _ in at}
        for link in sorted(links, key=lambda link: (link not in dipper, link)):
            n, m = link  # the Dipper first; the field never crosses it
            c, r = at[n][0], at[n][1]
            dc = (at[m][0] - c + SKY_W // 2) % SKY_W - SKY_W // 2
            cells = [((rr, cc % SKY_W), g) for (rr, cc), g in link_cells((r, c), (at[m][1], c + dc))]
            if link not in dipper and any(cell in taken for cell, _ in cells):
                continue
            for (rr, cc), g in cells:
                arr[rr][cc] = '.' if (n, m) not in dipper and g == '-' else g
                taken.add((rr, cc))
        for row in arr:  # two links side by side would read as a doubled stroke
            for c in range(1, SKY_W):
                if row[c] == row[c - 1] == '\\':
                    row[c] = ' '
        lines.append(arr)
        sky = grid(SKY_W, SKY_H)
        for n, (c, r, depth, bright) in enumerate(at):
            beat = (i + n * 29) % 48
            glyph = ('*' if bright else '+') if depth > 1 else '.'
            if beat in (7, 8):
                glyph = {'*': '+', '+': '*', '.': '+'}[glyph]
            sky[r][c] = glyph
        points.append(sky)
    assert [(round(x - d * SKY_W)) % SKY_W for x, _, d, _ in stars] == [round(x) % SKY_W for x, *_ in stars]
    return lines, points


def constellations():
    css = ['/* constellations */']
    lines, stars = ursa_frames()
    css.append(animation('.ascii-mini--ursa::before', 'ascii-ursa-lines', lines, URSA_FRAMES / URSA_FPS))
    css.append(animation('.ascii-mini--ursa::after', 'ascii-ursa-stars', stars, URSA_FRAMES / URSA_FPS))
    lines, stars = sky_frames()
    css.append(animation('.ascii-march--sky::before', 'ascii-sky-lines', lines, SKY_FRAMES / SKY_FPS))
    css.append(animation('.ascii-march--sky::after', 'ascii-sky-stars', stars, SKY_FRAMES / SKY_FPS))
    return '\n'.join(css) + '\n'



# ── aurora: the night sky over the hunt ─────────────────────────────────
# Looking straight up on a clear night: the Great Bear in the middle of the
# sky and the aurora drawn over it. Built the way the campfire is: fields
# sampled per cell and read through a density ramp, in layers stacked back to
# front, each on a loop of its own so the stack never lines up twice:
#
#   stars         7.4 s  field stars twinkling in place
#   bear         16.3 s  the Great Bear, traced star to star now and then
#   veil         53.3 s  a faint violet haze drifting across the whole sky
#   (each ribbon carries a dark fill under its lit cells, on its own loop,
#    so the stars it crosses dim behind it)
#   far ribbon   43.1 s  a faint ribbon high in the sky
#   near ribbon  29.7 s  the main ribbon: a pale green lower edge and rays
#                        that climb from it and turn pink and then violet at
#                        their tips, each ray at its own height
#   meteors      11.3, 17.9 s
#
# The aurora layers are translucent and sit in front of the stars, so the bear
# shows through the curtains the way stars do through a real display. The
# motion is slow travelling waves: rays drift along a ribbon and folds roll
# through its edge a turn or two per loop. Each wave turns a whole number of
# times per loop and the noise travels a circle in noise space, so each
# layer's last frame runs straight into its first.

AURORA_W, AURORA_H, AURORA_FPS = 48, 15, 6
AURORA_RAMP = ' .,:;=+*'
# (edge row at the left, at the right, ray reach, brightness, seed, loop)
NEAR_RIBBON = (11.2, 9.4, 5.6, 1.0, 0, 29.7)
FAR_RIBBON = (3.6, 5.2, 2.6, .6, 4.1, 43.1)
VEIL_LOOP = 53.3


def wave(t, loop, turns):
    """A phase that turns `turns` whole times per loop."""
    return TAU * turns * t / loop


def loop_orbit(t, loop, speed, seed=0):
    r = speed * loop / TAU
    a = TAU * t / loop
    return r * math.cos(a) + seed * 7.1, r * math.sin(a) - seed * 3.3


def ribbon_at(c, r, t, ribbon):
    """How bright a ribbon is at a cell, how far the cell sits above its lower
    edge, and how far that ray reaches there."""
    left, right, reach, gain, seed, loop = ribbon
    x = c / AURORA_W
    edge = (left + (right - left) * x + 1.3 * math.sin(TAU * x + wave(t, loop, 1) + seed)
            + .6 * math.sin(TAU * 2.3 * x - wave(t, loop, 2) + 1.3 + seed))
    ox, oy = loop_orbit(t, loop, .45, seed)
    rays = (.5 + .5 * math.sin(TAU * 4 * x - wave(t, loop, 2) + seed)) * .35 \
        + (.5 + .5 * math.sin(TAU * 9 * x + wave(t, loop, 3) + 2 + seed)) * .2 \
        + noise(x * 16 + ox, oy) * .6
    rays = max(0, min(1, (rays - .38) * 2))
    surge = .55 + .45 * max(0, math.sin(TAU * x * 1.2 - wave(t, loop, 1) + seed * 3)) ** 2 \
        + .25 * noise(x * 3 + ox * .4, 9 + oy * .4)
    d = edge - r
    span = reach * (.3 + rays)
    if d < -1.5:
        return 0, d, span
    v = surge * (.2 + .95 * rays ** 1.5) * (math.exp(-d / span) if d >= 0 else math.exp(d * 1.6))
    sx, sy = loop_orbit(t, loop, .6, seed + 1)
    return gain * (v - .1 * noise(c * .45 + sx, r * .8 + sy)), d, span


def ramp(v):
    return AURORA_RAMP[max(1, min(len(AURORA_RAMP) - 1, int(v * .9 * (len(AURORA_RAMP) - 1)) + 1))]


def tint(c, r, t, d, span, seed, loop):
    """Green low on a ray, pink and then violet towards its tip. Where the
    colour turns depends on the ray's own height and a slow wander, so the
    hues follow the rays instead of lying in bands."""
    ox, oy = loop_orbit(t, loop, .35, seed + 7)
    turn = span * (.45 + .45 * noise(c * .3 + ox, oy))
    if d < turn:
        return 'green'
    return 'pink' if d < turn + .35 * span + .5 else 'violet'


def ribbon_frames(ribbon, hues, fill):
    """One ribbon on its own loop, each hue in its own layer so it can take
    its own colour. The hues partition the ribbon's cells, so within a ribbon
    no two glyphs ever share a cell. The fill layer is the ribbon's shadow:
    a solid block under every lit cell, drawn in the night's colour behind
    the ribbon and in front of the stars, so a star the aurora crosses dims."""
    loop = ribbon[5]
    layers = {k: [] for k in hues + (fill,)}
    for i in range(round(loop * AURORA_FPS)):
        t = i / AURORA_FPS
        out = {k: grid(AURORA_W, AURORA_H) for k in layers}
        for c in range(AURORA_W):
            for r in range(AURORA_H):
                v, d, span = ribbon_at(c, r, t, ribbon)
                if v > .12:
                    hue = 'edge' if d < .7 else tint(c, r, t, d, span, ribbon[4], loop)
                    hue = hue if hue in hues else hues[0] if hue in ('edge', 'green') else hues[-1]
                    out[hue][r][c] = ramp(v)
                    out[fill][r][c] = '\u2588'
        for k in layers:
            layers[k].append(out[k])
    return layers


def veil_frames():
    """A faint haze that wanders across the sky behind the ribbons' glow."""
    frames = []
    for i in range(round(VEIL_LOOP * AURORA_FPS)):
        t = i / AURORA_FPS
        ox, oy = loop_orbit(t, VEIL_LOOP, .5, 11)
        arr = grid(AURORA_W, AURORA_H)
        for c in range(AURORA_W):
            for r in range(AURORA_H):
                v = noise(c * .09 + ox, r * .19 + oy) * 1.2 - .95 + .25 * noise(c * .5 - oy, r * .7 + ox)
                if v > .08:
                    arr[r][c] = '.' if v < .18 else ','
        frames.append(arr)
    return frames


def aurora_meteors(seed, frames, starts):
    """Shooting stars: a head that crosses one cell a frame down a slope,
    trailing a tail that thins, then nothing until the next one."""
    rng = random.Random(seed)
    out = [grid(AURORA_W, AURORA_H) for _ in range(frames)]
    for start in starts:
        c0, r0 = rng.randrange(16, 44), rng.randrange(0, 6)
        run = rng.randrange(6, 9)
        for k in range(run + 4):
            arr = out[(start + k) % frames]
            for lag, glyph in enumerate('*=-.'):
                j = k - lag
                if 0 <= j < run:
                    c, r = c0 - j * 2, r0 + j // 2
                    if 0 <= c < AURORA_W and r < AURORA_H and arr[r][c] == ' ':
                        arr[r][c] = glyph
    return out


# The Great Bear in the middle of the sky, placed from its stars' real right
# ascension and declination: the Dipper is its tail and back, the head and
# snout run west of Dubhe, and its three pairs of paws hang below. The sky
# has no lines in it; instead, every 16 s a light runs star to star along
# the figure, leaving a trail that fades behind it, and the whole bear
# brightens for a moment before it rests.
BEAR_STARS = {
    'alkaid': (6, 4), 'mizar': (4, 10), 'alioth': (4, 13), 'megrez': (3, 18),
    'phecda': (5, 20), 'merak': (4, 26), 'dubhe': (1, 26),
    'h': (1, 34), 'muscida': (2, 41), 'upsilon': (2, 33), 'theta': (5, 37),
    'kappa': (7, 42), 'iota': (7, 43), 'psi': (8, 25), 'lambda': (9, 33), 'mu': (9, 32),
    'chi': (7, 20), 'nu': (12, 24), 'xi': (13, 24),
}
BEAR_PATH = [('alkaid', 'mizar'), ('mizar', 'alioth'), ('alioth', 'megrez'), ('megrez', 'dubhe'),
             ('dubhe', 'merak'), ('merak', 'phecda'), ('phecda', 'megrez'), ('dubhe', 'h'),
             ('h', 'muscida'), ('h', 'upsilon'), ('upsilon', 'merak'), ('upsilon', 'theta'),
             ('theta', 'kappa'), ('kappa', 'iota'), ('merak', 'psi'), ('psi', 'mu'), ('mu', 'lambda'),
             ('phecda', 'chi'), ('chi', 'nu'), ('nu', 'xi')]
TRACE_LOOP, TRACE_FPS = 16.3, 10
BEAR_SPEED = 1.1  # cells a frame along the figure


def bear_trace():
    """When each line cell is passed, and when each star is reached."""
    cells, reached, at = [], {'alkaid': 0}, 0.0
    for a, b in BEAR_PATH:
        at = max(at, reached.get(a, at))
        path = link_cells(BEAR_STARS[a], BEAR_STARS[b])
        for k, (cell, g) in enumerate(path):
            cells.append((at + (k + 1) / BEAR_SPEED, cell, g))
        at += (len(path) + 1) / BEAR_SPEED
        reached[b] = min(reached.get(b, at), at)
    return cells, reached, at


def star_field():
    near = {(r + dr, c + dc) for r, c in BEAR_STARS.values() for dr in (-1, 0, 1) for dc in (-1, 0, 1)}
    near |= {cell for a, b in BEAR_PATH for cell, _ in link_cells(BEAR_STARS[a], BEAR_STARS[b])}
    return [(c, r) for r in range(AURORA_H) for c in range(AURORA_W)
            if hash2(c + 3, r * 7) < .04 and (r, c) not in near]


def aurora_stars():
    """The background stars: small, dim, twinkling on a 7.4 s loop."""
    field = star_field()
    frames = []
    count = round(7.4 * AURORA_FPS)
    for i in range(count):
        arr = grid(AURORA_W, AURORA_H)
        for c, r in field:
            beat = (i + int(hash2(c, r) * count)) % count
            arr[r][c] = '+' if beat == 5 else "'" if beat in (4, 6) else '.'
        frames.append(arr)
    return frames, 7.4


def bear_frames():
    """The bear's stars at rest, and the trace: a light that runs the figure,
    the trail it leaves, and the stars it lights."""
    cells, reached, length = bear_trace()
    count = round(TRACE_LOOP * TRACE_FPS)
    start = 20
    shine = start + length + 2  # the whole bear holds its light for a moment
    rest, trace = [], []
    for i in range(count):
        stars, light = grid(AURORA_W, AURORA_H), grid(AURORA_W, AURORA_H)
        for at, (r, c), g in cells:
            age = i - start - at
            if 0 <= age < 12:
                light[r][c] = g
            elif 12 <= age < 20:
                light[r][c] = '.'
        for n, (name, (r, c)) in enumerate(BEAR_STARS.items()):
            age = i - start - reached[name]
            lit = 0 <= age < 16 or shine <= i < shine + 18
            if lit:
                light[r][c] = '*'
            else:
                stars[r][c] = '+' if (i + n * 13) % 40 == 7 else '*'
        rest.append(stars)
        trace.append(light)
    assert shine + 18 < count, 'bear trace runs past its loop'
    return rest, trace


def aurora():
    css = ['/* aurora */']
    sel = '.ascii-mini--aurora .aurora-{}::before'
    stars, star_loop = aurora_stars()
    css.append(animation(sel.format('stars'), 'ascii-aurora-stars', stars, star_loop))
    rest, trace = bear_frames()
    css.append(animation(sel.format('bear'), 'ascii-aurora-bear', rest, TRACE_LOOP))
    css.append(animation(sel.format('trace'), 'ascii-aurora-trace', trace, TRACE_LOOP))
    css.append(animation(sel.format('veil'), 'ascii-aurora-veil', veil_frames(), VEIL_LOOP))
    for ribbon, hues, fill in ((FAR_RIBBON, ('far', 'far-tip'), 'far-fill'),
                               (NEAR_RIBBON, ('edge', 'green', 'pink', 'violet'), 'fill')):
        for name, frames in ribbon_frames(ribbon, hues, fill).items():
            css.append(animation(sel.format(name), f'ascii-aurora-{name}', frames, ribbon[5]))
    for n, (seconds, starts) in enumerate(((11.3, (20,)), (17.9, (30, 80)))):
        count = round(seconds * AURORA_FPS)
        css.append(animation(sel.format(f'meteors-{n}'), f'ascii-aurora-meteors-{n}',
                             aurora_meteors(83 + n, count, starts), seconds))
    return '\n'.join(css) + '\n'


if __name__ == '__main__':
    header = '/* Generated by .dsh/build-ascii.py — edit the generator, not this file.\n   Layout and colour for these scenes live in css/ascii.css. */\n'
    write('css/ascii-frames.css', header + campfire() + hearth() + forge() + minis() + march() + constellations() + aurora())
    print('wrote css/ascii-frames.css and _includes/ascii/campfire.html')

