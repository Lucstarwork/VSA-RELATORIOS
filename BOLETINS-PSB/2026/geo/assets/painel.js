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
   veda consumo fora do SDK proprio.

   maxNativeZoom em vez de maxZoom nas duas camadas globais. Com maxZoom o
   Leaflet rebaixa o teto do MAPA inteiro para 19 -- o botao de zoom morre ali,
   e trocar da ortofoto (nativa ate 21) para o satelite puxava o leitor para
   tras sem aviso. maxNativeZoom para de pedir tile acima de 19, que e onde o
   World Imagery devolve o quadro cinza "Map data not yet available", e deixa o
   Leaflet ampliar o ultimo tile bom. Ampliado e borrado, mas borrado e honesto:
   mostra onde a fonte acaba em vez de fingir que o mapa acabou. */
/* Opcoes comuns aos tres fundos de imagem, e o conserto do travamento medido.

   O voo entre territorios atravessa varios niveis de zoom, e por padrao o
   Leaflet pede tile de CADA nivel atravessado: medido no fundo de satelite com
   a apresentacao rodando, deram 474 requisicoes em 45 segundos. Cada imagem
   que chega e decodificada na thread principal, e era dali que vinham os
   engasgos -- 117 quadros acima de 100 ms com o quadro mediano ainda em 60 fps,
   que e a assinatura de tarefa longa pontual, nao de carga continua.

   updateWhenZooming: false faz o Leaflet escalar por transform durante a
   animacao e so buscar tile ao pousar. keepBuffer menor corta o anel de tiles
   fora de tela, que no voo e desperdicio puro: ele e descartado antes de
   aparecer. */
const TILES_FLUIDOS = { updateWhenZooming: false, keepBuffer: 1 };

const ZOOM_MAXIMO = 21;      // teto nativo da ortofoto municipal (7,3 cm/px)
const ZOOM_NATIVO_GLOBAL = 19;  // teto real do Esri sobre Araucaria

