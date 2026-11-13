"use strict";
/* Dados do servidor: INC_Settings.json, AIPatrolSettings.json, Lores.txt, ranking.txt e o log de 13/11. */
const KOMBAT = [["Aeródromo de Balota",5076,2313],["Base de Pavlovo",2096,3505],["Base de Zelenogorsk",2447,5174],["Base de Myshkino",1173,7215],["Base VMC",4547,8304],["Base de Stary Sobor",6317,7803],["Base de Staroye",10444,5960],["Base Bashnya",4160,11619],["Base de Severograd",7074,12720],["Base de Troitskoe",7892,14704],["Base de Ostry",10920,13382],["Aeródromo de Krasnostav",12101,12574],["Ilha da Prisão",2634,1312],["Base de Tikhiy Zaliv",765,1894]];
const Facs = [
  {id:"Wolves", ru:"Волки", base:"Stary Sobor", bx:6318, bz:7805, brac:"de lobo", renasce:15,
   story:"Empresa militar privada que estava no país antes do colapso. A CDF contratou o que sobrou e paga em munição, remédio e passagem livre. São os mais disciplinados de Chernarus, e dentro dessa disciplina não cabe testemunha.",
   farda:"Farda Crye em multicam, multicam black, coyote ou preto.", pesos:{"Território":2, "Recurso":1, "Militar":2, "Abrigo":1},
   bau:639, caixa:248, comboios:2,
   fato:"<b>Seguraram Stary Sobor</b> contra os Crooks às 11:22. Antes, gastaram quase todo o caixa no Radist: duas MK47 e um M4A1 montados para o baú."},
  {id:"Vipers", ru:"Гадюки", base:"Castelo do Diabo", bx:6890, bz:11366, brac:"de cobra", renasce:15,
   story:"Também vieram pelo dinheiro, mas ninguém mais paga. Saíram do Castelo do Diabo, no alto do morro ao norte de Stary Sobor, e vão atrás de recurso onde houver, inclusive nas bases da CDF. Vivem em guerra com os Wolves.",
   farda:"Uniforme MTF em coyote ou preto, botas de operador.", pesos:{"Território":1, "Recurso":3, "Militar":1, "Abrigo":1},
   bau:521, caixa:42247, comboios:2,
   fato:"<b>Derrubaram o Kapkan duas vezes</b> na mesma manhã, perto de Gorka e de Ostry, e atacaram Stroytel às 11:02. Estão com 42 mil em nota no baú."},
  {id:"Crooks", ru:"Жулики", base:"Acampamento de Stroytel", bx:7089, bz:4275, brac:"Crook", renasce:10,
   story:"Ladrões de carga, gente de desmanche e rapazes das vilas que perderam tudo no primeiro inverno. Vivem das cidades, nunca entram em base militar e atiram primeiro porque não têm mais nada a perder.",
   farda:"Moletom tático e calça UFP em preto ou cinza, tênis.", pesos:{"Território":3, "Recurso":1, "Militar":0, "Abrigo":1},
   bau:404, caixa:576, comboios:2,
   fato:"<b>Defenderam Stroytel</b> dos Vipers às 11:03 e, às 11:19, juntaram gente para atacar os Wolves. Voltaram do Radist com uma MK47."}
];
const TRADE = [
  {k:"Baryga", x:14318, z:13322, t:"Comerciante · zona segura", d:"Porto de Svetloyarsk. Compra qualquer coisa e não exige reputação."},
  {k:"Radist", x:3712, z:5985, t:"Comerciante · zona segura", d:"Torre de rádio de Green Mountain. Topo do mercado, exige confiança."},
  {k:"Spawn", x:12862, z:9250, t:"Onde todo mundo nasce", d:"Entrada sul de Berezino, com garrafa, lata, faca e rádio. O Yuri das primeiras missões fica no píer, ao lado."}
];
const BOSS = [
  {id:"Kombat", ru:"КОМБАТ", who:"Anatoly Tarasov · major da CDF · 54 anos", big:true, voice:"kombat",
   lugares:KOMBAT.map(b => [b[1], b[2], b[0]]), ch:[.9, 1], pres:[120, 180], desc:[30, 60], morte:[180, 240],
   story:"Quando os generais embarcaram nos últimos helicópteros, ninguém mandou Tarasov ficar. Ele sentou no rádio e chamou as outras bases, uma por uma. Em dois meses, 14 bases atendiam à mesma voz. Para o Kombat não existem refugiados: quem está sem farda dentro do perímetro é saqueador, e saqueador não tem julgamento.",
   how:"Não sai atrás de ninguém. Defende o prédio de comando e o pátio, corre de cobertura em cobertura, e quem se esconde atrás de parede recebe granada. Três guardas: um caça você, um fica colado nele e o terceiro cobre a base do alto com fuzil de luneta, sem descer.",
   kit:{always:"Capacete Altyn, colete 6B13, gorka verde, rádio de comando, Desert Eagle, faca e três RGD-5", e:["AKM ou MK47 montados, com mira, punho e quebra-chamas", "AK-12 ou SCAR-H montados", "ASh-12 ou KC-17 montados, e visão noturna"]},
   loot:"No corpo, o quepe do major (o Baryga paga 8 mil) e de 2 a 6 mil hryvnia. No prédio, um cofre com munição, kit de primeiros socorros, morfina e peças que melhoram com o wipe: ACOG, PSO, tambor de AKM, colete, visão noturna, explosivo plástico. Fica uma hora, e ninguém é avisado.",
   lines:[["05", "Это Комбат. Кто без формы — тот мародёр.", "Aqui é o Kombat. Quem está sem farda é saqueador."], ["08", "Граната!", "Granada!"], ["15", "Выходи! Я тебя вижу!", "Sai daí! Eu estou te vendo!"], ["12", "Суки... Мои люди! Всех положу!", "Desgraçados... meus homens! Vou derrubar todos!"]]},
  {id:"Chugun", ru:"ЧУГУН", who:"Boris Petrov · infantaria de choque · 34 anos", voice:"chugun",
   lugares:[[5645, 2460, "Shopping de Vysotovo"]], ch:[.5, .8], pres:[120, 180], desc:[60, 120], morte:[240, 360],
   story:"Chugun quer dizer ferro fundido. O Kombat o mandou para Tisy com uma ordem de três palavras: ninguém sai daqui. Um dia o rádio de Tisy parou de responder. Ele tinha descido para a cidade onde cresceu e hoje mora no shopping de Vysotovo, entre o hotel e as duas lojas. Não saqueia, não negocia, não fala no rádio.",
   how:"Sozinho e de frente. Ouve tiro de longe e vem ver, mas não sai do quarteirão. Vem andando para cima com o tambor de 75. Armadura no tronco, viseira na cabeça, pernas sem nada: é por elas que ele cai. Com a perna quebrada não corre mais, e pancada não o apaga.",
   kit:{always:"Agasalho preto de listra branca, balaclava sob a viseira do Gorka, colete 6B13, braçadeira do Zenit, três RGD-5 e AKM com tambor de 75", e:["Sem mira", "Com mira Kobra", "Com mira Kobra e visão noturna"]},
   loot:"O kit inteiro dele e uma recompensa que cresce com a etapa do wipe.",
   lines:[["01", "Моё. Всё здесь моё.", "Meu. Tudo aqui é meu."], ["06", "О, гости! Заходи, не стесняйся!", "Opa, visita! Entra, fica à vontade!"], ["11", "А-а, нога! Сука!", "Aaah, a perna! Desgraçado!"], ["16", "Это мой район!", "Esse bairro é meu!"]]},
  {id:"Shtrafbat", ru:"ШТРАФБАТ", who:"4 a 5 operadores · ex-CDF · 28 a 42 anos", voice:"shtrafbat",
   lugares:[[4428, 10179, "Aeródromo do Noroeste"]], ch:[.6, .9], pres:[120, 180], desc:[60, 120], morte:[240, 360],
   story:"Batalhão penal. Foi a sentença do Kombat quando um grupo de elite se recusou a atirar numa fila de civis: segurar o NWAF até o último homem. Eles seguraram, mataram os oficiais, abriram o depósito da OTAN e ficaram com o nome da punição. Hoje atiram em qualquer um que pise na pista.",
   how:"Não tem um chefe para derrubar. Andam em bloco: metade cobre, metade avança pelo flanco, e trocam. Ninguém avança sem cobertura, e o atirador designado não sai da base de fogo. Atire de longe, derrube quem avança e mude de lugar antes de fecharem o cerco.",
   kit:{always:"Softshell tan, calça multicam, máscara de caveira, capacete balístico e porta-placa, iguais para todos", e:["M4A1 com ponto vermelho ou AUG; Uzi; SR25 com ACOG", "M4A1, MCX ou K416; Uzi ou MP7; SR25 com luneta", "MCX, K416 ou SCAR-H com luneta 1-4x; MP7 ou Vector; SR25; visão noturna"]},
   loot:"Quando o último cai, o depósito da OTAN abre junto ao avião da pista com fumaça vermelha, e todo mundo fica sabendo. As facções por perto mandam gente buscar. Dentro: 5.56, .308, carregadores, remédio, duas M67, peças de valor e a ordem de transferência assinada pelo major (9 mil no Baryga).",
   lines:[["s1_06", "Контакт! К бою!", "Contato! Em posição!"], ["s1_16", "Дави его! Не давай поднять голову!", "Prende ele! Não deixa levantar a cabeça!"], ["s2_15", "Спрятался! Выкуриваем!", "Escondeu! Vamos tirar ele de lá!"], ["s3_18", "Попала. Лежит.", "Acertei. Está no chão."]]},
  {id:"Leshiy", ru:"ЛЕШИЙ", who:"Ivan · guarda florestal · 45 anos",
   lugares:LOCAIS.serraria.map(p => [p[0], p[1], "Serraria"]), ch:[.85, 1], pres:[90, 150], desc:[30, 60], morte:[180, 240],
   story:"Dezoito anos de guarda florestal e oito de queixas mensais contra as madeireiras, todas arquivadas. A última cita três técnicos de Kharkiv contratados para a serraria de Berezino: Luka, Petro e Emanuil. Leshiy é o espírito da mata que faz o caçador se perder. Ele não fala, não negocia e não avisa.",
   how:"Escolhe um ponto, fica nele e atira de longe, de ghillie. Dois rastreadores cuidam de quem tenta chegar perto. Quem atravessa o pátio de uma serraria em campo aberto é o alvo que ele veio buscar.",
   kit:{always:"Ghillie e dois rastreadores com farda tirada de soldado morto", e:["SVD com PSO", "SV98", "SV98 ou VSS; com a VSS, nem o estalo do tiro"]},
   loot:"O fuzil dele e a ghillie."},
  {id:"Myasnik", ru:"МЯСНИК", who:"Operário de fundição · sozinho",
   lugares:LOCAIS.fabrica.map(p => [p[0], p[1], "Fábrica"]), ch:[.85, 1], pres:[90, 150], desc:[30, 60], morte:[180, 240],
   story:"Quando o exército requisitou as fábricas e abriu fogo contra quem estava dentro, a turma dele morreu no pátio. Passou semanas escondido na casa de máquinas e saiu sem falar, com a marreta do turno. Para ele, o turno nunca acabou: anda de fábrica em fábrica como quem cumpre escala.",
   how:"Entra atirando de escopeta. Abaixo de 40% de vida larga a escopeta e vem correndo de marreta. Em galpão sem saída, o tempo entre vê-lo e ser alcançado é curto.",
   kit:{always:"Couro preto, máscara de gás, botas de trabalho, marreta e cutelo", e:["Escopeta MP-133", "Escopeta Saiga", "Escopeta Saiga"]},
   loot:"A escopeta, a marreta e o que ele carrega."},
  {id:"Feldsher", ru:"ФЕЛЬДШЕР", who:"Médico de hospital · com dois guardas",
   lugares:LOCAIS.hospital.map(p => [p[0], p[1], "Hospital"]), ch:[.75, 1], pres:[90, 150], desc:[45, 90], morte:[240, 300],
   story:"Percebeu antes dos outros que, quando o dinheiro deixasse de valer, o remédio passaria a valer tudo. Enquanto os colegas atendiam a fila, ele contava o estoque; quando a fila virou multidão, trancou a farmácia. Os guardas chegaram feridos e ficaram por causa da morfina.",
   how:"Não luta até o fim. Ferido, recua e se trata com soro enquanto os guardas avançam para segurar você. Quem perde tempo com os guardas recomeça do zero. Persiga-o pelas enfermarias e não o deixe parar.",
   kit:{always:"Jaqueta de paramédico, máscara cirúrgica, luvas brancas, pistola, dois soros e morfina; às vezes epinefrina e tetraciclina", e:["Fuzil montado de nível Bom", "Fuzil montado de nível Viciado, o topo", "Fuzil montado de nível Viciado, o topo"]},
   loot:"Remédio que ninguém mais tem: soro, morfina, epinefrina."},
  {id:"Kapkan", ru:"КАПКАН", who:"Sergei · preparado para o fim · 51 anos",
   lugares:LOCAIS.comedouro.map(p => [p[0], p[1], "Comedouro de caça"]), ch:[.75, 1], pres:[90, 150], desc:[45, 90], morte:[240, 300],
   story:"Passou vinte anos se preparando para o fim do mundo, ouvindo os vizinhos rirem. Quando a infecção chegou, já estava no mato. Kapkan quer dizer armadilha. Não quer recurso nem território: quer que o deixem em paz, e a única maneira é ninguém voltar para contar o caminho.",
   how:"Você descobre que ele está ali quando a perna prende. Arma armadilha de urso e fio de tropeço com granada de luz em volta dos comedouros de caça e espera alguém correr atrás dele. Ande devagar e olhe onde pisa.",
   kit:{always:"Ghillie Woodland, capuz de ghillie, pistola, armadilhas de urso e fios de tropeço", e:["CZ 550, Winchester 70 ou Scout com luneta", "Fuzil de atirador de nível Experiente", "Fuzil de atirador de nível Bom"]},
   loot:"O fuzil, a ghillie e as armadilhas que sobraram."},
  {id:"Sektanty", ru:"СЕКТАНТЫ", who:"Zhrets, o sacerdote, e 2 a 4 fiéis", night:true,
   lugares:LOCAIS.igreja.map(p => [p[0], p[1], "Igreja"]), ch:[1, 1], pres:[480, 480], desc:[60, 120], morte:[180, 200],
   story:"Nos primeiros meses muita gente se abrigou nas igrejas. O padre de uma delas parou de rezar pelos mordidos e passou a dizer que os infectados não estavam doentes, estavam limpos. Os seguidores largaram as armas de fogo e molham as lâminas em restos de infectado. Para eles, isso é conversão.",
   how:"Só de noite, das 22h às 5h do jogo, em silêncio e em grupo. Chegam pelas sombras e cortam. Qualquer golpe infecta: sobreviver é só a primeira parte, depois é correr atrás de remédio. Ninguém foge, e Zhrets é o mais duro de derrubar.",
   kit:{always:"Zhrets de capa vermelha e facão; fiéis de capa preta. Nenhuma arma de fogo", e:["Fiéis com foice e faca de cozinha", "Fiéis com foice e facão", "Fiéis com foice e facão"]},
   loot:"Lâminas e o que os fiéis carregam. O que vale mesmo é sair vivo."},
  {id:"Troika", ru:"ТРОЙКА", who:"Vozhd, Grom e Tuman · ninguém sabe quem são", roam:true,
   lugares:[], ch:[1, 1], pres:[0, 0], desc:[0, 0], morte:[180, 180],
   story:"Na União Soviética, troika era o tribunal de três homens que condenava sem processo. Uma versão diz que é uma equipe de limpeza estrangeira deixada para trás; outra, que vem de uma lista que o Kombat apagou. Depois deles sobra um esquadrão inteiro no chão e ninguém que tenha visto quem atirou.",
   how:"Três chefes de uma vez. Vozhd segura o combate com o fuzil, Grom dispara o M79 de longe e Tuman atira com a VSS silenciada. As granadas do Grom são três: passou a terceira explosão, vá para cima dele. Quebrado o trio, quem sobrou some assim que você se afasta.",
   kit:{always:"Grom: M79 com três granadas. Tuman: VSS com PSO e pistola", e:["Vozhd: pistola e AKM, M4A1, AUG ou FAL", "Vozhd: AKM com PSO ou M4A1 com ACOG", "Vozhd: AKM com PSO ou M4A1 com ACOG"]},
   loot:"O equipamento de três chefes. Ninguém conta que matou os três."}
];
const CURVA = [[0, [45, 30, 15, 7, 2, 1]], [7, [25, 30, 25, 12, 6, 2]], [15, [10, 20, 30, 22, 12, 6]], [30, [5, 10, 20, 30, 22, 13]]];
const PATENTES = ["Noob", "Casual", "Mediano", "Experiente", "Bom", "Viciado"];
const NIVEIS = [[.28, .75, 150], [.35, .82, 200], [.42, .86, 275], [.5, .9, 350], [.56, .95, 425], [.61, .98, 500]];
const PERFIS = [
  {n:"Agressivo", p:25, d:"Corre na direção do tiro, flanqueia e dispara em sprint quando vê ameaça. Ouve tiro de longe.", s:["ouve tiro a 700 m", "visão 90%", "flanqueia", "cautela baixa"]},
  {n:"Moderado", p:40, d:"Fuzileiro de linha. Avança e recua conforme a briga, sem pressa e sem heroísmo.", s:["ouve tiro a 350 m", "visão 100%", "não flanqueia", "cautela média"]},
  {n:"Campeiro", p:20, d:"Anda devagar, enxerga mais longe e deita para atirar quando o alvo passa de 100 m.", s:["ouve tiro a 250 m", "visão 130%", "deita acima de 100 m", "cautela alta"]},
  {n:"Rato", p:15, d:"Quer loot, não briga. Anda quieto, evita confronto e foge cedo.", s:["ouve tiro a 120 m", "visão 80%", "foge cedo", "cautela muito alta"]}
];
const RANK = [["Lucstarwork", "Jogador", 695, 20, 0, 21, 2], ["Pyotr Petrov", "Wolves", 350, 31, 0, 0, 0], ["Mikhail Kiselev", "Wolves", 220, 18, 0, 0, 0], ["Semyon Krylov", "Wolves", 190, 19, 0, 0, 0], ["Boris Ilyin", "Wolves", 140, 10, 0, 0, 0], ["Yuri Boyko", "Vipers", 120, 12, 0, 0, 0], ["Nikolai Sidorov", "Vipers", 110, 7, 0, 0, 0], ["Maksim Tkachuk", "Crooks", 110, 5, 0, 0, 0], ["Nikita Smirnov", "Vipers", 100, 8, 0, 0, 0], ["Konstantin Zaitsev", "Vipers", 100, 8, 0, 0, 0], ["Volodymyr Pavlov", "Vipers", 100, 0, 0, 1, 0], ["Boris Chernov", "Vipers", 95, 2, 0, 1, 1]];
const PLACAR = [["Wolves", 480, 3980, 260, 376], ["Troika", 250, 290, 0, 4], ["Crooks", 180, 3710, 120, 365], ["Vipers", -100, 2900, 240, 324]];
const SKILLS = [
  ["Resistência", "Física", "andando, correndo e pulando; carregado rende mais", [["Fôlego gasto correndo", -2.5], ["Fôlego gasto no pulo", -4], ["Braço cansa segurando a respiração", -4], ["Fôlego volta mais rápido", 3]]],
  ["Saúde", "Física", "com 30% do que as outras habilidades ganham", [["Chance de a perna não quebrar", 4], ["Fome mais lenta", 2], ["Sede mais lenta", 2]]],
  ["Imunidade", "Física", "doente, envenenado, no frio, no calor e usando remédio", [["Frio e calor pesam menos", 3]], "Também resiste a doença, deixa o veneno mais fraco e faz o remédio durar mais."],
  ["Metabolismo", "Física", "comendo e bebendo", [["Comida e bebida rendem mais", 3], ["Colateral de estimulante mais curto", 5], ["Dano por fome e sede", -5]]],
  ["Força", "Física", "carregando mais de 50% do limite e batendo corpo a corpo", [["Carrega mais", 3], ["Pulo mais forte", 1.5], ["Corpo a corpo", 3], ["Braço cansa menos mirando", 3]]],
  ["Estresse", "Física", "levando pancada e tiro, acordando de desmaio", [["Chance de não desmaiar", 4], ["Acorda mais rápido", 5]]],
  ["Vitalidade", "Física", "levando dano", [["Chance de não sangrar no golpe", 3], ["Sangra mais devagar", 3], ["Não desmaia por perda de sangue", 4]]],
  ["Pistolas", "Combate", "atirando; acertar alvo vivo rende mais, matar mais ainda", [["Recuo", -2], ["Balanço da mira", -2]]],
  ["Submetralhadoras", "Combate", "atirando; acertar alvo vivo rende mais, matar mais ainda", [["Recuo", -2], ["Balanço da mira", -2]]],
  ["Fuzis de assalto", "Combate", "atirando; acertar alvo vivo rende mais, matar mais ainda", [["Recuo", -2], ["Balanço da mira", -2]]],
  ["Escopetas", "Combate", "atirando; acertar alvo vivo rende mais, matar mais ainda", [["Recuo", -2], ["Balanço da mira", -2]]],
  ["Precisão", "Combate", "fuzil de ferrolho e DMR; acertar e matar rendem mais", [["Recuo", -2], ["Balanço da mira", -3]]],
  ["Controle de recuo", "Combate", "rajadas e tiros seguidos", [["Recuo lateral de toda arma", -2]]],
  ["Carregador", "Combate", "enchendo e esvaziando carregador", [["Tempo para encher e esvaziar", -4]]],
  ["Panes", "Combate", "desengasgando a arma", [["Chance de a arma engasgar", -4]]],
  ["Furtividade", "Combate", "agachado ou devagar com NPC ou zumbi por perto", [["Distância em que o NPC te percebe", -3]]]
];
const MODS = [["Community Framework", 1559212036, "base de vários mods"], ["VPPAdminTools", 1828439124, "administração"], ["DayZ Expansion Core", 2291785308, "núcleo do Expansion"], ["Quadlock's Pack", 2484279619, "equipamento"], ["Dabs Framework", 2545327648, "base de vários mods"], ["DayZ Expansion Market", 2572328470, "loja e caixa eletrônico"], ["DayZ Expansion AI", 2792982069, "o corpo dos NPCs"], ["DayZ Expansion Quests", 2828486817, "missões"], ["DayZ Expansion Hardline", 2828487396, "reputação"], ["Forward Operator Gear", 2931560672, "roupa tática"], ["AI Raids & AI Camps", 3582501680, "os Corvos"], ["My Delta Force Weapons", 3612546508, "armas"], ["Asmond Vanilla Clothing", 3735683378, "retexturas de roupa"], ["Incursão Inventário", 3835305391, "inventário, habilidades, vozes e posto de rádio"]];
