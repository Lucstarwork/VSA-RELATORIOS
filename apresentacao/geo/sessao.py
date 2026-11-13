"""Le um log do Incursao e monta a reproducao da sessao para o mapa da pagina.

Uso: python sessao.py <incursao_*.log> <AILocationSettings.json> <saida.json>

Tudo sai do log: viagens, rondas, confrontos, chefes, invasoes, cacadas, comboios, socorros, mortes do elenco
e as mensagens que entraram na fila do radio. Lugar sem coordenada no log vem do AILocationSettings, pelo
mesmo nome legivel que o Incursao usa (INC_Locais.NomeLegivel).
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

LOG, LOCAIS, SAIDA = (Path(a) for a in sys.argv[1:4])
VELOCIDADE = 4.0  # m/s, VelocidadeOffline do INC_Settings
BAUS = {"Wolves": (6318, 7805), "Vipers": (6890, 11366), "Crooks": (7089, 4275)}
COMERCIANTES = {"Radist": (3712, 5985), "Baryga": (14318, 13322)}
FAC = r"(Wolves|Vipers|Crooks|Troika)"
SQ = re.compile(FAC + r" #(\d+) \(([^()]*)\)")


def legivel(nome: str) -> str:
    m = re.search(r"\((.+)\)", nome)
    if m:
        return m.group(1)
    return nome.split("_", 1)[1] if "_" in nome else nome


lugares: dict[str, tuple[float, float]] = {}
for loc in json.loads(LOCAIS.read_text(encoding="utf-8"))["RoamingLocations"]:
    lugares.setdefault(legivel(loc["Name"]), (round(loc["Position"][0]), round(loc["Position"][2])))

# ---------- entradas do log (linha de cabecalho + continuacoes) ----------
entradas = []
for linha in LOG.read_text(encoding="utf-8", errors="replace").splitlines():
    m = re.match(r"^(\d\d):(\d\d):(\d\d)  (\w+)\s+(.*)$", linha)
    if m:
        entradas.append([int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]), m[4], m[5].strip(), []])
    elif entradas and linha.startswith(" "):
        entradas[-1][3].append(linha.strip())
T0 = entradas[0][0]
LUGAR_CHEFE = {"Aerodromo Balota": "Aeródromo de Balota", "Aerodromo Krasnostav": "Aeródromo de Krasnostav",
               "Ilha da Prisao": "Ilha da Prisão", "Shopping Vysotovo": "Shopping de Vysotovo", "Base VMC": "Base VMC"}


def artigo(nome: str, em: bool) -> str:
    fem = nome.startswith(("Base", "Ilha"))
    return ("na " if fem else "no ") if em else ("a " if fem else "o ")


def lugar_chefe(nome: str) -> str:
    if nome in LUGAR_CHEFE:
        return LUGAR_CHEFE[nome]
    return re.sub(r"^Base (?!VMC)", "Base de ", nome) if nome.startswith("Base ") and nome not in ("Base Bashnya",) else nome
FIM = entradas[-1][0] - T0


def rot(label: str) -> str:
    """'[BOM] Campeiro + [CASUAL] Agressivo' -> 'Bom Campeiro + Casual Agressivo'."""
    return re.sub(r"\[(\w+)\]", lambda m: m.group(1).capitalize(), label)


def km(v: float) -> str:
    return f"{v:.1f}".replace(".", ",") + " km"


def num(v: int) -> str:
    return f"{v:,}".replace(",", ".")


sem_lugar = Counter()


def pos(nome: str):
    nome = nome.strip()
    if nome in lugares:
        return lugares[nome]
    sem_lugar[nome] += 1
    return None


esquadroes: dict[str, dict] = {}
quadros: dict[str, list] = defaultdict(list)   # sid -> [t, x, z, estado]
partidas: dict[str, tuple] = {}
eventos = []      # [t, tipo, texto, x, z]
confrontos = []   # [t, x, z, facA, facB, texto]
chefes = []       # [nome, t0, t1, x, z, lugar]
chefe_aberto: dict[str, list] = {}
invasoes = []
inv_aberta: dict[tuple, dict] = {}
comboios = {}
mortes = []
radio = []
visto_radio = set()
desconhecido = Counter()


def esquadrao(fac: str, sid: str, label: str) -> str:
    chave = sid
    e = esquadroes.setdefault(chave, {"f": fac, "r": rot(label), "n": label.count("[")})
    e["r"] = rot(label)
    e["n"] = max(1, label.count("["))
    return chave


def onde(sid: str, t: float):
    """Posicao do esquadrao no instante t pelos quadros ja montados."""
    q = quadros.get(sid)
    if not q:
        return None
    ant = None
    for qt, x, z, _ in q:
        if qt > t:
            if ant is None:
                return (x, z)
            at, ax, az = ant
            f = (t - at) / max(qt - at, 1)
            return (ax + (x - ax) * f, az + (z - az) * f)
        ant = (qt, x, z)
    return (ant[1], ant[2])


def quadro(sid: str, t: float, p, estado: str):
    if p is None:
        return
    q = quadros[sid]
    if q and q[-1][0] == t:
        q[-1] = [t, p[0], p[1], estado]
    else:
        q.append([t, round(p[0]), round(p[1]), estado])


for t, cat, txt, cont in entradas:
    t -= T0
    if cat == "VIAGEM":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) saiu de (.+?) para (.+?) \(([\d.]+) km(, perto de jogador)?\)$", txt)
        if m:
            sid = esquadrao(m[1], m[2], m[3])
            a = pos(m[4]) or onde(sid, t)
            b = pos(m[5])
            quadro(sid, t, a, "em " + m[4] if m[4] != "estrada" else "na estrada")
            partidas[sid] = (t, m[5], b, float(m[6]), a)
            continue
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) chegou em (.+)$", txt)
        if m:
            sid = esquadrao(m[1], m[2], m[3])
            b = pos(m[4])
            p = partidas.pop(sid, None)
            if p and b is None:
                b = p[2]
            quadro(sid, t, b, "chegou em " + m[4])
            continue
        if "mudou de rumo" in txt:
            continue
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) volta para casa \((.+?)\)", txt)
        if m:
            sid = esquadrao(m[1], m[2], m[3])
            quadro(sid, t, onde(sid, t), "voltando para casa")
            partidas[sid] = (t, m[4], pos(m[4]), 0.0, onde(sid, t))
            continue
    elif cat == "TRABALHO":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\): (.+)$", txt)
        if m and m[2] in quadros and quadros[m[2]]:
            fazer = m[4].replace("predios", "prédios")
            quadros[m[2]][-1][3] = fazer
        continue
    elif cat == "ONLINE":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) entrou no mundo perto de (.+?) \((\d+), (\d+)\)", txt)
        if m:
            sid = esquadrao(m[1], m[2], m[3])
            quadro(sid, t, (int(m[5]), int(m[6])), "no mundo, perto de " + m[4])
        continue
    elif cat == "ESQUADRAO":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) saiu da base \((.+?)\)", txt)
        if m:
            sid = esquadrao(m[1], m[2], m[3])
            quadro(sid, t, pos(m[4]), "saiu da base")
            continue
        m = re.match(FAC + r" #(\d+) eliminado", txt)
        if m and m[2] in esquadroes:
            esquadroes[m[2]]["fim"] = t
            continue
    elif cat == "CONFRONTO":
        lados = SQ.findall(txt)
        if len(lados) >= 2:
            (fa, ia, la), (fb, ib, lb) = lados[0], lados[1]
            esquadrao(fa, ia, la)
            esquadrao(fb, ib, lb)
            lug = re.search(r" em (.+?) \((dia|noite)\), a (\d+) m$", txt)
            p = None
            if lug and lug[1] != "estrada":
                p = pos(lug[1])
            p = p or onde(ia, t) or onde(ib, t)
            corpo = []
            for c in cont:
                c2 = re.sub(r"#\d+ ", "", c)
                c2 = (c2.replace("viu primeiro e saiu de fininho, estava em desvantagem", "viu primeiro e saiu de fininho: estava em desvantagem")
                         .replace("viu primeiro e saiu de fininho, nao quis arriscar", "viu primeiro e saiu de fininho: não quis arriscar")
                         .replace(" por cento", "%").replace("nao ", "não ").replace("foge da base", "foge da base"))
                c2 = re.sub(r"(\d+) tiros e (\d+) acertos em (\d+) s", lambda m: f"{m[1]} tiros, {m[2]} {'acerto' if m[2] == '1' else 'acertos'} em {m[3]} s", c2)
                c2 = re.sub(r"\[(\w+)\]", lambda m: m.group(1).capitalize(), c2)
                c2 = c2.replace("recua para casa ", "recua para casa, em ")
                c2 = re.sub(r"My_DF_Weapons_\w+?_", "", c2)
                corpo.append(c2)
            onde_txt = (" em " + lug[1] if lug and lug[1] != "estrada" else " na estrada" if lug else "") + (f", a {lug[3]} m" if lug else "")
            texto = f"{fa} e {fb} se cruzaram{onde_txt}. " + ". ".join(corpo) + "."
            if p:
                confrontos.append([t, round(p[0]), round(p[1]), fa, fb, texto])
            continue
    elif cat == "CHEFE":
        m = re.match(r"(\w+) PRESENTE (?:perto de |em |no |na )?(.+?) \((\d+), (\d+)\)", txt)
        if m:
            fixo = m[2].startswith(('Base', 'Shopping', 'NWAF', 'Aerodromo', 'Ilha'))
            nome_l = lugar_chefe(m[2])
            chefe_aberto[m[1]] = [m[1], t, None, int(m[3]), int(m[4]), nome_l if fixo else "perto de " + nome_l]
            eventos.append([t, "chefe", f"{m[1]} apareceu {(artigo(nome_l, True) + nome_l) if fixo else 'perto de ' + nome_l}.", int(m[3]), int(m[4])])
            continue
        m = re.match(r"(\w+) deixou o mapa \((?:em|perto de) (.+?) \((\d+), (\d+)\)\)", txt)
        if m:
            c = chefe_aberto.pop(m[1], None)
            if c:
                c[2] = t
                chefes.append(c)
            eventos.append([t, "chefe", f"{m[1]} deixou {artigo(lugar_chefe(m[2]), False) + lugar_chefe(m[2]) if not txt.count('perto de') else 'a área perto de ' + m[2]}.", int(m[3]), int(m[4])])
            continue
        m = re.match(r"(\w+) eliminado (?:perto de |em )?(.+?) \((\d+), (\d+)\)", txt)
        if m:
            c = chefe_aberto.pop(m[1], None)
            if c:
                c[2] = t
                c.append("caiu")
                chefes.append(c)
            continue
        m = re.match(r"(\w+) (?:caiu|foi derrubado|morreu)", txt)
        if m:
            c = chefe_aberto.pop(m[1], None)
            if c:
                c[2] = t
                chefes.append(c)
            eventos.append([t, "chefe", txt, None, None])
            continue
    elif cat == "INVASAO":
        m = re.match(r"os (\w+) vao atacar a base dos (\w+) em (.+?): (\d+) esquadroes se juntam em (.+)$", txt)
        if m:
            r = pos(m[5])
            alvo = BAUS.get(m[2])
            inv_aberta[(m[1], m[2])] = {"a": m[1], "b": m[2], "t0": t, "t1": None, "rx": r[0] if r else None,
                                       "rz": r[1] if r else None, "bx": alvo[0], "bz": alvo[1], "res": ""}
            eventos.append([t, "invasao", f"Os {m[1]} juntam {m[4]} esquadrões em {m[5]} para atacar a base dos {m[2]} em {m[3]}.", r[0] if r else None, r[1] if r else None])
            continue
        m = re.match(r"os (\w+) partiram para a base dos (\w+) em (.+?) com (\d+) esquadroes", txt)
        if m:
            i = inv_aberta.get((m[1], m[2]))
            if i:
                i["tp"] = t
            eventos.append([t, "invasao", f"Os {m[1]} partiram para a base dos {m[2]} em {m[3]} com {m[4]} esquadrões.", *BAUS[m[2]]])
            continue
        m = re.match(r"a base dos (\w+) em (.+?) resistiu aos (\w+)", txt)
        if m:
            i = inv_aberta.pop((m[3], m[1]), None)
            if i:
                i["t1"] = t
                i["res"] = "resistiu"
                invasoes.append(i)
            eventos.append([t, "invasao", f"A base dos {m[1]} em {m[2]} resistiu. Os {m[3]} voltaram de mãos vazias.", *BAUS[m[1]]])
            continue
        m = re.match(r"os (\w+) tomaram a base dos (\w+) em (.+?)(?:[:,]|$)", txt)
        if m:
            i = inv_aberta.pop((m[1], m[2]), None)
            if i:
                i["t1"] = t
                i["res"] = "tomada"
                invasoes.append(i)
            eventos.append([t, "invasao", f"Os {m[1]} tomaram a base dos {m[2]} em {m[3]}.", *BAUS[m[2]]])
            continue
        m = re.match(r"(?:a invasao|o ataque) dos (\w+) (?:a|contra) (?:base dos )?(\w+)", txt)
        if m:
            i = inv_aberta.pop((m[1], m[2]), None)
            if i:
                i["t1"] = t
                invasoes.append(i)
    elif cat == "CACA":
        if txt.startswith(("armadura", "ninguem")):
            continue
        grupos = SQ.findall(txt)
        fac = grupos[0][0] if grupos else ""
        m = re.search(r"sairam atras do (\w+) perto de (.+?)(?: \(|$)", txt)
        if m:
            p = pos(m[2])
            eventos.append([t, "caca", f"{len(grupos)} esquadrões dos {fac} se juntaram e saíram atrás do {m[1]} perto de {m[2]}.", *(p or (None, None))])
            continue
        m = re.search(r"derrubou o (\w+) perto de (.+?)$", txt)
        if m:
            p = pos(m[2])
            eventos.append([t, "abate", f"Os {fac} derrubaram o {m[1]} perto de {m[2]}.", *(p or (None, None))])
            continue
        m = re.search(r"nao conseguiu derrubar o (\w+) perto de (.+?)$", txt)
        if m:
            p = pos(m[2])
            eventos.append([t, "caca", f"Os {fac} não conseguiram derrubar o {m[1]} perto de {m[2]} e recuaram.", *(p or (None, None))])
            continue
    elif cat == "COMERCIO":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) saiu para o (Radist|Baryga) \(([\d.]+) km\)", txt)
        if m:
            nota = 0
            escolta = re.search(r"(\d+) de escolta", " ".join(cont))
            lev = re.search(r"leva (\d+) itens que valem (\d+) e (\d+) em nota", " ".join(cont))
            if lev:
                nota = int(lev[3])
            comboios[m[2]] = {"f": m[1], "c": m[4], "t0": t, "tc": None, "t1": None, "n": int(escolta[1]) if escolta else 4}
            eventos.append([t, "comboio", f"Comboio dos {m[1]} saiu para o {m[4]} com {comboios[m[2]]['n']} de escolta" + (f", {lev[1]} itens para vender e {num(nota)} em nota." if lev else "."), *BAUS[m[1]]])
            continue
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) negociou com o (Radist|Baryga): levou (\d+) em nota, vendeu por (\d+), gastou (\d+)", txt)
        if m:
            if m[2] in comboios:
                comboios[m[2]]["tc"] = t
            comp = re.search(r"comprou (.+?); volta com (\d+) de troco", " ".join(cont))
            itens = ""
            if comp:
                cont_it = Counter(re.sub(r"My_DF_Weapons_\w+?_", "", x).replace(" E1", "").replace(" E2", "").replace(" E3", "").replace("kit de remedio", "kit de remédio")
                                  for x in comp[1].split(", "))
                itens = ", ".join(f"{n}x {k}" if n > 1 else k for k, n in cont_it.items())
            eventos.append([t, "comboio", f"O comboio dos {m[1]} vendeu por {num(int(m[6]))} e gastou {num(int(m[7]))} no {m[4]}" + (f": {itens}." if itens else "."), *COMERCIANTES[m[4]]])
            continue
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) chegou em casa com o comboio: (\d+) preset", txt)
        if m:
            if m[2] in comboios:
                comboios[m[2]]["t1"] = t
            eventos.append([t, "comboio", f"O comboio dos {m[1]} chegou em casa: {m[4]} {'arma montada' if m[4] == '1' else 'armas e kits montados'} no baú.", *BAUS[m[1]]])
            continue
        continue
    elif cat == "AJUDA":
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) tem ferido grave e pediu ajuda pelo radio; " + FAC + r" #(\d+) \(([^()]*)\) vem de ([\d.]+) km", txt)
        if m:
            p = onde(m[2], t)
            eventos.append([t, "ajuda", f"{m[1]} #{m[2]} tem ferido grave e pediu socorro no rádio. {m[4]} #{m[5]} vem de {km(float(m[7]))}.", *(map(round, p) if p else (None, None))])
            continue
        m = re.match(FAC + r" #(\d+) \(([^()]*)\) socorreu", txt)
        if m:
            p = onde(m[2], t)
            eventos.append([t, "ajuda", f"Socorro dos {m[1]} chegou: ferido tratado.", *(map(round, p) if p else (None, None))])
            continue
        continue
    elif cat == "DEFESA":
        m = re.match(r"base dos (\w+) em (.+?) em alerta", txt)
        if m:
            eventos.append([t, "defesa", f"Base dos {m[1]} em {m[2]} em alerta: invasão a caminho.", *BAUS[m[1]]])
        continue
    elif cat == "ELENCO":
        m = re.match(r"(.+?) \((\w+)\) morreu na vida (\d+) \(traco (\d+), (\w+), viveu (\d+) min, habilidades somadas (\d+)\)", txt)
        if m:
            mortes.append({"t": t, "nome": m[1], "f": m[2], "vida": int(m[3]), "traco": int(m[4]), "perfil": m[5],
                           "viveu": int(m[6]), "hab": int(m[7])})
        continue
    elif cat == "RANKING":
        m = re.match(r"(.+?) \((\w+)\) derrubou alguem do top 10: \+(\d+), agora (\d+)", txt)
        if m:
            eventos.append([t, "ranking", f"{m[1]} ({m[2]}) derrubou alguém do top 10: +{m[3]} pontos.", None, None])
        continue
    elif cat == "RADIO":
        m = re.match(r"na fila \((urgente|importante|rotina), (profissional|agressivo)\): (.+)$", txt)
        if m and m[3] not in visto_radio:
            visto_radio.add(m[3])
            radio.append([t, m[1], m[2], m[3]])
        continue
    else:
        continue
    desconhecido[cat + ": " + re.sub(r"\d+", "N", txt)[:70]] += 1

# fecha o que ficou aberto no fim do log
for c in chefe_aberto.values():
    c[2] = FIM
    chefes.append(c)
for i in inv_aberta.values():
    i["t1"] = FIM
    invasoes.append(i)
for sid, (t, para, b, dist, a) in partidas.items():
    if b is None:
        continue
    chegada = t + dist * 1000 / VELOCIDADE
    if chegada <= FIM:
        quadro(sid, chegada, b, "chegou em " + para)
    elif a:
        f = (FIM - t) / (chegada - t)
        quadro(sid, FIM, (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), "a caminho de " + para)

# comboio: sai do bau, negocia no comerciante e volta
lista_comboios = []
for sid, c in comboios.items():
    b = BAUS[c["f"]]
    k = COMERCIANTES[c["c"]]
    tc = c["tc"] if c["tc"] is not None else None
    lista_comboios.append([c["f"], c["c"], c["t0"], tc, c["t1"], b[0], b[1], k[0], k[1], c["n"]])

# velocidade observada nas viagens com chegada
vel = []
for sid, q in quadros.items():
    for (t1, x1, z1, _), (t2, x2, z2, _) in zip(q, q[1:]):
        if t2 > t1 and (x1, z1) != (x2, z2):
            vel.append(((x2 - x1) ** 2 + (z2 - z1) ** 2) ** 0.5 / (t2 - t1))
vel.sort()

saida = {
    "inicio": T0, "fim": FIM,
    "esq": {sid: [e["f"], e["r"], e["n"], e.get("fim")] for sid, e in esquadroes.items() if quadros.get(sid)},
    "quadros": {sid: q for sid, q in quadros.items() if sid in esquadroes},
    "confrontos": confrontos,
    "chefes": chefes,
    "invasoes": [[i["a"], i["b"], i["t0"], i.get("tp"), i["t1"], i["rx"], i["rz"], i["bx"], i["bz"], i["res"]] for i in invasoes],
    "comboios": lista_comboios,
    "eventos": sorted(eventos, key=lambda e: e[0]),
    "mortes": mortes,
    "radio": radio,
}
SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"fim {FIM} s, esquadroes {len(saida['esq'])}, quadros {sum(len(q) for q in quadros.values())}, confrontos {len(confrontos)},"
      f" chefes {len(chefes)}, invasoes {len(invasoes)}, comboios {len(lista_comboios)}, eventos {len(eventos)}, mortes {len(mortes)}, radio {len(radio)}")
print("velocidade m/s p10/p50/p90:", [round(vel[int(len(vel) * q)], 2) for q in (0.1, 0.5, 0.9)] if vel else None)
print("lugares sem coordenada:", sem_lugar.most_common(15))
print("linhas nao lidas:", desconhecido.most_common(12))
print("tamanho", SAIDA.stat().st_size)
