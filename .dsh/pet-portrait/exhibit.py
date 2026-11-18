"""Turn exported Kingshot models into inputs for the existing portrait baker."""
from pathlib import Path
from io import BytesIO
import json
import struct

import numpy as np
from PIL import Image


def recovered(alias, variant='exhibit', eyes=None):
    return ('../pet-recovered', f'{alias}-{variant}-body', eyes, f'{alias}-diffuse.png')


# Bundle labels are not the in-game species names. See pet-recovered/INDEX.md.
SOURCES = {
    'gray-wolf': recovered('crocuta_spelaea'),
    'lynx': recovered('north_wolf'),
    'bison': recovered('megatapirus'),
    'moose': recovered('titanis', 'pit'),
    'lion': recovered('megaloceros'),
    'alpha-black-panther': recovered('sabretooth'),
    'great-moose': recovered('sinotherium'),
    'ironclad-war-bear': recovered('monitor_lizard'),
    'ironclad-war-elephant': ('../pet-rigs', 'gigantopithecus-rigged.glb', 'gigantopithecus'),
    'giant-rhino': ('hole_lion', '3d_pet_exhibit_rhinoceros_body', '3d_pet_exhibit_rhinoceros_eye'),
    'regal-white-lion': ('regal_white_lion', 'mammoth-rigged.glb'),
    'mighty-bison': ('wendigo', '3d_pet_exhibit_wendigo_1_body', None, '../../pet-recovered/wendigo-diffuse.png'),
    'cheetah': recovered('ovibos_moschatus'),
    'grizzly-bear': recovered('snow_leopard'),
}


def obj(path):
    """Read the triangulated OBJ exports (positive indices, position/UV/normal)."""
    pos, uv, faces = [], [], []
    for line in path.read_text(encoding='utf-8').splitlines():
        fields = line.split()
        if not fields:
            continue
        kind, *values = fields
        if kind == 'v':
            pos.append([float(v) for v in values[:3]])
        elif kind == 'vt':
            uv.append([float(v) for v in values[:2]])
        elif kind == 'f':
            if len(values) != 3:
                raise ValueError(f'{path}: expected triangulated faces')
            faces.extend([int(v) - 1 if v else -1 for v in c.split('/')[:2]] for c in values)
    corners = np.array(faces)
    return np.array(pos)[corners[:, 0]], np.array(uv)[corners[:, 1]] if uv else None


def diffuse(path, uv):
    material = path.with_suffix('.mtl').read_text(encoding='utf-8').splitlines()
    image = next(line.split(maxsplit=1)[1] for line in material if line.startswith('map_Kd '))
    with Image.open(path.with_name(image)) as png:
        return sample(png, uv * [1, -1] + [0, 1])


def sample(png, uv):
    rgb = np.asarray(png.convert('RGB'))
    h, w = rgb.shape[:2]
    x, y = (np.clip(uv, 0, 1) * [w - 1, h - 1]).T
    ix, iy = x.astype(int), y.astype(int)
    fx, fy = (x - ix)[:, None], (y - iy)[:, None]
    jx, jy = np.minimum(ix + 1, w - 1), np.minimum(iy + 1, h - 1)
    return np.rint((rgb[iy, ix] * (1 - fx) + rgb[iy, jx] * fx) * (1 - fy)
                   + (rgb[jy, ix] * (1 - fx) + rgb[jy, jx] * fx) * fy).astype(np.uint8)


