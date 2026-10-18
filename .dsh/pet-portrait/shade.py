#!/usr/bin/env python3
"""Bake a pet's portrait frames from its low-poly model.

    npm i --no-save three@0.169.0
    python3 -m pip install numpy pillow
    npm i --no-save meshoptimizer@0.22.0
    python3 .dsh/pet-portrait/shade.py grizzly-bear path/to/model.stl

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
import numpy as np
from PIL import Image

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
PETS = {
    'grizzly-bear': dict(
        orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        inks={'night': '#6E4636', 'umber': '#93604A', 'bark': '#B67F5A', 'fur': '#D49C6C', 'tawny': '#EDBC86', 'cream': '#F8DDB0', 'bone': '#FFF5E2'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.3, ymin=-0.2),
        fur=[0.62, 0.40, 0.27],
        regions=dict(ears=dict(ymin=0.44, rgb=[0.84, 0.54, 0.36]),
                     muzzle=dict(zmin=0.74, ymax=0.12, rgb=[1.0, 0.86, 0.64]),
                     nose=dict(zmin=0.96, ymin=-0.03, rgb=[0.10, 0.07, 0.07])),
        eyes=[(-0.14, 0.16, 0.80), (0.14, 0.16, 0.80)], head=dict(zmin=0.3),
        rest=dict(lift=-0.4, turn=-0.45, scale=1.1), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.2, 0.2], soft=[0.08, 0.36]),
        ear_flick=dict(sel=dict(ymin=0.36, xmin=0.08, zmin=0.25), pivot=[0.2, 0.4, 0.45], axis=[0, 0, 1], angle=0.28),
        sniff=dict(sel=dict(zmin=0.9), pivot=[0, 0.0, 0.95], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0, -0.07, 0.99], top=[0, 0.6, 0.5], cheeks=[[-0.26, 0.0, 0.72], [0.26, 0.0, 0.72]],
                  pivots=dict(neck=[0, 0.12, 0.0], head=[0, 0.22, 0.32], ear=[0.22, 0.47, 0.52], nose=[0, 0.0, 0.92]),
                  weights=dict(neck=dict(z=[-0.15, 0.2]), head=dict(z=[0.15, 0.42]), ear=dict(y=[0.45, 0.52], x=[0.12, 0.17], c=[0.24, 0.53], r=[0.12, 0.2]), nose=dict(z=[0.9, 0.97], y=[-0.06, 0.0])),
                  scale=1.12)),
    'gray-wolf': dict(
        orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        inks={'night': '#4C4E5C', 'umber': '#666A7A', 'bark': '#848899', 'fur': '#A4A8B6', 'tawny': '#C3C5CE', 'cream': '#DEDDDC', 'bone': '#F7F4EE'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.45, ymin=-0.2),
        fur=[0.56, 0.57, 0.63],
        regions=dict(ears=dict(ymin=0.3, rgb=[0.42, 0.43, 0.5]),
                     muzzle=dict(zmin=0.88, ymax=0.1, rgb=[0.98, 0.95, 0.9]),
                     nose=dict(zmin=0.965, ymin=-0.06, ymax=0.02, rgb=[0.1, 0.1, 0.12])),
        eyes=[(-0.09, 0.115, 0.945), (0.09, 0.115, 0.945)], head=dict(zmin=0.6),
        rest=dict(lift=-0.35, turn=-0.4, scale=1.1), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.1, 0.65], soft=[0.55, 0.78]),
        ear_flick=dict(sel=dict(ymin=0.28, xmin=0.04, zmin=0.75), pivot=[0.11, 0.3, 0.85], axis=[0, 0, 1], angle=0.28),
        sniff=dict(sel=dict(zmin=0.92, ymax=0.05), pivot=[0, -0.02, 0.95], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0, -0.1, 0.95], top=[0, 0.42, 0.8], cheeks=[[-0.15, 0.05, 0.88], [0.15, 0.05, 0.88]],
                  pivots=dict(neck=[0, 0.1, 0.45], head=[0, 0.15, 0.7], ear=[0.12, 0.31, 0.84], nose=[0, -0.02, 0.94]),
                  weights=dict(neck=dict(z=[0.3, 0.6]), head=dict(z=[0.6, 0.78]), ear=dict(y=[0.28, 0.33], x=[0.03, 0.07], c=[0.12, 0.85], r=[0.08, 0.14]), nose=dict(z=[0.93, 0.97], y=[-0.08, -0.03])),
                  scale=1.12)),
    'bison': dict(
        orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        inks={'night': '#4A3128', 'umber': '#694535', 'bark': '#895D44', 'fur': '#A87956', 'tawny': '#C79A70', 'cream': '#E2C29C', 'bone': '#F8EDDA'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.55, ymin=-0.3),
        fur=[0.5, 0.33, 0.24],
        regions={'mane': dict(ymin=0.05, zmax=0.82, rgb=[0.66, 0.46, 0.3]),
                 'horn-l': dict(xmax=-0.22, ymin=0.18, zmin=0.65, rgb=[0.95, 0.9, 0.8]),
                 'horn-r': dict(xmin=0.22, ymin=0.18, zmin=0.65, rgb=[0.95, 0.9, 0.8]),
                 'muzzle': dict(zmin=0.92, ymax=0.02, rgb=[0.42, 0.3, 0.24]),
                 'nose': dict(zmin=0.975, rgb=[0.1, 0.07, 0.07])},
        eyes=[(-0.145, 0.126, 0.869), (0.145, 0.126, 0.869)], head=dict(zmin=0.55),
        rest=dict(lift=-0.25, turn=-0.4, scale=1.1), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.05, 0.6], soft=[0.5, 0.72]),
        ear_flick=dict(sel=dict(ymin=0.06, ymax=0.18, xmin=0.2, zmin=0.65), pivot=[0.24, 0.12, 0.76], axis=[0, 0, 1], angle=0.3),
        sniff=dict(sel=dict(zmin=0.93), pivot=[0, -0.06, 0.96], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0, -0.13, 0.97], top=[0, 0.48, 0.7], cheeks=[[-0.2, 0.0, 0.86], [0.2, 0.0, 0.86]],
                  pivots=dict(neck=[0, 0.05, 0.4], head=[0, 0.1, 0.65], ear=[0.24, 0.12, 0.76], nose=[0, -0.06, 0.95]),
                  weights=dict(neck=dict(z=[0.3, 0.55]), head=dict(z=[0.55, 0.72]), ear=dict(y=[0.06, 0.1], x=[0.2, 0.24], c=[0.27, 0.76], r=[0.05, 0.1]), nose=dict(z=[0.94, 0.98], y=[-0.12, -0.07])),
                  scale=1.12)),
    'lion': dict(
        orient=dict(up=[0, 0, 1], fwd=[0, -1, 0]),
        inks={'night': '#7A4826', 'umber': '#9C6330', 'bark': '#BE8240', 'fur': '#D9A255', 'tawny': '#EBC175', 'cream': '#F6DDA2', 'bone': '#FFF4D8'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(ymin=0.15, zmin=0.0), fill=0.7, start=dict(target=[0, 0.6, 0.3], dist=3.0),
        fur=[0.86, 0.64, 0.36],
        regions=dict(mane=dict(ymin=0.05, zmax=0.66, rgb=[0.56, 0.31, 0.16]),
                     muzzle=dict(zmin=0.86, ymin=0.3, ymax=0.52, rgb=[1.0, 0.9, 0.7]),
                     nose=dict(zmin=0.975, ymin=0.42, rgb=[0.35, 0.18, 0.14])),
        eyes=[(-0.189, 0.598, 0.752), (0.086, 0.603, 0.734)], head=dict(ymin=0.15),
        rest=dict(lift=0.0, turn=-0.35, scale=1.05), low=0.1, asleep=0.18,
        neck=dict(pivot=[-0.05, 0.2, 0.4], soft=[0.05, 0.3], axis=1),
        ear_flick=dict(sel=dict(ymin=0.68, xmin=0.15, zmin=0.3), pivot=[0.22, 0.72, 0.5], axis=[0, 0, 1], angle=0.28),
        sniff=dict(sel=dict(zmin=0.9, ymin=0.36, ymax=0.52), pivot=[-0.07, 0.45, 0.95], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[-0.07, 0.35, 0.97], top=[-0.05, 0.97, 0.45], cheeks=[[-0.25, 0.47, 0.86], [0.12, 0.47, 0.86]],
                  pivots=dict(neck=[-0.05, 0.0, 0.4], head=[-0.05, 0.25, 0.55], ear=[0.25, 0.75, 0.5], nose=[-0.07, 0.45, 0.94]),
                  weights=dict(neck=dict(y=[-0.2, 0.1]), head=dict(y=[0.1, 0.3]), ear=dict(cx=-0.05, y=[0.7, 0.75], x=[0.2, 0.25], c=[0.3, 0.5], r=[0.08, 0.14]), nose=dict(z=[0.92, 0.97], y=[0.38, 0.42])),
                  scale=1.06)),
    'alpha-black-panther': dict(
        orient=dict(up=[0, 0, 1], fwd=[-1, 0, 0]),
        inks={'night': '#433E58', 'umber': '#585273', 'bark': '#6F688E', 'fur': '#8881A8', 'tawny': '#A6A0C2', 'cream': '#C7C2DA', 'bone': '#EEEBF6'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.45, ymin=-0.1), start=dict(target=[0, 0.25, 0.75], dist=2.5),
        fur=[0.5, 0.47, 0.62],
        regions=dict(muzzle=dict(zmin=0.95, ymax=0.15, rgb=[0.62, 0.59, 0.74]),
                     nose=dict(zmin=0.99, rgb=[0.12, 0.1, 0.15])),
        eyes=[(0.003, 0.238, 0.933), (0.101, 0.218, 0.95)], head=dict(zmin=0.55),
        rest=dict(lift=-0.3, turn=-0.4, scale=1.1), low=0.1, asleep=0.18,
        neck=dict(pivot=[0.03, 0.2, 0.6], soft=[0.5, 0.72]),
        ear_flick=dict(sel=dict(ymin=0.31, xmin=0.1, zmin=0.65), pivot=[0.15, 0.32, 0.78], axis=[0, 0, 1], angle=0.28),
        sniff=dict(sel=dict(zmin=0.94), pivot=[0.08, 0.13, 0.98], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0.08, 0.07, 0.97], top=[0.05, 0.42, 0.75], cheeks=[[-0.03, 0.16, 0.93], [0.15, 0.16, 0.93]],
                  pivots=dict(neck=[0.03, 0.15, 0.4], head=[0.03, 0.2, 0.65], ear=[0.17, 0.33, 0.8], nose=[0.08, 0.13, 0.97]),
                  weights=dict(neck=dict(z=[0.3, 0.55]), head=dict(z=[0.55, 0.7]), ear=dict(cx=0.05, y=[0.31, 0.35], x=[0.05, 0.09], c=[0.12, 0.78], r=[0.06, 0.1]), nose=dict(z=[0.95, 0.99], y=[0.08, 0.11])),
                  scale=1.12)),
    'ironclad-war-elephant': dict(
        orient=dict(up=[0, 1, 0], fwd=[1, 0, 0]),
        inks={'night': '#55504F', 'umber': '#716A69', 'bark': '#8E8684', 'fur': '#ABA29F', 'tawny': '#C6BEBA', 'cream': '#DFD8D3', 'bone': '#F7F2EC'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.4, ymin=-0.5), start=dict(target=[0, 0.2, 0.6], dist=3.0),
        fur=[0.62, 0.58, 0.57],
        regions={'ear-l': dict(xmax=-0.3, ymin=0.1, rgb=[0.78, 0.64, 0.62]),
                 'ear-r': dict(xmin=0.3, ymin=0.1, rgb=[0.78, 0.64, 0.62]),
                 'tusk-l': dict(xmax=-0.08, ymin=-0.05, ymax=0.12, zmin=0.8, rgb=[0.98, 0.95, 0.86]),
                 'tusk-r': dict(xmin=0.08, ymin=-0.05, ymax=0.12, zmin=0.8, rgb=[0.98, 0.95, 0.86]),
                 'nose': dict(ymax=-0.75, zmin=0.6, rgb=[0.35, 0.3, 0.3])},
        eyes=[(-0.195, 0.29, 0.679), (0.192, 0.295, 0.682)], head=dict(zmin=0.45),
        rest=dict(lift=-0.1, turn=-0.35, scale=1.05), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.4, 0.4], soft=[0.3, 0.5]),
        ear_flick=dict(sel=dict(xmin=0.3, ymin=0.1, zmin=0.3), pivot=[0.3, 0.4, 0.5], axis=[0, 1, 0], angle=0.3),
        sniff=dict(sel=dict(zmin=0.6, ymax=-0.2), pivot=[0, -0.2, 0.75], scale=1.06, move=[0, 0.03, 0]),
        live=dict(mouth=[0, -0.05, 0.8], top=[0, 0.75, 0.4], cheeks=[[-0.2, 0.15, 0.7], [0.2, 0.15, 0.7]],
                  pivots=dict(neck=[0, 0.35, 0.2], head=[0, 0.4, 0.45], ear=[0.3, 0.4, 0.5], nose=[0, 0.0, 0.78]),
                  weights=dict(neck=dict(z=[0.1, 0.35]), head=dict(z=[0.35, 0.5]), ear=dict(y=[0.05, 0.15], x=[0.28, 0.34], c=[0.5, 0.5], r=[0.25, 0.35]), nose=dict(z=[0.65, 0.75], y=[-0.9, -0.1])),
                  scale=1.06)),
    'cheetah': dict(
        orient=dict(up=[0, 0, 1], fwd=[1, 0, 0]),
        inks={'night': '#6B4A2A', 'umber': '#8E6638', 'bark': '#B0854A', 'fur': '#CDA45E', 'tawny': '#E3C27E', 'cream': '#F2DDAA', 'bone': '#FFF5DE'},
        cols=72, rows=24, render_rows=30, yaw=-0.9, pitch=0.08, focus=dict(zmin=0.0, ymin=-0.2), start=dict(target=[0, 0.2, 0.5], dist=3.0),
        fur=[0.86, 0.64, 0.34],
        spots=dict(scale=30, cut=0.33, zmax=0.9, ymin=-0.45, rgb=[0.24, 0.15, 0.09]),
        regions=dict(muzzle=dict(zmin=0.93, ymax=0.38, rgb=[1.0, 0.93, 0.8]),
                     **{'tear-l': dict(xmin=-0.07, xmax=-0.03, ymin=0.31, ymax=0.41, zmin=0.955, rgb=[0.12, 0.08, 0.06]),
                        'tear-r': dict(xmin=0.03, xmax=0.07, ymin=0.31, ymax=0.41, zmin=0.955, rgb=[0.12, 0.08, 0.06])},
                     nose=dict(zmin=0.985, ymin=0.33, ymax=0.38, xmin=-0.035, xmax=0.035, rgb=[0.15, 0.1, 0.1])),
        eyes=[(-0.051, 0.418, 0.981), (0.058, 0.42, 0.98)], head=dict(zmin=0.75),
        rest=dict(lift=-0.2, turn=-0.4, scale=1.15), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.32, 0.72], soft=[0.62, 0.8]),
        ear_flick=dict(sel=dict(ymin=0.46, xmin=0.06, zmin=0.8), pivot=[0.1, 0.46, 0.88], axis=[0, 0, 1], angle=0.28),
        sniff=dict(sel=dict(zmin=0.96, ymax=0.4), pivot=[0, 0.36, 0.98], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0, 0.3, 0.98], top=[0, 0.55, 0.88], cheeks=[[-0.09, 0.36, 0.96], [0.09, 0.36, 0.96]],
                  pivots=dict(neck=[0, 0.3, 0.5], head=[0, 0.35, 0.78], ear=[0.11, 0.47, 0.88], nose=[0, 0.36, 0.97]),
                  weights=dict(neck=dict(z=[0.35, 0.6]), head=dict(z=[0.65, 0.8]), ear=dict(y=[0.45, 0.49], x=[0.07, 0.09], c=[0.11, 0.88], r=[0.05, 0.08]), nose=dict(z=[0.95, 0.99], y=[0.3, 0.34])),
                  scale=1.15)),
    'moose': dict(
        orient=dict(up=[0, 1, 0], fwd=[0, 0, 1]),
        inks={'night': '#4A3427', 'umber': '#664837', 'bark': '#85604A', 'fur': '#A27B5F', 'tawny': '#BF997A', 'cream': '#DABA9C', 'bone': '#F4E6D6'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.55, ymin=-0.1, xmin=-0.3, xmax=0.3), start=dict(target=[0, 0.3, 0.75], dist=3.0),
        fur=[0.52, 0.38, 0.28],
        regions=dict(antlers=dict(ymin=0.47, rgb=[0.86, 0.78, 0.62]),
                     muzzle=dict(zmin=0.9, ymax=0.25, rgb=[0.62, 0.48, 0.38]),
                     nose=dict(zmin=0.985, ymin=0.08, ymax=0.16, xmin=-0.07, xmax=0.07, rgb=[0.15, 0.1, 0.08])),
        eyes=[(-0.11, 0.333, 0.736), (0.111, 0.334, 0.734)], head=dict(zmin=0.6),
        shape=[dict(sel=dict(ymin=0.45), pivot=[0, 0.47, 0.66], scale=0.55)],   # the model's antlers are wider than the pen
        rest=dict(lift=-0.15, turn=-0.4, scale=1.08), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.3, 0.55], soft=[0.45, 0.65]),
        ear_flick=dict(sel=dict(ymin=0.38, ymax=0.47, xmin=0.15, zmin=0.55), pivot=[0.16, 0.42, 0.62], axis=[0, 0, 1], angle=0.3),
        sniff=dict(sel=dict(zmin=0.95, ymax=0.22), pivot=[0, 0.12, 0.97], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0, 0.03, 0.97], top=[0, 0.55, 0.7], cheeks=[[-0.1, 0.2, 0.85], [0.1, 0.2, 0.85]],
                  pivots=dict(neck=[0, 0.25, 0.35], head=[0, 0.32, 0.6], ear=[0.16, 0.42, 0.62], nose=[0, 0.12, 0.95]),
                  weights=dict(neck=dict(z=[0.25, 0.5]), head=dict(z=[0.5, 0.62]), ear=dict(y=[0.38, 0.41], x=[0.14, 0.17], c=[0.22, 0.62], r=[0.06, 0.1]), nose=dict(z=[0.95, 0.99], y=[0.05, 0.1])),
                  scale=1.08)),
    'giant-rhino': dict(
        orient=dict(up=[0, 1, 0], fwd=[1, 0, 0]),
        inks={'night': '#4E4A48', 'umber': '#6A6461', 'bark': '#878079', 'fur': '#A39C94', 'tawny': '#BEB8AF', 'cream': '#D9D4CC', 'bone': '#F4F1EC'},
        cols=72, rows=24, render_rows=30, yaw=-0.5, pitch=0.05, focus=dict(zmin=0.4, ymin=-0.45), start=dict(target=[0, 0.0, 0.6], dist=2.5),
        fur=[0.6, 0.57, 0.53],
        regions=dict(horns=dict(zmin=0.72, ymin=-0.12, xmin=-0.06, xmax=0.06, rgb=[0.92, 0.88, 0.78]),
                     nose=dict(zmin=0.92, ymax=-0.2, rgb=[0.2, 0.18, 0.17])),
        eyes=[(-0.157, -0.004, 0.632), (0.152, 0.003, 0.642)], head=dict(zmin=0.45),
        rest=dict(lift=-0.35, turn=-0.4, scale=1.1), low=0.1, asleep=0.18,
        neck=dict(pivot=[0, 0.1, 0.4], soft=[0.35, 0.55]),
        ear_flick=dict(sel=dict(ymin=0.15, xmin=0.05, zmin=0.5), pivot=[0.1, 0.18, 0.6], axis=[0, 0, 1], angle=0.3),
        sniff=dict(sel=dict(zmin=0.9, ymax=-0.15), pivot=[0, -0.24, 0.93], scale=1.1, move=[0, 0.015, 0]),
        live=dict(mouth=[0, -0.36, 0.88], top=[0, 0.35, 0.55], cheeks=[[-0.17, -0.12, 0.7], [0.17, -0.12, 0.7]],
                  pivots=dict(neck=[0, 0.05, 0.2], head=[0, 0.1, 0.48], ear=[0.11, 0.2, 0.61], nose=[0, -0.24, 0.92]),
                  weights=dict(neck=dict(z=[0.15, 0.4]), head=dict(z=[0.4, 0.52]), ear=dict(y=[0.15, 0.19], x=[0.06, 0.08], c=[0.11, 0.61], r=[0.06, 0.1]), nose=dict(z=[0.9, 0.95], y=[-0.32, -0.2])),
                  scale=1.1)),
    'lynx': dict(
        orient=dict(up=[0, 0, 1], fwd=[-0.71, -0.70, 0]),
        inks={'night': '#5C4535', 'umber': '#7F604A', 'bark': '#A07E62', 'fur': '#BF9C7C', 'tawny': '#D8BA98', 'cream': '#EBD6BC', 'bone': '#FAF1E4'},
        cols=72, rows=24, render_rows=30, yaw=-0.2, pitch=0.05, focus=dict(ymin=0.1, xmin=0.45), start=dict(target=[0.75, 0.5, -0.1], dist=2.0),
        fur=[0.78, 0.62, 0.48],
        regions=dict(ears=dict(ymin=0.6, rgb=[0.36, 0.28, 0.24]),
                     muzzle=dict(xmin=0.78, ymax=0.34, zmin=0.04, rgb=[1.0, 0.94, 0.85]),
                     nose=dict(xmin=0.85, ymin=0.29, zmin=0.105, rgb=[0.4, 0.22, 0.2])),
        eyes=[(0.792, 0.407, 0.04), (0.901, 0.407, 0.016)], head=dict(xmin=0.5, ymin=0.15),
        rest=dict(lift=0.0, turn=-0.45, scale=1.08), low=0.1, asleep=0.18,
        neck=dict(sel=dict(xmin=0.4), pivot=[0.7, 0.32, -0.05], soft=[0.5, 0.65], axis=0),
        ear_flick=dict(sel=dict(xmin=0.84, ymin=0.52), pivot=[0.9, 0.54, -0.15], axis=[0.39, 0, 0.92], angle=0.28),
        sniff=dict(sel=dict(xmin=0.8, ymin=0.24, ymax=0.36, zmin=0.05), pivot=[0.88, 0.31, 0.1], scale=1.12, move=[0, 0.015, 0]),
        live=dict(mouth=[0.88, 0.24, 0.12], top=[0.78, 0.72, -0.1], cheeks=[[0.72, 0.33, 0.05], [0.95, 0.33, 0.05]],
                  pivots=dict(neck=[0.4, 0.3, -0.05], head=[0.68, 0.35, -0.05], ear=[0.9, 0.55, -0.12], nose=[0.86, 0.31, 0.08]),
                  weights=dict(neck=dict(x=[0.3, 0.5]), head=dict(x=[0.5, 0.65]), ear=dict(cx=0.775, y=[0.52, 0.58], x=[0.08, 0.11], c=[0.15, -0.12], r=[0.1, 0.16]), nose=dict(z=[0.07, 0.11], y=[0.26, 0.3])),
                  scale=1.1)),
}


# The mighty, regal, great and ironclad pets are their base pet reskinned, with a small change to the model (`shape`, bent
# into the rest pose by render.cjs and mesh.cjs) or to how it holds its head.
PETS['mighty-bison'] = dict(PETS['bison'],
    inks={'night': '#3A2420', 'umber': '#55332A', 'bark': '#744635', 'fur': '#935E44', 'tawny': '#B57D5B', 'cream': '#D7A77F', 'bone': '#F6E4C6'},
    fur=[0.44, 0.27, 0.19],
    regions={**PETS['bison']['regions'], 'mane': dict(ymin=0.05, zmax=0.82, rgb=[0.6, 0.38, 0.24]),
             'horn-l': dict(xmax=-0.22, ymin=0.18, zmin=0.65, rgb=[0.98, 0.85, 0.55]), 'horn-r': dict(xmin=0.22, ymin=0.18, zmin=0.65, rgb=[0.98, 0.85, 0.55])},
    shape=[dict(sel=dict(xmax=-0.22, ymin=0.18, zmin=0.65), pivot=[-0.24, 0.2, 0.76], scale=1.3),
           dict(sel=dict(xmin=0.22, ymin=0.18, zmin=0.65), pivot=[0.24, 0.2, 0.76], scale=1.3)],
    rest=dict(PETS['bison']['rest'], lift=-0.3))
PETS['regal-white-lion'] = dict(PETS['lion'],
    inks={'night': '#6E6A8C', 'umber': '#A07A48', 'bark': '#C9984E', 'fur': '#E2B868', 'tawny': '#EED6A2', 'cream': '#F8EEDB', 'bone': '#FFFFFF'},
    fur=[0.95, 0.9, 0.8],
    regions=dict(mane=dict(PETS['lion']['regions']['mane'], rgb=[0.95, 0.68, 0.32]),
                 muzzle=dict(PETS['lion']['regions']['muzzle'], rgb=[1.0, 0.98, 0.93]),
                 nose=dict(PETS['lion']['regions']['nose'], rgb=[0.82, 0.45, 0.48])),
    rest=dict(PETS['lion']['rest'], lift=-0.1, scale=1.1))
PETS['great-moose'] = dict(PETS['moose'],
    inks={'night': '#3A2A22', 'umber': '#55402F', 'bark': '#725A43', 'fur': '#8E7559', 'tawny': '#AC9375', 'cream': '#CDB698', 'bone': '#EEE3D2'},
    fur=[0.42, 0.31, 0.23],
    regions=dict(PETS['moose']['regions'], antlers=dict(ymin=0.47, rgb=[0.95, 0.88, 0.72])),
    shape=[dict(sel=dict(ymin=0.45), pivot=[0, 0.47, 0.66], scale=0.7)])
PETS['ironclad-war-bear'] = dict(PETS['grizzly-bear'],
    inks={'night': '#3F4652', 'umber': '#56606E', 'bark': '#6F7A89', 'fur': '#8A95A3', 'tawny': '#A8B1BD', 'cream': '#C8CED6', 'bone': '#EEF1F4'},
    fur=[0.5, 0.52, 0.56],
    regions=dict(ears=dict(PETS['grizzly-bear']['regions']['ears'], rgb=[0.64, 0.66, 0.72]),
                 muzzle=dict(PETS['grizzly-bear']['regions']['muzzle'], rgb=[0.86, 0.87, 0.9]),
                 nose=dict(PETS['grizzly-bear']['regions']['nose'], rgb=[0.08, 0.08, 0.1])),
    shape=[dict(sel=dict(ymin=0.36, xmax=-0.08, zmin=0.25), pivot=[-0.2, 0.42, 0.45], scale=0.8),
           dict(sel=dict(ymin=0.36, xmin=0.08, zmin=0.25), pivot=[0.2, 0.42, 0.45], scale=0.8)],
    rest=dict(PETS['grizzly-bear']['rest'], turn=-0.35))


def model(cfg):
    """How render.cjs and mesh.cjs read the model: turned by `orient`, then reshaped by a variant's `shape`."""
    return dict(cfg['orient'], shape=cfg.get('shape', []))


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


