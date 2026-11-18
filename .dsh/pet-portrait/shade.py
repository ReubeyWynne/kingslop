#!/usr/bin/env python3
"""Bake a pet's portrait frames from its low-poly model.

    npm i --no-save three@0.169.0
    python3 -m pip install numpy pillow
    npm i --no-save meshoptimizer@0.22.0
    python3 .dsh/pet-portrait/shade.py --exhibits path/to/pet-models [pet ...]

Writes .dsh/pet-portraits/<pet>.json, which .dsh/build-ascii.py turns into
stepped CSS frames, and, for the live pen (js/pet-live.js), pets/models/<pet>.bin
(the simplified mesh, via mesh.cjs) and pets/models/<pet>.json (its skeleton,
face and camera).

The shader follows the usual text-shader recipe: render the model, then for
each character cell pick a glyph from the light falling on it, a colour from
the fur under it times that light, and a line glyph where the model's
silhouette or a depth step runs through the cell. Each pose is the same model
bent a little (an ear tipped, the nose flared, the head lowered) and rendered
through the same camera, so the frames differ only where the pet moved.
"""
import json, os, subprocess, sys, tempfile
from statistics import mean
import numpy as np
from PIL import Image
from exhibit import SOURCES, prepare

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'pet-portraits')
CW, CH = 8, 17                      # render pixels per character cell
RAMP = ' .:-=+*#%@'
LIGHT = dict(key=2.2, amb=0.25, rim=0.7, fill=1.1, keypos=[-0.6, 2.4, 0.4])
LIVE = os.path.join(HERE, '..', '..', 'pets', 'models')


def neck_pose(cfg, lift=None, turn=None, head=None):
    """The head lifted and turned about the neck; the rest of the body stays put."""
    r = cfg['rest']
    neck = dict(sel=cfg['neck'].get('sel', {}), soft=cfg['neck']['soft'], softAxis=cfg['neck'].get('axis', 2), pivot=cfg['neck']['pivot'])
    return [dict(neck, axis=[1, 0, 0], angle=r['lift'] if lift is None else lift, scale=r['scale'] if head is None else head),
            dict(neck, axis=[0, 1, 0], angle=r['turn'] if turn is None else turn)]


def poses(cfg):
    ear, sniff = dict(cfg['ear_flick']), dict(cfg['sniff'])
    low, asleep = cfg['rest']['lift'] + cfg['low'], cfg['rest']['lift'] + cfg['asleep']
    return {
        'still': dict(deform=neck_pose(cfg)),
        'blink': dict(deform=neck_pose(cfg), eye='-'),
        'ear': dict(deform=[ear] + neck_pose(cfg)),
        'sniff': dict(deform=[sniff] + neck_pose(cfg)),
        'happy': dict(deform=neck_pose(cfg), eye='^'),
        'happy-ear': dict(deform=[ear] + neck_pose(cfg), eye='^'),
        'low': dict(deform=neck_pose(cfg, lift=low)),
        'low-blink': dict(deform=neck_pose(cfg, lift=low), eye='-'),
        'asleep': dict(deform=neck_pose(cfg, lift=asleep), eye='-'),
    }


# Every pet, in model space after mesh.cjs/render.cjs turn it to stand up +y and face +z and fit
# it to -1..1. `inks` darkest first, always these seven names (css/ascii.css holds the same
# values as --tone-0..6); `regions` paint fur colours (later over earlier; the nose last);
# `focus` is what the camera frames (`start` seeds the search when the head is small, `fill`
# loosens it); `head` is the box the face leads from; `neck`, `ear_flick` and `sniff` bend the
# model for the baked poses; `live` is the skeleton and face js/pet-live.js uses
# (pets/models/<pet>.json).
GRID = dict(cols=72, rows=24, render_rows=30)