const FUNDOS = {
  proprio: { rotulo: 'Mapa do território', imagem: false, fonte: 'geoportal municipal' },
  ruas: {
    rotulo: 'Ruas',
    imagem: true,
    imagemClara: true,
    fonte: 'Esri World Street Map',
    claro: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    opcoes: {
      maxZoom: ZOOM_MAXIMO, maxNativeZoom: ZOOM_NATIVO_GLOBAL,
      ...TILES_FLUIDOS,
      attribution: 'Ruas: Esri, HERE, Garmin e colaboradores do '
        + '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satelite: {
    rotulo: 'Satélite',
    imagem: true,
    fonte: 'Esri World Imagery',
    claro: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opcoes: {
      maxZoom: ZOOM_MAXIMO, maxNativeZoom: ZOOM_NATIVO_GLOBAL,
      ...TILES_FLUIDOS,
      // A data da cena vai na barra de procedencia, onde ja moram as outras
      // fontes -- e nao no rotulo do cabecalho, que fica curto como os demais
      // fundos. "Parece desatualizado" e a primeira suspeita de quem olha
      // imagem de satelite, e sem a data ninguem tem como conferir. Conferida
      // no identify do proprio servico sobre o nucleo urbano: GeoEye-1, Vivid
      // Advanced, 30 cm, 26/12/2025. O mosaico e por cena, entao a data vale
      // para o nucleo e nao para a area rural -- por isso o rotulo diz onde.
      attribution: 'Satélite: Esri, Vantor/Maxar, Earthstar Geographics '
        + '— cena de 26/12/2025 no núcleo urbano',
    },
  },
  ortofoto: {
    rotulo: 'Ortofoto municipal',
    imagem: true,
    fonte: 'ortofoto municipal',
    wms: true,
    opcoes: {
      layers: 'Araucaria:ORTO', format: 'image/png', transparent: true, version: '1.3.0',
      maxZoom: ZOOM_MAXIMO, ...TILES_FLUIDOS, attribution: 'Ortofoto: Prefeitura de Araucária (núcleo urbano)',
      bounds: L.latLngBounds([-25.650736, -49.443689], [-25.520990, -49.336521]),
    },
  },
};

/* A ortofoto municipal so existe dentro da rede da Prefeitura:
   geonovo.araucaria.pr.gov.br resolve para 172.20.10.67, endereco privado
   (RFC 1918). O painel servido pelo HUB vem de origem publica, e dali o
   navegador barra a requisicao antes de ela sair -- politica de acesso a rede
   privada -- enquanto o GeoServer nao devolve cabecalho CORS nenhum para o
   preflight ter como passar. Pela linha de comando, de dentro da rede, o mesmo
   tile volta em 0,09 s: por isso o defeito nao aparecia em nenhum teste de
   servidor. O que o leitor via era o botao ligado e o mapa cinza, sem erro.

   A sonda pede o menor tile possivel pelo mesmo caminho dos tiles reais (<img>
   sem CORS, para falhar e acertar exatamente como eles) e so entao decide se o
   botao fica de pe. */
const ORTO_SONDA = `${WMS_MUNICIPAL}?service=WMS&request=GetMap&version=1.3.0`
  + '&layers=Araucaria:ORTO&styles=&format=image/png&transparent=true'
  + '&crs=EPSG:3857&width=1&height=1'
  + '&bbox=-5498574,-2949858,-5493682,-2944966';
const ORTO_ESPERA_MS = 6000;

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
  divisoria: 'todos',
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
let camadaDivisorias;
let camadaRotulos;
let quadroPendente = null;

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const token = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
/* Token da rampa cartografica, escolhido pelo que esta ATRAS do coropletico e
   nao pelo tema da interface. As duas rampas tem a MESMA direcao -- amarelo na
   classe baixa, vermelho na alta -- e diferem so na luminosidade, calibrada
   uma para fundo claro e outra para fundo escuro. O mapa de ruas e cor de
   creme nos dois temas, e sobre ele a rampa escura perde separacao do fundo:
   sobre imagem clara o mapa desenha com a rampa clara, qualquer que seja o
   tema da pagina. Os graficos do painel lateral continuam no tema, porque o
   fundo deles e a interface. */
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

/* Value-by-alpha SAIU. A opacidade acompanhava a densidade populacional do
   setor (peso_visual, rank percentil de densidade), e isso punha dois dados
   diferentes no mesmo canal: o matiz carregava o indice, o alfa carregava
   densidade, e o olho le os dois como "intensidade de cor". O piso de 0,55 era
   uma tentativa de limitar o estrago, e nao foi suficiente -- medido em OKLab
   sobre o fundo real do mapa:

     espalhamento DENTRO de uma classe, so pelo alfa   0,273 (claro vetorial)
     menor passo ENTRE classes vizinhas                0,077
     ou seja: o ruido era 3,5x o sinal

   Na pratica um setor da classe 5 com baixa densidade chegava a tela na mesma
   cor de um classe 3 com alta densidade. Com alfa fixo o passo minimo sobe
   para 0,138 no claro e 0,121 no escuro -- 4x o limiar de percepcao para
   mancha grande -- e o ruido vai a zero.

   O motivo original continua valido: os setores rurais cobrem 82% do
   territorio com 6% da populacao e dominam a leitura de area. So que a
   resposta a isso nao e sujar o unico canal que carrega o indice. O painel ja
   responde em tres outros lugares -- o mapa de calor por densidade de
   familias, a contagem por classe na legenda e a tabela ligada com o valor
   exato. Qualquer coroplético publicado no mundo tem essa propriedade.

   peso_visual continua viajando no GeoJSON (publicar.py:478). Nada no painel
   le mais. Nao arranquei de la para nao forcar re-publicacao do pipeline
   inteiro por 247 floats inertes. */
const ALFA_COM_DADO = 0.90;
const ALFA_SEM_DADO = 0.75;
const RECUO_SOBRE_IMAGEM = 0.78;  // ver o comentario de trocarFundo

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
  // Fora do recorte a feição some por ESTILO, não por remoção do DOM. Antes o
  // recorte reconstruía a camada inteira -- 247 paths SVG destruídos e criados
  // de novo a cada uma das nove paradas, quase 2.300 elementos, e cada lote
  // desses é uma tarefa longa na thread principal no meio da animação. Agora a
  // camada nasce uma vez por escala e o recorte é um setStyle.
  if (!noRecorte(feicao.properties)) {
    return { fillOpacity: 0, opacity: 0, fill: false, stroke: false };
  }

  // Na apresentação o coroplético fica CHAPADO. Numa projeção vista de seis
  // metros, translucidez vira cor lavada: os 10% de fundo que atravessam o
  // polígono custam saturação que a sala inteira precisa enxergar. Na tela de
  // trabalho os 0,90 continuam, porque ali a referência do fundo ainda serve.
  const base = semDado ? ALFA_SEM_DADO : (cinema.ligado ? 1 : ALFA_COM_DADO);
  // Com calor ligado o coroplético recua para contexto: duas superfícies
  // contínuas disputando a mesma leitura não somam, se anulam.
  const recuoImagem = cinema.ligado ? 0.88 : RECUO_SOBRE_IMAGEM;
  const recuo = (sobreImagem ? recuoImagem : 1) * (estado.calor !== 'nenhum' ? 0.45 : 1);
  return {
    fillColor: semDado ? (hachuraSemDado() || tokenDoMapa('vazio')) : corDe(valor),
    fillOpacity: base * recuo,
    color: selecionada ? tokenDoMapa('contorno') : (semDado ? token('--ink-3') : tokenDoMapa('traco')),
    // Malha mais marcada na apresentação: 0,6px de traço desaparece numa
    // projeção, e sem o traço os setores vizinhos de mesma classe viram uma
    // mancha só -- a densidade da malha urbana some justo onde ela é o
    // argumento. É a mesma decisão dos painéis de apuração, onde o contorno
    // entre municípios é o que deixa a mancha legível.
    weight: selecionada ? 2.5
      : (cinema.ligado ? (estado.escala === 'setor' ? 1.2 : 2)
        : (sobreImagem ? 1.1 : (semDado ? 0.9 : (estado.escala === 'setor' ? 0.6 : 1.4)))),
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
/* Enquadrar exige container medido. Dentro do HUB o painel nasce num iframe
   com display:none -- o bloco do mapa mede 0x0, o Leaflet calcula zoom a
   partir desse tamanho, chega em infinito e estoura "Invalid LatLng object:
   (NaN, NaN)" no meio de carregar(). O throw derrubava a carga inteira: sem
   seletor de indicador, sem tabela, sem ficha. Enquanto nao ha tamanho o mapa
   recebe centro valido e zoom fixo, o enquadramento fica guardado, e o
   ResizeObserver aplica no quadro em que a moldura aparece. */
const ZOOM_SEM_MEDIDA = 11;

function mapaMedido() {
  const tamanho = mapa.getSize();
  return tamanho.x > 0 && tamanho.y > 0;
}

function ajustarQuadro(limites, opcoes) {
  if (mapaMedido()) {
    quadroPendente = null;
    // Voo em vez de salto durante a apresentação: entre dois territórios o
    // fitBounds troca o quadro num corte seco e quem assiste perde a noção de
    // onde estava. O flyToBounds afasta, desloca e aproxima -- a trajetória é
    // a própria informação "saímos daqui e chegamos ali". Fora da
    // apresentação continua salto, que é o certo para quem está operando.
    if (cinema.ligado && !movimentoReduzido()) {
      // 1,1s em vez de 1,6s. O voo longo parecia arrastado justamente por ser o
      // trecho mais caro de desenhar: meio segundo a menos sob carga é meio
      // segundo a menos de queda de quadro, e a trajetória continua legível.
      mapa.flyToBounds(limites, { ...opcoes, duration: 1.1, easeLinearity: 0.3 });
      return;
    }
    mapa.fitBounds(limites, opcoes);
    return;
  }
  quadroPendente = { limites, opcoes };
  mapa.setView(L.latLngBounds(limites).getCenter(), ZOOM_SEM_MEDIDA);
}

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
    // Teto fixo no mapa, nao herdado da camada de fundo. Sem isto o Leaflet
    // recalcula o maximo a cada troca de fundo e o leitor perde zoom ao sair
    // da ortofoto, no meio de uma leitura de quadra.
    maxZoom: ZOOM_MAXIMO,
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

  // Divisoria de CRAS e linha de referencia: tem que ficar legivel por cima do
  // coropletico E por cima da mancha de calor. No overlayPane ela viveria a
  // merce do proximo bringToFront do coropletico -- mesmo problema que levou o
  // calor a ganhar painel proprio. 460 fica acima do calor (450) e abaixo do
  // marcador de unidade (600), que continua sendo o que o leitor clica.
  mapa.createPane('divisorias');
  mapa.getPane('divisorias').style.zIndex = 460;
  mapa.getPane('divisorias').style.pointerEvents = 'none';

  // Rótulo de território acima de tudo, inclusive do marcador de unidade: ele
  // é texto, e texto coberto por um ponto de 8px fica ilegível sem que ninguém
  // perceba a causa.
  mapa.createPane('rotulos');
  mapa.getPane('rotulos').style.zIndex = 620;
  mapa.getPane('rotulos').style.pointerEvents = 'none';

  // Enquanto o mapa se move, os painéis da apresentação largam o desfoque de
  // fundo (ver .cinema.movendo). Preso ao evento do Leaflet e não a um
  // temporizador: o voo tem duração própria e qualquer palpite erraria para
  // mais ou para menos.
  const marcarMovimento = (movendo) => {
    const camada = document.getElementById('cinema');
    if (camada) camada.classList.toggle('movendo', movendo);
  };
  mapa.on('movestart zoomstart', () => marcarMovimento(true));
  mapa.on('moveend zoomend', () => marcarMovimento(false));

  // O Leaflet so escuta resize da janela, e trocar display:none por block no
  // iframe do HUB nao gera resize nenhum. Quem ve o bloco mudar de tamanho e
  // o observador do proprio elemento.
  new ResizeObserver(() => {
    if (!mapaMedido()) return;
    mapa.invalidateSize();
    if (quadroPendente) ajustarQuadro(quadroPendente.limites, quadroPendente.opcoes);
  }).observe(document.getElementById('mapa'));
}

function escuro() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/* O fundo de imagem muda o que o coropletico pode fazer por cima dele: cheio,
   ele apaga a imagem e o leitor perde a ancora que foi buscar; apagado demais,
   a classificacao some.

   O recuo era 0,62 e foi para 0,78. O 0,62 nasceu quando a opacidade ainda
   variava por densidade (ver ALFA_COM_DADO): naquele regime 0,62 era o TETO,
   que so o setor mais denso alcancava, e o ponto de equilibrio foi medido
   nesse teto. Com alfa fixo o recuo deixou de ser teto e virou o valor de
   todo poligono, e 0,62 x 0,90 = 0,558 jogava as tres primeiras classes uma
   em cima da outra -- a mesma mancha lavada que o value-by-alpha produzia.

   Remedido compondo a rampa sobre tile real da ortofoto, no pior caso
   (telhado branco, 255,254,255):

     recuo  alfa   passo min  foto visivel
     0,62   0,558    0,079       44%
     0,70   0,630    0,091       37%
     0,78   0,702    0,103       30%   <- escolhido
     0,86   0,774    0,116       23%

   Em 0,86 a classe mais alta apaga a quadra, que e justo o que o tecnico foi
   buscar na imagem. Em 0,78 as cinco classes separam (3,4x o limiar) e rua,
   lote e edificacao continuam legiveis sob todas elas. */
function trocarFundo(nome) {
  estado.fundo = nome;
  if (camadaFundo) { camadaFundo.remove(); camadaFundo = null; }

  const fundo = FUNDOS[nome];
  if (fundo.imagem) {
    // updateWhenIdle SÓ na apresentação. Medido: updateWhenZooming não alcança o
    // flyTo -- ele não é uma animação de zoom, é movimento contínuo, e o
    // GridLayer segue pedindo tile a cada quadro do trajeto. updateWhenIdle
    // segura tudo até o mapa pousar. No uso diário ele ficaria ruim, porque o
    // tile só apareceria ao soltar o arrasto; na apresentação ninguém arrasta.
    const opcoes = { ...fundo.opcoes, updateWhenIdle: cinema.ligado };
    camadaFundo = fundo.wms
      ? L.tileLayer.wms(WMS_MUNICIPAL, opcoes)
      : L.tileLayer(escuro() && fundo.escuro ? fundo.escuro : fundo.claro, opcoes);
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
  // A divisoria e o chip de rotulo leem tokenDoMapa, que muda com o fundo
  // (imagem clara inverte a rampa) e com o tema. aplicarTema entra por aqui,
  // entao este e o unico ponto que precisa redesenhar.
  desenharDivisorias();
  desenharRotulos();
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

/* Pergunta ao geoportal se ele esta ao alcance DESTE navegador. Promessa que
   nunca rejeita: indisponibilidade de fundo nao e erro de carga do painel, e
   nao pode derrubar o resto da tela. */
function sondarOrtofoto() {
  return new Promise((resolve) => {
    const imagem = new Image();
    const prazo = setTimeout(() => { imagem.src = ''; resolve(false); }, ORTO_ESPERA_MS);
    const responder = (alcancavel) => { clearTimeout(prazo); resolve(alcancavel); };
    imagem.onload = () => responder(true);
    imagem.onerror = () => responder(false);
    // Sem o parametro de corte o navegador pode responder do cache -- inclusive
    // o cache de uma falha anterior, de outra rede.
    imagem.src = `${ORTO_SONDA}&_=${Date.now()}`;
  });
}

/* Botao de fundo que nao entrega fundo tem que sair do caminho. Desligar e
   dizer por que e melhor do que deixar o leitor concluir que a ortofoto nao
   existe, ou que o mapa quebrou. */
async function conferirOrtofoto() {
  const botao = document.querySelector('[data-fundo="ortofoto"]');
  const aviso = document.getElementById('orto-indisponivel');
  if (await sondarOrtofoto()) return;

  botao.disabled = true;
  aviso.textContent = 'Ortofoto só na rede da Prefeitura';
  // Fundo vindo do hash: o leitor chegou com ortofoto na URL e ficaria preso
  // num fundo que nao pinta nada.
  if (estado.fundo === 'ortofoto') trocarFundo('satelite');
}

/* Divisorias de CRAS sobre qualquer escala.

   O painel ja tinha territorio de CRAS como ESCALA, mas escala troca o que o
   mapa mede: para ver o indice por setor E a fronteira do territorio ao mesmo
   tempo nao havia jeito. Quem trabalha na ponta precisa exatamente disso --
   "esse setor vermelho cai no meu territorio?".

   Linha com casing (duas passadas, clara por baixo e escura por cima, ou o
   contrario no tema escuro) porque uma unica passada nao resolve: sobre a
   classe 1 so a escura aparece, sobre a classe 5 so a clara. Casing e a saida
   cartografica padrao para fronteira que precisa ser lida sobre qualquer
   preenchimento, e aqui ela ainda tem que sobreviver a foto de satelite. */
function desenharDivisorias() {
  if (camadaDivisorias) { camadaDivisorias.remove(); camadaDivisorias = null; }
  if (estado.divisoria === 'nenhuma') return;

  const feicoes = estado.geo.cras.features.filter((f) =>
    estado.divisoria === 'todos' || f.properties.cras === estado.divisoria);
  if (!feicoes.length) return;

  camadaDivisorias = L.layerGroup().addTo(mapa);
  const colecao = { type: 'FeatureCollection', features: feicoes };
  // Ordem importa: a passada larga vai primeiro e fica por baixo.
  [
    { color: tokenDoMapa('traco'), weight: 5.5, opacity: 0.85 },
    { color: tokenDoMapa('contorno'), weight: 2, opacity: 1 },
  ].forEach((traco) => {
    L.geoJSON(colecao, {
      interactive: false,
      pane: 'divisorias',
      style: { ...traco, fill: false, lineJoin: 'round' },
    }).addTo(camadaDivisorias);
  });
}

/* A lista sai da geometria, em ordem alfabetica -- a ordem de feicao no arquivo
   e a do GeoServer, que nao significa nada para quem procura o proprio CRAS. */
function preencherDivisorias() {
  const seletor = document.getElementById('seletor-divisoria');
  const nomes = estado.geo.cras.features
    .map((f) => f.properties.cras)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  nomes.forEach((nome) => {
    seletor.add(new Option(nome, nome));
  });
}

/* O seletor de divisoria nao desenha so a linha: ele RECORTA o mapa. Escolhido
   um CRAS, o painel desenha apenas o que pertence aquele territorio e o resto
   do municipio fica limpo -- fundo e nada mais. "Todos" e "Sem divisorias"
   mostram o municipio inteiro, mudando so a linha.

   O pertencimento vem do campo `cras`, que publicar.py agora grava em setor e
   bairro pela mesma regra de indice.py. No bairro ele pode ser uma LISTA: a
   divisa Califórnia/Industrial passa dentro de Capela Velha, entao o bairro
   pertence aos dois e aparece nos dois recortes. Fingir dono unico ali faria
   Capela Velha sumir justamente dos dois CRAS que trabalham nele. */
function noRecorte(propriedades) {
  if (estado.divisoria === 'nenhuma' || estado.divisoria === 'todos') return true;
  const dono = propriedades.cras;
  return Array.isArray(dono) ? dono.includes(estado.divisoria) : dono === estado.divisoria;
}

function feicoesNoRecorte() {
  return estado.geo[estado.escala].features.filter((f) => noRecorte(f.properties));
}

/* Chip de rótulo por território, no estilo do rótulo de estado num painel de
   apuração: nome e valor pintados na cor da própria classe. Resolve o vaivém
   entre mapa e legenda -- quem olha de longe, numa projeção, não tem como
   cruzar tom de laranja com faixa numérica no rodapé.

   Só na visão de todos os territórios. Recortado num CRAS, oito chips seriam
   sete mentiras sobre o que está na tela; na escala de setor seriam 247 chips
   sobrepostos. */
function desenharRotulos() {
  if (camadaRotulos) { camadaRotulos.remove(); camadaRotulos = null; }
  if (estado.divisoria !== 'todos') return;
  // Na escala de território o chip é 1:1 com o polígono, então vale no uso
  // diário. Na apresentação ele entra por cima da malha de setor, que é o
  // arranjo dos painéis de apuração: a unidade fina pintada e a unidade de
  // gestão nomeada em cima. Na escala de bairro ficaria 8 chips sobre 19
  // polígonos de outro recorte -- rótulo apontando para o que não está ali.
  if (!cinema.ligado && estado.escala !== 'cras') return;

  camadaRotulos = L.layerGroup().addTo(mapa);
  estado.geo.cras.features.forEach((feicao) => {
    const valor = feicao.properties[estado.indicador];
    if (valor === null || valor === undefined) return;
    const fundo = corDe(valor);
    const info = indicadorAtual();
    const chip = `<span class="rot-chip" style="background:${fundo};color:${tintaSobre(fundo)}">`
      + `<b>${feicao.properties.cras.replace('CRAS ', '')}</b>`
      + `<span class="rot-val">${formatar(valor, info.unidade, estado.indicador)}</span></span>`;
    L.marker(L.geoJSON(feicao).getBounds().getCenter(), {
      pane: 'rotulos',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'rot-marcador', html: chip, iconSize: null }),
    }).addTo(camadaRotulos);
  });
}

/* Faixa de apuração: distribui a POPULAÇÃO entre as classes do indicador em
   tela. É a correção que o coroplético sozinho não dá -- no mapa a área manda,
   e os 23 setores rurais cobrem 82% do território com 6% da gente. Aqui cada
   classe ocupa a largura das pessoas que vivem nela.

   Lê as mesmas quebras e as mesmas cores do mapa, via corDe/classeDe: se a
   barra tivesse classificação própria ela acabaria discordando da legenda ao
   lado, que é o pior defeito possível num painel. */
function renderizarApuracao(feicoes, titulo) {
  const quebras = quebrasAtuais();
  const info = indicadorAtual();
  const alvo = document.getElementById('cinema-barra');
  document.getElementById('cinema-apuracao-titulo').textContent = titulo;

  if (ehNominal(info) || !quebras || quebras.length < 2) {
    // Escala nominal não tem classe ordenada para empilhar, e empilhar mesmo
    // assim sugeriria uma progressão que não existe.
    document.getElementById('cinema-apuracao').hidden = true;
    return;
  }
  document.getElementById('cinema-apuracao').hidden = false;

  const faixas = new Map();
  let semDado = 0;
  let total = 0;
  feicoes.forEach((f) => {
    const pop = f.properties.pop || 0;
    total += pop;
    const indice = classeDe(f.properties[estado.indicador], quebras);
    if (indice < 0) { semDado += pop; return; }
    faixas.set(indice, (faixas.get(indice) || 0) + pop);
  });
  const medido = total - semDado;
  if (!medido) { document.getElementById('cinema-apuracao').hidden = true; return; }

  const ordenadas = [...faixas.entries()].sort((a, b) => a[0] - b[0]);
  alvo.innerHTML = ordenadas
    .map(([indice, pop]) => {
      const cor = corDe((quebras[indice] + quebras[indice + 1]) / 2);
      const pct = (pop / medido) * 100;
      const rotulo = `${nf1.format(quebras[indice])}–${nf1.format(quebras[indice + 1])}`;
      // Percentual só na fatia que o comporta. Abaixo disso o número sai
      // cortado pelo overflow, e metade de um algarismo é pior que nenhum --
      // o valor continua no title e no rodapé.
      return `<span class="cinema-fatia" style="color:${tintaSobre(cor)};background:${cor};`
        + `width:${pct}%" title="${rotulo}: ${nf.format(pop)} moradores">`
        + `${pct >= 7 ? `${nf1.format(pct)}%` : ''}</span>`;
    })
    .join('');
  // Reinicia a revelação a cada parada. A largura final já está no markup: o
  // que anima é o recorte do container, não a geometria das fatias.
  alvo.classList.remove('revelando');
  void alvo.offsetWidth;
  alvo.classList.add('revelando');

  // A faixa do rodapé vem NOMEADA. Quatro territórios não têm ninguém na
  // classe crítica, e "na classe mais alta" apontaria para a terceira faixa
  // deles como se fosse a pior do município -- superlativo relativo ao recorte
  // lido como absoluto é o mesmo erro que a narração já teve uma vez.
  const [indiceTopo, popTopo] = ordenadas[ordenadas.length - 1];
  const faixaTopo = `${nf1.format(quebras[indiceTopo])}–${nf1.format(quebras[indiceTopo + 1])}`;
  const ehTopoAbsoluto = indiceTopo === quebras.length - 2;
  document.getElementById('cinema-apuracao-pe').innerHTML =
    `<span>Moradores medidos <b>${nf.format(medido)}</b></span>`
    + `<span>${ehTopoAbsoluto ? 'Na classe mais alta' : 'Na faixa mais alta presente'} `
    + `(${faixaTopo}) <b>${nf.format(popTopo)}</b> `
    + `(${nf1.format((popTopo / medido) * 100)}%)</span>`
    + (semDado ? `<span>Em setor sem valor publicável <b>${nf.format(semDado)}</b></span>` : '');
}

function trocarDivisoria(valor) {
  estado.divisoria = valor;

  // A ficha lateral pode estar aberta num setor que acabou de sair do recorte.
  const chave = ESCALAS[estado.escala].chave;
  if (estado.selecionado
      && !feicoesNoRecorte().some((f) => f.properties[chave] === estado.selecionado)) {
    estado.selecionado = null;
  }

  // setStyle em vez de desenharDados: a geometria não mudou, só quem aparece.
  camadaDados.setStyle(estiloFeicao);
  camadaDados.bringToFront();
  desenharDivisorias();
  desenharRotulos();
  if (camadaUnidades) camadaUnidades.bringToFront();
  aplicarCalor();
  // Ficha lateral e tabela estão fora da tela em modo apresentação -- redesenhar
  // os dois a cada parada era trabalho invisível, oito vezes.
  if (!cinema.ligado) {
    renderizarDetalhe();
    destacarLinhaTabela();
  }

  // Enquadra so ao ENTRAR num territorio: recortado para um CRAS no zoom do
  // municipio o leitor veria uma mancha de selo postal cercada de vazio.
  // Voltar para todos/sem nao reenquadra -- tirar o zoom de quem estava
  // examinando uma quadra seria pior que manter o enquadramento apertado.
  if (valor !== 'nenhuma' && valor !== 'todos') {
    const alvo = estado.geo.cras.features.find((f) => f.properties.cras === valor);
    if (alvo) ajustarQuadro(L.geoJSON(alvo).getBounds(), { padding: [12, 12] });
  }
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
    // Classe própria nos polígonos de dado. A cascata de entrada era endereçada
    // a .leaflet-interactive, que pega também os 224 traços de hidrografia e os
    // marcadores de unidade: 480 elementos animando onde 247 bastam, e a
    // hidrografia nem deveria cascatear -- rio não tem classe de índice.
    className: 'feicao-dado',
    onEachFeature: (feicao, camada) => {
      // Na apresentação não se passa o mouse nem se clica no mapa: o controle
      // é teclado e temporizador. Montar 247 tooltips e 247 ouvintes de clique
      // a cada parada era trabalho jogado fora oito vezes seguidas, e é parte
      // do engasgo na virada.
      if (cinema.ligado) return;
      const propriedades = feicao.properties;
      const info = indicadorAtual();
      camada.bindTooltip(
        `<span class="tt-nome">${rotuloFeicao(propriedades)}</span>` +
        `${info.rotulo}: <span class="tt-val">${formatar(propriedades[estado.indicador], info.unidade, estado.indicador)}</span>`,
        { className: 'tt-mapa', sticky: true }
      );
      // A feição fora do recorte continua no DOM, apenas transparente: sem esta
      // guarda um clique no vazio selecionaria um setor que não está na tela.
      camada.on('click', () => { if (noRecorte(propriedades)) selecionar(propriedades[chave]); });
    },
  }).addTo(mapa);

  if (estado.camadas.hidrografia && document.getElementById('cam-hidro').checked) {
    estado.camadas.hidrografia.addTo(mapa);
  }
  if (camadaUnidades && document.getElementById('cam-unidades').checked) camadaUnidades.addTo(mapa);
  escalonarEntrada();
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
  if (quadro === 'urbano') ajustarQuadro(painel.enquadramento_urbano, { padding: [20, 20] });
  else ajustarQuadro(L.geoJSON(estado.geo.limite).getBounds(), { padding: [12, 12] });
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
  desenharDivisorias();
  desenharRotulos();
  // Com recorte ativo o quadro segue o territorio, nao o padrao da escala:
  // voltar para o municipio inteiro desfaria o recorte que o leitor acabou de
  // pedir, so porque ele trocou de setor para bairro.
  const alvo = estado.geo.cras.features.find((f) => f.properties.cras === estado.divisoria);
  if (alvo) ajustarQuadro(L.geoJSON(alvo).getBounds(), { padding: [12, 12] });
  else enquadrar(QUADRO_POR_ESCALA[escala] || 'municipio');
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
  desenharRotulos();
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
  document.getElementById('seletor-divisoria')
    .addEventListener('change', (e) => trocarDivisoria(e.target.value));

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
  ligarCinema();
  preCarregarCena();
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