def spots(p, spec):
    """A spotted coat: blobs where three crossed, wobbled waves all peak, so a point on the model always gets the
    same spot in every pose. js/pet-live.js paints the same pattern."""
    a = spec['scale']; b = a * 0.37; x, y, z = p[..., 0], p[..., 1], p[..., 2]
    s = np.sin(a * x + 2 * np.sin(b * y)) * np.sin(a * y + 2 * np.sin(b * z)) * np.sin(a * z + 2 * np.sin(b * x))
    return (np.abs(s) > spec['cut']) & region(p, spec)


def shade(R, cfg, cols, rows, eye='o', mouth='w', body_dim=0.8, edge_frac=0.1, dstep=0.02):
    a = R['lit'][..., 3]; m = a > 0.5
    lum = R['lit'][..., 0]
    lo, hi = np.percentile(lum[m], [1, 99.5]); L = np.clip((lum - lo) / (hi - lo), 0, 1)
    p = R['pos'][..., :3] * 2 - 1
    z = p[..., 2]
    alb = np.broadcast_to(np.array(cfg['fur']), p.shape).copy()
    masks = {}
    NAMES = list(cfg['inks']); INK_RGB = np.stack([[int(v[i:i + 2], 16) / 255 for i in (1, 3, 5)] for v in cfg['inks'].values()])
    if 'spots' in cfg:
        alb[spots(p, cfg['spots'])] = cfg['spots']['rgb']
    for name in cfg['regions']:                 # later regions paint over earlier ones
        masks[name] = region(p, cfg['regions'][name])
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