PETS = {
    'giant-rhino': dict(GRID,
        orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        eye=[0.60, 0.85, 1.0],
        inks={'night': '#30313F', 'umber': '#46495A', 'bark': '#556779', 'fur': '#7593A1', 'tawny': '#A7B8B9', 'cream': '#D7C4A0', 'bone': '#F4F1E5'},
        yaw=-0.62, pitch=0.06, focus=dict(zmin=0.45, ymin=-0.2), fill=0.63,
        start=dict(target=[0, 0.12, 0.63], dist=2.4), tris=2100,
        fur=[0.53, 0.63, 0.69],
        regions=dict(muzzle=dict(zmin=0.62, ymax=0.05),
                     nose=dict(zmin=0.81, ymin=-0.1, ymax=-0.04, xmin=-0.11, xmax=-0.05)),
        eyes=[(-0.14, -0.045, 0.48), (0.14, -0.045, 0.48)], head=dict(zmin=0.36),
        rest=dict(lift=-0.04, turn=-0.06, scale=1.0), low=0.1, asleep=0.16,
        neck=dict(pivot=[0, -0.03, 0.26], soft=[0.25, 0.46]),
        ear_flick=dict(sel=dict(ymin=0.28, xmin=0.09, zmin=0.39, zmax=0.58), pivot=[0.11, 0.21, 0.45], axis=[0, 0, 1], angle=0.19),
        sniff=dict(sel=dict(zmin=0.79, ymax=-0.015), pivot=[0, -0.08, 0.87], scale=1.04),
        live=dict(mouth=[0, -0.16, 0.894], mouthGlyph='-', mouthInk=7, top=[0, 0.47, 0.82], cheeks=[[-0.15, -0.13, 0.54], [0.15, -0.13, 0.54]],
                  pivots=dict(neck=[0, -0.05, 0.24], head=[0, -0.025, 0.43], ear=[0.11, 0.22, 0.45], nose=[0, -0.08, 0.86]),
                  weights=dict(neck=dict(z=[0.22, 0.39]), head=dict(z=[0.35, 0.48]), ear=dict(y=[0.23, 0.29], x=[0.08, 0.13], c=[0.16, 0.46], r=[0.08, 0.14]), nose=dict(z=[0.79, 0.86], y=[-0.015, -0.065])),
                  scale=1.0)),
}

PETS['mighty-bison'] = dict(GRID,
    trait='snort',
    eye=[1.0, 0.73, 0.40],
    inks={'night': '#45334B', 'umber': '#654859', 'bark': '#855E65', 'fur': '#A97975', 'tawny': '#C89785', 'cream': '#E3C4A5', 'bone': '#F8E9CE'},
    orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
    yaw=-0.46, pitch=0.06, focus=dict(zmin=0.43, ymin=-0.17), fill=0.65, start=dict(target=[0, 0.14, 0.65], dist=2.5),
    fur=[0.45, 0.35, 0.41], tris=1850,
    regions=dict(horns=dict(ymin=0.24, zmin=0.49, rgb=[0.96, 0.85, 0.68]),
                 crest=dict(ymin=0.23, xmin=-0.11, xmax=0.11, zmin=0.49, rgb=[0.42, 0.27, 0.37]),
                 muzzle=dict(zmin=0.88, ymax=0.065, rgb=[0.82, 0.53, 0.45]),
                 nose=dict(zmin=0.977, ymin=-0.085, ymax=-0.015, xmin=-0.09, xmax=0.09, rgb=[0.27, 0.15, 0.18])),
    eyes=[(-0.104, 0.117, 0.826), (0.104, 0.117, 0.826)], head=dict(zmin=0.42),
    rest=dict(lift=-0.07, turn=-0.04, scale=1.0), low=0.1, asleep=0.15,
    neck=dict(pivot=[0, 0.09, 0.4], soft=[0.32, 0.60]),
    ear_flick=dict(sel=dict(ymin=0.02, ymax=0.12, xmin=0.22, zmin=0.44, zmax=0.69), pivot=[0.2, 0.08, 0.57], axis=[0, 0, 1], angle=0.24),
    sniff=dict(sel=dict(zmin=0.93, ymax=0.055), pivot=[0, -0.035, 0.97], scale=1.09),
    live=dict(mouth=[0, -0.12, 0.97], top=[0, 0.45, 0.65], cheeks=[[-0.115, 0.004, 0.9], [0.115, 0.004, 0.9]],
              pivots=dict(neck=[0, 0.02, 0.31], head=[0, 0.09, 0.62], ear=[0.2, 0.08, 0.57], nose=[0, -0.035, 0.97]),
              weights=dict(neck=dict(z=[0.24, 0.47]), head=dict(z=[0.46, 0.63]), ear=dict(y=[0.025, 0.065], x=[0.18, 0.22], c=[0.26, 0.58], r=[0.06, 0.1]), nose=dict(z=[0.9, 0.96], y=[0.08, 0.02])),
              scale=1.0))
