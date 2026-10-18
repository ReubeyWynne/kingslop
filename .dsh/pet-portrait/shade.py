#!/usr/bin/env python3
"""Bake a pet's portrait frames from its low-poly model.

    npm i --no-save three@0.169.0
    python3 -m pip install numpy pillow
    python3 .dsh/pet-portrait/shade.py grizzly-bear path/to/model.stl

Writes .dsh/pet-portraits/<pet>.json, which .dsh/build-ascii.py turns into
stepped CSS frames. This runs offline only; the site never loads the model.

The shader follows the usual text-shader recipe: render the model, then for
each character cell pick a glyph from the light falling on it, a colour from
the fur under it times that light, and a line glyph where the model's
silhouette or a depth step runs through the cell. Each pose is the same model
bent a little (an ear tipped, the nose flared, the head lowered) and rendered
through the same camera, so the frames differ only where the pet moved.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'pet-portraits')
CW, CH = 8, 17                      # render pixels per character cell
RAMP = ' .:-=+*#%@'
# The inks, darkest first; css/ascii.css holds the same names as tokens.
INKS = {'night': '#6E4636', 'umber': '#93604A', 'bark': '#B67F5A', 'fur': '#D49C6C',
        'tawny': '#EDBC86', 'cream': '#F8DDB0', 'bone': '#FFF5E2'}
INK_RGB = np.stack([[int(v[i:i + 2], 16) / 255 for i in (1, 3, 5)] for v in INKS.values()])
NAMES = list(INKS)
LIGHT = dict(key=2.2, amb=0.25, rim=0.7, fill=1.1, keypos=[-0.6, 2.4, 0.4])


def grizzly_pose(lift=-0.4, turn=-0.45, head=1.1):
    """Chin up and head turned to the viewer: the model's own pose hangs its head."""
    neck = dict(sel={}, soft=[0.08, 0.36], pivot=[0, 0.2, 0.2])
    return [dict(neck, axis=[1, 0, 0], angle=lift, scale=head), dict(neck, axis=[0, 1, 0], angle=turn)]


EAR_FLICK = dict(sel=dict(ymin=0.36, xmin=0.08, zmin=0.25), pivot=[0.2, 0.4, 0.45], axis=[0, 0, 1], angle=0.28)
SNIFF = dict(sel=dict(zmin=0.9), pivot=[0, 0.0, 0.95], scale=1.12, move=[0, 0.015, 0])

PETS = {
    'grizzly-bear': dict(
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05,
        fur=[0.62, 0.40, 0.27],
        # model-space regions (the model is scaled to fit -1..1 with the snout towards +z)
        regions=dict(muzzle=dict(zmin=0.74, ymax=0.12, rgb=[1.0, 0.86, 0.64]),
                     nose=dict(zmin=0.96, ymin=-0.03, rgb=[0.10, 0.07, 0.07]),
                     ears=dict(ymin=0.44, rgb=[0.84, 0.54, 0.36])),
        eyes=[(-0.14, 0.16, 0.80), (0.14, 0.16, 0.80)], head_z=0.3,
        poses={
            'still': dict(deform=grizzly_pose()),
            'blink': dict(deform=grizzly_pose(), eye='-'),
            'ear': dict(deform=[EAR_FLICK] + grizzly_pose()),
            'sniff': dict(deform=[SNIFF] + grizzly_pose()),
            'happy': dict(deform=grizzly_pose(), eye='^'),
            'happy-ear': dict(deform=[EAR_FLICK] + grizzly_pose(), eye='^'),
            'low': dict(deform=grizzly_pose(lift=-0.3)),
            'low-blink': dict(deform=grizzly_pose(lift=-0.3), eye='-'),
            'asleep': dict(deform=grizzly_pose(lift=-0.22), eye='-'),
        }),
}


def render(stl, tmp, cols, rows, modes=('lit', 'normal', 'depth', 'pos'), **opts):
    out = os.path.join(tmp, 'r')
    opts['modes'] = list(modes)
    subprocess.run(['node', os.path.join(HERE, 'render.cjs'), json.dumps(dict(stl=stl, w=cols * CW, h=rows * CH, out=out, **opts))], check=True)
    return {k: np.asarray(Image.open(f'{out}-{k}.png').convert('RGBA')).astype(float) / 255 for k in modes}