const ICONE_TOCAR = `<path d="M232,128a15.76,15.76,0,0,1-7.86,13.57L88.27,222.79A15.94,15.94,0,0,1,64,209.22V46.78A15.94,15.94,0,0,1,88.27,33.21l135.87,81.22A15.76,15.76,0,0,1,232,128Z"/>`;
const ICONE_PAUSAR = `<path d="M216,48V208a16,16,0,0,1-16,16H164a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h36A16,16,0,0,1,216,48ZM92,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H92a16,16,0,0,0,16-16V48A16,16,0,0,0,92,32Z"/>`;

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
    // Durante a apresentação o Esc é dela: sairDoCinema desmaximiza no fim.
    // Sem esta guarda os dois ouvintes disputam a mesma tecla e o resultado
    // passa a depender da ordem de registro.
    if (evento.key === 'Escape' && maximizado() && !cinema.ligado) alternarMaximizar();
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement || !maximizado()) return;
    // Esc consumido pelo navegador: sem isto a apresentação continuava rodando
    // por cima do mapa já restaurado ao tamanho pequeno.
    if (cinema.ligado) encerrarCinema();
    aplicarMaximizacao(false);
  });
}

/* ------------------------------------------------------------ cena 3D -- */
/* Abertura da apresentação em relevo: os setores viram prismas com altura
   proporcional ao indicador e a câmera orbita a malha urbana, inclinada.

   Por que um segundo motor de mapa. O Leaflet é 2D por construção -- não tem
   pitch nem bearing, e não existe truque de CSS que lhe dê relevo de verdade:
   inclinar o container inclina um plano, e prisma exige geometria. O MapLibre
   desenha em WebGL e faz extrusão nativa (`fill-extrusion`), então a órbita
   custa menos ao navegador do que o nosso coroplético em SVG custa hoje.

   Por que não trocar o painel inteiro para MapLibre: o Leaflet entrega um nó de
   DOM por feição, e é isso que sustenta anel de foco por teclado e rótulo
   acessível em cada setor. Em WebGL tudo isso teria de ser reconstruído à mão.
   A cena 3D não precisa disso -- ninguém tabula por 247 prismas -- então ela
   fica onde serve e o painel de trabalho continua onde funciona.

   O download só acontece se a apresentação for usada. São ~200 KB comprimidos
   que não têm por que pesar em quem abre o painel para consultar um setor. */
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
// Altura do prisma na classe mais alta. Começou em 2.200 m e isso era errado
// por uma razão simples de escala: setor urbano tem 300 a 800 m de largura, e
// 2.200 m de altura sobre 500 m de base é proporção de arranha-céu -- um único
// prisma tapava metade da cidade e a órbita virava um passeio entre torres. Em
// 700 m o setor mais alto fica na proporção de uma quadra deitada em pé, que
// com 58 graus de inclinação já se lê como relevo sem engolir a vizinhança.
const CENA_ALTURA_MAX_M = 700;
const CENA_PITCH = 58;            // inclinação da câmera, em graus
const CENA_GIRO_MS = 15000;       // uma volta completa

