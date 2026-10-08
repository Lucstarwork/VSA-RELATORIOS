/* Observatório Territorial — Araucária/PR
   Mapa, legenda, tabela ligada e os dois gráficos de leitura territorial.

   O fundo padrão é vetor do próprio geoportal municipal (limite, hidrografia,
   perímetro urbano) desenhado com os tokens do Design System, mais a ortofoto
   municipal por WMS. Esses dois não dependem de ninguém de fora. As duas
   opções de imagem global (ruas e satélite) dependem, e por isso a escolha do
   provedor está documentada em FUNDOS, logo abaixo. */
'use strict';

const WMS_MUNICIPAL = 'https://geonovo.araucaria.pr.gov.br/geoserver/ows';

/* Fundos de mapa. O vetor proprio e o padrao: ele e construido com os tokens do
   design system e com a geometria do geoportal municipal, nao depende de
   terceiro e nao tem cota. As tres opcoes de imagem existem porque um mapa
   puramente vetorial de poligono administrativo nao da ao leitor nenhuma
   ancora do mundo real -- nao se reconhece a rua de casa num desenho de
   fronteira.

   Licenca conferida em tela, nao so na documentacao. A CARTO passou a exigir
   chave de API nos basemaps: o tile ainda volta com status 200, mas agora tem
   a marca "API KEY REQUIRED" gravada na propria imagem -- nao da para detectar
   por codigo de erro, so olhando o mapa. Saiu.

   Entrou o World Street Map dos servicos legados do ArcGIS Online, que
   continuam abertos sem chave, cobrem ate o zoom 19 e trazem o nome da rua em
   portugues. E o mesmo provedor que ja servia o satelite. O Light Gray Canvas
   da Esri seria cartograficamente melhor sob um coropletico, mas para no zoom
   16 e devolve "Map data not yet available" acima disso -- inutil num mapa
   onde o tecnico vai procurar a quadra. Tile direto de tile.openstreetmap.org
   continua fora pela politica de uso da OSMF, e Google esta fora porque o ToS
   veda consumo fora do SDK proprio. */
