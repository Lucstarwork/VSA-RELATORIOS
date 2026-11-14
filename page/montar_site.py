"""Gera a pasta do site estatico (GitHub Pages) a partir do index.html montado por montar.py.

Uso:
  python montar.py                       (sempre antes: monta index.html com os dados)
  python montar_site.py                  (gera ..\\..\\tres-de-berezino-pages)
  python montar_site.py --url https://SEU-USUARIO.github.io/SEU-REPO/
                                         (o mesmo, com o endereco final nas tags de previa do link)

O Pages serve so arquivos: index.html, css/, js/, som/, og.png e favicon.svg. Nada roda no servidor.
"""
import argparse
import re
import shutil
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI.parent.parent / "tres-de-berezino-pages"

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="", help="endereco publico do site, terminado em /")
url = ap.parse_args().url.strip()
if url and not url.endswith("/"):
    url += "/"

pagina = (AQUI / "index.html").read_text(encoding="utf-8")
estilo = re.search(r"<style>(.*?)</style>", pagina, re.S).group(1).strip("\n")
scripts = re.findall(r"<script>(.*?)</script>", pagina, re.S)
if len(scripts) != 3:
    raise SystemExit(f"esperava 3 scripts (dados, mapa, resto), achei {len(scripts)}")
dados, principal, resto = (b.strip("\n") for b in scripts)
corpo = pagina[pagina.index("</style>") + len("</style>"):pagina.index("<script>")].strip("\n")
titulo = re.search(r"<title>(.*?)</title>", pagina).group(1)
descricao = re.search(r'<meta name="description" content="(.*?)">', pagina).group(1)
fontes = "\n".join(re.findall(r'<link rel="(?:preconnect|stylesheet)"[^>]*>', pagina))

imagem = (url + "og.png") if url else "og.png"
cabeca = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{titulo}</title>
<meta name="description" content="{descricao}">
<meta name="theme-color" content="#e7e5d8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14180f" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{descricao}">
<meta property="og:image" content="{imagem}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
{f'<meta property="og:url" content="{url}">' if url else ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
{fontes}
<link rel="stylesheet" href="css/estilo.css">
</head>
<body>
"""
html = cabeca + corpo + '\n<script src="js/dados.js"></script>\n<script src="js/pagina.js"></script>\n</body>\n</html>\n'
html = re.sub(r"\n{3,}", "\n\n", html)

# o OneDrive trava pasta apagada durante a sincronizacao: sobrescreve no lugar e so tira o arquivo que sobrou
SAIDA.mkdir(parents=True, exist_ok=True)
esperados = {"index.html", "css/estilo.css", "js/dados.js", "js/pagina.js", ".nojekyll", "og.png", "favicon.svg", "README.md"}
esperados |= {f"som/{o.name}" for o in (AQUI / "som").glob("*.ogg")}
for f in list(SAIDA.rglob("*")):
    if f.is_file() and ".git" not in f.parts and f.relative_to(SAIDA).as_posix() not in esperados:
        f.unlink()
(SAIDA / "css").mkdir(parents=True, exist_ok=True)
(SAIDA / "js").mkdir(exist_ok=True)
(SAIDA / "som").mkdir(exist_ok=True)
(SAIDA / "index.html").write_text(html, encoding="utf-8")
# o esqueleto do Artifact zerava a margem do body e escondia [hidden]; aqui isso vai no proprio CSS
(SAIDA / "css" / "estilo.css").write_text("body{margin:0}\n[hidden]{display:none!important}\nimg{max-width:100%}\n" + estilo + "\n", encoding="utf-8")
(SAIDA / "js" / "dados.js").write_text("/* Gerado por montar.py a partir dos arquivos do servidor. Nao editar a mao. */\n" + dados + "\n", encoding="utf-8")
(SAIDA / "js" / "pagina.js").write_text(principal + "\n\n" + resto + "\n", encoding="utf-8")
for ogg in sorted((AQUI / "som").glob("*.ogg")):
    shutil.copy2(ogg, SAIDA / "som" / ogg.name)
for extra in ("og.png", "favicon.svg", "README.md"):
    if (AQUI / "site" / extra).exists():
        shutil.copy2(AQUI / "site" / extra, SAIDA / extra)
(SAIDA / ".nojekyll").write_text("", encoding="utf-8")
tamanho = sum(f.stat().st_size for f in SAIDA.rglob("*") if f.is_file())
print(f"{SAIDA} pronto: {len(list(SAIDA.rglob('*.*')))} arquivos, {tamanho / 1e6:.2f} MB" + (f", previa apontando para {imagem}" if url else ", previa com caminho relativo"))
