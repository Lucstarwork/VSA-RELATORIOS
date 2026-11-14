"""Monta a pagina: fonte.html + dados.js + JSON da geografia e da sessao.

Saidas:
  index.html   para o Artifact (audio em som/*.ogg, publicado ao lado)
  avulso.html  arquivo unico com o audio embutido, para mandar direto a quem quiser
"""
import base64
import json
from pathlib import Path

AQUI = Path(__file__).parent
GEO = AQUI.parent / "geo"

fonte = (AQUI / "fonte.html").read_text(encoding="utf-8")
dados = (AQUI / "dados.js").read_text(encoding="utf-8")
radio = json.loads((AQUI.parent / "radio_sub.json").read_text(encoding="utf-8"))
titulos = {k: radio[k] for k in ("TU", "TI", "TR")}


def bloco(nome: str) -> str:
    return (GEO / nome).read_text(encoding="utf-8").strip()


cabeca = "\n".join([
    '"use strict";',
    "const W = 15360;",
    "const GEO = " + bloco("geo.json") + ";",
    "const SES = " + bloco("sessao.json") + ";",
    "const LUG = " + bloco("lugares.json") + ";",
    "const LOCAIS = " + (AQUI.parent / "locais.json").read_text(encoding="utf-8").strip() + ";",
    "const TIT = " + json.dumps(titulos, ensure_ascii=False, separators=(",", ":")) + ";",
    'function somURL(p){ return (typeof SOM !== "undefined" && SOM[p]) || p; }',
])