const FUNDOS = {
  proprio: { rotulo: 'Mapa do território', imagem: false, fonte: 'geoportal municipal' },
  ruas: {
    rotulo: 'Ruas',
    imagem: true,
    imagemClara: true,
    fonte: 'Esri World Street Map',
    claro: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    opcoes: {
      maxZoom: 19,
      attribution: 'Ruas: Esri, HERE, Garmin e colaboradores do '
        + '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satelite: {
    rotulo: 'Satélite',
    imagem: true,
    fonte: 'Esri World Imagery',
    claro: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opcoes: { maxZoom: 19, attribution: 'Imagem: Esri, Maxar, Earthstar Geographics' },
  },
  ortofoto: {
    rotulo: 'Ortofoto municipal',
    imagem: true,
    fonte: 'ortofoto municipal',
    wms: true,
    opcoes: {
      layers: 'Araucaria:ORTO', format: 'image/png', transparent: true, version: '1.3.0',
      maxZoom: 21, attribution: 'Ortofoto: Prefeitura de Araucária (núcleo urbano)',
      bounds: L.latLngBounds([-25.650736, -49.443689], [-25.520990, -49.336521]),
    },
  },
};

const ESCALAS = {
  setor: { arquivo: 'setores.geojson', chave: 'CD_SETOR', rotulo: 'Setor censitário' },
  bairro: { arquivo: 'bairros.geojson', chave: 'bairro', rotulo: 'Bairro' },
  cras: { arquivo: 'territorios.geojson', chave: 'cras', rotulo: 'Território de CRAS' },
};

const estado = {
  escala: 'setor',
  indicador: 'ivt',
  fundo: 'proprio',
  calor: 'nenhum',
  selecionado: null,
  camadas: {},
  geo: {},
};

let mapa;
let painel;
let camadaDados;
let camadaUnidades;
let camadaContexto;
let camadaFundo;
let camadaCalor;

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const token = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
/* Token da rampa cartografica, escolhido pelo que esta ATRAS do coropletico e
   nao pelo tema da interface. O tema escuro inverte a luminancia da rampa --
   no escuro e o tom claro que significa "mais intenso" -- e isso so se sustenta
   sobre fundo escuro. O mapa de ruas e cor de creme nos dois temas, e sobre ele
   as classes altas do tema escuro desaparecem: justo as que precisam saltar.
   Sobre imagem clara o mapa desenha com a rampa clara, qualquer que seja o tema
   da pagina. Os graficos do painel lateral continuam no tema, porque o fundo
   deles e a interface. */
const tokenDoMapa = (nome) =>
  token(escuro() && FUNDOS[estado.fundo].imagemClara ? `--mapc-${nome}` : `--map-${nome}`);
const rampa = () => ['1', '2', '3', '4', '5'].map(tokenDoMapa);

/* Luminância relativa (WCAG) de uma cor em hexadecimal. */
function luminancia(cor) {
  const canais = cor.replace('#', '').match(/../g).map((c) => parseInt(c, 16) / 255);
  const linear = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/* Escolhe entre tinta clara e escura MEDINDO o contraste contra o fundo, em vez
   de supor pela posição na rampa. A suposição quebrava no tema escuro, onde a
   rampa sobe em luminosidade: a segunda classe recebia tinta clara e ficava em
   3,38:1, abaixo do mínimo de 4,5:1 do WCAG 1.4.3. */
function tintaSobre(fundo) {
  const claro = token('--surface-float') || '#ffffff';
  const escuro = token('--ink') || '#1a1a17';
  return contraste(fundo, escuro) >= contraste(fundo, claro) ? escuro : claro;
}

/* Indice e dimensao sempre com uma casa decimal, mesmo quando o valor cai
   redondo: numa coluna, "17" ao lado de "26,6" parece outra unidade de
   medida. Contagem (populacao, setores) sempre inteira. */
const COM_DECIMAL = new Set([
  'ivt', 'ivt_min', 'ivt_max', 'amplitude_interna', 'alcance_rede',
  'dim_renda_trabalho', 'dim_habitacao_infraestrutura', 'dim_composicao_ciclo_vida',
]);

/* Indicador de escala NOMINAL. "Unidade de referência" não tem ordem nem
   distância: CRAS Tupy não é maior nem menor que CRAS Centro. Rampa sequencial
   ali mentiria duas vezes -- sugeriria ordem e sugeriria magnitude. A ordem das
   categorias é alfabética e fixa, para a mesma unidade receber sempre a mesma
   cor entre recarregamentos. */
const CATEGORIAS = [
  'CRAS Boqueirão', 'CRAS Califórnia', 'CRAS Centro', 'CRAS Costeira',
  'CRAS Fazenda Velha', 'CRAS Industrial', 'CRAS Thomaz Coelho', 'CRAS Tupy',
];

const ehNominal = (info) => info && info.unidade === 'categoria';

function corDaCategoria(valor) {
  const posicao = CATEGORIAS.indexOf(valor);
  return posicao < 0 ? tokenDoMapa('vazio') : tokenDoMapa(`cat-${posicao + 1}`);
}

function formatar(valor, unidade, campo) {
  if (unidade === 'categoria') return valor || '—';
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  const decimal = unidade === '%' || COM_DECIMAL.has(campo) || !Number.isInteger(valor);
  const texto = decimal ? nf1.format(valor) : nf.format(valor);
  return unidade ? `${texto}${unidade}` : texto;
}

function indicadorAtual() {
  return painel.indicadores.find((i) => i.campo === estado.indicador) || painel.indicadores[0];
}

/* Nem todo indicador existe nas três escalas. Os do sistema municipal de
   atendimento param no bairro, porque a base registra bairro e não endereço --
   e espalhá-los por setor seria inventar precisão. Em vez de pintar o mapa
   inteiro de "sem dado", a opção fica desabilitada na escala onde não há dado,
   com o motivo no title. */
const valeNaEscala = (info, escala) => !info.escalas || info.escalas.includes(escala);

function indicadorValido(campo, escala) {
  const info = painel.indicadores.find((i) => i.campo === campo);
  return info && valeNaEscala(info, escala) ? campo : painel.indicadores[0].campo;
}

function sincronizarSeletorIndicador() {
  const seletor = document.getElementById('seletor-indicador');
  [...seletor.options].forEach((opcao) => {
    const info = painel.indicadores.find((i) => i.campo === opcao.value);
    const vale = valeNaEscala(info, estado.escala);
    opcao.disabled = !vale;
    opcao.title = vale ? '' : `Não existe na escala de ${ESCALAS[estado.escala].rotulo.toLowerCase()}`;
  });
  seletor.value = estado.indicador;
}

function quebrasAtuais() {
  const porEscala = painel.quebras[estado.escala] || {};
  return porEscala[estado.indicador] || null;
}

/* Índice da classe de um valor: a última classe inclui o limite superior, as
   demais são [inicio, fim). Sem isso o valor máximo cairia fora de todas. */
function classeDe(valor, quebras) {
  if (valor === null || valor === undefined || Number.isNaN(valor) || !quebras) return -1;
  for (let i = 0; i < quebras.length - 1; i += 1) {
    const ultimo = i === quebras.length - 2;
    if (valor >= quebras[i] && (ultimo ? valor <= quebras[i + 1] : valor < quebras[i + 1])) return i;
  }
  return valor > quebras[quebras.length - 1] ? quebras.length - 2 : -1;
}

function corDe(valor) {
  if (ehNominal(indicadorAtual())) return corDaCategoria(valor);
  const quebras = quebrasAtuais();
  const indice = classeDe(valor, quebras);
  if (indice < 0) return tokenDoMapa('vazio');
  const cores = rampa();
  const total = quebras.length - 1;
  // Com menos de 5 classes, amostra a rampa em passos regulares em vez de
  // usar sempre os primeiros tons -- senão uma classificação de 3 classes
  // nunca chegaria ao extremo escuro e pareceria uniformemente clara.
  return cores[Math.round((indice / Math.max(total - 1, 1)) * (cores.length - 1))];
}

/* Value-by-alpha: a opacidade acompanha a densidade populacional do setor.
   Sem isso o mapa de Araucaria mede area, nao vulnerabilidade -- os 23 setores
   rurais cobrem 82% do territorio com 6% da populacao e dominariam a leitura.
   O piso subiu de 0,45 para 0,55 depois de medir o que o alfa faz com a cor.
   Em 0,45 a classe mais alta do tema claro chegava a tela com 34% do croma
   que a legenda mostra -- a mesma classe aparecia no mapa em duas cores
   diferentes conforme a densidade do setor, e a legenda deixava de descrever
   o mapa. Em 0,55 sobram 45% no tema claro e 58% no escuro, e as duas classes
   mais altas continuam separadas por 0,083 em OKLab, bem acima do limiar de
   percepcao. A transparencia continua fazendo o que tem que fazer, e agora
   esta dita na legenda em vez de ficar implicita.
   So vale na escala de setor: bairro e territorio de CRAS ja agregam
   populacoes comparaveis. */
function opacidadeDe(propriedades) {
  if (estado.escala !== 'setor') return 0.90;
  const peso = propriedades.peso_visual;
  if (peso === null || peso === undefined) return 0.75;
  return 0.55 + peso * 0.45;
}

/* Hachura do setor sem valor publicavel.

   O painel promete hachura em dois lugares do texto e o mapa nunca desenhou
   nenhuma: o sem-dado saia pintado de cor chapada, que e exatamente o que o
   texto diz que ele nao e. Pior, com a paleta anterior o tom do sem-dado
   ficava a 0,026 de distancia OKLab da classe mais baixa -- abaixo do limiar
   de percepcao para mancha grande. "Nao medimos aqui" e "aqui o valor e o
   mais baixo" apareciam iguais.

   Sao duas correcoes: o tom saiu do matiz quente da rampa (foi para um cinza
   frio, distancia 0,070) e a textura entrou. Padrao SVG no defs do renderer
   do Leaflet e o unico jeito de pintar textura num path de GeoJSON sem trocar
   o renderer por canvas -- e canvas custaria o foco por teclado em cada
   feicao. */
const ID_HACHURA = 'hachura-sem-dado';
const SVG_NS = 'http://www.w3.org/2000/svg';
let padraoHachura = null;

function hachuraSemDado() {
  const svg = mapa.getPanes().overlayPane.querySelector('svg');
  if (!svg) return null;

  if (!padraoHachura || !svg.contains(padraoHachura)) {
    let defs = svg.querySelector('defs');
    if (!defs) svg.insertBefore(defs = document.createElementNS(SVG_NS, 'defs'), svg.firstChild);
    padraoHachura = document.createElementNS(SVG_NS, 'pattern');
    padraoHachura.setAttribute('id', ID_HACHURA);
    padraoHachura.setAttribute('patternUnits', 'userSpaceOnUse');
    padraoHachura.setAttribute('patternTransform', 'rotate(45)');
    padraoHachura.setAttribute('width', '7');
    padraoHachura.setAttribute('height', '7');
    const fundo = document.createElementNS(SVG_NS, 'rect');
    fundo.setAttribute('width', '7');
    fundo.setAttribute('height', '7');
    const risco = document.createElementNS(SVG_NS, 'line');
    risco.setAttribute('x1', '0'); risco.setAttribute('y1', '0');
    risco.setAttribute('x2', '0'); risco.setAttribute('y2', '7');
    risco.setAttribute('stroke-width', '2.4');
    padraoHachura.append(fundo, risco);
    defs.appendChild(padraoHachura);
    padraoHachura.dataset.tom = '';
  }

  const tom = tokenDoMapa('vazio');
  if (padraoHachura.dataset.tom !== tom) {
    padraoHachura.dataset.tom = tom;
    padraoHachura.firstElementChild.setAttribute('fill', tom);
    padraoHachura.lastElementChild.setAttribute('stroke', tokenDoMapa('vazio-traco'));
  }
  return `url(#${ID_HACHURA})`;
}

function estiloFeicao(feicao) {
  const valor = feicao.properties[estado.indicador];
  const semDado = valor === null || valor === undefined;
  const selecionada = estado.selecionado === feicao.properties[ESCALAS[estado.escala].chave];
  const sobreImagem = FUNDOS[estado.fundo].imagem;
  const base = semDado ? 0.75 : opacidadeDe(feicao.properties);
  // Com calor ligado o coroplético recua para contexto: duas superfícies
  // contínuas disputando a mesma leitura não somam, se anulam.
  const recuo = (sobreImagem ? 0.62 : 1) * (estado.calor !== 'nenhum' ? 0.45 : 1);
  return {
    fillColor: semDado ? (hachuraSemDado() || tokenDoMapa('vazio')) : corDe(valor),
    fillOpacity: base * recuo,
    color: selecionada ? tokenDoMapa('contorno') : (semDado ? token('--ink-3') : tokenDoMapa('traco')),
    weight: selecionada ? 2.5
      : (sobreImagem ? 1.1 : (semDado ? 0.9 : (estado.escala === 'setor' ? 0.6 : 1.4))),
    // Tracejado marca o que nao tem dado: o leitor precisa distinguir "nao
    // medimos aqui" de "aqui o valor e baixo", e cor sozinha nao faz isso.
    dashArray: semDado ? '2 3' : null,
  };
}

/* Rotulo do setor. O codigo do IBGE identifica, mas nao localiza: ninguem no
   CRAS diz "setor 000240". O nome de lugar vem de nomes.py, com a procedencia
   junto, e o codigo fica como identificador secundario na ficha -- quem precisa
   cruzar com outra base continua tendo ele. */
function rotuloFeicao(propriedades) {
  const chave = ESCALAS[estado.escala].chave;
  if (estado.escala !== 'setor') return propriedades[chave];
  const partes = [propriedades.bairro_ibge, propriedades.lugar].filter(Boolean);
  if (!partes.length) return `Setor ${propriedades[chave].slice(-6)}`;
  return partes.join(' · ');
}

/* ------------------------------------------------------------------ mapa -- */
function montarMapa() {
  mapa = L.map('mapa', {
    // Renderer SVG (padrao do Leaflet), nao Canvas: com 247 setores mais
    // hidrografia o custo e irrelevante, e so o SVG da um no de DOM por
    // feicao -- que e o que permite anel de foco visivel por teclado e
    // rotulo acessivel por feicao. Canvas desenha tudo num bitmap unico e
    // nao tem onde pendurar foco.
    renderer: L.svg({ padding: 0.3 }),
    zoomControl: true,
    attributionControl: true,
    // Rolagem sobre o mapa é zoom, e só: com o ponteiro dentro do mapa a
    // página não sobe nem desce. Quem precisa rolar a página passa por fora do
    // mapa, e quem não usa roda continua com os botões e com o teclado.
    scrollWheelZoom: true,
    zoomSnap: 0.25,
  });
  mapa.attributionControl.setPrefix('');
  mapa.attributionControl.addAttribution(
    'Geometria: <a href="https://geonovo.araucaria.pr.gov.br/geoserver/ows">Geoportal de Araucária</a> e IBGE (Censo 2022)'
  );
  L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 140 }).addTo(mapa);

  mapa.on('zoomend', () => {
    if (!camadaCalor) return;
    const raio = raioDeCalor();
    camadaCalor.setOptions({ radius: raio, blur: raio * 0.62 });
  });

  // Painel proprio para o calor. Sem isso ele divide o overlayPane com o SVG
  // do coropletico, e qualquer bringToFront no coropletico o enterra -- o
  // canvas continua la, desenhado, e invisivel. z-index 450 fica acima do
  // overlay (400) e abaixo do marcador (600), que e onde as unidades de CRAS
  // precisam continuar.
  mapa.createPane('calor');
  mapa.getPane('calor').style.zIndex = 450;
  mapa.getPane('calor').style.pointerEvents = 'none';
}

