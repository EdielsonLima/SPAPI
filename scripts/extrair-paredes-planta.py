"""Extrai as paredes de uma planta humanizada (imagem) para o tour "dollhouse"
do Quadro Espelho 3D (src/components/planta-dollhouse.tsx).

Como funciona: as paredes das plantas humanizadas sao pintadas num marrom
escuro e quente; o script separa esses pixels, descarta blobs gordos (tapete,
sofa) e pequenos (sombras, plantas), e exporta retangulos em pixels
(celulas de 4 px, mescladas na vertical). O componente extruda cada retangulo.

Uso:
  py scripts/extrair-paredes-planta.py public/modelos/palacio-planta-tipo.webp \
     --saida public/modelos/palacio-planta-tipo.paredes.json \
     --excluir 575,55,790,330 --excluir 1290,590,1600,960

  --excluir x0,y0,x1,y1  zona (px) ignorada: borda de tapete, bancada, painel
                         que a cor confunde com parede. Repetir quantas vezes
                         precisar. Conferir com --mascara (grava um PNG).

Precisa de Pillow, numpy e scipy (py -m pip install pillow numpy scipy).
"""
import argparse, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ap = argparse.ArgumentParser()
ap.add_argument("imagem")
ap.add_argument("--saida", required=True)
ap.add_argument("--excluir", action="append", default=[], help="x0,y0,x1,y1 em px")
ap.add_argument("--celula", type=int, default=4)
ap.add_argument("--espessura-max", type=float, default=16, help="meia-espessura maxima (px) de um blob para ser parede")
ap.add_argument("--area-min", type=int, default=300)
ap.add_argument("--mascara", help="grava a mascara final neste PNG para conferencia")
a = ap.parse_args()

im = np.array(Image.open(a.imagem).convert("RGB")).astype(int)
H, W = im.shape[:2]
r, g, b = im[..., 0], im[..., 1], im[..., 2]
lum = (r + g + b) / 3
quente = ((r - b) >= 4) & ((r - b) <= 22) & ((r - g) <= 14)
mask = (lum < 102) & (lum > 40) & quente
mask = ndi.binary_opening(mask, iterations=1)

# Blobs gordos (tapete, sofa) e pequenos (sombra) nao sao parede.
dist = ndi.distance_transform_edt(mask)
lab, n = ndi.label(mask)
idx = np.arange(1, n + 1)
maxd = ndi.maximum(dist, lab, index=idx)
area = ndi.sum(mask, lab, index=idx)
keep = np.zeros(n + 1, bool)
for i in range(n):
    if area[i] >= 120 and maxd[i] <= a.espessura_max:
        keep[i + 1] = True
mask = keep[lab]
mask = ndi.binary_closing(mask, iterations=1)

for z in a.excluir:
    x0, y0, x1, y1 = [int(v) for v in z.split(",")]
    mask[y0:y1, x0:x1] = False

lab, n = ndi.label(mask)
area = ndi.sum(mask, lab, index=np.arange(1, n + 1))
keep = np.zeros(n + 1, bool)
for i, s in enumerate(ndi.find_objects(lab)):
    h = s[0].stop - s[0].start
    w = s[1].stop - s[1].start
    if area[i] >= a.area_min and max(w, h) >= 40:
        keep[i + 1] = True
mask = keep[lab]
if a.mascara:
    Image.fromarray((mask * 255).astype(np.uint8)).save(a.mascara)

# Celulas -> corridas horizontais -> mescla vertical de corridas iguais.
C = a.celula
gh, gw = H // C, W // C
grid = mask[: gh * C, : gw * C].reshape(gh, C, gw, C).mean((1, 3)) > 0.5
rects = []
for y in range(gh):
    x = 0
    while x < gw:
        if grid[y, x]:
            x0 = x
            while x < gw and grid[y, x]:
                x += 1
            rects.append([x0 * C, y * C, (x - x0) * C, C])
        else:
            x += 1
rects.sort(key=lambda q: (q[0], q[2], q[1]))
aberto, saida = {}, []
for q in rects:
    k = (q[0], q[2])
    if k in aberto and aberto[k][1] + aberto[k][3] == q[1]:
        aberto[k][3] += q[3]
    else:
        if k in aberto:
            saida.append(aberto[k])
        aberto[k] = list(q)
saida += list(aberto.values())
json.dump({"w": W, "h": H, "rects": saida}, open(a.saida, "w"), separators=(",", ":"))
print(f"{len(saida)} retangulos de parede -> {a.saida} (mascara {mask.mean():.1%} da imagem)")