PETS['regal-white-lion'] = dict(GRID,
    trait='regal',
    orient=dict(up=[0, 1, 0], fwd=[0, 0, 1]),
    eye=[0.96, 0.76, 0.37],
    inks={'night': '#373345', 'umber': '#504B5C', 'bark': '#6C6779', 'fur': '#8D899A', 'tawny': '#B5B0BA', 'cream': '#DBD5D4', 'bone': '#F9F4EB'},
    yaw=-0.48, pitch=0.06, focus=dict(ymin=-0.16, zmin=0.54), fill=0.67, start=dict(target=[0, 0.15, 0.74], dist=2.5),
    fur=[0.79, 0.78, 0.82], tris=2100,
    regions=dict(muzzle=dict(zmin=0.89, ymax=0.13),
                 nose=dict(zmin=0.972, ymin=0.045, ymax=0.11, xmin=-0.05, xmax=0.05)),
    eyes=[(-0.082, 0.203, 0.867), (0.082, 0.203, 0.867)], head=dict(ymin=-0.19, zmin=0.47),
    rest=dict(lift=-0.05, turn=-0.05, scale=1.0), low=0.10, asleep=0.15,
    neck=dict(pivot=[0, 0.017, 0.514], soft=[0.42, 0.67]),
    ear_flick=dict(sel=dict(ymin=0.28, xmin=0.10, zmin=0.70, zmax=0.82), pivot=[0.12, 0.297, 0.759], axis=[0, 0, 1], angle=0.24),
    sniff=dict(sel=dict(zmin=0.93, ymin=0.015, ymax=0.13), pivot=[0, 0.114, 0.923], scale=1.08),
    live=dict(mouth=[0, -0.033, 0.935], mouthGlyph='-', mouthInk=7, top=[0, 0.51, 0.66], cheeks=[[-0.103, 0.10, 0.92], [0.103, 0.10, 0.92]],
              pivots=dict(neck=[0, 0.017, 0.514], head=[0, 0.095, 0.638], ear=[0.12, 0.297, 0.759], nose=[0, 0.114, 0.923]),
              scale=1.0))

# Retail exhibit geometry and diffuse maps, matched through the APK's pet config.
PETS['grizzly-bear'] = dict(GRID,
    eye=[1.0, 0.70, 0.34],
    orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
    fur=[0.62, 0.40, 0.27], low=0.1, asleep=0.18,
    inks={'night':'#674233','umber':'#996043','bark':'#C77B4F','fur':'#EC9A62','tawny':'#F7BD8A','cream':'#FFDBA7','bone':'#FFF2DB'},
    yaw=-0.22, pitch=0.05, focus=dict(zmin=0.46, ymin=0.02), fill=0.65,
    start=dict(target=[0, 0.31, 0.70], dist=2.8), tris=2100,
    regions=dict(muzzle=dict(zmin=0.82, ymax=0.31),
                 nose=dict(zmin=0.965, ymin=0.235, ymax=0.31, xmin=-0.11, xmax=0.11)),
    eyes=[(-0.127, 0.367, 0.715), (0.127, 0.367, 0.715)], head=dict(zmin=0.49),
    rest=dict(lift=-0.04, turn=-0.025, scale=1.0),
    neck=dict(pivot=[0, 0.13, 0.35], soft=[0.25, 0.59]),
    ear_flick=dict(sel=dict(ymin=0.43, xmin=0.18, zmin=0.43, zmax=0.59), pivot=[0.21, 0.45, 0.52], axis=[0,0,1], angle=0.16),
    sniff=dict(sel=dict(zmin=0.90, ymin=0.20, ymax=0.33), pivot=[0, 0.265, 0.96], scale=1.06),
    live=dict(mouth=[0, 0.061, 0.881], mouthGlyph='-', mouthInk=7, top=[0, 0.61, 0.55], cheeks=[[-0.14,0.21,0.86],[0.14,0.21,0.86]],
              pivots=dict(neck=[0,0.13,0.35], head=[0,0.23,0.56], ear=[0.22,0.46,0.522], nose=[0,0.267,0.96]),
              weights=dict(neck=dict(z=[0.23,0.43]),head=dict(z=[0.43,0.64]),ear=dict(y=[0.43,0.48],x=[0.15,0.21],c=[0.22,0.52],r=[0.08,0.13]),nose=dict(z=[0.89,0.97],y=[0.18,0.23])),
              scale=1.0))