function escuro() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/* O fundo de imagem muda o que o coropletico pode fazer por cima dele: cheio,
   ele apaga a imagem e o leitor perde a ancora que foi buscar; apagado demais,
   a classificacao some. 0,55 com contorno reforcado e o ponto em que os dois
   continuam legiveis -- conferido sobre telhado claro, que e o pior caso. */
function trocarFundo(nome) {
  estado.fundo = nome;
  if (camadaFundo) { camadaFundo.remove(); camadaFundo = null; }

  const fundo = FUNDOS[nome];
  if (fundo.imagem) {
    camadaFundo = fundo.wms
      ? L.tileLayer.wms(WMS_MUNICIPAL, fundo.opcoes)
      : L.tileLayer(escuro() && fundo.escuro ? fundo.escuro : fundo.claro, fundo.opcoes);
    camadaFundo.addTo(mapa);
    camadaFundo.bringToBack();
  }
  document.querySelectorAll('[data-fundo]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.fundo === nome));
  });
  // O rotulo do cabecalho era fixo em "geoportal municipal" e ficava mentindo
  // assim que o leitor trocava de fundo. Quem cita a fonte tem que citar a que
  // esta na tela.
  document.getElementById('fonte-fundo').textContent = `Fundo cartográfico: ${fundo.fonte}`;
  desenharContexto();
  if (camadaDados) {
    camadaDados.setStyle(estiloFeicao);
    camadaDados.bringToFront();
    // Trocar de fundo pode trocar a rampa inteira (ver tokenDoMapa). A legenda
    // e a superficie de calor leem as mesmas cores do coropletico: se nao
    // forem refeitas junto, a legenda passa a mentir sobre o mapa que esta ao
    // lado dela.
    renderizarLegenda();
    aplicarCalor();
  }
  if (camadaUnidades) camadaUnidades.bringToFront();
  atualizarHash();
}

function desenharContexto() {
  if (camadaContexto) camadaContexto.remove();
  camadaContexto = L.featureGroup().addTo(mapa);  // featureGroup, nao layerGroup: so ele tem bringToBack

  const sobreImagem = FUNDOS[estado.fundo].imagem;
  L.geoJSON(estado.geo.limite, {
    interactive: false,
    style: sobreImagem
      // Sobre imagem o limite vira so contorno: preencher cobriria a foto.
      ? { color: tokenDoMapa('contorno'), weight: 2, fill: false, opacity: 0.85 }
      : { color: token('--hairline-strong'), weight: 1, fill: true, fillColor: token('--map-fundo'), fillOpacity: 1 },
  }).addTo(camadaContexto);

  L.geoJSON(estado.geo.perimetro, {
    interactive: false,
    style: { color: token('--ink-3'), weight: 1, dashArray: '5 4', fill: false, opacity: 0.6 },
  }).addTo(camadaContexto);
  camadaContexto.bringToBack();
}

function desenharHidrografia() {
  if (estado.camadas.hidrografia) estado.camadas.hidrografia.remove();
  estado.camadas.hidrografia = L.geoJSON(estado.geo.hidrografia, {
    interactive: false,
    style: { color: token('--map-agua'), weight: 1.1, fill: false, opacity: 0.9 },
  });
}

/* A marca distingue o nivel de protecao pela FORMA, nao por uma segunda cor:
   circulo para basica, losango para especial. Forma sobrevive a qualquer
   daltonismo e nao gasta a unica cor de marca que o design system autoriza. */
const MARCA_POR_NIVEL = {
  'Proteção Social Básica': 'un-basica',
  'Proteção Social Especial de Média Complexidade': 'un-media',
};