def live(cfg, cam):
    """What js/pet-live.js needs besides the mesh: inks, fur regions, face, skeleton and camera."""
    ids = {'muzzle': 2, 'nose': 3}
    regions = [dict(id=ids.get(name, 1), rgb=spec['rgb'], **{k: v for k, v in spec.items() if k != 'rgb'}) for name, spec in cfg['regions'].items()]
    return dict(inks=list(cfg['inks'].values()), fur=cfg['fur'], regions=regions, head=cfg['head'], ramp=ramp(cfg), eyes=[list(e) for e in cfg['eyes']],
                rest=dict(lift=cfg['rest']['lift'], turn=cfg['rest']['turn'], scale=cfg['live']['scale']),
                camera={k: cam[k] for k in ('yaw', 'pitch', 'fov', 'dist', 'target')}, lights=dict(key=LIGHT['keypos'], rim=[2, 0.6, -1.5]),
                **({'spots': cfg['spots']} if 'spots' in cfg else {}), **{k: v for k, v in cfg['live'].items() if k != 'scale'})


def main(pet, stl):
    cfg = PETS[pet]
    cols, rows, tall = cfg['cols'], cfg['rows'], cfg['render_rows']
    subprocess.run(['node', os.path.join(HERE, 'mesh.cjs'), pet, stl, json.dumps(dict(model(cfg), tris=cfg.get('tris', 1000)))], check=True)
    with tempfile.TemporaryDirectory() as tmp:
        cam = fit(stl, tmp, cols, tall, cfg['yaw'], cfg['pitch'], neck_pose(cfg), cfg['focus'], model(cfg), fill=cfg.get('fill', 0.8), start=cfg.get('start'))
        cam.update(LIGHT)
        baked = {}
        for name, pose in poses(cfg).items():
            R = render(stl, tmp, cols, tall, deform=pose['deform'], **cam, **model(cfg))
            baked[name] = shade(R, cfg, cols, tall, eye=pose.get('eye', 'o'))
    # crop every pose to the same rows: the art's top, then as many rows as the pen holds
    used = [r for pose in baked.values() for g in pose.values() for r, row in enumerate(g) if row.strip()]
    top = max(0, min(used) - 1)
    baked = {n: {k: g[top:top + rows] for k, g in pose.items()} for n, pose in baked.items()}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{pet}.json'), 'w') as f:
        json.dump({'cols': cols, 'rows': rows, 'inks': list(cfg['inks']), 'poses': baked}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    with open(os.path.join(LIVE, f'{pet}.json'), 'w') as f:
        json.dump(live(cfg, cam), f, separators=(',', ':'))
        f.write('\n')
    print(f'{pet}: {len(baked)} poses, rows {top}..{top + rows} of {tall}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