PETS['cheetah'] = dict(
    orient=dict(up=[0,0,1], fwd=[0,-1,0]),
    inks={'night':'#674125','umber':'#A76725','bark':'#DA8A25','fur':'#FFC448','tawny':'#FFE098','cream':'#FFF4DE','bone':'#5AD8FF'},
    eye=[0.20,0.72,1.0], fur=[0.87,0.61,0.29],
    cols=72, rows=24, render_rows=30, yaw=-0.26, pitch=0.065, fill=0.63, tris=2000,
    focus=dict(zmin=0.59,ymin=0.012), start=dict(target=[0,0.22,0.8],dist=2.0),
    regions=dict(muzzle=dict(zmin=0.90,ymax=0.19),
                 nose=dict(zmin=0.988,ymin=0.13,ymax=0.184,xmin=-0.064,xmax=0.064)),
    eyes=[(-0.089,0.249,0.875),(0.089,0.249,0.875)], head=dict(zmin=0.56),
    rest=dict(lift=-0.045,turn=-0.025,scale=1.0), low=0.09, asleep=0.15,
    neck=dict(pivot=[0,0.14,0.57],soft=[0.46,0.71]),
    ear_flick=dict(sel=dict(ymin=0.30,xmin=0.12,zmin=0.6,zmax=0.76),pivot=[0.13,0.31,0.67],axis=[0,0,1],angle=0.20),
    sniff=dict(sel=dict(zmin=0.94,ymin=0.10,ymax=0.19),pivot=[0,0.15,0.98],scale=1.08),
    live=dict(mouth=[0,0.083,0.946],mouthGlyph='-',mouthInk=7,top=[0,0.39,0.72],
              cheeks=[[-0.071,0.173,0.929],[0.071,0.173,0.929]],
              pivots=dict(neck=[0,0.14,0.56],head=[0,0.16,0.72],ear=[0.14,0.31,0.67],nose=[0,0.15,0.98]),
              weights=dict(neck=dict(z=[0.42,0.62]),head=dict(z=[0.58,0.78]),ear=dict(y=[0.29,0.33],x=[0.09,0.12],c=[0.14,0.67],r=[0.07,0.12]),nose=dict(z=[0.93,0.99],y=[0.08,0.13])),
              scale=1.0))


# Face anchors are measured in the fitted game meshes, not inherited from a stand-in.
def portrait(inks, eye, eyes, nose, mouth, ear, top, cheek, *, yaw=-0.31,
             focus=None, trait=None, elephant=False):
    ex, ey, ez = mean(abs(p[0]) for p in eyes), eyes[0][1], eyes[0][2]
    _, ny, nz = nose
    x, y, z = ear
    neck = [0, ey - 0.10, ez - 0.37]
    head = [0, ey - 0.08, ez - 0.18]
    bands = [ez - 0.38, ez - 0.17, ez - 0.04]
    return dict(GRID,
        orient=dict(up=[0, 1, 0], fwd=[0, 0, 1]) if elephant else dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        inks=dict(zip(('night', 'umber', 'bark', 'fur', 'tawny', 'cream', 'bone'), inks.split())),
        fur=[0.64, 0.57, 0.48], eye=eye, eyes=eyes,
        yaw=yaw, pitch=0.07, fill=0.68, tris=2100,
        focus=focus or dict(zmin=ez - 0.25, ymin=min(mouth[1] - 0.13, 0)),
        start=dict(target=[0, (ey + top[1]) / 2 - 0.09, (ez + nz) / 2], dist=2.6),
        head=dict(zmin=ez - 0.23), rest=dict(lift=-0.045, turn=-0.02, scale=1),
        low=0.11, asleep=0.17, neck=dict(pivot=neck, soft=bands[:2]),
        regions=dict(muzzle=dict(zmin=nz - 0.16, ymax=ey - 0.015),
                     nose=dict(xmin=-0.65 * ex, xmax=0.65 * ex, ymin=ny - 0.04, ymax=ny + 0.04, zmin=nz - 0.045)),
        ear_flick=dict(sel=dict(xmin=x - 0.06, ymin=y - 0.025, zmin=z - 0.10, zmax=z + 0.12),
                       pivot=ear, axis=[0, 0, 1], angle=0.16),
        sniff=dict(sel=dict(zmin=nz - 0.08, ymin=ny - 0.10, ymax=ny + 0.09), pivot=nose, scale=1.06),
        live=dict(mouth=mouth, mouthGlyph='-', mouthInk=7, top=top,
                  cheeks=[[-abs(cheek[0]), *cheek[1:]], [abs(cheek[0]), *cheek[1:]]],
                  pivots=dict(neck=neck, head=head, ear=ear, nose=nose),
                  weights=dict(neck=dict(z=bands[:2]), head=dict(z=bands[1:]),
                               ear=dict(x=[x - 0.08, x - 0.025], y=[y - 0.08, y - 0.025], c=[x, z], r=[0.08, 0.18]),
                               nose=dict(z=[nz - 0.1, nz - 0.035], y=[ny - 0.10, ny - 0.045])),
                  scale=1),
        **({'trait': trait} if trait else {}))