let cena3d = null;
let cenaPromessa = null;

function carregarMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (cenaPromessa) return cenaPromessa;
  cenaPromessa = new Promise((resolve, reject) => {
    const folha = document.createElement('link');
    folha.rel = 'stylesheet';
    folha.href = MAPLIBRE_CSS;
    document.head.appendChild(folha);
    const script = document.createElement('script');
    script.src = MAPLIBRE_JS;
    script.crossOrigin = '';
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => reject(new Error('MapLibre não carregou'));
    document.head.appendChild(script);
  });
  return cenaPromessa;
}

/* Altura do prisma. Normalizada pelo MAIOR valor do indicador na malha, não por
   um teto fixo: indicador em pontos (0 a 65) e indicador em porcentagem (0 a
   100) produziriam relevos de escala incomparável com a mesma fórmula. O que o
   relevo comunica é hierarquia relativa, e a legenda com o corte numérico
   continua ao lado para quem precisar do valor. */
function geometriaDaCena() {
  // estado.geo é indexado pela ESCALA ('setor', 'bairro', 'cras'), não pelo
  // nome do arquivo de origem -- ver o mapa `nomes` em carregar().
  const feicoes = estado.geo.setor.features;
  const valores = feicoes
    .map((f) => f.properties[estado.indicador])
    .filter((v) => typeof v === 'number');
  const maximo = Math.max(...valores, 1);
  return {
    type: 'FeatureCollection',
    features: feicoes
      .filter((f) => typeof f.properties[estado.indicador] === 'number')
      .map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          cor: corDe(f.properties[estado.indicador]),
          altura: (f.properties[estado.indicador] / maximo) * CENA_ALTURA_MAX_M,
        },
      })),
  };
}