function desenharUnidades() {
  if (camadaUnidades) camadaUnidades.remove();
  camadaUnidades = L.geoJSON(estado.geo.unidades, {
    pointToLayer: (feicao, latlng) => L.marker(latlng, {
      keyboard: false,
      icon: L.divIcon({
        className: 'un-marca-caixa',
        html: `<i class="un-marca ${MARCA_POR_NIVEL[feicao.properties.nivel] || 'un-basica'}"></i>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
    }),
    onEachFeature: (feicao, camada) => {
      const p = feicao.properties;
      camada.bindTooltip(
        `<span class="tt-nome">${p.unidade}</span>${p.nivel}<br>${p.endereco}`,
        { className: 'tt-mapa', direction: 'top', offset: [0, -10] }
      );
    },
  });
}

function desenharDados() {
  if (camadaDados) camadaDados.remove();
  const chave = ESCALAS[estado.escala].chave;
  camadaDados = L.geoJSON(estado.geo[estado.escala], {
    style: estiloFeicao,
    onEachFeature: (feicao, camada) => {
      const propriedades = feicao.properties;
      const info = indicadorAtual();
      camada.bindTooltip(
        `<span class="tt-nome">${rotuloFeicao(propriedades)}</span>` +
        `${info.rotulo}: <span class="tt-val">${formatar(propriedades[estado.indicador], info.unidade, estado.indicador)}</span>`,
        { className: 'tt-mapa', sticky: true }
      );
      camada.on('click', () => selecionar(propriedades[chave]));
    },
  }).addTo(mapa);

  if (estado.camadas.hidrografia && document.getElementById('cam-hidro').checked) {
    estado.camadas.hidrografia.addTo(mapa);
  }
  if (camadaUnidades && document.getElementById('cam-unidades').checked) camadaUnidades.addTo(mapa);
}

function selecionar(chave) {
  estado.selecionado = estado.selecionado === chave ? null : chave;
  camadaDados.setStyle(estiloFeicao);
  renderizarDetalhe();
  destacarLinhaTabela();
}

function feicaoSelecionada() {
  if (!estado.selecionado) return null;
  const chave = ESCALAS[estado.escala].chave;
  return estado.geo[estado.escala].features.find((f) => f.properties[chave] === estado.selecionado);
}

/* ----------------------------------------------------- superfície de calor -- */
/* Três leituras, e a diferença entre elas é o ponto inteiro desta seção.
   "Famílias" e "Extrema pobreza" são VOLUME: mostram onde há mais gente
   cadastrada, e numa cidade isso acompanha de perto a densidade populacional
   -- o mapa fica bonito e diz pouco. "Concentração" é a razão entre as duas,
   a única das três que mede INTENSIDADE: responde onde, entre as famílias
   cadastradas daquele pedaço de cidade, a proporção em extrema pobreza é mais
   alta. É a leitura que a literatura de superfície de risco relativo
   (densidade dividida pela população em risco) recomenda, e a que não se
   confunde com um mapa de onde mora mais gente. */
const CALOR = {
  nenhum: null,
  familias: { rotulo: 'famílias no Cadastro Único', peso: (c) => c[2] },
  extrema: { rotulo: 'famílias em extrema pobreza', peso: (c) => c[3] },
  razao: {
    rotulo: 'concentração de extrema pobreza',
    // Razão em célula pequena é ruído: 2 de 3 famílias dá 67% e não significa
    // nada. Abaixo de 8 famílias a célula não entra nesta leitura.
    peso: (c) => (c[2] >= 8 ? c[3] / c[2] : 0),
  },
};

/* O teto da escala é o percentil 95, não o máximo. Uma única célula com 205
   famílias -- o conjunto habitacional mais denso da cidade -- empurra todas as
   outras para perto de zero se o máximo virar referência, e a superfície
   inteira some. Cortar no p95 e saturar acima dele é a prática padrão em
   superfície de densidade: preserva o contraste da faixa em que a maioria das
   células vive, ao custo de achatar o topo, que já é visualmente saturado de
   qualquer forma. */
function tetoDaEscala(valores) {
  const ordenados = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (!ordenados.length) return 1;
  return ordenados[Math.floor(ordenados.length * 0.95)] || ordenados[ordenados.length - 1];
}

/* O radius do leaflet.heat é em PIXELS, não em metros -- se ficar fixo, a
   mancha representa 200 m num zoom e 20 km noutro, o que é mentira
   cartográfica. Aqui ele é recalculado a cada zoom a partir do tamanho real da
   célula na tela. */
function raioDeCalor() {
  const metrosPorPixel = 156543.03 * Math.cos((-25.6 * Math.PI) / 180) / 2 ** mapa.getZoom();
  const celulaEmPixels = painel.calor.lado_m / metrosPorPixel;
  return Math.max(22, Math.min(80, celulaEmPixels * 1.9));
}

/* O leaflet.heat 0.2.0 remove o canvas com overlayPane.removeChild fixo no
   onRemove. Como nos o movemos para o pane proprio depois de montado, esse
   removeChild lanca NotFoundError e derruba o resto do onRemove junto: os
   listeners de moveend e zoomanim ficam presos e, pior, a excecao sobe e aborta
   quem chamou. Era por isso que desligar o mapa de calor nao desligava nada e
   trocar de modo nao trocava -- aplicarCalor morria na primeira linha. Devolver
   o no ao overlayPane antes de remover faz o teardown do plugin rodar inteiro. */
function removerCalor() {
  if (!camadaCalor) return;
  if (camadaCalor._canvas) mapa.getPanes().overlayPane.appendChild(camadaCalor._canvas);
  mapa.removeLayer(camadaCalor);
  camadaCalor = null;
}

function aplicarCalor() {
  removerCalor();
  const modo = CALOR[estado.calor];
  document.getElementById('calor-nota').textContent = modo
    ? `Superfície por grade de ${painel.calor.lado_m} m — ${modo.rotulo}. Células com menos de `
      + `${painel.calor.minimo_por_celula} famílias não entram. A superfície complementa o coroplético, `
      + 'não o substitui: ela não tem denominador por setor e não entra no índice.'
    : '';
  if (camadaDados) camadaDados.setStyle(estiloFeicao);
  if (!modo) return;

  const pontos = painel.calor.pontos
    .map((c) => [c[0], c[1], modo.peso(c)])
    .filter((p) => p[2] > 0);

  const raio = raioDeCalor();
  camadaCalor = L.heatLayer(pontos, {
    pane: 'calor',
    radius: raio,
    blur: raio * 0.62,
    max: tetoDaEscala(pontos.map((p) => p[2])),
    maxZoom: 17,
    minOpacity: 0.30,
    // O gradiente começa em 0,15 e não em 0: abaixo disso o leaflet.heat
    // devolve transparente, que é o que se quer. Começar no tom mais claro da
    // rampa pinta um véu quase branco sobre a cidade inteira e lava o
    // coroplético por baixo -- foi o que aconteceu na primeira tentativa.
    gradient: {
      0.15: tokenDoMapa('2'), 0.40: tokenDoMapa('3'),
      0.68: tokenDoMapa('4'), 1.0: tokenDoMapa('5'),
    },
  }).addTo(mapa);

  // O leaflet.heat 0.2.0 ignora a opcao pane e anexa o canvas direto no
  // overlayPane -- conferido em tela: o canvas pintava 16 mil pixeis e ficava
  // invisivel por baixo do SVG do coropletico. Mover o no depois de montado e
  // o unico jeito sem bifurcar o plugin.
  const painelDoCalor = mapa.getPane('calor');
  if (camadaCalor._canvas && camadaCalor._canvas.parentElement !== painelDoCalor) {
    painelDoCalor.appendChild(camadaCalor._canvas);
  }
}

/* --------------------------------------------------------------- legenda -- */
/* A amostra de "sem dado" na legenda repete a hachura do mapa em CSS. Legenda
   que mostra cor chapada ao lado de um mapa hachurado descreve outro mapa. */
function amostraSemDado() {
  const tom = tokenDoMapa('vazio');
  const risco = tokenDoMapa('vazio-traco');
  return `background:repeating-linear-gradient(45deg,${tom} 0 2px,${risco} 2px 4px)`;
}

/* A rede inteira em uma frase, inclusive o que nao esta no mapa. Quem le tem
   que saber que a rede e maior que os pontos desenhados, e por que a diferenca
   existe -- senao a ausencia de ponto vira ausencia de servico. */
function renderizarRede() {
  const rede = painel.rede || [];
  if (!rede.length) return;
  const porNivel = new Map();
  rede.forEach((u) => porNivel.set(u.nivel, (porNivel.get(u.nivel) || 0) + 1));
  const fora = rede.filter((u) => !u.no_mapa);
  const partes = [...porNivel].map(([nivel, n]) =>
    `${n} de ${nivel.replace('Proteção Social ', '').toLowerCase()}`);
  document.getElementById('nota-rede').textContent =
    `Rede socioassistencial: ${rede.length} unidades — ${partes.join(', ')}. `
    + `${fora.length} unidades de acolhimento entram na contagem e não no mapa: publicar a coordenada `
    + 'de um abrigo expõe quem está lá.';
}

function renderizarLegenda() {
  const quebras = quebrasAtuais();
  const info = indicadorAtual();
  const alvo = document.getElementById('legenda');
  document.getElementById('legenda-titulo').textContent = info.rotulo;
  document.getElementById('legenda-nota').textContent = info.nota;
  // Jenks não se aplica a categoria, e dizer que se aplica confunde quem lê.
  document.getElementById('nota-classificacao').textContent = ehNominal(info)
    ? 'Escala nominal: a cor nomeia a unidade, não mede quantidade. Não há classe nem ordem entre elas.'
    : 'Classificação por quebras naturais (Jenks), exceto o índice, que é cortado por decil.';

  const feicoes = estado.geo[estado.escala].features;
  if (ehNominal(info)) {
    const contagem = new Map();
    feicoes.forEach((f) => {
      const v = f.properties[estado.indicador];
      if (v) contagem.set(v, (contagem.get(v) || 0) + 1);
    });
    const rotuloEscala = ESCALAS[estado.escala].rotulo.toLowerCase();
    alvo.innerHTML = '<div class="legenda-nominal">' + CATEGORIAS
      .filter((c) => contagem.has(c))
      .map((c) => `<span class="ln-item" title="${contagem.get(c)} ${rotuloEscala}(s)">`
        + `<i style="background:${corDaCategoria(c)}"></i>${c.replace('CRAS ', '')}`
        + ` <b>${contagem.get(c)}</b></span>`)
      .join('') + '</div>';
    return;
  }

  if (!quebras) { alvo.innerHTML = ''; return; }
  const contagem = quebras.slice(0, -1).map((_, i) =>
    feicoes.filter((f) => classeDe(f.properties[estado.indicador], quebras) === i).length
  );
  const semDado = feicoes.filter((f) => classeDe(f.properties[estado.indicador], quebras) < 0).length;

  const faixas = quebras.slice(0, -1).map((inicio, i) => {
    const cor = corDe((inicio + quebras[i + 1]) / 2);
    return `<div class="legenda-faixa"
      title="${contagem[i]} ${ESCALAS[estado.escala].rotulo.toLowerCase()}(s) nesta classe">
      <span class="lf-cor" style="background:${cor};color:${tintaSobre(cor)}">
        ${contagem[i]}</span>
      <span class="lf-rot">${formatar(quebras[i + 1], info.unidade, estado.indicador)}</span>
    </div>`;
  }).join('');

  alvo.innerHTML =
    `<span class="legenda-limite">${formatar(quebras[0], info.unidade, estado.indicador)}</span>` +
    `<div class="legenda-escala">${faixas}</div>` +
    (semDado
      ? `<span class="badge neutro"><span class="dot amostra-hachura" style="${amostraSemDado()}"></span>`
        + `${semDado} sem dado</span>`
      : '');
}

/* --------------------------------------------------------------- detalhe -- */
const CAMPOS_DETALHE = [
  ['ivt', 'Índice (IVT)', ''],
  ['dim_renda_trabalho', 'Renda e trabalho', ''],
  ['dim_habitacao_infraestrutura', 'Habitação e infraestrutura', ''],
  ['dim_composicao_ciclo_vida', 'Composição e ciclo de vida', ''],
  ['alcance_rede', 'Alcance da rede', ''],
  ['pop', 'População (Censo 2022)', ''],
  ['familias', 'Famílias no CadÚnico', ''],
  ['familias_cad', 'Famílias no CadÚnico', ''],
  ['cobertura_cadunico', 'Cobertura do CadÚnico', '%'],
  ['pct_extrema_pobreza', 'Extrema pobreza', '%'],
  ['pct_moradia_precaria', 'Moradia precária', '%'],
  ['pct_esgoto_precario', 'Esgotamento precário', '%'],
  ['amplitude_interna', 'Amplitude interna do IVT', ''],
  ['atendimentos', 'Atendimentos (jan-set/2026)', ''],
  ['atendimentos_por_100', 'Atendimentos por 100 hab.', ''],
  ['atendimentos_na_unidade', 'Atendimentos feitos na unidade', ''],
  ['unidade_referencia', 'Unidade de referência declarada', 'categoria'],
  ['pct_unidade_referencia', 'Concordância da declaração', '%'],
];

function renderizarDetalhe() {
  const alvo = document.getElementById('detalhe');
  const feicao = feicaoSelecionada();
  if (!feicao) {
    alvo.innerHTML =
      '<div class="detalhe-vazio"><svg class="icone" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false"><path d="M88,24V16a8,8,0,0,1,16,0v8a8,8,0,0,1-16,0ZM16,104h8a8,8,0,0,0,0-16H16a8,8,0,0,0,0,16ZM124.42,39.16a8,8,0,0,0,10.74-3.58l8-16a8,8,0,0,0-14.31-7.16l-8,16A8,8,0,0,0,124.42,39.16Zm-96,81.69-16,8a8,8,0,0,0,7.16,14.31l16-8a8,8,0,1,0-7.16-14.31ZM219.31,184a16,16,0,0,1,0,22.63l-12.68,12.68a16,16,0,0,1-22.63,0L132.7,168,115,214.09c0,.1-.08.21-.13.32a15.83,15.83,0,0,1-14.6,9.59l-.79,0a15.83,15.83,0,0,1-14.41-11L32.8,52.92A16,16,0,0,1,52.92,32.8L213,85.07a16,16,0,0,1,1.41,29.8l-.32.13L168,132.69ZM208,195.31,156.69,144h0a16,16,0,0,1,4.93-26l.32-.14,45.95-17.64L48,48l52.2,159.86,17.65-46c0-.11.08-.22.13-.33a16,16,0,0,1,11.69-9.34,16.72,16.72,0,0,1,3-.28,16,16,0,0,1,11.3,4.69L195.31,208Z"/></svg>' +
      '<p>Selecione uma área no mapa ou uma linha da tabela para ver o detalhe do território.</p></div>';
    return;
  }
  const p = feicao.properties;
  const linhas = CAMPOS_DETALHE
    .filter(([campo]) => p[campo] !== undefined && p[campo] !== null)
    .map(([campo, rotulo, unidade]) =>
      `<div class="detalhe-linha"><span class="rot">${rotulo}</span>` +
      `<span class="val">${formatar(p[campo], unidade, campo)}</span></div>`)
    .join('');

  const selo = p.classe
    ? `<span class="badge ${{ 'Crítica': 'err', 'Alta': 'warn', 'Média': 'info', 'Baixa': 'ok' }[p.classe] || 'neutro'}">
         <span class="dot"></span>Prioridade ${p.classe.toLowerCase()}</span>`
    : '';
  const comunidade = p.comunidade_urbana
    ? `<span class="badge neutro"><span class="dot"></span>${p.comunidade_urbana}</span>` : '';

  alvo.innerHTML =
    `<h3>${rotuloFeicao(p)}</h3>` +
    `<div class="sub">${ESCALAS[estado.escala].rotulo}${p.CD_SETOR ? ` · ${p.CD_SETOR}` : ''}` +
    // De onde veio o nome. Nome de lugar sem procedencia vira folclore: quem
    // le precisa saber se aquilo e limite oficial de comunidade urbana ou a
    // rua com mais enderecos no setor.
    `${p.lugar_origem ? `<br>nome de lugar por ${p.lugar_origem}` : ''}</div>` +
    (selo || comunidade ? `<div class="chip-row" style="margin-bottom:var(--sp-4)">${selo}${comunidade}</div>` : '') +
    linhas;
}

/* ---------------------------------------------------------------- tabela -- */
function renderizarTabela() {
  const dados = estado.escala === 'cras' ? painel.cras : painel.bairros;
  const chave = estado.escala === 'cras' ? 'cras' : 'bairro';
  const corpo = document.getElementById('corpo-tabela');
  const maximo = Math.max(...dados.map((d) => d.ivt || 0));

  corpo.innerHTML = dados
    .slice()
    .sort((a, b) => (b.ivt || 0) - (a.ivt || 0))
    .map((d) => {
      const largura = maximo ? Math.round(((d.ivt || 0) / maximo) * 100) : 0;
      return `<tr data-chave="${d[chave]}" tabindex="0">
        <td class="nome">${String(d[chave]).replace('CRAS ', '')}</td>
        <td class="num" data-ordem="${d.ivt || 0}">
          <span class="barcell"><span class="bar-track"><span class="bar-fill" style="width:${largura}%"></span></span>
          <span class="bar-num">${formatar(d.ivt, '', 'ivt')}</span></span></td>
        <td class="num" data-ordem="${d.amplitude_interna || 0}">${formatar(d.amplitude_interna, '', 'amplitude_interna')}</td>
        <td class="num" data-ordem="${d.pop || 0}">${formatar(d.pop, '')}</td>
        <td class="num" data-ordem="${d.pessoas_cad || 0}">${formatar(d.pessoas_cad, '')}</td>
        <td class="num" data-ordem="${d.cobertura_cadunico || 0}">${formatar(d.cobertura_cadunico, '%')}</td>
        <td class="num" data-ordem="${d.alcance_rede || 0}">${formatar(d.alcance_rede, '', 'alcance_rede')}</td>
        <td class="num" data-ordem="${d.atendimentos || 0}">${formatar(d.atendimentos, '')}</td>
        <td class="num" data-ordem="${d.setores || 0}">${formatar(d.setores, '')}</td>
      </tr>`;
    })
    .join('');

  document.getElementById('contador-tabela').textContent =
    `${dados.length} ${estado.escala === 'cras' ? 'territórios de CRAS' : 'bairros'}`;
  document.getElementById('rotulo-unidade').textContent = estado.escala === 'cras' ? 'Território' : 'Bairro';

  corpo.querySelectorAll('tr').forEach((linha) => {
    const ativar = () => {
      if (estado.escala === 'setor') trocarEscala('cras');
      selecionar(linha.dataset.chave);
      const feicao = feicaoSelecionada();
      if (feicao) mapa.fitBounds(L.geoJSON(feicao).getBounds(), { padding: [30, 30] });
    };
    linha.addEventListener('click', ativar);
    linha.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); ativar(); }
    });
  });
  destacarLinhaTabela();
}

function destacarLinhaTabela() {
  document.querySelectorAll('#corpo-tabela tr').forEach((linha) => {
    linha.classList.toggle('destacada', linha.dataset.chave === estado.selecionado);
  });
}

function ordenarTabela(cabecalho) {
  const indice = Array.from(cabecalho.parentElement.children).indexOf(cabecalho);
  const direcao = cabecalho.dataset.dir === 'desc' ? 'asc' : 'desc';
  const corpo = document.getElementById('corpo-tabela');
  cabecalho.parentElement.querySelectorAll('th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th !== cabecalho) delete th.dataset.dir;
  });
  cabecalho.dataset.dir = direcao;
  cabecalho.classList.add(direcao === 'asc' ? 'sort-asc' : 'sort-desc');

  const linhas = Array.from(corpo.querySelectorAll('tr'));
  linhas.sort((a, b) => {
    const ca = a.children[indice];
    const cb = b.children[indice];
    const va = ca.dataset.ordem !== undefined ? parseFloat(ca.dataset.ordem) : ca.textContent.trim().toLowerCase();
    const vb = cb.dataset.ordem !== undefined ? parseFloat(cb.dataset.ordem) : cb.textContent.trim().toLowerCase();
    if (va < vb) return direcao === 'asc' ? -1 : 1;
    if (va > vb) return direcao === 'asc' ? 1 : -1;
    return 0;
  });
  linhas.forEach((linha) => corpo.appendChild(linha));
}

/* ---------------------------------------- gráfico 1: topografia social --- */
function renderizarFaixas() {
  const dados = painel.cras.slice().sort((a, b) => b.ivt - a.ivt);
  const minimo = Math.min(...dados.map((d) => d.ivt_min));
  const maximo = Math.max(...dados.map((d) => d.ivt_max));
  const escala = (valor) => ((valor - minimo) / (maximo - minimo)) * 100;

  const alvo = document.getElementById('faixas');
  alvo.innerHTML = dados.map((d, i) => `
    <div class="faixa-linha" style="--atraso:${i}">
      <span class="faixa-nome">${d.cras.replace('CRAS ', '')}</span>
      <span class="faixa-trilho">
        <span class="faixa-base"></span>
        <span class="faixa-span" style="left:${escala(d.ivt_min)}%;width:${escala(d.ivt_max) - escala(d.ivt_min)}%;
          --origem:${((escala(d.ivt) - escala(d.ivt_min)) / Math.max(escala(d.ivt_max) - escala(d.ivt_min), 0.01)) * 100}%"></span>
        <span class="faixa-extremo" style="left:${escala(d.ivt_min)}%" title="setor menos vulnerável: ${formatar(d.ivt_min, '', 'ivt')}"></span>
        <span class="faixa-extremo" style="left:${escala(d.ivt_max)}%" title="setor mais vulnerável: ${formatar(d.ivt_max, '', 'ivt')}"></span>
        <span class="faixa-ponto" style="left:${escala(d.ivt)}%" title="média do território: ${formatar(d.ivt, '', 'ivt')}"></span>
      </span>
      <span class="faixa-val">${formatar(d.amplitude_interna, '', 'amplitude_interna')}</span>
    </div>`).join('');

  // Revela quando o gráfico entra na tela, não no carregamento: a barra
  // crescendo a partir da média do território é o argumento do painel, e
  // animá-la fora de vista desperdiça o único momento animado da página.
  const observador = new IntersectionObserver((entradas, obs) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('revelar');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.25 });
  observador.observe(alvo);

  document.getElementById('faixa-eixo-min').textContent = formatar(minimo, '', 'ivt');
  document.getElementById('faixa-eixo-meio').textContent = formatar((minimo + maximo) / 2, '', 'ivt');
  document.getElementById('faixa-eixo-max').textContent = formatar(maximo, '', 'ivt');
}

/* ------------------------------------------ gráfico 2: demanda x oferta -- */
function renderizarQuadrante() {
  const dados = painel.cras;
  const svg = document.getElementById('quadrante-svg');
  const L_ = 46, R = 14, T = 16, B = 34;
  const largura = 560, altura = 400;
  // Escala ajustada ao intervalo observado, com folga de 12%: os oito
  // territorios ocupam uma faixa estreita de 0-100 e, numa escala fixa,
  // amontoariam todos num canto, apagando a diferenca entre eles.
  const faixa = (valores) => {
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const folga = (maximo - minimo) * 0.12 || 1;
    return [minimo - folga, maximo + folga];
  };
  const [ix0, ix1] = faixa(dados.map((d) => d.ivt));
  const [ay0, ay1] = faixa(dados.map((d) => d.alcance_rede));
  const x = (v) => L_ + ((v - ix0) / (ix1 - ix0)) * (largura - L_ - R);
  const y = (v) => altura - B - ((v - ay0) / (ay1 - ay0)) * (altura - T - B);
  const mediaIvt = dados.reduce((s, d) => s + d.ivt, 0) / dados.length;
  const mediaAlc = dados.reduce((s, d) => s + d.alcance_rede, 0) / dados.length;

  const pontos = dados.map((d) => {
    const prioritario = d.ivt >= mediaIvt && d.alcance_rede < mediaAlc;
    return `<circle class="q-ponto" cx="${x(d.ivt)}" cy="${y(d.alcance_rede)}" r="${prioritario ? 7 : 5}"
              ${prioritario ? `style="fill:${token('--map-5')}"` : ''}>
              <title>${d.cras}: IVT ${formatar(d.ivt, '', 'ivt')}, alcance ${formatar(d.alcance_rede, '', 'alcance_rede')}</title></circle>
            <text class="q-nome" x="${x(d.ivt) + 9}" y="${y(d.alcance_rede) + 3.5}">${d.cras.replace('CRAS ', '')}</text>`;
  }).join('');

  svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
  svg.innerHTML = `
    <rect class="q-zona" x="${x(mediaIvt)}" y="${y(mediaAlc)}" width="${largura - R - x(mediaIvt)}"
          height="${altura - B - y(mediaAlc)}" rx="4"></rect>
    <line class="q-guia" x1="${x(mediaIvt)}" y1="${T}" x2="${x(mediaIvt)}" y2="${altura - B}"></line>
    <line class="q-guia" x1="${L_}" y1="${y(mediaAlc)}" x2="${largura - R}" y2="${y(mediaAlc)}"></line>
    <text class="q-rotulo" x="${x(mediaIvt) + 5}" y="${T + 10}">média do município</text>
    <text class="q-rotulo" x="${L_ + 5}" y="${y(mediaAlc) - 6}">média do município</text>
    <line class="q-eixo" x1="${L_}" y1="${altura - B}" x2="${largura - R}" y2="${altura - B}"></line>
    <line class="q-eixo" x1="${L_}" y1="${T}" x2="${L_}" y2="${altura - B}"></line>
    <text class="q-rotulo" x="${L_}" y="${altura - B + 20}">${formatar(ix0 + (ix1 - ix0) * 0.02, '', 'ivt')}</text>
    <text class="q-rotulo" x="${largura - R}" y="${altura - B + 20}" text-anchor="end">Vulnerabilidade (IVT) →</text>
    <text class="q-rotulo" x="${L_ - 8}" y="${T + 4}" text-anchor="end" transform="rotate(-90 ${L_ - 8} ${T + 4})">Alcance da rede →</text>
    <text class="q-rotulo" x="${L_ - 6}" y="${altura - B}" text-anchor="end">${formatar(ay0 + (ay1 - ay0) * 0.02, '', 'alcance_rede')}</text>
    <text class="q-rotulo" x="${L_ - 6}" y="${T + 8}" text-anchor="end">${formatar(ay1, '', 'alcance_rede')}</text>
    <text class="q-rotulo" x="${largura - R - 6}" y="${altura - B - 8}" text-anchor="end"
          style="fill:var(--danger)">Alta demanda · baixo alcance</text>
    ${pontos}`;
}

/* --------------------------------------- população, cor/raça e atendimento -- */
/* Encurta o nome da unidade sem apagar o que a distingue de outra: cortar
   tudo depois de ' - ' transformava 'Uai Famílias' e 'Uai Idoso' no mesmo
   rótulo. Só as siglas longas e conhecidas são substituídas. */
const APELIDO = {
  'CREAS - Centro de Referência Especializado de Assistência Social': 'CREAS',
  'Cram - Centro de Referência de Atendimento à Mulher em Situação de Violência': 'CRAM',
};

function nomeCurto(nome) {
  return APELIDO[nome] || nome.replace('CRAS ', '');
}

function renderizarPiramide() {
  const base = painel.municipais.composicao;
  const unidade = document.getElementById('seletor-piramide').value;
  const fonte = (unidade === 'Araucária' ? base.municipio : base.por_cras)
    .find((u) => u.unidade === unidade) || base.municipio[0];

  // A escala é o maior valor entre os dois lados: se cada lado usasse a sua, a
  // pirâmide deixaria de ser comparável entre sexos, que é o que ela existe
  // para mostrar.
  const teto = Math.max(...fonte.masculino, ...fonte.feminino) || 1;
  document.getElementById('piramide-nota').textContent =
    `${nf.format(fonte.pessoas)} pessoas no cadastro municipal · idade mediana de ${nf1.format(fonte.idade_mediana)} anos`;

  document.getElementById('piramide').innerHTML = fonte.faixas.map((faixa, i) => `
    <div class="pir-linha">
      <span class="pir-esq"><span class="pir-barra" style="width:${(fonte.masculino[i] / teto) * 100}%"
        title="Masculino, ${faixa}: ${nf1.format(fonte.masculino[i])}%"></span></span>
      <span class="pir-faixa">${faixa}</span>
      <span class="pir-dir"><span class="pir-barra" style="width:${(fonte.feminino[i] / teto) * 100}%"
        title="Feminino, ${faixa}: ${nf1.format(fonte.feminino[i])}%"></span></span>
    </div>`).join('')
    + `<div class="pir-legenda">
         <span><i class="pir-amostra" style="background:var(--info)"></i> Masculino</span>
         <span><i class="pir-amostra" style="background:var(--ink-3)"></i> Feminino</span>
       </div>`;
  renderizarRaca(fonte);
}

function renderizarRaca(fonte) {
  const base = painel.municipais.composicao;
  const municipio = base.municipio[0].raca;
  const teto = Math.max(...base.ordem_raca.map((n) => Math.max(fonte.raca[n] || 0, municipio[n] || 0))) || 1;
  document.getElementById('raca').innerHTML = base.ordem_raca.map((nome) => {
    const local = fonte.raca[nome] || 0;
    const geral = municipio[nome] || 0;
    return `<div class="raca-linha">
      <span>${nome}</span>
      <span class="raca-trilho">
        <span class="raca-local" style="width:${(local / teto) * 100}%"></span>
        <span class="raca-municipio" style="left:${(geral / teto) * 100}%"
          title="Araucária: ${nf1.format(geral)}%"></span>
      </span>
      <span class="raca-val">${nf1.format(local)}%</span>
    </div>`;
  }).join('')
  + `<p class="nota" style="margin-top:var(--sp-2)">A marca vertical escura é o valor de Araucária inteira.</p>`;
}

function renderizarPaif() {
  const paif = painel.municipais.paif;
  const maximo = Math.max(...paif.unidades.map((u) => u.familias)) || 1;
  document.getElementById('paif-nota').textContent =
    `${nf.format(paif.total)} famílias ativas no serviço, pela lista do sistema municipal — `
    + `${nf1.format((paif.total / painel.familias_cadunico) * 100)}% das famílias do Cadastro Único. `
    + 'É esta a fonte do indicador de PAIF no mapa, e não o marcador do cadastro federal.';
  document.getElementById('escada-paif').innerHTML = paif.unidades.map((u) => `
    <div class="escada-item">
      <span class="escada-rot">${nomeCurto(u.unidade)}</span>
      <span class="escada-trilho"><span class="escada-fill"
        style="width:${(u.familias / maximo) * 100}%;background:var(--map-4)"></span></span>
      <span class="escada-val">${nf.format(u.familias)}</span>
    </div>`).join('');
}

/* Sparkline por unidade, cada uma na sua escala. Comparar CREAS (10.839) e uma
   unidade de 300 atendimentos na mesma escala apagaria a segunda; o que se
   compara aqui é a forma da curva ao longo do ano, e o total vai ao lado em
   número. */
function renderizarSeries() {
  const dados = painel.municipais.atendimentos;
  const l = 100, a = 26;
  document.getElementById('atendimento-periodo').textContent =
    `${nf.format(dados.total)} atendimentos · ${dados.periodo[0].split('-').reverse().join('/')} a `
    + `${dados.periodo[1].split('-').reverse().join('/')}`;

  document.getElementById('series').innerHTML = dados.unidades.map((u) => {
    const teto = Math.max(...u.serie) || 1;
    const passo = l / Math.max(u.serie.length - 1, 1);
    const pontos = u.serie.map((v, i) => `${(i * passo).toFixed(1)},${(a - 2 - (v / teto) * (a - 5)).toFixed(1)}`);
    return `<div class="serie-linha">
      <span class="serie-nome" title="${u.unidade}">${nomeCurto(u.unidade)}</span>
      <svg class="serie-spark" viewBox="0 0 ${l} ${a}" preserveAspectRatio="none" role="img"
           aria-label="${nomeCurto(u.unidade)}: ${u.serie.join(', ')} atendimentos por mês">
        <path class="area" d="M0,${a} L${pontos.join(' L')} L${l},${a} Z"></path>
        <path d="M${pontos.join(' L')}"></path>
      </svg>
      <span class="serie-total">${nf.format(u.total)}</span>
    </div>`;
  }).join('')
  + `<div class="serie-eixo"><span></span><span class="serie-marcas">`
  + dados.meses.map((m) => `<span>${m.slice(5)}</span>`).join('')
  + `</span><span></span></div>`;
}

function ligarPopulacao() {
  const base = painel.municipais.composicao;
  const seletor = document.getElementById('seletor-piramide');
  seletor.innerHTML = `<option value="Araucária">Araucária (município)</option>`
    + base.por_cras.map((u) => `<option value="${u.unidade}">${u.unidade}</option>`).join('');
  seletor.addEventListener('change', renderizarPiramide);
  document.getElementById('contador-municipais').textContent =
    `${nf.format(base.com_bairro)} pessoas com bairro identificado (${nf1.format(base.pct_com_bairro)}% do cadastro)`;
  renderizarPiramide();
  renderizarPaif();
  renderizarSeries();
}

/* ----------------------------------------------------- ficha de qualidade - */
function renderizarConferencia() {
  const conf = painel.municipais.conferencia;
  document.getElementById('conferencia-ref').textContent =
    `Observatório de ${conf.mes_referencia} · gerado em ${conf.gerado_em.split('-').reverse().join('/')}`;
  document.getElementById('corpo-conferencia').innerHTML = conf.linhas.map((l) => {
    const d = l.diferenca_pct;
    // Até 1% de diferença é arredondamento ou corte de data entre as duas
    // extrações; acima disso é discrepância de método e precisa de atenção.
    const selo = d === null ? '<span class="badge neutro"><span class="dot"></span>sem par</span>'
      : Math.abs(d) <= 1 ? `<span class="badge ok"><span class="dot"></span>${nf1.format(d)}%</span>`
      : `<span class="badge warn"><span class="dot"></span>${nf1.format(d)}%</span>`;
    return `<tr><td class="nome">${l.indicador}</td>
      <td class="num">${l.painel === null ? '—' : nf.format(l.painel)}</td>
      <td class="num">${l.observatorio === null ? '—' : nf.format(l.observatorio)}</td>
      <td class="num">${selo}</td></tr>`;
  }).join('')
  + '<p class="nota" style="margin-top:var(--sp-3)">Quatro dos cinco indicadores batem exatamente. '
  + 'A diferença na contagem de famílias monoparentais é de definição, não de dado: este painel conta filho de '
  + 'qualquer idade, o Observatório aparenta restringir a filho menor. Fica declarada em vez de ajustada.</p>';
}

function renderizarQualidade() {
  const q = painel.qualidade;
  const cores = rampa();
  const total = q.geocodificacao.familias;
  document.getElementById('escada-geo').innerHTML = q.geocodificacao.niveis.map((n, i) => `
    <div class="escada-item">
      <span class="escada-rot">N${n.nivel} ${n.rotulo.replace('_', ' ')}</span>
      <span class="escada-trilho"><span class="escada-fill"
        style="width:${(n.familias / total) * 100}%;background:${cores[Math.max(cores.length - 1 - i, 0)]}"></span></span>
      <span class="escada-val">${nf1.format(n.pct)}%</span>
    </div>`).join('');

  // Cobertura da ponte entre atendimentos e território, pelo mesmo princípio
  // da escada de geocodificação: taxa publicada sem denominador declarado é
  // número solto.
  const a = q.atendimentos;
  if (a) {
    document.getElementById('nota-atendimentos').textContent =
      `Atendimentos de ${a.periodo[0].split('-').reverse().join('/')} a `
      + `${a.periodo[1].split('-').reverse().join('/')}: ${nf.format(a.total)} registros. `
      + `${nf1.format((a.com_pessoa / a.total) * 100)}% cruzam com o cadastro de pessoas pelo `
      + `identificador, e ${nf1.format(a.pct_com_bairro)}% chegam a um bairro — o resto tem a pessoa, `
      + 'mas o cadastro dela não traz bairro aproveitável. A taxa por 100 habitantes é calculada sobre '
      + 'o que chega ao território, nunca sobre o total.';
  }
}

/* --------------------------------------------------------------- controles */
/* Enquadramento recomendado por escala. No municipio inteiro, 83% dos pixeis
   vao para o territorio do CRAS Centro, que inclui toda a area rural -- os
   outros sete territorios ficam espremidos num canto e a leitura morre. Na
   escala de setor o quadro municipal faz sentido, porque cada setor rural e
   uma feicao propria com valor proprio. Os botoes continuam mandando: trocar
   de escala aplica o padrao da escala, clicar no botao sobrepoe. */
const QUADRO_POR_ESCALA = { setor: 'municipio', bairro: 'urbano', cras: 'urbano' };

function enquadrar(quadro) {
  estado.quadro = quadro;
  if (quadro === 'urbano') mapa.fitBounds(painel.enquadramento_urbano, { padding: [20, 20] });
  else mapa.fitBounds(L.geoJSON(estado.geo.limite).getBounds(), { padding: [12, 12] });
  document.getElementById('botao-urbano').setAttribute('aria-pressed', String(quadro === 'urbano'));
  document.getElementById('botao-municipio').setAttribute('aria-pressed', String(quadro !== 'urbano'));
}

function trocarEscala(escala) {
  estado.escala = escala;
  estado.selecionado = null;
  estado.indicador = indicadorValido(estado.indicador, escala);
  sincronizarSeletorIndicador();
  document.querySelectorAll('[data-escala]').forEach((botao) => {
    botao.setAttribute('aria-pressed', String(botao.dataset.escala === escala));
  });
  desenharDados();
  enquadrar(QUADRO_POR_ESCALA[escala] || 'municipio');
  renderizarLegenda();
  renderizarDetalhe();
  renderizarTabela();
  atualizarHash();
}

function trocarIndicador(campo) {
  estado.indicador = campo;
  camadaDados.setStyle(estiloFeicao);
  camadaDados.eachLayer((camada) => {
    const info = indicadorAtual();
    const p = camada.feature.properties;
    camada.setTooltipContent(
      `<span class="tt-nome">${rotuloFeicao(p)}</span>` +
      `${info.rotulo}: <span class="tt-val">${formatar(p[estado.indicador], info.unidade, estado.indicador)}</span>`
    );
  });
  renderizarLegenda();
  atualizarHash();
}

function atualizarHash() {
  const partes = [estado.escala, estado.indicador, estado.fundo, estado.calor];
  if (estado.selecionado) partes.push(encodeURIComponent(estado.selecionado));
  history.replaceState(null, '', `#${partes.join('/')}`);
}

function lerHash() {
  const partes = decodeURIComponent(location.hash.replace('#', '')).split('/');
  if (partes[0] && ESCALAS[partes[0]]) estado.escala = partes[0];
  if (partes[1] && painel.indicadores.some((i) => i.campo === partes[1])) estado.indicador = partes[1];
  if (partes[2] && FUNDOS[partes[2]]) estado.fundo = partes[2];
  if (partes[3] && ['nenhum', 'familias', 'extrema', 'razao'].includes(partes[3])) estado.calor = partes[3];
}

/* O tema e do HUB, nao do painel.

   O painel tinha botao proprio e chave propria no localStorage, e isso quebrava
   em dois lugares: aberto a partir do HUB, ele podia aparecer claro com o HUB
   escuro; e o leitor ganhava dois controles de tema para a mesma sessao. A
   chave e o protocolo agora sao os mesmos do boletim -- 'hub_tema', evento
   'storage' entre abas e mensagem 'hub:tema' quando o painel roda em iframe de
   outra origem. O painel so LE o tema; quem decide e o HUB. */
const CHAVE_TEMA_HUB = 'hub_tema';

function temaDoHub() {
  try {
    if (window.parent && window.parent !== window) {
      const pai = window.parent.document.documentElement.getAttribute('data-theme');
      if (pai === 'dark' || pai === 'light') return pai;
    }
  } catch (e) { /* origem cruzada: sem acesso ao pai */ }
  try {
    const guardado = localStorage.getItem(CHAVE_TEMA_HUB);
    if (guardado === 'dark' || guardado === 'light') return guardado;
  } catch (e) { /* modo privativo */ }
  return null;
}

/* Trocar de tema obriga a redesenhar o mapa: o Leaflet resolve cor no momento
   em que desenha, e os tokens mudaram. Sem isso o coroplético ficaria com a
   rampa do tema anterior sobre a interface do novo. */
function aplicarTema(tema) {
  if (document.documentElement.getAttribute('data-theme') === tema) return;
  document.documentElement.setAttribute('data-theme', tema);
  document.documentElement.classList.add('theme-switching');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.documentElement.classList.remove('theme-switching')));
  if (camadaDados) {
    trocarFundo(estado.fundo);
    desenharContexto();
    desenharHidrografia();
    desenharDados();
    camadaDados.bringToFront();
    renderizarLegenda();
    renderizarQualidade();
    renderizarQuadrante();
  }
}

function ligarControles() {
  document.querySelectorAll('[data-escala]').forEach((botao) => {
    botao.addEventListener('click', () => trocarEscala(botao.dataset.escala));
  });

  const seletor = document.getElementById('seletor-indicador');
  seletor.innerHTML = painel.indicadores
    .map((i) => `<option value="${i.campo}">${i.rotulo}</option>`).join('');
  sincronizarSeletorIndicador();
  seletor.addEventListener('change', () => trocarIndicador(seletor.value));

  document.querySelectorAll('[data-fundo]').forEach((botao) => {
    botao.addEventListener('click', () => trocarFundo(botao.dataset.fundo));
  });
  document.getElementById('seletor-calor').addEventListener('change', (e) => {
    estado.calor = e.target.value;
    aplicarCalor();
    atualizarHash();
  });
  document.getElementById('cam-hidro').addEventListener('change', (e) => {
    if (e.target.checked) estado.camadas.hidrografia.addTo(mapa);
    else estado.camadas.hidrografia.remove();
  });
  document.getElementById('cam-unidades').addEventListener('change', (e) => {
    if (e.target.checked) camadaUnidades.addTo(mapa); else camadaUnidades.remove();
  });

  document.querySelectorAll('#tabela-territorios th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => ordenarTabela(th));
  });

  document.getElementById('botao-urbano').addEventListener('click', () => enquadrar('urbano'));
  document.getElementById('botao-municipio').addEventListener('click', () => enquadrar('municipio'));

  ouvirTemaDoHub();
  ligarMaximizar();
}

/* Maximizar o mapa.

   Duas camadas, de propósito. A classe no bloco é o que realmente redimensiona
   e funciona em qualquer lugar, inclusive dentro de um iframe sem permissão de
   tela cheia. A API de fullscreen entra por cima, quando o navegador deixa,
   para o painel também ocupar a barra do navegador -- se ela recusar, a classe
   já resolveu e ninguém percebe a diferença.

   O Leaflet guarda o tamanho do container e não observa o DOM: sem
   invalidateSize depois da troca, o mapa fica desenhado no tamanho antigo
   dentro da moldura nova. */
const ICONE_EXPANDIR = `<path d="M216,48V96a8,8,0,0,1-16,0V67.31l-42.34,42.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM98.34,146.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l42.35-42.34a8,8,0,0,0-11.32-11.32ZM208,152a8,8,0,0,0-8,8v28.69l-42.34-42.35a8,8,0,0,0-11.32,11.32L188.69,200H160a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V160A8,8,0,0,0,208,152ZM67.31,56H96a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31l42.34,42.35a8,8,0,0,0,11.32-11.32Z"/>`;
const ICONE_RESTAURAR = `<path d="M144,104V64a8,8,0,0,1,16,0V84.69l42.34-42.35a8,8,0,0,1,11.32,11.32L171.31,96H192a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm-40,40H64a8,8,0,0,0,0,16H84.69L42.34,202.34a8,8,0,0,0,11.32,11.32L96,171.31V192a8,8,0,0,0,16,0V152A8,8,0,0,0,104,144Zm67.31,16H192a8,8,0,0,0,0-16H152a8,8,0,0,0-8,8v40a8,8,0,0,0,16,0V171.31l42.34,42.35a8,8,0,0,0,11.32-11.32ZM104,56a8,8,0,0,0-8,8V84.69L53.66,42.34A8,8,0,0,0,42.34,53.66L84.69,96H64a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V64A8,8,0,0,0,104,56Z"/>`;

function maximizado() {
  return document.getElementById('mapa-bloco').classList.contains('expandido');
}

function aplicarMaximizacao(ligar) {
  const bloco = document.getElementById('mapa-bloco');
  const botao = document.getElementById('botao-expandir');
  bloco.classList.toggle('expandido', ligar);
  document.body.classList.toggle('com-mapa-maximizado', ligar);
  botao.setAttribute('aria-pressed', String(ligar));
  const rotulo = ligar ? 'Restaurar o tamanho do mapa' : 'Maximizar o mapa';
  botao.setAttribute('aria-label', rotulo);
  botao.title = ligar ? 'Restaurar o tamanho do mapa (Esc)' : 'Maximizar o mapa (Esc para sair)';
  document.getElementById('icone-expandir').innerHTML = ligar ? ICONE_RESTAURAR : ICONE_EXPANDIR;
  // Dois quadros: o primeiro aplica o layout novo, o segundo já mede certo.
  // Depois de medir, reenquadra: invalidateSize preserva centro e zoom, o que
  // num quadro muito mais largo só acrescenta fundo vazio ao redor. Quem
  // maximiza quer ver mais mapa, não mais margem.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    mapa.invalidateSize();
    enquadrar(estado.quadro || 'municipio');
  }));
}