PETS.update({
    'gray-wolf': portrait('#4C4E5C #666A7A #848899 #A4A8B6 #C3C5CE #DEDDDC #F7F4EE', [0.37, 0.69, 1],
        [(-0.137, 0.231, 0.641), (0.137, 0.231, 0.641)], [0, 0.129, 0.99], [0, -0.035, 0.906],
        [0.19, 0.46, 0.51], [0, 0.62, 0.54], [0.184, 0.098, 0.725], yaw=-0.22),
    'lynx': portrait('#5C4535 #7F604A #A07E62 #BF9C7C #D8BA98 #EBD6BC #FAF1E4', [0.9, 0.75, 0.34],
        [(-0.137, 0.106, 0.819), (0.153, 0.106, 0.814)], [0, -0.012, 0.99], [0, -0.122, 0.898],
        [0.245, 0.37, 0.60], [0, 0.63, 0.60], [0.153, -0.004, 0.867]),
    'bison': portrait('#4A3128 #694535 #895D44 #A87956 #C79A70 #E2C29C #F8EDDA', [0.99, 0.73, 0.37],
        [(-0.106, -0.098, 0.849), (0.114, -0.098, 0.854)], [0, -0.176, 0.937], [0, -0.255, 0.914],
        [0.27, -0.03, 0.70], [0, 0.443, 0.36], [0.14, -0.16, 0.92],
        focus=dict(ymin=-0.32, zmin=0.37)),
    'moose': portrait('#4A3427 #664837 #85604A #A27B5F #BF997A #DABA9C #F4E6D6', [0.99, 0.78, 0.45],
        [(-0.129, 0.271, 0.681), (0.153, 0.271, 0.681)], [0, 0.098, 0.976], [0, 0.012, 0.976],
        [0.28, 0.098, 0.28], [0, 0.71, 0.59], [0.122, 0.145, 0.953],
        focus=dict(ymin=-0.08), yaw=-0.34),
    'lion': portrait('#7A4826 #9C6330 #BE8240 #D9A255 #EBC175 #F6DDA2 #FFF4D8', [0.98, 0.78, 0.37],
        [(-0.122, 0.106, 0.793), (0.145, 0.106, 0.785)], [0, 0.075, 0.976], [0, -0.043, 0.953],
        [0.24, 0.24, 0.50], [0, 0.45, 0.58], [0.129, 0.02, 0.82]),
    'alpha-black-panther': portrait('#433E58 #585273 #6F688E #8881A8 #A6A0C2 #C7C2DA #EEEBF6', [0.96, 0.73, 0.30],
        [(-0.122, 0.145, 0.854), (0.114, 0.145, 0.848)], [0, 0.098, 0.969], [0, -0.012, 0.945],
        [0.153, 0.263, 0.671], [0, 0.365, 0.522], [0.114, 0.051, 0.906]),
    'great-moose': portrait('#3A2A22 #55402F #725A43 #8E7559 #AC9375 #CDB698 #EEE3D2', [0.61, 0.85, 1],
        [(-0.137, 0.012, 0.728), (0.169, 0.012, 0.735)], [0, -0.098, 0.984], [0, -0.208, 0.992],
        [0.294, 0.098, 0.592], [0, 0.69, 0.58], [0.129, -0.106, 0.82],
        focus=dict(ymin=-0.23), yaw=-0.40, trait='shake'),
    'ironclad-war-elephant': portrait('#55504F #716A69 #8E8684 #ABA29F #C6BEBA #DFD8D3 #F7F2EC', [0.52, 0.77, 1],
        [(-0.137, 0.082, 0.64), (0.153, 0.082, 0.64)], [0, -0.315, 0.735], [0, 0.04, 0.77],
        [0.143, 0.251, 0.356], [0, 0.515, 0.405], [0.153, 0.035, 0.655],
        focus=dict(ymin=-0.48, zmin=0.13), yaw=-0.43, elephant=True),
    'ironclad-war-bear': portrait('#3F4652 #56606E #6F7A89 #8A95A3 #A8B1BD #C8CED6 #EEF1F4', [1, 0.73, 0.32],
        [(-0.082, 0.294, 0.928), (0.082, 0.294, 0.928)], [0, 0.184, 0.969], [0, 0.059, 0.922],
        [0.239, 0.357, 0.647], [0, 0.537, 0.475], [0.122, 0.114, 0.914], yaw=-0.21, trait='roar'),
})

