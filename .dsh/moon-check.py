import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('ascii', Path(__file__).with_name('build-ascii.py'))
scene = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scene)
shadow, samples = scene.moon_surface()
frames = scene.moon_frames()
disk = {(c, r) for c, r, *_ in samples}
light = [{(c, r) for c, r in disk if frame[r][c] != ' '} for frame in frames]
assert len(frames) == 112
assert len(light[12]) == len(disk), 'Full moon must light the whole disk'
assert not light[68], 'New moon must leave only earthshine'
for index, side in ((40, 'left'), (96, 'right')):
    assert .4 < len(light[index]) / len(disk) < .6
    assert all(c <= 18 if side == 'left' else c >= 18 for c, r in light[index])
assert len({frames[12][r][c] for c, r in disk}) >= 6, 'Full moon needs surface texture'
for index, frame in enumerate(frames):
    assert len(frame) == 13 and all(len(row) == 37 for row in frame)
    assert all(ord(glyph) < 128 for row in frame for glyph in row)
    assert all(shadow[r][c] != ' ' for c, r in light[index]), 'Light escaped the fixed silhouette'
    assert len(light[index] ^ light[(index + 1) % 112]) < len(disk) * .08, 'Terminator jumps at a frame boundary'
print('Moon: full/new/quarters, fixed silhouette, ASCII texture and seamless phase boundary pass')