function alternarMaximizar() {
  const ligar = !maximizado();
  aplicarMaximizacao(ligar);
  const bloco = document.getElementById('mapa-bloco');
  try {
    if (ligar && bloco.requestFullscreen) bloco.requestFullscreen().catch(() => {});
    else if (!ligar && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (e) { /* sem permissão de tela cheia: a classe já deu conta */ }
}

function ligarMaximizar() {
  document.getElementById('botao-expandir').addEventListener('click', alternarMaximizar);
  // Esc sai. Quando a tela cheia nativa está ativa, o navegador consome o Esc
  // e avisa por fullscreenchange; fora dela, o atalho é nosso.
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && maximizado()) alternarMaximizar();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && maximizado()) aplicarMaximizacao(false);
  });
}

function ouvirTemaDoHub() {
  // Em iframe de outra origem o HUB nao consegue escrever no documento filho,
  // entao empurra o tema por mensagem.
  window.addEventListener('message', (evento) => {
    const dado = evento.data;
    if (dado && dado.tipo === 'hub:tema' && (dado.tema === 'dark' || dado.tema === 'light')) {
      aplicarTema(dado.tema);
    }
  });
  // Troca de tema em outra aba da mesma origem.
  window.addEventListener('storage', (evento) => {
    if (evento.key === CHAVE_TEMA_HUB && (evento.newValue === 'dark' || evento.newValue === 'light')) {
      aplicarTema(evento.newValue);
    }
  });
  // Sem tema do HUB, quem manda e o sistema operacional -- e continua mandando
  // se o usuario trocar o modo do sistema com a pagina aberta.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (evento) => {
    if (!temaDoHub()) aplicarTema(evento.matches ? 'dark' : 'light');
  });
}

