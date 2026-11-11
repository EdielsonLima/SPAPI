"""Converte um modelo SketchUp (.skp) na maquete leve que o 3D do Quadro
Espelho carrega (public/modelos/<chave>.m3d).

Uso (Windows, com o Autodesk instalado — ele traz o SDK do SketchUp):
    py -I scripts/skp-para-maquete.py <arquivo.skp> <saida.m3d> [--previa previa.npz]

O que faz:
  - lê o .skp pelo SketchUpAPI.dll (ctypes), só o que está visível;
  - tira o que não aparece na maquete (paredes internas, cortinas) e troca por
    uma caixa na cor média tudo que é pequeno e pesado (placa solar, chapa
    perfurada, arbusto, mobília): 1,8 milhão de triângulos viram ~250 mil;
  - separa cada apartamento: os componentes PAVIMENTOS (um por andar, de baixo
    para cima) são cortados no eixo da torre em lado esquerdo e direito
    (olhando a frente), e dentro de cada um o vidro fica à parte do resto;
  - grava em metros, com a origem no centro da torre e no nível da calçada:
    x para a direita, y para cima, z para a frente (a fachada das sacadas);
  - deixa à parte o terreno desenhado pelo arquiteto (ruas e grama em volta):
    o 3D só mostra ele enquanto o mapa da cidade não chega.

Formato .m3d (gzip): "M3D1" + uint32 tamanho do cabeçalho + cabeçalho JSON +
posições (uint16 × 9 por triângulo, quantizadas na caixa do cabeçalho) +
cores (uint8 × 3 por triângulo). O cabeçalho diz a faixa de triângulos da
casca, do terreno e de cada unidade (`opaco` e `vidro`: [início, quantidade]).
Leitor: src/lib/modelo-3d.ts.

Ajustes por empreendimento ficam em CONFIG, pelo nome do arquivo de saída.
"""
import ctypes as C
import gzip
import json
import os
import re
import struct
import sys

import numpy as np

DLLDIR = r"C:\Program Files\Common Files\Autodesk Shared\Components\2027\2.0.3"

CONFIG = {
    "135-jardins": {
        # Componentes que são um pavimento de apartamentos, em qualquer ordem
        # (a ordem dos andares sai da cota de cada um).
        "pavimentos": r"^(TIPO|DIFERENCIADO)$",
        # A frente (sacadas) olha para -y no arquivo.
        "frente": "-y",
        # Fora da maquete: não se vê de fora e pesa.
        "ignorar": r"paredes internas|^curtain$",
        # Altura (m) da calçada acima do ponto mais baixo do arquivo: é o y = 0
        # da cena, para o prédio assentar no mapa da cidade (que é plano).
        "calcada": 0.55,
    },
}

LIMITE_TRI = 1500   # nó com mais triângulos que isto...
LIMITE_DIM = 14.0   # ...e menor que isto (m) vira uma caixa
LIMITE_PEQ = 5.0    # abaixo disto vira caixa mesmo com peça pesada dentro
POL = 0.0254
SEM_MATERIAL = (232, 230, 226, 255)

VP, SZ, I = C.c_void_p, C.c_size_t, C.c_int


class P3(C.Structure):
    _fields_ = [("x", C.c_double), ("y", C.c_double), ("z", C.c_double)]


class TR(C.Structure):
    _fields_ = [("v", C.c_double * 16)]


class COL(C.Structure):
    _fields_ = [("r", C.c_ubyte), ("g", C.c_ubyte), ("b", C.c_ubyte), ("a", C.c_ubyte)]


su = None


def f(name, res, *args):
    fn = getattr(su, name)
    fn.restype = res
    fn.argtypes = list(args)
    return fn


