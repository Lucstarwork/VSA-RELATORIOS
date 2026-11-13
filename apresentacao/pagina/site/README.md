# Os Três de Berezino

Página de apresentação do servidor de DayZ. É um site estático: o GitHub Pages só entrega os arquivos desta pasta, nada roda no servidor.

```
index.html      a página
css/estilo.css  o visual
js/dados.js     mapa, sessão do A-Life e textos, gerados dos arquivos do servidor
js/pagina.js    mapa, rádio, reprodução da sessão e gráficos
som/            as falas dos chefes
og.png          a imagem que aparece quando o link é colado no WhatsApp ou no Discord
favicon.svg     o ícone da aba
.nojekyll       avisa o GitHub para entregar os arquivos como estão
```

## Publicar

1. No GitHub, crie um repositório público, por exemplo `tres-de-berezino`.
2. Envie o conteúdo desta pasta para a raiz do repositório, com o `index.html` no topo. Pelo site: **Add file → Upload files**, arraste tudo (as pastas também) e confirme o commit.
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em um ou dois minutos o site abre em `https://SEU-USUARIO.github.io/tres-de-berezino/`.

## Prévia do link

Para a imagem aparecer quando alguém colar o link, a tag `og:image` precisa do endereço completo. Depois de publicar, rode na pasta `OneDrive\DAYZ\apresentacao\pagina`:

    python montar_site.py --url https://SEU-USUARIO.github.io/tres-de-berezino/

e suba de novo o `index.html`. Ou troque à mão, no `index.html`, `content="og.png"` por `content="https://SEU-USUARIO.github.io/tres-de-berezino/og.png"`.

## Atualizar

A fonte fica em `OneDrive\DAYZ\apresentacao`. Para trocar a sessão do mapa por um log novo do Incursão:

    python geo\sessao.py <incursao_AAAA-MM-DD_HH-MM-SS.log> <AILocationSettings.json> geo\sessao.json
    python pagina\montar.py
    python pagina\montar_site.py

Os números fixos de cada facção, o ranking e o placar ficam em `pagina\dados.js`.

## Antes de deixar público

O site fica aberto para qualquer pessoa: o ranking mostra apelidos de jogador e a lista de mods tem o link do Incursão Inventário, que está como não listado na Workshop. Endereço e senha do servidor não estão na página.