# Weight drivers from the elephant's original bind matrices.
PETS['ironclad-war-elephant']['live']['pivots'].update(
    neck=[0, 0.166, 0.148], head=[0, 0.214, 0.358],
    ear=[0.143, 0.251, 0.356], nose=[0, 0.145, 0.61])
del PETS['ironclad-war-elephant']['live']['weights']


def render(stl, tmp, cols, rows, modes=('lit', 'normal', 'depth', 'pos'), **opts):
    out = os.path.join(tmp, 'r')
    opts['modes'] = list(modes)
    subprocess.run(['node', os.path.join(HERE, 'render.cjs'), json.dumps(dict(stl=stl, w=cols * CW, h=rows * CH, out=out, **opts))], check=True)
    return {k: np.asarray(Image.open(f'{out}-{k}.png').convert('RGBA')).astype(float) / 255 for k in modes}


def fit(stl, tmp, cols, rows, yaw, pitch, deform, focus, orient, fov=26, fill=0.8, lift=0.04, start=None):
    """Aim the camera so the head (the `focus` box: in front of the chest, above the legs) fills the frame."""
    t, dist = np.array((start or {}).get('target', [0, 0.2, 0.6])), (start or {}).get('dist', 2.6)
    for _ in range(4):
        R = render(stl, tmp, cols // 2, rows // 2, yaw=yaw, pitch=pitch, fov=fov, dist=dist, target=t.tolist(), modes=['pos'], deform=deform, **orient)
        im = R['pos']; h, w = im.shape[:2]
        p = im[..., :3] * 2 - 1
        ys, xs = np.nonzero((im[..., 3] > 0.5) & region(p, focus))
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
        if k[1:] not in ('min', 'max'):         # rgb, and a coat's own settings
            continue
        axis = 'xyz'.index(k[0])
        m &= (p[..., axis] >= v) if k.endswith('min') else (p[..., axis] <= v)
    return m


def ramp(cfg):
    """What brightness reads as the densest fur glyph: the grizzly's 0.82, scaled by how light the pet's fur is."""
    return round(0.82 * float(np.array(cfg['fur']) @ [0.5, 0.35, 0.15]) / 0.4905, 3)


def shade(R, cfg, cols, rows, eye='o', mouth='w', body_dim=0.8, edge_frac=0.1, dstep=0.02):
    a = R['lit'][..., 3]; m = a > 0.5
    lum = R['lit'][..., 0]
    lo, hi = np.percentile(lum[m], [1, 99.5]); L = np.clip((lum - lo) / (hi - lo), 0, 1)
    p = R['pos'][..., :3] * 2 - 1
    z = p[..., 2]
    textured = 'rgb' in R
    alb = R['rgb'][..., :3] ** 0.65 if textured else np.broadcast_to(np.array(cfg['fur']), p.shape).copy()
    masks = {}
    NAMES = list(cfg['inks']); INK_RGB = np.stack([[int(v[i:i + 2], 16) / 255 for i in (1, 3, 5)] for v in cfg['inks'].values()])
    for name in cfg['regions']:                 # later regions paint over earlier ones
        masks[name] = region(p, cfg['regions'][name])
        if not textured:
            alb[masks[name]] = cfg['regions'][name]['rgb']
    rgb = alb * (0.3 + 0.95 * L[..., None])
    head = region(p, cfg['head'])
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
                t = min(0.999, float(col @ [0.5, 0.35, 0.15]) / ramp(cfg))
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


def live(cfg, cam, **channels):
    """What js/pet-live.js needs besides the mesh: inks, fur regions, face, skeleton and camera."""
    ids = {'muzzle': 2, 'nose': 3}
    regions = [dict(id=4 if spec.get('metal') else ids.get(name, 1), **{k: v for k, v in spec.items() if k != 'metal'}) for name, spec in cfg['regions'].items()]
    return dict(inks=list(cfg['inks'].values()), fur=cfg['fur'], regions=regions, head=cfg['head'], ramp=ramp(cfg), eyes=[list(e) for e in cfg['eyes']],
                rest=dict(lift=cfg['rest']['lift'], turn=cfg['rest']['turn'], scale=cfg['live']['scale']),
                camera={k: cam[k] for k in ('yaw', 'pitch', 'fov', 'dist', 'target')}, lights=dict(key=LIGHT['keypos'], rim=[2, 0.6, -1.5]),
                **channels,
                **({'eye': cfg['eye']} if 'eye' in cfg else {}), **({'trait': cfg['trait']} if 'trait' in cfg else {}), **({'range': cfg['range']} if 'range' in cfg else {}), **{k: v for k, v in cfg['live'].items() if k != 'scale'})


def main(pet, stl, channels=None):
    channels = channels or {}
    cfg = PETS[pet]
    cols, rows, tall = cfg['cols'], cfg['rows'], cfg['render_rows']
    geom = cfg['orient']
    subprocess.run(['node', os.path.join(HERE, 'mesh.cjs'), pet, stl, json.dumps(dict(geom, tris=cfg.get('tris', 1000), **channels))], check=True)
    coat = {'rgb': channels['rgb']} if 'rgb' in channels else {}
    modes = ('lit', 'depth', 'pos', 'rgb') if coat else ('lit', 'depth', 'pos')
    with tempfile.TemporaryDirectory() as tmp:
        cam = fit(stl, tmp, cols, tall, cfg['yaw'], cfg['pitch'], neck_pose(cfg), cfg['focus'], geom, fill=cfg.get('fill', 0.8), start=cfg.get('start'))
        cam.update(LIGHT)
        baked = {}
        for name, pose in poses(cfg).items():
            R = render(stl, tmp, cols, tall, modes=modes, deform=pose['deform'], **cam, **geom, **coat)
            mouth = None if coat else 'w'
            baked[name] = shade(R, cfg, cols, tall, eye=pose.get('eye', 'o'), mouth=mouth)
    # crop every pose to the same rows: the art's top, then as many rows as the pen holds
    used = [r for pose in baked.values() for g in pose.values() for r, row in enumerate(g) if row.strip()]
    top = max(0, min(used) - 1)
    baked = {n: {k: g[top:top + rows] for k, g in pose.items()} for n, pose in baked.items()}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{pet}.json'), 'w') as f:
        json.dump({'cols': cols, 'rows': rows, 'inks': list(cfg['inks']), 'poses': baked}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    with open(os.path.join(LIVE, f'{pet}.json'), 'w') as f:
        json.dump(live(cfg, cam, **{flag: True for channel, flag in [('rgb', 'vertexRGB'), ('skin', 'vertexSkin')] if channel in channels}), f, separators=(',', ':'))
        f.write('\n')
    print(f'{pet}: {len(baked)} poses, rows {top}..{top + rows} of {tall}')



def relive(pet):
    """Rewrite pets/models/<pet>.json from PETS, keeping the camera it was baked with (for a change that needs no new frames)."""
    path = os.path.join(LIVE, f'{pet}.json')
    with open(path) as f:
        current = json.load(f)
    with open(path, 'w') as f:
        channels = {k: current[k] for k in ('vertexRGB', 'vertexSkin') if k in current}
        json.dump(live(PETS[pet], current['camera'], **channels), f, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    if sys.argv[1] == '--live':                 # python3 shade.py --live [pet ...]
        for name in sys.argv[2:] or PETS:
            relive(name)
    elif sys.argv[1] == '--exhibits':
        for name in sys.argv[3:] or SOURCES:
            with tempfile.TemporaryDirectory() as tmp:
                main(name, *prepare(name, sys.argv[2], tmp))