/* ------------------------------------------------------------------ carga - */
function carregar() {
  painel = JSON.parse(document.getElementById('dados-painel').textContent);
  lerHash();

  // A geometria viaja dentro do proprio HTML, e nao por fetch: a pagina e
  // aberta direto do disco com frequencia, e file:// bloqueia requisicao de
  // arquivo local. Os mesmos GeoJSON continuam em output/dados/ para quem
  // quiser reusar a camada.
  const geo = JSON.parse(document.getElementById('dados-geo').textContent);
  const nomes = {
    setor: 'setores', bairro: 'bairros', cras: 'territorios', unidades: 'unidades',
    hidrografia: 'hidrografia', perimetro: 'perimetro_urbano', limite: 'limite_municipal',
  };
  Object.entries(nomes).forEach(([destino, origem]) => { estado.geo[destino] = geo[origem]; });

  montarMapa();
  trocarFundo(estado.fundo);
  desenharContexto();
  desenharHidrografia();
  desenharUnidades();
  desenharDados();
  mapa.fitBounds(L.geoJSON(estado.geo.limite).getBounds(), { padding: [12, 12] });
  if (document.getElementById('cam-hidro').checked) estado.camadas.hidrografia.addTo(mapa);
  camadaDados.bringToFront();

  ligarControles();
  document.getElementById('seletor-calor').value = estado.calor;
  trocarEscala(estado.escala);
  aplicarCalor();
  renderizarFaixas();
  renderizarQuadrante();
  renderizarQualidade();
  renderizarConferencia();
  renderizarRede();
  ligarPopulacao();
}

function iniciar() {
  // O tema ja foi resolvido pelo bloco no <head>, antes da primeira pintura.
  try {
    carregar();
  } catch (erro) {
    document.getElementById('falha-dados').hidden = false;
    document.getElementById('falha-detalhe').textContent = erro.message;
    console.error(erro);
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
