"""Extrai a geografia de Chernarus dos arquivos da missao do servidor para a pagina.

Fontes (todas da pasta da missao, nada inventado):
  mapgroupcluster*.xml  ~217 mil arvores, tocos, arbustos, fardos, trilhos e pecas de estrada, com altitude
  mapgrouppos.xml       11.676 construcoes com posicao, altitude e angulo

Saida: geo.json com litoral e matas em caminho SVG (coordenadas do mundo em metros, z para o norte),
relevo em grade Int16 (decimetros) e estradas, trilhos e predios empacotados em base64.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np

MISSAO = Path(sys.argv[1])
SAIDA = Path(sys.argv[2])
W = 15360.0

PADRAO = re.compile(r'<group name="([^"]+)" pos="([-0-9.e]+) ([-0-9.e]+) ([-0-9.e]+)"[^>]*?a="([-0-9.e]+)"')


def ler(arquivo: Path) -> list[tuple[str, float, float, float, float]]:
    texto = arquivo.read_text(encoding="utf-8", errors="replace")
    return [(n, float(x), float(y), float(z), float(a)) for n, x, y, z, a in PADRAO.findall(texto)]


cluster = [p for f in sorted(MISSAO.glob("mapgroupcluster*.xml")) for p in ler(f)]
predios = ler(MISSAO / "mapgrouppos.xml")
print(f"cluster {len(cluster)}  predios {len(predios)}")

ARVORES = ("PiceaAbies", "FagusSylvatica", "QuercusRobur", "PinusSylvestris", "BetulaPendula")
NA_AGUA = ("Boat", "Pier", "Ship", "Buoy")


def dentro(x: float, z: float) -> bool:
    return 0 <= x < W and 0 <= z < W


# ---------- mascara de terra a 40 m ----------
C = 40.0
N = int(W / C)
terra = np.zeros((N, N), bool)          # [linha z, coluna x], z para o norte
for nome, x, y, z, a in cluster + predios:
    if any(t in nome for t in NA_AGUA) or not dentro(x, z):
        continue
    terra[int(z // C), int(x // C)] = True


def vizinhanca(m: np.ndarray, r: int, op) -> np.ndarray:
    out = m.copy()
    pad = np.pad(m, r, mode="edge")
    for dz in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dz * dz > r * r:
                continue
            out = op(out, pad[r + dz:r + dz + m.shape[0], r + dx:r + dx + m.shape[1]])
    return out


terra = vizinhanca(terra, 4, np.logical_or)
terra = vizinhanca(terra, 4, np.logical_and)

# mar = o que nao e terra e esta ligado as bordas sul ou leste (a costa de Chernarus); buraco no meio vira terra
mar = np.zeros_like(terra)
fila = deque()
for i in range(N):
    for (zz, xx) in ((0, i), (i, N - 1)):
        if not terra[zz, xx] and not mar[zz, xx]:
            mar[zz, xx] = True
            fila.append((zz, xx))
while fila:
    zz, xx = fila.popleft()
    for dz, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a, b = zz + dz, xx + dx
        if 0 <= a < N and 0 <= b < N and not mar[a, b] and not terra[a, b]:
            mar[a, b] = True
            fila.append((a, b))
terra = ~mar
terra = vizinhanca(terra, 1, np.logical_or)  # praia: a areia nao tem objeto


def borrar(m: np.ndarray, passes: int) -> np.ndarray:
    k = m.astype(np.float32)
    for _ in range(passes):
        p = np.pad(k, 1, mode="edge")
        k = (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:] + 2 * p[1:-1, :-2] + 4 * p[1:-1, 1:-1] + 2 * p[1:-1, 2:]
             + p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) / 16
    return k


# ---------- marching squares com encadeamento em aneis ----------
def aneis(campo: np.ndarray, nivel: float, celula: float, borda: float) -> list[list[tuple[float, float]]]:
    """Curvas fechadas de `campo` no `nivel`. A grade ganha uma borda com valor `borda` para todo anel fechar."""
    g = np.pad(campo, 1, constant_values=borda)
    h, w = g.shape
    segs: dict[tuple, list] = {}

    def ponto(z0, x0, z1, x1):
        v0, v1 = g[z0, x0], g[z1, x1]
        t = 0.5 if v1 == v0 else (nivel - v0) / (v1 - v0)
        zz = z0 + (z1 - z0) * t
        xx = x0 + (x1 - x0) * t
        return (round((xx - 1 + 0.5) * celula, 1), round((zz - 1 + 0.5) * celula, 1))

    arestas = []
    for zi in range(h - 1):
        for xi in range(w - 1):
            a = g[zi, xi] > nivel
            b = g[zi, xi + 1] > nivel
            c = g[zi + 1, xi + 1] > nivel
            d = g[zi + 1, xi] > nivel
            cod = (a << 3) | (b << 2) | (c << 1) | d
            if cod in (0, 15):
                continue
            S = ponto(zi, xi, zi, xi + 1)          # lado de baixo (z menor)
            E = ponto(zi, xi + 1, zi + 1, xi + 1)
            Nn = ponto(zi + 1, xi, zi + 1, xi + 1)
            O = ponto(zi, xi, zi + 1, xi)
            tabela = {1: [(O, Nn)], 2: [(Nn, E)], 3: [(O, E)], 4: [(S, E)], 5: [(O, S), (Nn, E)], 6: [(S, Nn)],
                      7: [(O, S)], 8: [(O, S)], 9: [(S, Nn)], 10: [(S, E), (O, Nn)], 11: [(S, E)], 12: [(O, E)],
                      13: [(Nn, E)], 14: [(O, Nn)]}
            arestas.extend(tabela[cod])
    for p, q in arestas:
        segs.setdefault(p, []).append(q)
        segs.setdefault(q, []).append(p)
    vistos = set()
    saida = []
    for inicio in list(segs):
        for prox in segs[inicio]:
            chave = (inicio, prox) if inicio < prox else (prox, inicio)
            if chave in vistos:
                continue
            anel = [inicio]
            ant, atual = inicio, prox
            vistos.add(chave)
            while True:
                anel.append(atual)
                candidatos = [q for q in segs[atual] if ((atual, q) if atual < q else (q, atual)) not in vistos]
                if not candidatos:
                    break
                q = candidatos[0]
                vistos.add((atual, q) if atual < q else (q, atual))
                ant, atual = atual, q
                if atual == inicio:
                    break
            if len(anel) > 3:
                saida.append(anel)
    return saida


def simplificar(pts: list, tol: float) -> list:
    if len(pts) < 4:
        return pts
    arr = np.array(pts)
    manter = np.zeros(len(arr), bool)
    manter[0] = manter[-1] = True
    pilha = [(0, len(arr) - 1)]
    while pilha:
        i, j = pilha.pop()
        if j <= i + 1:
            continue
        a, b = arr[i], arr[j]
        ab = b - a
        n = np.hypot(*ab)
        seg = arr[i + 1:j]
        if n == 0:
            d = np.hypot(*(seg - a).T)
        else:
            d = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / n
        k = int(np.argmax(d))
        if d[k] > tol:
            manter[i + 1 + k] = True
            pilha += [(i, i + 1 + k), (i + 1 + k, j)]
    return [tuple(p) for p in arr[manter]]


def caminho(lista: list, tol: float, minimo: float) -> str:
    partes = []
    for anel in lista:
        anel = simplificar(anel, tol)
        xs = [p[0] for p in anel]
        zs = [p[1] for p in anel]
        if (max(xs) - min(xs)) * (max(zs) - min(zs)) < minimo:
            continue
        cx, cz = round(anel[0][0]), round(anel[0][1])
        s = [f"M{cx} {cz}"]
        for x, z in anel[1:]:
            x, z = round(x), round(z)
            if (x, z) == (cx, cz):
                continue
            s.append(f"l{x - cx} {z - cz}")
            cx, cz = x, z
        partes.append("".join(s) + "z")
    return "".join(partes)


# fora do mapa ao norte e a oeste e terra; ao sul e a leste e mar
terra_f = borrar(terra, 3)
litoral = caminho(aneis(terra_f, 0.5, C, 0.0), 5, 40 * 40)
print("litoral", len(litoral))

# ---------- matas ----------
dens = np.zeros((N, N), np.float32)
for nome, x, y, z, a in cluster:
    if nome.startswith(ARVORES) and dentro(x, z):
        dens[int(z // C), int(x // C)] += 1
dens_b = borrar(dens, 4) * terra
for lim in (0.25, 0.4, 0.6):
    print("mata > ", lim, float((dens_b > lim).mean()))
LIM_MATA = 0.4
matas = caminho(aneis(dens_b, LIM_MATA, C, 0.0), 9, 120 * 120)
print("matas", len(matas))

# ---------- relevo (grade de 76,8 m) ----------
G = 200
CG = W / G
soma = np.zeros((G, G))
cont = np.zeros((G, G))
for nome, x, y, z, a in cluster + predios:
    if any(t in nome for t in NA_AGUA) or not dentro(x, z):
        continue
    soma[int(z // CG), int(x // CG)] += y
    cont[int(z // CG), int(x // CG)] += 1
# terra na grade do relevo: media da mascara fina
fator = N / G
terra_g = np.zeros((G, G), np.float32)
for zi in range(G):
    for xi in range(G):
        bloco = terra_f[int(zi * fator):int((zi + 1) * fator) + 1, int(xi * fator):int((xi + 1) * fator) + 1]
        terra_g[zi, xi] = bloco.mean()
alt = np.where(cont > 0, soma / np.maximum(cont, 1), np.nan)
eh_terra = terra_g > 0.15
fixo = ~np.isnan(alt) & eh_terra
mar_g = ~eh_terra
h = np.where(fixo, alt, 40.0)
h[mar_g] = -12.0
livre = eh_terra & ~fixo
for _ in range(600):
    p = np.pad(h, 1, mode="edge")
    media = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
    h[livre] = media[livre]
# suaviza o ruido de amostra, mas preserva o mar
h = borrar(h, 2)
h[mar_g] = np.minimum(h[mar_g], -4)
print("relevo min/max", float(h.min()), float(h.max()))
relevo_b64 = base64.b64encode(np.round(h * 10).astype("<i2").tobytes()).decode()

# ---------- estradas e trilhos ----------
def pecas(prefixo: str) -> list:
    return [(n, x, z, a) for n, x, y, z, a in cluster if n.startswith(prefixo) and dentro(x, z)]


estradas = pecas("Path")
trilhos = pecas("Rail")


def conferir_eixo(lista):
    """Qual convencao de angulo alinha melhor a peca com a vizinha mais proxima."""
    arr = np.array([(x, z, a) for _, x, z, a in lista])
    if len(arr) < 10:
        return None
    from_idx = np.random.default_rng(1).choice(len(arr), size=min(1500, len(arr)), replace=False)
    m1 = m2 = 0.0
    for i in from_idx:
        d = np.hypot(arr[:, 0] - arr[i, 0], arr[:, 1] - arr[i, 1])
        d[i] = 1e9
        j = int(np.argmin(d))
        if d[j] > 60:
            continue
        vx, vz = arr[j, 0] - arr[i, 0], arr[j, 1] - arr[i, 1]
        ang = np.arctan2(vz, vx)
        a = np.radians(arr[i, 2])
        m1 += abs(np.cos(ang - a))                    # a = angulo matematico (anti-horario a partir do leste)
        m2 += abs(np.cos(ang - (np.pi / 2 - a)))      # a = rumo de bussola
    return m1, m2


print("eixo estradas (mat, bussola)", conferir_eixo(estradas))
print("eixo trilhos (mat, bussola)", conferir_eixo(trilhos))


def empacotar(lista, extra) -> str:
    buf = bytearray()
    for item in lista:
        n, x, z, a = item[:4]
        buf += np.array([round(x * 2), round(z * 2), round((a % 360) * 100), extra(n)], "<u2").tobytes()
    return base64.b64encode(bytes(buf)).decode()


def tipo_estrada(n: str) -> int:
    # 1 = asfalto (R), 2 = terra (D); dezena = comprimento nominal da peca
    base = 1 if n.startswith("PathR") else 2
    comp = 30 if "30" in n else 10 if "10" in n else 20
    return base * 100 + comp


# ---------- predios ----------
FORA = ("Wreck", "wreck", "Boat", "Toilet", "City_Stand", "FeedShack", "Well_Pump", "Power_Transformer", "BusStop",
        "TrailRoof", "Pier", "Misc_", "Ship", "Buoy", "Bench", "Sign")
TAMANHOS = [  # (trecho do nome, largura, comprimento)
    ("Tenement", 40, 13), ("HouseBlock", 18, 12), ("Hospital", 40, 20), ("School", 34, 14), ("Church", 22, 12),
    ("Factory", 34, 20), ("CoalPlant", 34, 24), ("CementWorks", 30, 20), ("Sawmill", 26, 12), ("Hangar", 40, 28),
    ("Barracks", 30, 10), ("Tent_Big", 14, 8), ("Mil_Guard", 4, 4), ("Mil_Tower", 4, 4), ("Garage_Row", 26, 7),
    ("Garage", 6, 5), ("Barn", 24, 12), ("Farm", 26, 13), ("Shed", 6, 5), ("Container", 6, 3), ("Camp_House", 6, 4),
    ("Train_Wagon", 15, 3), ("Mil_", 12, 8), ("House", 12, 9), ("Village", 12, 9),
]


def tamanho(n: str) -> int:
    for trecho, lar, com in TAMANHOS:
        if trecho in n:
            return lar * 64 + com
    return 9 * 64 + 7


casas = [(n, x, z, a) for n, x, y, z, a in predios if dentro(x, z) and not any(t in n for t in FORA)]
print("predios desenhados", len(casas))

geo = {
    "litoral": litoral,
    "matas": matas,
    "relevo": {"n": G, "b64": relevo_b64},
    "estradas": empacotar(estradas, tipo_estrada),
    "trilhos": empacotar(trilhos, lambda n: 15),
    "predios": empacotar(casas, tamanho),
}
SAIDA.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
print("geo.json", SAIDA.stat().st_size)
np.save(SAIDA.with_suffix(".relevo.npy"), h)
np.save(SAIDA.with_suffix(".terra.npy"), terra_f)
np.save(SAIDA.with_suffix(".mata.npy"), dens_b)