function montarCena(maplibregl) {
  const [[sulLat, oesteLon], [norteLat, lesteLon]] = painel.enquadramento_urbano;
  cena3d = new maplibregl.Map({
    container: 'cena3d',
    // Estilo mínimo próprio: nenhum provedor de basemap vetorial é consumido
    // aqui. O fundo é o mesmo satélite Esri que o painel já cita na barra de
    // procedência, e nada mais entra -- sem rótulo de terceiro na tela.
    style: {
      version: 8,
      sources: {
        satelite: {
          type: 'raster',
          // Mesma URL do fundo de satélite do painel, sem adaptação: o Esri
          // serve z/linha/coluna e os dois motores substituem o marcador onde
          // ele está, então {z}/{y}/{x} vale igual no Leaflet e no MapLibre.
          tiles: [FUNDOS.satelite.claro],
          tileSize: 256,
          maxzoom: ZOOM_NATIVO_GLOBAL,
          attribution: FUNDOS.satelite.opcoes.attribution,
        },
      },
      layers: [
        { id: 'fundo', type: 'background', paint: { 'background-color': token('--map-fundo') } },
        { id: 'satelite', type: 'raster', source: 'satelite' },
      ],
    },
    center: [(oesteLon + lesteLon) / 2, (sulLat + norteLat) / 2],
    zoom: 11.2,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    interactive: false,
    canvasContextAttributes: { antialias: false },   // MSAA não paga o custo em órbita
  });
  return new Promise((resolve) => cena3d.on('load', resolve));
}

function pintarCena() {
  if (cena3d.getLayer('setores3d')) cena3d.removeLayer('setores3d');
  if (cena3d.getSource('setores')) cena3d.removeSource('setores');
  cena3d.addSource('setores', { type: 'geojson', data: geometriaDaCena() });
  cena3d.addLayer({
    id: 'setores3d',
    type: 'fill-extrusion',
    source: 'setores',
    paint: {
      'fill-extrusion-color': ['get', 'cor'],
      'fill-extrusion-height': ['get', 'altura'],
      'fill-extrusion-base': 0,
      // 0,92 e não 1: a aresta onde dois prismas se encostam fica visível, e é
      // ela que impede a malha de virar um bloco maciço quando vizinhos caem na
      // mesma classe. Opaco demais apaga a densidade; translúcido demais deixa
      // ver através de três quadras e confunde a leitura de altura.
      'fill-extrusion-opacity': 0.92,
      // Degradê vertical DESLIGADO. Ele é bonito e custa por fragmento: com 220
      // prismas em órbita, numa máquina sem GPU dedicada vira o maior item da
      // conta. A aresta entre prismas vizinhos já separa a malha sem ele.
      'fill-extrusion-vertical-gradient': false,
    },
  });
}

/* Guarda de desempenho. A sala de reunião pode ter um notebook com vídeo
   integrado, e a órbita precisa parecer boa lá ou não serve para nada. Em vez
   de apostar na GPU, a cena MEDE os próprios quadros: se a média dos primeiros
   não sustentar uma animação decente, ela se desliga sozinha e a apresentação
   segue em 2D, que é liso em qualquer máquina.
   40 ms é o corte -- 25 quadros por segundo. Abaixo disso o giro não parece
   câmera, parece defeito, e defeito é pior que não ter o recurso. */
const CENA_QUADRO_LIMITE_MS = 40;
const CENA_AMOSTRA_QUADROS = 20;

function cenaAguentaOrbitar(amostra) {
  if (amostra.length < CENA_AMOSTRA_QUADROS) return null;   // ainda medindo
  const media = amostra.reduce((a, b) => a + b, 0) / amostra.length;
  return media <= CENA_QUADRO_LIMITE_MS;
}

/* A órbita. Um único requestAnimationFrame governando bearing e pitch: o
   easeTo do MapLibre encadeado produziria paradas entre trechos, e parada no
   meio de um giro parece travamento, não pausa. */
function orbitar(inicio, amostra = [], ultimo = performance.now()) {
  if (!cinema.ligado || cinema.roteiro[cinema.parada].tipo !== 'municipio') return;
  const agora = performance.now();

  // Mede, decide uma vez, e nunca mais mede: a verificação não pode virar ela
  // própria um custo por quadro.
  if (amostra.length <= CENA_AMOSTRA_QUADROS) {
    amostra.push(agora - ultimo);
    const aguenta = cenaAguentaOrbitar(amostra);
    if (aguenta === false) {
      const media = Math.round(amostra.reduce((a, b) => a + b, 0) / amostra.length);
      console.warn(`cena 3D a ${media} ms por quadro: desligando e seguindo em 2D`);
      cinema.sem3d = true;
      fecharCena3d();
      return;
    }
  }

  const t = Math.min((agora - inicio) / CENA_GIRO_MS, 1);
  // Entrada da câmera concentrada no primeiro terço: ela levanta e aproxima
  // enquanto já está girando, em vez de fazer as duas coisas em sequência.
  const entrada = Math.min(t / 0.33, 1);
  const suave = 1 - (1 - entrada) ** 3;
  cena3d.jumpTo({
    bearing: t * 360,
    pitch: CENA_PITCH * suave,
    // Chega em 12,4 e não em 13,1: no zoom mais fechado a câmera entrava dentro
    // da malha e perdia a cidade de vista. A aproximação tem que deixar ver o
    // conjunto -- é dele que a apresentação está falando.
    zoom: 11.0 + 1.4 * suave,
  });
  if (t < 1) requestAnimationFrame(() => orbitar(inicio, amostra, agora));
}