def carregar_sdk():
    global su
    if not os.path.isdir(DLLDIR):
        sys.exit(f"Não achei o SDK do SketchUp em {DLLDIR} (vem com o Autodesk).")
    os.add_dll_directory(DLLDIR)
    su = C.CDLL(os.path.join(DLLDIR, "SketchUpAPI.dll"))
    PVP, PSZ, PB = C.POINTER(VP), C.POINTER(SZ), C.POINTER(C.c_bool)
    g = globals()
    for nome, res, args in [
        ("SUInitialize", None, []),
        ("SUModelCreateFromFileWithStatus", I, [PVP, C.c_char_p, C.POINTER(I)]),
        ("SUModelGetEntities", I, [VP, PVP]),
        ("SUEntitiesGetNumFaces", I, [VP, PSZ]), ("SUEntitiesGetFaces", I, [VP, SZ, PVP, PSZ]),
        ("SUEntitiesGetNumGroups", I, [VP, PSZ]), ("SUEntitiesGetGroups", I, [VP, SZ, PVP, PSZ]),
        ("SUEntitiesGetNumInstances", I, [VP, PSZ]), ("SUEntitiesGetInstances", I, [VP, SZ, PVP, PSZ]),
        ("SUGroupGetEntities", I, [VP, PVP]), ("SUGroupGetTransform", I, [VP, C.POINTER(TR)]),
        ("SUGroupGetName", I, [VP, PVP]),
        ("SUComponentInstanceGetDefinition", I, [VP, PVP]),
        ("SUComponentInstanceGetTransform", I, [VP, C.POINTER(TR)]),
        ("SUComponentDefinitionGetEntities", I, [VP, PVP]), ("SUComponentDefinitionGetName", I, [VP, PVP]),
        ("SUFaceToDrawingElement", VP, [VP]), ("SUGroupToDrawingElement", VP, [VP]),
        ("SUComponentInstanceToDrawingElement", VP, [VP]),
        ("SUDrawingElementGetHidden", I, [VP, PB]), ("SUDrawingElementGetLayer", I, [VP, PVP]),
        ("SUDrawingElementGetMaterial", I, [VP, PVP]), ("SULayerGetVisibility", I, [VP, PB]),
        ("SUFaceGetFrontMaterial", I, [VP, PVP]),
        ("SUMaterialGetColor", I, [VP, C.POINTER(COL)]), ("SUMaterialGetTexture", I, [VP, PVP]),
        ("SUTextureGetAverageColor", I, [VP, C.POINTER(COL)]),
        ("SUMaterialGetOpacity", I, [VP, C.POINTER(C.c_double)]), ("SUMaterialGetUseOpacity", I, [VP, PB]),
        ("SUMaterialGetName", I, [VP, PVP]),
        ("SUMeshHelperCreate", I, [PVP, VP]), ("SUMeshHelperRelease", I, [PVP]),
        ("SUMeshHelperGetNumTriangles", I, [VP, PSZ]), ("SUMeshHelperGetNumVertices", I, [VP, PSZ]),
        ("SUMeshHelperGetVertexIndices", I, [VP, SZ, PSZ, PSZ]),
        ("SUMeshHelperGetVertices", I, [VP, SZ, C.POINTER(P3), PSZ]),
        ("SUStringCreate", I, [PVP]), ("SUStringRelease", I, [PVP]),
        ("SUStringGetUTF8Length", I, [VP, PSZ]), ("SUStringGetUTF8", I, [VP, SZ, C.c_char_p, PSZ]),
    ]:
        g[nome] = f(nome, res, *args)


def texto(getter, ref):
    s = VP()
    SUStringCreate(C.byref(s))
    try:
        if getter(ref, C.byref(s)) != 0:
            return ""
        n = SZ()
        SUStringGetUTF8Length(s, C.byref(n))
        buf = C.create_string_buffer(n.value + 1)
        out = SZ()
        SUStringGetUTF8(s, n.value + 1, buf, C.byref(out))
        return buf.value.decode("utf-8", "replace")
    finally:
        SUStringRelease(C.byref(s))


def lista(num_fn, get_fn, ref):
    n = SZ()
    num_fn(ref, C.byref(n))
    if not n.value:
        return []
    arr = (VP * n.value)()
    got = SZ()
    get_fn(ref, n.value, arr, C.byref(got))
    return [arr[i] for i in range(got.value)]


def matriz(fn, ref):
    t = TR()
    fn(ref, C.byref(t))
    return np.array(t.v, dtype=np.float64).reshape(4, 4).T  # o SketchUp guarda por coluna


_camada = {}