def fit(stl, tmp, cols, rows, yaw, pitch, deform, fov=26, fill=0.8, lift=0.04):
    """Aim the camera so the head (model z > 0.3, above the chest) fills the frame."""
    t, dist = np.array([0, 0.2, 0.6]), 2.6
    for _ in range(4):
        R = render(stl, tmp, cols // 2, rows // 2, yaw=yaw, pitch=pitch, fov=fov, dist=dist, target=t.tolist(), modes=['pos'], deform=deform)
        im = R['pos']; h, w = im.shape[:2]
        p = im[..., :3] * 2 - 1
        ys, xs = np.nonzero((im[..., 3] > 0.5) & (p[..., 2] > 0.3) & (p[..., 1] > -0.2))
        cx, cy = (xs.min() + xs.max()) / 2 / w - 0.5, (ys.min() + ys.max()) / 2 / h - 0.5 - lift
        f = -np.array([np.sin(yaw) * np.cos(pitch), np.sin(pitch), np.cos(yaw) * np.cos(pitch)])
        right = np.cross(f, [0, 1, 0]); right /= np.linalg.norm(right); up = np.cross(right, f)
        vh = 2 * dist * np.tan(np.radians(fov / 2)); vw = vh * w / h
        t = t + right * cx * vw - up * cy * vh
        dist *= max((xs.max() - xs.min()) / w, (ys.max() - ys.min()) / h) / fill
    return dict(yaw=yaw, pitch=pitch, fov=fov, dist=float(dist), target=t.tolist())


def sobel(a):
    p = np.pad(a, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    return gx, gy


def laplace(a):
    p = np.pad(a, 1, mode='edge')
    return np.abs(p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] - 4 * a)


def region(p, spec):
    m = np.ones(p.shape[:2], bool)
    for k, v in spec.items():
        if k == 'rgb':
            continue
        axis = 'xyz'.index(k[0])
        m &= (p[..., axis] >= v) if k.endswith('min') else (p[..., axis] <= v)
    return m


def shade(R, cfg, cols, rows, eye='o', mouth='w', body_dim=0.8, edge_frac=0.1, dstep=0.02):
    a = R['lit'][..., 3]; m = a > 0.5
    lum = R['lit'][..., 0]
    lo, hi = np.percentile(lum[m], [1, 99.5]); L = np.clip((lum - lo) / (hi - lo), 0, 1)
    p = R['pos'][..., :3] * 2 - 1
    z = p[..., 2]
    alb = np.broadcast_to(np.array(cfg['fur']), p.shape).copy()
    masks = {}
    for name in ('ears', 'muzzle', 'nose'):     # later regions paint over earlier ones
        masks[name] = region(p, cfg['regions'][name])
        alb[masks[name]] = cfg['regions'][name]['rgb']
    rgb = alb * (0.3 + 0.95 * L[..., None])
    head = z > cfg['head_z']
    rgb[~head] *= body_dim                      # the body sinks back so the face leads
    depth = np.where(m, R['depth'][..., 0], 1.0)
    sx, sy = sobel(m.astype(float))
    edge = ((np.hypot(sx, sy) > 0.5) | (laplace(depth) > dstep)) & head
    gx, gy = sobel(depth - m)
    ang = (np.degrees(np.arctan2(-gy, gx)) + 180) % 180
    slope = np.select([(ang < 22.5) | (ang >= 157.5), ang < 67.5, ang < 112.5], [0, 1, 2], 3)
    layers = {k: [[' '] * cols for _ in range(rows)] for k in NAMES}

    def put(r, c, glyph, ink):
        for g in layers.values():
            g[r][c] = ' '
        layers[ink][r][c] = glyph

    for r in range(rows):
        for c in range(cols):
            sl = (slice(r * CH, (r + 1) * CH), slice(c * CW, (c + 1) * CW))
            mm = m[sl]
            if mm.mean() < 0.2:
                continue
            col = rgb[sl][mm].mean(0)
            ink = int(np.argmin(((INK_RGB - col) ** 2).sum(1)))
            if (masks['nose'][sl] & mm).mean() > 0.3:
                put(r, c, '@', 'night')
                continue
            e = edge[sl] & mm
            if e.sum() > CW * CH * edge_frac:   # line glyphs a little brighter than the fill
                put(r, c, '|/_\\'[np.bincount(slope[sl][e], minlength=4).argmax()], NAMES[min(len(NAMES) - 1, ink + 2)])
            else:
                t = min(0.999, float(col @ [0.5, 0.35, 0.15]) / 0.82)
                put(r, c, RAMP[max(1, min(9, int(t * 10)))], NAMES[ink])

    def cell_of(mask):
        cnt = mask.reshape(rows, CH, cols, CW).sum((1, 3))
        return np.unravel_index(cnt.argmax(), cnt.shape) if cnt.max() >= 6 else None

    x, y = p[..., 0], p[..., 1]
    for ex, ey, ez in cfg['eyes']:
        at = cell_of((np.sqrt((x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2) < 0.05) & m)
        if at:
            put(*at, eye, 'bone')
    nose = masks['nose'] & m
    cnt = nose.reshape(rows, CH, cols, CW).sum((1, 3))
    rr, cc = np.nonzero(cnt > CW * CH * 0.08)
    if mouth and len(rr) and rr.max() + 1 < rows:
        put(rr.max() + 1, int(round(cc[rr == rr.max()].mean())), mouth, 'umber')
    # the site's frames never draw two backslashes side by side; the second of a pair becomes an underscore
    for r in range(rows):
        for c in range(1, cols):
            here = [k for k in NAMES if layers[k][r][c] == '\\']
            if here and any(layers[k][r][c - 1] == '\\' for k in NAMES):
                layers[here[0]][r][c] = '_'
    return {k: [''.join(row).rstrip() for row in g] for k, g in layers.items()}


def main(pet, stl):
    cfg = PETS[pet]
    cols, rows, tall = cfg['cols'], cfg['rows'], cfg['render_rows']
    with tempfile.TemporaryDirectory() as tmp:
        cam = fit(stl, tmp, cols, tall, cfg['yaw'], cfg['pitch'], cfg['poses']['still']['deform'])
        cam.update(LIGHT)
        poses = {}
        for name, pose in cfg['poses'].items():
            R = render(stl, tmp, cols, tall, deform=pose['deform'], **cam)
            poses[name] = shade(R, cfg, cols, tall, eye=pose.get('eye', 'o'))
    # crop every pose to the same rows: the art's top, then as many rows as the pen holds
    used = [r for pose in poses.values() for g in pose.values() for r, row in enumerate(g) if row.strip()]
    top = max(0, min(used) - 1)
    poses = {n: {k: g[top:top + rows] for k, g in pose.items()} for n, pose in poses.items()}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{pet}.json'), 'w') as f:
        json.dump({'cols': cols, 'rows': rows, 'inks': NAMES, 'poses': poses}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{pet}: {len(poses)} poses, rows {top}..{top + rows} of {tall}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