async function abrirCena3d() {
  const painelCena = document.getElementById('cena3d');
  // Reprovada na medição uma vez, não se tenta de novo na mesma sessão: repetir
  // o teste a cada apresentação é repetir o engasgo que ele existe para evitar.
  if (cinema.sem3d) return false;
  try {
    const maplibregl = await carregarMapLibre();
    if (!cinema.ligado) return false;
    const precisaPintar = !cena3d;
    if (!cena3d) await montarCena(maplibregl);
    // O MapLibre mede o container no construtor, e nessa hora o bloco do mapa
    // ainda está no layout de duas colunas -- a maximização acabou de ser
    // pedida e o navegador não repintou. Sem este resize o canvas nasce com a
    // largura antiga e a cena aparece espremida num terço da tela.
    cena3d.resize();
    // A pré-carga normalmente já pintou. Repintar aqui refaria o trabalho caro
    // justo no quadro do clique, que é o que se quer evitar.
    if (precisaPintar || !cena3d.getLayer('setores3d')) pintarCena();
    painelCena.classList.add('visivel');
    orbitar(performance.now());
    return true;
  } catch (erro) {
    // Rede ruim ou WebGL indisponível não podem derrubar a apresentação: ela
    // segue em 2D, que é o que já funcionava.
    console.warn('cena 3D indisponível, seguindo em 2D:', erro.message);
    painelCena.classList.remove('visivel');
    return false;
  }
}

function fecharCena3d() {
  const painelCena = document.getElementById('cena3d');
  if (painelCena) painelCena.classList.remove('visivel');
}

/* ------------------------------------------------ apresentação conduzida -- */
/* O mapa percorre os 8 territórios sozinho, do mais vulnerável ao menos, e
   narra cada um com número que veio da base. Existe para sala de reunião: lá
   ninguém opera o mouse, e a janela de atenção de quem decide orçamento é de
   um minuto, não de uma tarde de exploração.

   O que NÃO entra aqui, e a recusa é deliberada: partícula, brilho, parallax,
   gradiente animado, número girando sem razão. Tudo isso é barato de escrever
   e deprecia o dado -- em cima de indicador do SUAS, efeito decorativo diz que
   a Vigilância tinha tempo sobrando. Todo movimento desta camada carrega
   informação: o voo é a mudança de território, a cascata é a hierarquia do
   índice se formando, a trilha é o relógio e o sumário. */
const CINEMA_PARADA_MS = 9000;
const CINEMA_PARADA_CALMA_MS = 13000;  // sem movimento, a leitura é só texto

function movimentoReduzido() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* A abertura dura o giro inteiro mais um respiro. Cortar a órbita no meio para
   entrar no primeiro território é pior que não ter órbita: o movimento fica
   sem resolução e parece defeito. Com movimento reduzido não há órbita, então
   a abertura volta ao tempo das outras paradas. */
function duracaoDaParada() {
  if (movimentoReduzido()) return CINEMA_PARADA_CALMA_MS;
  const parada = cinema.roteiro[cinema.parada];
  if (parada && parada.tipo === 'municipio') return CENA_GIRO_MS + 1500;
  return CINEMA_PARADA_MS;
}

const cinema = { ligado: false, parada: 0, pausado: false, relogio: null, roteiro: [], sem3d: false };

/* Posto do território no indicador, em palavra. A primeira versão destas frases
   afirmava superlativo direto ("a maior do município") a partir do escore
   padronizado, e isso era FALSO: o escore diz que o território se destaca, não
   que ele é o extremo. O CRAS Thomaz Coelho saía narrado como "a menor
   cobertura do município" com o Fazenda Velha abaixo dele. Afirmação errada
   num painel apresentado a quem decide orçamento custa mais que a apresentação
   inteira -- agora o superlativo só aparece quando o posto é de fato o 1º. */
function posto(ranque, palavra) {
  return ranque === 1 ? `a ${palavra}` : `a ${ranque}ª ${palavra}`;
}

/* Leituras candidatas para a frase de destaque. `direcao` diz de que lado está
   a notícia: +1 quando valor alto é o que chama atenção, -1 quando é o baixo
   (cobertura e alcance de rede são oferta -- ali o problema é faltar). */
const LEITURAS_CINEMA = [
  {
    campo: 'amplitude_interna', direcao: 1,
    frase: (c, r) => `A média esconde o território: dentro dele o índice vai de `
      + `${nf1.format(c.ivt_min)} a ${nf1.format(c.ivt_max)} — `
      + `${nf1.format(c.amplitude_interna)} pontos entre o setor em melhor e em pior situação, `
      + `${posto(r, 'maior')} desigualdade interna entre os oito territórios.`,
  },
  {
    campo: 'pct_extrema_pobreza', direcao: 1,
    frase: (c, r) => `${nf1.format(c.pct_extrema_pobreza)}% das famílias cadastradas vivem com até `
      + `R$ 218 por pessoa: ${posto(r, 'maior')} concentração de extrema pobreza entre os territórios.`,
  },
  {
    campo: 'cobertura_cadunico', direcao: -1,
    // A sentença sobre família não conhecida só entra nos dois primeiros postos.
    // Ela vale aritmeticamente para qualquer cobertura abaixo de 100%, mas dita
    // sobre um 4º lugar empresta ao dado um peso que ele não tem.
    frase: (c, r) => `O Cadastro Único alcança ${nf1.format(c.cobertura_cadunico)}% da população daqui `
      + `— ${posto(r, 'menor')} cobertura do município.`
      + (r <= 2 ? ' Há família elegível que o SUAS ainda não conhece.' : ''),
  },
  {
    campo: 'pct_moradia_precaria', direcao: 1,
    frase: (c, r) => `${nf1.format(c.pct_moradia_precaria)}% das famílias cadastradas estão em domicílio `
      + `sem água de rede, esgoto ou coleta de lixo: ${posto(r, 'maior')} proporção do município.`,
  },
  {
    campo: 'pct_monoparental_feminina', direcao: 1,
    frase: (c, r) => `${nf1.format(c.pct_monoparental_feminina)}% das famílias são monoparentais `
      + `chefiadas por mulher, ${posto(r, 'maior')} proporção do município — perfil que concentra `
      + `demanda de creche e de acompanhamento PAIF.`,
  },
  {
    campo: 'alcance_rede', direcao: -1,
    // "é onde a oferta chega menos" afirmava mínimo e contradizia o próprio
    // ordinal que vinha antes na mesma frase. O posto já diz a posição; o resto
    // da sentença agora explica o que a medida é, não repete a classificação.
    frase: (c, r) => `Alcance da rede em ${nf1.format(c.alcance_rede)} — ${posto(r, 'menor')} do `
      + `município. Mede acompanhamento PAIF e cobertura cadastral: é o eixo de oferta, `
      + `o que a rede entrega, e não o risco que a população vive.`,
  },
];

/* Escolhe, para cada território, a leitura em que ele MAIS se afasta dos outros
   sete. É o que torna a apresentação defensável: nenhuma frase foi escrita para
   um CRAS específico -- o destaque é calculado, e muda sozinho quando a base
   muda. Escore padronizado sobre n=8 serve para ordenar relevância entre
   candidatas, não para inferência; por isso a frase sempre vem acompanhada do
   número que a sustenta. */
function destaqueDoTerritorio(alvo) {
  let melhor = null;
  LEITURAS_CINEMA.forEach((leitura) => {
    const valores = painel.cras.map((c) => c[leitura.campo]).filter((v) => typeof v === 'number');
    if (valores.length < 3 || typeof alvo[leitura.campo] !== 'number') return;
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const desvio = Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length);
    if (!desvio) return;
    const escore = ((alvo[leitura.campo] - media) / desvio) * leitura.direcao;
    // Posto no indicador, medido e não deduzido do escore. Ordenado pelo lado
    // que a leitura trata: direcao -1 ordena crescente, porque ali o 1o lugar
    // e o MENOR valor.
    const ranque = valores
      .slice()
      .sort((a, b) => (leitura.direcao > 0 ? b - a : a - b))
      .indexOf(alvo[leitura.campo]) + 1;
    if (!melhor || escore > melhor.escore) melhor = { escore, leitura, ranque };
  });
  // Corte em 0,8 desvio. Em 0,4 o Thomaz Coelho passava com 0,41 e recebia uma
  // frase de destaque para um desvio que não existe -- narrar como notável algo
  // que está na média é o começo do dado inflado. Abaixo do corte, a frase de
  // reserva diz justamente isso: aqui nada se descola.
  return melhor && melhor.escore > 0.8 ? melhor.leitura.frase(alvo, melhor.ranque) : null;
}

