# Reconstructs a clean Halloween item icon from a Kingshot Packs bag tile: fits the tile's
# background, cuts the item out, lifts the printed count and repaints what it covered.
# Usage: python3 .dsh/seasonal-icon-cutout.py <tile.png> <out.png> <name> [background tolerance] [edge trim]
# The committed icons used the defaults, except mythic-conquest and mythic-expedition (22 40).
import sys, numpy as np, cv2
from scipy import ndimage as nd
from PIL import Image
src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
rgb, a = im[..., :3], im[..., 3]
H, W = a.shape
tile = a > 200
tile = nd.binary_fill_holes(tile)
inner = nd.binary_erosion(tile, iterations=5)
ring = inner & ~nd.binary_erosion(inner, iterations=4)
yy, xx = np.mgrid[0:H, 0:W]
def design(y, x):
    y, x = y / H, x / W
    return np.stack([np.ones_like(x), x, y, x * y, x * x, y * y], -1)
# fit background surface to the ring, robustly (iterate dropping outliers)
pts = ring.copy()
for _ in range(3):
    A = design(yy[pts], xx[pts]); coef, *_ = np.linalg.lstsq(A, rgb[pts], rcond=None)
    bg = design(yy, xx) @ coef
    d = np.linalg.norm(rgb - bg, axis=-1)
    pts = ring & (d < np.percentile(d[ring], 70) + 8)
d = np.linalg.norm(rgb - bg, axis=-1)
T = float(sys.argv[4]) if len(sys.argv) > 4 else 30
near = inner & (d <= T)
lab_bg, _ = nd.label(near)
seeds = np.unique(lab_bg[ring & near]); seeds = seeds[seeds > 0]
bgmask = np.isin(lab_bg, seeds)
fg = inner & ~bgmask
# count digits: bright near-white text with dark outline in the lower right corner
corner = (yy > H * .62) & (xx > W * .52)
if name == 'hero-xp': corner |= (yy < H * .34)   # the "5K" denomination plate
white = (rgb.min(-1) > 200) & corner & inner
dark = (rgb.max(-1) < 70) & corner & inner
digits = nd.binary_dilation(white, iterations=2) & (white | dark | (d > 38))
digits = nd.binary_dilation(digits, iterations=1)
# what remains of the object after the digits are lifted
obj = fg & ~digits
obj = nd.binary_opening(obj, iterations=1)
lab, n = nd.label(obj)
if n:
    sizes = nd.sum(obj, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= max(30, sizes.max() * .06)]
    obj = np.isin(lab, keep)
obj = nd.binary_closing(obj, iterations=2)
obj = nd.binary_fill_holes(obj)
# trim the tile's glow from the silhouette: boundary pixels still close to the fitted background
for _ in range(3):
    band = obj & ~nd.binary_erosion(obj, iterations=1)
    obj = obj & ~(band & (d < (float(sys.argv[5]) if len(sys.argv) > 5 else 70)))
obj = nd.binary_opening(obj, iterations=1)
lab, n = nd.label(obj)
if n:
    sizes = nd.sum(obj, lab, range(1, n + 1)); obj = lab == (np.argmax(sizes) + 1) if name not in ('gear-material',) else np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 40])
if name.startswith('mythic-'):
    # the count sat over the book's lower edge: restore that edge inside the book's outline
    pts = np.argwhere(obj)[:, ::-1].astype(np.int32)
    hull = np.zeros_like(obj, np.uint8); cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
    obj = obj | (hull.astype(bool) & nd.binary_dilation(digits, iterations=1))
# repaint the object where digits covered it, from the surrounding object pixels
hole = digits & obj
paint = rgb.copy()
if hole.any():
    paint = cv2.inpaint(rgb.astype(np.uint8), hole.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA).astype(np.float32)
alpha = cv2.GaussianBlur(obj.astype(np.float32), (3, 3), .7) * 255
out = np.dstack([paint, alpha]).clip(0, 255).astype(np.uint8)
ys, xs = np.where(alpha > 10)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crop = Image.fromarray(out[y0:y1, x0:x1])
side = max(crop.size) + 6
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0)); canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
canvas.resize((100, 100), Image.LANCZOS).save(dst)