TROCAS = [
    ('const W = 15360;\nconst GEO = __GEO__;\nconst SES = __SESSAO__;\nconst LUG = __LUGARES__;\nconst LOCAIS = __LOCAIS__;\nconst TIT = __TITULOS__;\n', ""),
    ("  function sizePx(){ return box.clientWidth || 1; }\n  function upp(){ return view.w / sizePx(); }",
     "  function sizePx(){ return box.clientWidth || 1; }\n  function upp(){ return view.w / sizePx(); }\n"
     "  function vh(){ return view.w * (box.clientHeight || 1) / sizePx(); }\n"
     "  function maxW(){ return W * Math.max(1, sizePx() / (box.clientHeight || 1)); }\n"
     "  function fit(){ view.w = maxW(); view.x = (W - view.w) / 2; view.y = (W - vh()) / 2; clampView(); redraw(); }"),
    ('    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.w);',
     '    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + vh());'),
    ("  function clampView(){ view.w = Math.min(Math.max(view.w, 900), W); view.x = Math.min(Math.max(view.x, -view.w * .15), W - view.w * .85); view.y = Math.min(Math.max(view.y, -view.w * .15), W - view.w * .85); }",
     "  function clampView(){ view.w = Math.min(Math.max(view.w, 900), maxW()); const h = vh(); view.x = Math.min(Math.max(view.x, -view.w * .15), W - view.w * .85); view.y = Math.min(Math.max(view.y, -h * .15), W - h * .85); }"),
    ("  function zoomAt(f, px, py){ const r = sizePx(); const wx = view.x + px / r * view.w, wy = view.y + py / r * view.w; view.w *= f; clampView(); view.x = wx - px / r * view.w; view.y = wy - py / r * view.w; clampView(); redraw(); }",
     "  function zoomAt(f, px, py){ const u = upp(), wx = view.x + px * u, wy = view.y + py * u; view.w *= f; clampView(); const u2 = upp(); view.x = wx - px * u2; view.y = wy - py * u2; clampView(); redraw(); }"),
    ("  function flyTo(x, z, w){ view.w = w; view.x = x - w / 2; view.y = Y(z) - w / 2; clampView(); redraw(); }",
     "  function flyTo(x, z, w){ view.w = w; clampView(); view.x = x - view.w / 2; view.y = Y(z) - vh() / 2; clampView(); redraw(); }"),
    ("const r = box.getBoundingClientRect(); const wx = view.x + (e.clientX - r.left) / r.width * view.w, wy = view.y + (e.clientY - r.top) / r.width * view.w;",
     "const r = box.getBoundingClientRect(), u = upp(); const wx = view.x + (e.clientX - r.left) * u, wy = view.y + (e.clientY - r.top) * u;"),
    ("tipAt(g.__data, (g.__x - view.x) / view.w * r.width, (g.__y - view.y) / view.w * r.width);",
     "tipAt(g.__data, (g.__x - view.x) / upp(), (g.__y - view.y) / upp());"),
    ('$("#zin").onclick = () => zoomAt(.68, sizePx() / 2, sizePx() / 2);', '$("#zin").onclick = () => zoomAt(.68, sizePx() / 2, box.clientHeight / 2);'),
    ('$("#zout").onclick = () => zoomAt(1 / .68, sizePx() / 2, sizePx() / 2);', '$("#zout").onclick = () => zoomAt(1 / .68, sizePx() / 2, box.clientHeight / 2);'),
    ('$("#zreset").onclick = () => { view.x = view.y = 0; view.w = W; redraw(); };', '$("#zreset").onclick = fit;'),
    ("  build(); buildLive(); redraw();\n", "  build(); buildLive(); fit();\n"),
    ('    Object.values(trails).forEach(p => { p.setAttribute("stroke", COL[[...Object.entries(trails)].find(e => e[1] === p)[0].toLowerCase()]); L.trail.appendChild(p); });',
     '    for (const f in trails){ trails[f].setAttribute("stroke", COL[f.toLowerCase()]); L.trail.appendChild(trails[f]); }'),
    ("if (X < 8 || X > w - 30) continue;", "if (X < 8 || X > w - 60) continue;"),
    ("fill='var(--paper)'", "style='fill:var(--paper)'"),
    ("<textPath href='#at-\" + id + \"'", "<textPath href='#at-\" + id + \"' xlink:href='#at-\" + id + \"'"),
    ("<textPath href='#ab-\" + id + \"'", "<textPath href='#ab-\" + id + \"' xlink:href='#ab-\" + id + \"'"),
    ('const a = new Audio("som/kombat_" + k[0] + ".ogg");', 'const a = new Audio(somURL("som/kombat_" + k[0] + ".ogg"));'),
    ("audio = new Audio(v.dataset.src);", "audio = new Audio(somURL(v.dataset.src));"),
    ("themeHooks.push(drawCharts); stageHooks.push(drawCurva);\n</script>",
     "themeHooks.push(drawCharts); stageHooks.push(drawCurva);\n"
     "if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => themeHooks.forEach(f => f()));\n</script>"),
]
html = fonte
for velho, novo in TROCAS:
    if html.count(velho) != 1:
        raise SystemExit(f"troca nao achou um unico trecho: {velho[:80]!r} ({html.count(velho)}x)")
    html = html.replace(velho, novo)

primeiro = '<script>\n"use strict";\n\n/* ============ utilidades'
if html.count(primeiro) != 1:
    raise SystemExit("inicio do script principal nao encontrado")
html = html.replace(primeiro, "<script>\n" + cabeca + "\n" + dados + "\n</script>\n" + primeiro, 1)
if "__" + "GEO__" in html or "__SESSAO__" in html:
    raise SystemExit("sobrou marcador de dados")
(AQUI / "index.html").write_text(html, encoding="utf-8")

# versao avulsa: esqueleto proprio e audio embutido
som = {f"som/{p.name}": "data:audio/ogg;base64," + base64.b64encode(p.read_bytes()).decode() for p in sorted((AQUI / "som").glob("*.ogg"))}
cabeca_doc = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n')
corpo = html.replace('<svg width="0" height="0"', '</head>\n<body>\n<svg width="0" height="0"', 1)
avulso = cabeca_doc + "<script>const SOM = " + json.dumps(som) + ";</script>\n" + corpo + "\n</body>\n</html>\n"
(AQUI / "avulso.html").write_text(avulso, encoding="utf-8")
print("index.html", len(html.encode()), "bytes; avulso.html", len(avulso.encode()), "bytes;", len(som), "falas")