/* Primeira parada: o município inteiro. Entrar direto no território mais
   vulnerável tiraria a referência de quem assiste -- sem o todo antes, "32,4"
   não quer dizer nada. Aqui a faixa de apuração mostra como a população se
   reparte entre as classes e os oito chips nomeiam os territórios no mapa. */
function paradaDeAbertura() {
  const critico = painel.cras.reduce((a, b) => ((b.ivt || 0) > (a.ivt || 0) ? b : a));
  return {
    tipo: 'municipio',
    posicao: 0,
    titulo: painel.municipio,
    ordem: `Visão geral · ${painel.cras.length} territórios de CRAS`,
    // Mesma quantidade de KPIs das paradas de território, de propósito: o grid
    // mantém a altura e o cartão não salta de tamanho ao virar a parada.
    kpis: [
      { rotulo: 'Moradores (Censo 2022)', valor: painel.populacao_censo_2022, fmt: (v) => nf.format(Math.round(v)) },
      { rotulo: 'Pessoas no CadÚnico', valor: painel.pessoas_cadunico, fmt: (v) => nf.format(Math.round(v)) },
      { rotulo: 'Famílias no CadÚnico', valor: painel.familias_cadunico, fmt: (v) => nf.format(Math.round(v)) },
      { rotulo: 'Cobertura cadastral', valor: (painel.pessoas_cadunico / painel.populacao_censo_2022) * 100, fmt: (v) => `${nf1.format(v)}%` },
      { rotulo: 'Domicílios (Censo 2022)', valor: painel.domicilios_censo_2022, fmt: (v) => nf.format(Math.round(v)) },
      { rotulo: 'Setores censitários', valor: painel.cras.reduce((s, c) => s + (c.setores || 0), 0), fmt: (v) => nf.format(Math.round(v)) },
    ],
    leitura: `${nf1.format((painel.pessoas_cadunico / painel.populacao_censo_2022) * 100)}% da população `
      + `está no Cadastro Único. O índice é calculado por setor censitário e agregado daqui para cima — `
      + `o território mais vulnerável é ${critico.cras.replace('CRAS ', '')}, e é por ele que começamos.`,
  };
}

function montarRoteiro() {
  const territorios = painel.cras
    .slice()
    .sort((a, b) => (b.ivt || 0) - (a.ivt || 0))
    .map((c, i) => ({
      tipo: 'territorio',
      dados: c,
      posicao: i + 1,
      titulo: c.cras,
      ordem: `${i + 1}º de ${painel.cras.length} em vulnerabilidade`,
      // Pessoas e famílias no CadÚnico aparecem juntas porque respondem a
      // perguntas diferentes: família é a unidade do benefício e do
      // acompanhamento, pessoa é quem está coberto. Só famílias deixava sem
      // resposta "quanta gente da cidade o SUAS conhece aqui", e é essa que se
      // compara com a população do Censo -- a cobertura sai dessa razão.
      kpis: [
        { rotulo: 'Índice de vulnerabilidade', valor: c.ivt, fmt: (v) => nf1.format(v) },
        { rotulo: 'Moradores (Censo 2022)', valor: c.pop, fmt: (v) => nf.format(Math.round(v)) },
        { rotulo: 'Pessoas no CadÚnico', valor: c.pessoas_cad, fmt: (v) => nf.format(Math.round(v)) },
        { rotulo: 'Famílias no CadÚnico', valor: c.familias_cad, fmt: (v) => nf.format(Math.round(v)) },
        { rotulo: 'Cobertura cadastral', valor: c.cobertura_cadunico, fmt: (v) => `${nf1.format(v)}%` },
        { rotulo: 'Em extrema pobreza', valor: c.pct_extrema_pobreza, fmt: (v) => `${nf1.format(v)}%` },
      ],
      leitura: destaqueDoTerritorio(c)
        || `${nf.format(c.setores)} setores censitários e ${nf.format(c.pop)} moradores sob referência `
           + `de uma única unidade. Nenhum indicador de risco se descola da média municipal aqui — `
           + `é território de acompanhamento regular, não de prioridade imediata.`,
    }));
  return [paradaDeAbertura(), ...territorios];
}

function montarTrilha() {
  const trilha = document.getElementById('cinema-trilha');
  trilha.innerHTML = cinema.roteiro
    .map(() => '<span class="cinema-passo"><span class="cinema-pulso"></span></span>')
    .join('');
}

/* Contagem do número até o valor final. Vale a pena porque a cifra fica legível
   durante a subida (tabular-nums, sem reflow) e porque dá ao olho tempo de
   chegar nela antes de ela parar -- numa projeção, número que aparece pronto
   não é lido. Com movimento reduzido, entra direto no valor. */
function animarNumero(elemento, ate, formatar) {
  if (movimentoReduzido() || !Number.isFinite(ate)) {
    elemento.textContent = formatar(ate);
    return;
  }
  const inicio = performance.now();
  const dura = 900;
  const passo = (agora) => {
    const t = Math.min((agora - inicio) / dura, 1);
    const suave = 1 - (1 - t) ** 3;
    elemento.textContent = formatar(ate * suave);
    if (t < 1 && cinema.ligado) requestAnimationFrame(passo);
    else elemento.textContent = formatar(ate);
  };
  requestAnimationFrame(passo);
}

function preencherCartao(parada) {
  document.getElementById('cinema-ordem').textContent = parada.ordem;
  document.getElementById('cinema-nome').textContent = parada.titulo;
  document.getElementById('cinema-leitura').textContent = parada.leitura;

  const kpis = parada.kpis;
  // O valor que sobe fica fora da árvore de acessibilidade e um gêmeo invisível
  // carrega o número já pronto. O cartão é role="status": sem essa separação o
  // leitor de tela anunciaria cada quadro da contagem.
  const caixa = document.getElementById('cinema-kpis');
  caixa.innerHTML = kpis
    .map((k) => '<div><span class="cinema-kpi-valor" aria-hidden="true"></span>'
      + `<span class="sr-so">${k.rotulo}: ${k.fmt(k.valor)}</span>`
      + `<span class="cinema-kpi-rotulo" aria-hidden="true">${k.rotulo}</span></div>`)
    .join('');
  caixa.querySelectorAll('.cinema-kpi-valor').forEach((el, i) => {
    animarNumero(el, kpis[i].valor, kpis[i].fmt);
  });

  const cartao = document.getElementById('cinema-cartao');
  cartao.classList.remove('entrando');
  void cartao.offsetWidth;  // reinicia a animação na parada seguinte
  cartao.classList.add('entrando');
}

function marcarTrilha() {
  const passos = document.querySelectorAll('.cinema-passo');
  passos.forEach((passo, i) => {
    passo.classList.toggle('vista', i < cinema.parada);
    passo.classList.toggle('atual', i === cinema.parada);
    const pulso = passo.querySelector('.cinema-pulso');
    if (i === cinema.parada) {
      pulso.style.animationDuration = `${duracaoDaParada()}ms`;
      pulso.style.animation = 'none';
      void pulso.offsetWidth;
      pulso.style.animation = '';
    }
  });
}

function irParaParada(indice) {
  cinema.parada = (indice + cinema.roteiro.length) % cinema.roteiro.length;
  const parada = cinema.roteiro[cinema.parada];
  const destino = parada.tipo === 'municipio' ? 'todos' : parada.dados.cras;

  document.getElementById('seletor-divisoria').value = destino;
  trocarDivisoria(destino);
  // trocarDivisoria só reenquadra ao ENTRAR num território; a abertura precisa
  // pedir o município por conta própria.
  if (parada.tipo === 'municipio') {
    enquadrar('municipio');
    abrirCena3d();
  } else {
    fecharCena3d();
  }

  preencherCartao(parada);
  renderizarApuracao(
    feicoesNoRecorte(),
    parada.tipo === 'municipio'
      ? `Moradores por classe — ${indicadorAtual().rotulo}`
      : `Moradores por classe em ${parada.titulo.replace('CRAS ', '')}`
  );
  marcarTrilha();
  agendarProximaParada();
}