def rigged(path, recovered_uv=None, recovered_diffuse=None):
    """Read the exhibit GLB's bind mesh, diffuse colours and skin influences."""
    data = path.read_bytes()
    size, kind = struct.unpack_from('<I4s', data, 12)
    if data[:4] != b'glTF' or kind != b'JSON' or data[24 + size:28 + size] != b'BIN\0':
        raise ValueError(f'{path}: expected a GLB with an embedded buffer')
    doc = json.loads(data[20:20 + size])
    binary = memoryview(data)[28 + size:]

    def view(i):
        v = doc['bufferViews'][i]
        offset = v.get('byteOffset', 0)
        return binary[offset:offset + v['byteLength']]

    def attr(i, width):
        a = doc['accessors'][i]
        dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
        return np.frombuffer(view(a['bufferView']), dtype, a['count'] * width, a.get('byteOffset', 0)).reshape(-1, width)

    node = next(n for n in doc['nodes'] if 'skin' in n)
    skin = doc['skins'][node['skin']]
    # Collapse unanimated joints into their nearest animated ancestor. Whiskers,
    # mane, jaw and eyes still follow the head; legs and tail stay with the body.
    bones = {'Bip001 Neck': 1, 'Bip001 Head': 2, 'erduo_001': 3, 'erduo_002': 4, 'bizi_001': 5}
    parents = {child: i for i, n in enumerate(doc['nodes']) for child in n.get('children', [])}

    def driver(index):
        while index is not None:
            name = doc['nodes'][index]['name']
            if name in bones:
                return bones[name]
            index = parents.get(index)
        return 0

    remap = np.array([driver(i) for i in skin['joints']])
    xyz, rgb, weights = [], [], []
    primitives = [p for n in doc['nodes'] if n.get('skin') == node['skin']
                  for p in doc['meshes'][n['mesh']]['primitives']]
    for number, primitive in enumerate(primitives):
        a = primitive['attributes']
        indices = attr(primitive['indices'], 1).ravel()
        pos = attr(a['POSITION'], 3)[indices]
        j, w = attr(a['JOINTS_0'], 4), attr(a['WEIGHTS_0'], 4)
        dense = np.zeros((len(j), 6), dtype=np.float32)
        np.add.at(dense, (np.arange(len(j))[:, None], remap[j]), w)
        # Rounded cumulative sums keep the six quantised weights summing to 255.
        cumulative = np.rint(255 * np.cumsum(dense / dense.sum(1, keepdims=True), axis=1))
        packed = np.diff(cumulative, prepend=0, axis=1).astype(np.uint8)
        if recovered_uv is not None:
            if number == 0:
                uv = recovered_uv[indices]
                colour = sample(recovered_diffuse, np.mod(uv, 1) * [1, -1] + [0, 1])
            else:
                colour = np.broadcast_to([155, 155, 145], pos.shape)
        else:
            mat = doc['materials'][primitive['material']]['pbrMetallicRoughness']
            if 'baseColorTexture' in mat:
                image = doc['textures'][mat['baseColorTexture']['index']]['source']
                with Image.open(BytesIO(view(doc['images'][image]['bufferView']))) as png:
                    colour = sample(png, attr(a['TEXCOORD_0'], 2)[indices])
            else:
                colour = np.broadcast_to(np.rint(np.array(mat['baseColorFactor'][:3]) * 255), pos.shape)
        xyz.append(pos)
        rgb.append(colour)
        weights.append(packed[indices])
    return np.concatenate(xyz), np.concatenate(rgb), np.concatenate(weights)


def prepare(pet, root, tmp):
    folder, body, *parts = SOURCES[pet]
    path = Path(root) / folder / body
    if path.suffix == '.glb':
        if parts:
            assets = Path(root).parent / 'pet-recovered'
            uv = np.load(assets / f'{parts[0]}-uv.npy')
            with Image.open(assets / f'{parts[0]}-diffuse.png') as png:
                pos, colours, weights = rigged(path, uv, png)
        else:
            pos, colours, weights = rigged(path)
    else:
        path = path.with_suffix('.obj')
        pos, uv = obj(path)
        textures = path.with_suffix('.mtl').exists()
        colours = diffuse(path, uv) if textures else None
        if len(parts) > 1:
            with Image.open(path.parent / parts[1]) as png:
                colours = sample(png, np.mod(uv, 1) * [1, -1] + [0, 1])
        weights = None
        if parts[0]:
            eye_pos, _ = obj(path.with_name(f'{parts[0]}.obj'))
            pos = np.concatenate((pos, eye_pos))
            if textures:
                # The expression glyphs supply the iris. No eye diffuse was exported.
                colours = np.concatenate((colours, np.broadcast_to([185, 181, 173], eye_pos.shape)))
    stl = Path(tmp) / f'{pet}.stl'
    triangles = np.zeros(len(pos) // 3, dtype=[('normal', '<f4', 3), ('pos', '<f4', 9), ('flags', '<u2')])
    triangles['pos'] = pos.reshape(-1, 9)
    with stl.open('wb') as f:
        f.write(bytes(80) + struct.pack('<I', len(triangles)))
        f.write(triangles.tobytes())
    channels = {}
    for name, values in (('rgb', colours), ('skin', weights)):
        if values is not None:
            target = stl.with_suffix(f'.{name}')
            target.write_bytes(values.astype(np.uint8, copy=False).tobytes())
            channels[name] = str(target)
    return str(stl), channels