def visivel(de):
    h = C.c_bool()
    if SUDrawingElementGetHidden(de, C.byref(h)) == 0 and h.value:
        return False
    lay = VP()
    if SUDrawingElementGetLayer(de, C.byref(lay)) == 0 and lay.value:
        v = _camada.get(lay.value)
        if v is None:
            b = C.c_bool()
            SULayerGetVisibility(lay, C.byref(b))
            v = _camada[lay.value] = bool(b.value)
        return v
    return True


_cor = {}
_vidro_por_nome = set()


def cor(mat):
    """(r, g, b, a) do material; a < 255 = vidro."""
    if not mat:
        return SEM_MATERIAL
    c = _cor.get(mat)
    if c is not None:
        return c
    col = COL()
    ok = SUMaterialGetColor(mat, C.byref(col)) == 0
    tex = VP()
    if SUMaterialGetTexture(mat, C.byref(tex)) == 0 and tex.value:
        tc = COL()
        if SUTextureGetAverageColor(tex, C.byref(tc)) == 0:
            col, ok = tc, True
    rgb = (col.r, col.g, col.b) if ok else SEM_MATERIAL[:3]
    a = 255
    uo = C.c_bool()
    if SUMaterialGetUseOpacity(mat, C.byref(uo)) == 0 and uo.value:
        op = C.c_double()
        SUMaterialGetOpacity(mat, C.byref(op))
        a = int(round(max(0.0, min(1.0, op.value)) * 255))
    if a == 255 and re.search(r"vidro|glass", texto(SUMaterialGetName, VP(mat)), re.I):
        a = 128
    c = _cor[mat] = (*rgb, a)
    return c


def material_de(de):
    m = VP()
    if SUDrawingElementGetMaterial(de, C.byref(m)) == 0 and m.value:
        return m.value
    return None


def malha(face):
    mh = VP()
    if SUMeshHelperCreate(C.byref(mh), face) != 0:
        return None
    try:
        nt, nv = SZ(), SZ()
        SUMeshHelperGetNumTriangles(mh, C.byref(nt))
        SUMeshHelperGetNumVertices(mh, C.byref(nv))
        if not nt.value:
            return None
        idx = (SZ * (nt.value * 3))()
        got = SZ()
        SUMeshHelperGetVertexIndices(mh, nt.value * 3, idx, C.byref(got))
        pts = (P3 * nv.value)()
        SUMeshHelperGetVertices(mh, nv.value, pts, C.byref(got))
        v = np.frombuffer(pts, dtype=np.float64).reshape(-1, 3)
        i = np.frombuffer(idx, dtype=np.uint64).astype(np.int64)
        return v[i].reshape(-1, 3, 3).copy()
    finally:
        SUMeshHelperRelease(C.byref(mh))


def aplicar(M, tris):
    p = tris.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    return p.reshape(-1, 3, 3)


def filhos(ents):
    """[(nome, elemento, matriz, entidades)] dos grupos e componentes visíveis."""
    out = []
    for g in lista(SUEntitiesGetNumGroups, SUEntitiesGetGroups, ents):
        de = SUGroupToDrawingElement(g)
        if not visivel(de):
            continue
        e = VP()
        SUGroupGetEntities(g, C.byref(e))
        out.append((texto(SUGroupGetName, VP(g)), de, matriz(SUGroupGetTransform, g), e))
    for ins in lista(SUEntitiesGetNumInstances, SUEntitiesGetInstances, ents):
        de = SUComponentInstanceToDrawingElement(ins)
        if not visivel(de):
            continue
        d = VP()
        SUComponentInstanceGetDefinition(ins, C.byref(d))
        e = VP()
        SUComponentDefinitionGetEntities(d, C.byref(e))
        out.append((texto(SUComponentDefinitionGetName, d), de, matriz(SUComponentInstanceGetTransform, ins), e))
    return out


_soltas, _tudo = {}, {}