function agendarProximaParada() {
  clearTimeout(cinema.relogio);
  if (!cinema.ligado || cinema.pausado) return;
  cinema.relogio = setTimeout(() => irParaParada(cinema.parada + 1), duracaoDaParada());
}

function pausarCinema(pausar) {
  cinema.pausado = pausar;
  document.getElementById('cinema').classList.toggle('pausado', pausar);
  document.getElementById('botao-cinema').setAttribute('aria-pressed', String(!pausar));
  document.getElementById('icone-cinema').innerHTML = pausar ? ICONE_TOCAR : ICONE_PAUSAR;
  if (pausar) clearTimeout(cinema.relogio);
  else agendarProximaParada();
}

function entrarNoCinema() {
  cinema.ligado = true;
  cinema.pausado = false;
  cinema.roteiro = montarRoteiro();
  montarTrilha();
  document.getElementById('cinema').hidden = false;
  document.getElementById('mapa-bloco').classList.add('apresentando');
  // O botão vira pausa assim que a apresentação começa. Sem isto ele ficava
  // mostrando "tocar" com a apresentação em curso, e o aria-pressed mentia.
  document.getElementById('botao-cinema').setAttribute('aria-pressed', 'true');
  document.getElementById('icone-cinema').innerHTML = ICONE_PAUSAR;
  trocarFundo(estado.fundo);   // recria o fundo já com updateWhenIdle ligado
  escalonarEntrada();
  if (!maximizado()) alternarMaximizar();
  // Dois quadros: o maximizar remede o container, e só depois o voo tem
  // destino certo. Enquadrar antes mandaria o mapa para o quadro antigo.
  requestAnimationFrame(() => requestAnimationFrame(() => irParaParada(0)));
}

/* Desliga só a camada da apresentação, sem tocar no quadro nem na maximização.
   Separado de sairDoCinema porque o navegador tem o próprio caminho de saída:
   na tela cheia nativa o Esc é consumido por ele, que avisa por
   fullscreenchange. Nesse caminho a apresentação precisa parar sem tentar
   desmaximizar de novo -- isso já aconteceu -- e sem reenquadrar por cima de
   uma transição de layout que ainda está em curso. */
function encerrarCinema() {
  clearTimeout(cinema.relogio);
  cinema.ligado = false;
  cinema.pausado = false;
  const camada = document.getElementById('cinema');
  camada.hidden = true;
  camada.classList.remove('pausado');
  document.getElementById('mapa-bloco').classList.remove('apresentando');
  document.getElementById('botao-cinema').setAttribute('aria-pressed', 'false');
  document.getElementById('icone-cinema').innerHTML = ICONE_TOCAR;
  fecharCena3d();
  trocarFundo(estado.fundo);   // devolve o fundo ao comportamento de trabalho
  // Os chips são da apresentação (salvo na escala de território, onde valem
  // sozinhos). Sem este redesenho eles ficavam na tela depois do Esc.
  desenharRotulos();
}

function sairDoCinema() {
  encerrarCinema();
  document.getElementById('seletor-divisoria').value = 'todos';
  trocarDivisoria('todos');
  enquadrar('municipio');
  if (maximizado()) alternarMaximizar();
}

/* Pré-carga do MapLibre em tempo ocioso. Medido com PerformanceObserver: o
   download e a compilação dos 275 KB custavam 2,5 s de tarefa longa, e ela caía
   exatamente nos primeiros 500 ms depois do clique no play -- no quadro em que
   a sala inteira está olhando. Somada à montagem do contexto WebGL davam 4,9 s
   de engasgo concentrados na abertura, enquanto as oito paradas de território
   somavam 114 ms: o voo nunca foi o problema.

   requestIdleCallback entrega isso quando a thread está livre, muito antes de
   alguém apertar o play. O hover é a segunda rede: quem mira o botão antes de a
   ociosidade acontecer já dispara a carga. Quem nunca abre a apresentação numa
   sessão curta segue sem baixar nada. */
async function preCarregarCena() {
  const pedir = window.requestIdleCallback || ((fn) => setTimeout(fn, 4000));
  pedir(async () => {
    try {
      const maplibregl = await carregarMapLibre();
      // Monta e pinta já aqui, não no play. Medido: a criação do contexto WebGL
      // mais a compilação dos shaders custava mais do que o download, e caía no
      // clique. Parado, o MapLibre não repinta -- ele só desenha quando a
      // câmera muda ou chega tile --, então uma cena montada e imóvel atrás de
      // um container transparente custa memória e nada de CPU.
      if (!cena3d) await montarCena(maplibregl);
      pintarCena();
    } catch (erro) {
      console.warn('cena 3D não pôde ser preparada, a apresentação seguirá em 2D:', erro.message);
    }
  }, { timeout: 10000 });
}

function ligarCinema() {
  const botao = document.getElementById('botao-cinema');
  ['pointerenter', 'focus'].forEach((evento) => {
    botao.addEventListener(evento, () => carregarMapLibre().catch(() => {}), { once: true });
  });

  document.getElementById('botao-cinema').addEventListener('click', () => {
    if (!cinema.ligado) entrarNoCinema();
    else pausarCinema(!cinema.pausado);
  });

  document.addEventListener('keydown', (evento) => {
    if (!cinema.ligado) return;
    // Teclado só responde fora de campo de formulário: o apresentador costuma
    // usar controle remoto, que manda seta e espaço exatamente como o teclado.
    if (evento.target.closest('input, select, textarea')) return;
    const atalhos = {
      ' ': () => pausarCinema(!cinema.pausado),
      ArrowRight: () => irParaParada(cinema.parada + 1),
      ArrowLeft: () => irParaParada(cinema.parada - 1),
      Escape: sairDoCinema,
    };
    const acao = atalhos[evento.key];
    if (!acao) return;
    evento.preventDefault();
    acao();
  });
}

/* Cascata de entrada do coroplético: o setor de índice mais alto acende
   primeiro e a onda desce a rampa. Não é enfeite -- é a hierarquia se formando
   diante de quem assiste, em vez de um mapa pronto onde o olho tem que
   procurar sozinho onde está o pior. Só roda em apresentação; no uso diário,
   quem abre o painel quer o mapa já desenhado. */
/* Cascata de entrada, UMA vez por apresentação. Antes ela era refeita a cada
   parada, e isso deixou de ser possível quando os paths passaram a persistir
   entre recortes -- a animação CSS dispara na entrada da classe, não a cada
   setStyle. A perda é só aparente: a mesma cascata nove vezes seguidas vira
   tique; uma vez, na abertura, é o gesto que ela sempre quis ser. */
function escalonarEntrada() {
  if (!cinema.ligado || movimentoReduzido() || !camadaDados) return;
  const feicoes = camadaDados.getLayers()
    .filter((camada) => typeof camada.getElement === 'function' && camada.getElement());

  feicoes.sort((a, b) =>
    (b.feature.properties[estado.indicador] || 0) - (a.feature.properties[estado.indicador] || 0));
  // Janela fixa de 700ms, dividida pelo número de feições: a cascata leva o
  // mesmo tempo seja qual for a escala em tela.
  const passo = feicoes.length > 1 ? 700 / feicoes.length : 0;
  feicoes.forEach((camada, i) => {
    camada.getElement().style.animationDelay = `${Math.round(i * passo)}ms`;
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
  // Antes de trocarFundo: ele ja chama desenharDivisorias, e a lista precisa
  // existir antes de qualquer leitura do seletor.
  preencherDivisorias();
  trocarFundo(estado.fundo);
  desenharContexto();
  desenharHidrografia();
  desenharUnidades();
  desenharDados();
  ajustarQuadro(L.geoJSON(estado.geo.limite).getBounds(), { padding: [12, 12] });
  if (document.getElementById('cam-hidro').checked) estado.camadas.hidrografia.addTo(mapa);
  camadaDados.bringToFront();

  ligarControles();
  // Sem await: a sonda e uma ida a rede e o resto da tela nao depende dela.
  conferirOrtofoto();
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
