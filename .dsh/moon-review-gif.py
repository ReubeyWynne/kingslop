from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('.dsh/ascii-preview/390')
output = Path('.dsh/ascii-preview/moon-phases.gif')
frames = []
for index in range(112):
    scenes = [Image.open(root / name / f'{index:03}.png').convert('RGB')
              for name in ('moon', 'moon-card')]
    width, height = max(scene.width for scene in scenes), max(scene.height for scene in scenes)
    frame = Image.new('RGB', (width * 2 + 48, height + 64), '#0B0E16')
    draw = ImageDraw.Draw(frame)
    for column, (scene, label) in enumerate(zip(scenes, ('EVENTS HERO', 'EVENTS CARD'))):
        left = 16 + column * (width + 16)
        draw.text((left, 12), label, font=ImageFont.load_default(size=18), fill='#C7BC9D')
        frame.paste(scene, (left + (width - scene.width) // 2, 40))
    frames.append(frame)
frames[0].save(output, save_all=True, append_images=frames[1:],
               duration=[170, 180] * 56, loop=0, optimize=True)
print(f'Wrote {output}: 112 frames, 19.6 seconds, hero and card')