def soltas(ents, herdado):
    """Faces deste nível: {cor: (N,3,3)} no sistema local."""
    k = (ents.value, herdado)
    if k in _soltas:
        return _soltas[k]
    out = {}
    for fc in lista(SUEntitiesGetNumFaces, SUEntitiesGetFaces, ents):
        if not visivel(SUFaceToDrawingElement(fc)):
            continue
        m = VP()
        mat = m.value if SUFaceGetFrontMaterial(fc, C.byref(m)) == 0 and m.value else herdado
        t = malha(fc)
        if t is not None:
            out.setdefault(cor(mat), []).append(t)
    r = _soltas[k] = {c: np.concatenate(v) for c, v in out.items()}
    return r


def tudo(ents, herdado):
    """Subárvore inteira: {cor: (N,3,3)} no sistema local (para contar e medir)."""
    k = (ents.value, herdado)
    if k in _tudo:
        return _tudo[k]
    out = {c: [a] for c, a in soltas(ents, herdado).items()}
    for _, de, M, e in filhos(ents):
        for c, a in tudo(e, material_de(de) or herdado).items():
            out.setdefault(c, []).append(aplicar(M, a))
    r = _tudo[k] = {c: np.concatenate(v) for c, v in out.items()}
    return r


def area(tris):
    return 0.5 * np.linalg.norm(np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]), axis=1)


CAIXA = np.array([[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1],
                  [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]])


def caixa_de(sub):
    """Caixa (12 triângulos, sistema local) e cor média de uma subárvore."""
    p = np.concatenate([a.reshape(-1, 3) for a in sub.values()])
    mn, mx = p.min(0), p.max(0)
    cantos = np.array([[x, y, z] for x in (mn[0], mx[0]) for y in (mn[1], mx[1]) for z in (mn[2], mx[2])])
    pesos = np.array([area(a).sum() for a in sub.values()])
    cores = np.array([c[:3] for c in sub.keys()], dtype=np.float64)
    media = (cores * pesos[:, None]).sum(0) / max(pesos.sum(), 1e-9)
    return cantos[CAIXA], (int(media[0]), int(media[1]), int(media[2]), 255)


TERRENO = "terreno"  # destino das peças do chão em volta (em vez de um pavimento)


class Saida:
    def __init__(self):
        self.casca = []      # [(tris mundo, cor)]
        self.terreno = []    # ruas e grama desenhadas em volta do prédio
        self.andares = {}    # id do pavimento -> [(tris, cor)]
        self.caixas = 0
        self.ignorados = 0

    def por(self, tris, c, andar):
        if not len(tris):
            return
        destino = self.casca if andar is None else self.terreno if andar == TERRENO else self.andares.setdefault(andar, [])
        destino.append((tris, c))


def percorrer(ents, M, herdado, andar, cfg, saida, raiz=False):
    for c, a in soltas(ents, herdado).items():
        saida.por(aplicar(M, a) * POL, c, andar)
    for nome, de, Mf, e in filhos(ents):
        if re.search(cfg["ignorar"], nome, re.I):
            saida.ignorados += 1
            continue
        mat = material_de(de) or herdado
        Mw = M @ Mf
        sub = tudo(e, mat)
        n = sum(len(a) for a in sub.values())
        if not n:
            continue
        meu_andar = andar
        if andar is None and re.search(cfg["pavimentos"], nome):
            meu_andar = id(Mf)  # um por instância; a ordem vem da cota
            saida.andares[meu_andar] = []
        elif andar is None:
            # Chapa baixa e muito maior que o prédio = o terreno em volta.
            cx_, _ = caixa_de(sub)
            dims = np.ptp((aplicar(Mw, cx_) * POL).reshape(-1, 3), axis=0)
            if dims[2] < 2.5 and max(dims[0], dims[1]) > 80:
                meu_andar = TERRENO
        if n > LIMITE_TRI:
            cantos, cmedia = caixa_de(sub)
            mundo = aplicar(Mw, cantos) * POL
            maior = np.ptp(mundo.reshape(-1, 3), axis=0).max()
            # Peça pequena vira caixa inteira; a média só se não houver peça
            # pesada dentro dela (aí a caixa fica na peça de dentro).
            pesado_dentro = any(sum(len(x) for x in tudo(fe, material_de(fde) or mat).values()) > LIMITE_TRI for _, fde, _, fe in filhos(e))
            if maior < LIMITE_PEQ or (maior < LIMITE_DIM and not pesado_dentro):
                saida.por(mundo, cmedia, meu_andar)
                saida.caixas += 1
                continue
        percorrer(e, Mw, mat, meu_andar, cfg, saida)


