"""Desenha geo.json num PNG para conferir litoral, matas, relevo, estradas, trilhos e predios."""
import base64
import json
import math
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

geo = json.load(open(sys.argv[1], encoding="utf-8"))
S = int(sys.argv[3]) if len(sys.argv) > 3 else 1536
# recorte opcional: x0 z0 lado (em metros)
x0, z0, lado = (float(v) for v in sys.argv[4:7]) if len(sys.argv) > 6 else (0.0, 0.0, 15360.0)
k = S / lado


def P(x, z):
    return ((x - x0) * k, (lado - (z - z0)) * k)


def aneis(d):
    out = []
    for parte in re.findall(r"M[^M]+", d):
        nums = list(map(float, re.findall(r"-?\d+(?:\.\d+)?", parte)))
        x, z = nums[0], nums[1]
        pts = [(x, z)]
        for i in range(2, len(nums), 2):
            x += nums[i]
            z += nums[i + 1]
            pts.append((x, z))
        out.append(pts)
    return out


img = Image.new("RGB", (S, S), (188, 207, 211))
mask = Image.new("L", (S, S), 0)
dm = ImageDraw.Draw(mask)
for a in aneis(geo["litoral"]):
    dm.polygon([P(*p) for p in a], fill=255, outline=255)
# evenodd simples: anel dentro de anel inverte; aqui so conferimos visualmente
img.paste((230, 228, 214), mask=mask)
d = ImageDraw.Draw(img, "RGBA")
for a in aneis(geo["matas"]):
    d.polygon([P(*p) for p in a], fill=(150, 175, 110, 110))

n = geo["relevo"]["n"]
h = np.frombuffer(base64.b64decode(geo["relevo"]["b64"]), "<i2").reshape(n, n) / 10
c = 15360 / n
for nivel in range(25, 560, 25):
    for zi in range(n - 1):
        for xi in range(n - 1):
            a, b, cc, dd = h[zi, xi], h[zi, xi + 1], h[zi + 1, xi + 1], h[zi + 1, xi]
            vals = [(a, (xi, zi)), (b, (xi + 1, zi)), (cc, (xi + 1, zi + 1)), (dd, (xi, zi + 1))]
            pts = []
            for i in range(4):
                (v1, p1), (v2, p2) = vals[i], vals[(i + 1) % 4]
                if (v1 > nivel) != (v2 > nivel):
                    t = (nivel - v1) / (v2 - v1)
                    pts.append(((p1[0] + (p2[0] - p1[0]) * t + .5) * c, (p1[1] + (p2[1] - p1[1]) * t + .5) * c))
            if len(pts) >= 2:
                d.line([P(*pts[0]), P(*pts[1])], fill=(168, 132, 90, 200 if nivel % 100 == 0 else 110), width=1)


def pecas(b64):
    arr = np.frombuffer(base64.b64decode(b64), "<u2").reshape(-1, 4).astype(np.int64)
    return arr.tolist()


for x2, z2, a100, t in pecas(geo["estradas"]):
    x, z, a = x2 / 2, z2 / 2, math.radians(a100 / 100)
    comp = (t % 100) / 2
    dx, dz = math.cos(a) * comp, math.sin(a) * comp
    d.line([P(x - dx, z - dz), P(x + dx, z + dz)], fill=(60, 50, 40, 255) if t >= 200 else (180, 60, 30, 255), width=2)
for x2, z2, a100, t in pecas(geo["trilhos"]):
    x, z, a = x2 / 2, z2 / 2, math.radians(a100 / 100)
    dx, dz = math.cos(a) * 12, math.sin(a) * 12
    d.line([P(x - dx, z - dz), P(x + dx, z + dz)], fill=(20, 20, 20, 255), width=3)
for x2, z2, a100, t in pecas(geo["predios"]):
    x, z, a = x2 / 2, z2 / 2, math.radians(a100 / 100)
    lar, com = t // 64, t % 64
    ca, sa = math.cos(a), math.sin(a)
    cantos = []
    for lx, lz in ((-com / 2, -lar / 2), (com / 2, -lar / 2), (com / 2, lar / 2), (-com / 2, lar / 2)):
        cantos.append(P(x + lx * ca - lz * sa, z + lx * sa + lz * ca))
    d.polygon(cantos, fill=(28, 31, 23, 255))
img.save(sys.argv[2])
print("ok")