def cortar(tris, cx):
    """Separa triângulos pelo plano x = cx: (esquerda, direita). Os que cruzam
    o plano são partidos."""
    x = tris[:, :, 0]
    esq = (x <= cx + 1e-4).all(1)
    dir_ = (x >= cx - 1e-4).all(1) & ~esq
    cruza = ~(esq | dir_)
    L, R = [tris[esq]], [tris[dir_]]
    for t in tris[cruza]:
        for lado, alvo in ((-1, L), (1, R)):
            pol = []
            for i in range(3):
                a, b = t[i], t[(i + 1) % 3]
                da, db = lado * (a[0] - cx), lado * (b[0] - cx)
                if da >= 0:
                    pol.append(a)
                if (da > 0 and db < 0) or (da < 0 and db > 0):
                    pol.append(a + (b - a) * (da / (da - db)))
            for i in range(1, len(pol) - 1):
                alvo.append(np.array([[pol[0], pol[i], pol[i + 1]]]))
    return np.concatenate(L), np.concatenate(R)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    previa = sys.argv[sys.argv.index("--previa") + 1] if "--previa" in sys.argv else None
    chave = os.path.splitext(os.path.basename(dst))[0]
    cfg = CONFIG.get(chave)
    if not cfg:
        sys.exit(f"Sem CONFIG para '{chave}' (o nome do arquivo de saída escolhe o ajuste).")
    sys.stdout.reconfigure(encoding="utf-8")
    carregar_sdk()
    SUInitialize()
    model = VP()
    st = I()
    if SUModelCreateFromFileWithStatus(C.byref(model), src.encode("utf-8"), C.byref(st)) != 0:
        sys.exit("Não consegui abrir o .skp.")
    ents = VP()
    SUModelGetEntities(model, C.byref(ents))
    saida = Saida()
    percorrer(ents, np.eye(4), None, None, cfg, saida, raiz=True)

    # Pavimentos de baixo para cima; eixo da torre = centro da caixa deles.
    pav = []
    for k, itens in saida.andares.items():
        if not itens:
            continue
        p = np.concatenate([t.reshape(-1, 3) for t, _ in itens])
        pav.append((p[:, 2].min(), k, p.min(0), p.max(0)))
    pav.sort(key=lambda x: x[0])
    mn = np.min([p[2] for p in pav], axis=0)
    mx = np.max([p[3] for p in pav], axis=0)
    cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
    # y = 0 na calçada (o ponto mais baixo do arquivo fica um pouco abaixo).
    fundo = min(t[:, :, 2].min() for t, _ in saida.casca + saida.terreno)
    z0 = fundo + cfg.get("calcada", 0.0)

    def para_cena(t):
        """Arquivo (x, y, z para cima; frente em -y) → cena (x, y para cima, z para a frente)."""
        o = np.empty_like(t)
        o[:, :, 0] = t[:, :, 0] - cx
        o[:, :, 1] = t[:, :, 2] - z0
        o[:, :, 2] = -(t[:, :, 1] - cy)
        return o

    if cfg["frente"] != "-y":
        sys.exit("Só a frente em -y está implementada.")

    # Caixa de tudo, para quantizar as posições em uint16 (2 mm de passo).
    todos = [t for t, _ in saida.casca + saida.terreno] + [t for itens in saida.andares.values() for t, _ in itens]
    pts = np.concatenate([para_cena(t).reshape(-1, 3) for t in todos if len(t)])
    pmin, pmax = pts.min(0), pts.max(0)
    passo = (pmax - pmin) / 65535

    blocos, cores = [], []   # na ordem em que vão para o arquivo (já quantizados)
    total = 0
    degenerados = 0

    def gravar(itens, vidro):
        """Quantiza e grava; devolve a faixa [início, quantidade]. Triângulo que
        fica sem área depois de quantizado sai: a normal dele seria zero, e um
        pixel assim estraga o brilho (bloom) do modo noite inteiro."""
        nonlocal total, degenerados
        ini = total
        for t, c in itens:
            if (c[3] < 255) != vidro or not len(t):
                continue
            q = np.round((para_cena(t) - pmin) / passo).astype(np.int64)
            f32 = (pmin + q * passo).astype(np.float32)
            n = np.cross(f32[:, 1] - f32[:, 0], f32[:, 2] - f32[:, 0])
            ok = np.linalg.norm(n, axis=1) > 1e-5
            degenerados += int((~ok).sum())
            q = q[ok]
            if not len(q):
                continue
            blocos.append(q.astype("<u2"))
            cores.append(np.tile(np.array(c[:3], dtype=np.uint8), (len(q), 1)))
            total += len(q)
        return [ini, total - ini]

    cab = {"versao": 1, "origem": os.path.basename(src), "andares": [], "unidades": []}
    cab["casca"] = {"opaco": gravar(saida.casca, False), "vidro": gravar(saida.casca, True)}
    cab["terreno"] = gravar(saida.terreno, False)
    for i, (zmin, k, bmn, bmx) in enumerate(pav):
        cab["andares"].append({"piso": round(float(zmin - z0), 2), "topo": round(float(bmx[2] - z0), 2)})
        lados = ([], [])
        for t, c in saida.andares[k]:
            e, d = cortar(t, cx)
            lados[0].append((e, c))
            lados[1].append((d, c))
        for lado in (0, 1):
            op, vi = gravar(lados[lado], False), gravar(lados[lado], True)
            p = np.concatenate([para_cena(t).reshape(-1, 3) for t, _ in lados[lado] if len(t)])
            cab["unidades"].append({
                "andar": i, "lado": lado, "opaco": op, "vidro": vi,
                "caixa": [round(float(v), 2) for v in (*p.min(0), *p.max(0))],
            })

    q = np.concatenate(blocos).reshape(-1, 3)
    rgb = np.concatenate(cores)
    cab.update({"triangulos": int(total), "min": [float(v) for v in pmin], "max": [float(v) for v in pmax]})
    cj = json.dumps(cab, separators=(",", ":")).encode("utf-8")
    cru = b"M3D1" + struct.pack("<I", len(cj)) + cj + q.tobytes() + rgb.tobytes()
    with open(dst, "wb") as fh:
        fh.write(gzip.compress(cru, 9, mtime=0))

    print(f"{dst}: {total} triângulos, {len(pav)} pavimentos, {len(cab['unidades'])} unidades")
    print(f"  casca {cab['casca']} · caixas no lugar de peças pesadas: {saida.caixas} · nós ignorados: {saida.ignorados} · triângulos sem área tirados: {degenerados}")
    print(f"  cru {len(cru) / 1e6:.1f} MB, gzip {os.path.getsize(dst) / 1e6:.2f} MB")
    print(f"  caixa (m): {pmin.round(2)} a {pmax.round(2)} · eixo da torre no arquivo x={cx:.2f} y={cy:.2f} · calçada em z={z0:.2f}")
    print(f"  terreno {cab['terreno']}")
    print("  pisos:", [a["piso"] for a in cab["andares"]])
    if previa:
        # Mesmo formato do render de conferência (um grupo por cor, eixos do arquivo).
        grupos = {}
        for b, c in zip(blocos, cores):
            grupos.setdefault(tuple(int(v) for v in c[0]), []).append(pmin + b.astype(np.float64) * passo)
        arrays, meta = {}, []
        for n, (c, lst) in enumerate(grupos.items()):
            a = np.concatenate(lst)
            o = np.empty_like(a)  # de volta a z para cima, para o render.py
            o[:, :, 0], o[:, :, 1], o[:, :, 2] = a[:, :, 0], -a[:, :, 2], a[:, :, 1]
            arrays[f"g{n}"] = o.astype(np.float32)
            meta.append({"id": f"g{n}", "cor": [*c, 255], "nome": "", "tri": int(len(a))})
        np.savez_compressed(previa, **arrays)
        with open(os.path.splitext(previa)[0] + ".json", "w", encoding="utf-8") as fh:
            json.dump({"grupos_cor": meta}, fh)


if __name__ == "__main__":
    main()
