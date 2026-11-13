"use strict";

/* ============ utilidades ============ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function grade(x, z){ return String(Math.max(0, Math.floor(x / 100))).padStart(3, "0") + " " + String(Math.max(0, Math.floor(z / 100))).padStart(3, "0"); }
function rng(seed){ let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hashN(...a){ let h = 2166136261; for (const n of a){ h ^= (n | 0); h = Math.imul(h, 16777619); } return h >>> 0; }
function num(n){ return Math.round(n).toLocaleString("pt-BR"); }
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function relogio(t){ const s = SES.inicio + Math.floor(t); return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":"); }
function hm(min){ const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + " h" + (m ? " " + String(m).padStart(2, "0") : "") : m + " min"; }
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COR = {Wolves:"--wolves", Vipers:"--vipers", Crooks:"--crooks", Troika:"--troika", Jogador:"--mark", CDF:"--cdf"};
const PERFIL = {Avancado:"Agressivo", Fuzileiro:"Moderado", Atirador:"Campeiro", Rato:"Rato"};

/* ============ tema ============ */
const themeHooks = [];
(function(){
  const btn = $("#themeBtn");
  const saved = store("tdb-tema"); if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  const dark = () => { const a = document.documentElement.getAttribute("data-theme"); return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const label = () => { btn.textContent = dark() ? "Carta de dia" : "Carta de noite"; btn.setAttribute("aria-pressed", dark()); };
  label();
  btn.addEventListener("click", () => { const n = dark() ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); store("tdb-tema", n); label(); themeHooks.forEach(f => f()); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { label(); themeHooks.forEach(f => f()); });
})();

/* ============ geografia (dos arquivos da missao) ============ */
function buf(s){ const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
const DEM_N = GEO.relevo.n, CELL = W / DEM_N, DEM = new Int16Array(buf(GEO.relevo.b64));
const H = (i, j) => DEM[Math.min(DEM_N - 1, Math.max(0, j)) * DEM_N + Math.min(DEM_N - 1, Math.max(0, i))] / 10;
const PATH = { coast: new Path2D(GEO.litoral), forest: new Path2D(GEO.matas) };
function segPath(b64s, half){ const a = new Uint16Array(buf(b64s)), p = new Path2D();
  for (let k = 0; k < a.length; k += 4){ const x = a[k] / 2, z = a[k + 1] / 2, g = a[k + 2] / 100 * Math.PI / 180, L = half(a[k + 3]); const dx = Math.cos(g) * L, dz = Math.sin(g) * L; p.moveTo(x - dx, z - dz); p.lineTo(x + dx, z + dz); }
  return p; }
PATH.trail = segPath(GEO.estradas, t => (t % 100) / 2 + 1.5);
PATH.rail = segPath(GEO.trilhos, () => 22);
PATH.bldg = (function(){ const a = new Uint16Array(buf(GEO.predios)), p = new Path2D();
  for (let k = 0; k < a.length; k += 4){ const x = a[k] / 2, z = a[k + 1] / 2, g = a[k + 2] / 100 * Math.PI / 180, lar = Math.floor(a[k + 3] / 64), com = a[k + 3] % 64;
    const c = Math.cos(g), s = Math.sin(g), hx = com / 2, hz = lar / 2;
    const q = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    q.forEach(([u, v], i) => { const px = x + u * c - v * s, pz = z + u * s + v * c; i ? p.lineTo(px, pz) : p.moveTo(px, pz); });
    p.closePath(); }
  return p; })();
(function(){ const minor = new Path2D(), major = new Path2D(), n = DEM_N;
  for (let lv = 20; lv <= 560; lv += 20){ const p = lv % 100 === 0 ? major : minor;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++){
      const a = H(i, j), b = H(i + 1, j), c = H(i + 1, j + 1), d = H(i, j + 1);
      const A = a > lv, B = b > lv, C = c > lv, D = d > lv;
      if (A === B && B === C && C === D) continue;
      const x0 = (i + .5) * CELL, z0 = (j + .5) * CELL, f = (u, v) => (lv - u) / (v - u);
      const pts = {};
      if (A !== B) pts.S = [x0 + CELL * f(a, b), z0];
      if (B !== C) pts.E = [x0 + CELL, z0 + CELL * f(b, c)];
      if (D !== C) pts.N = [x0 + CELL * f(d, c), z0 + CELL];
      if (A !== D) pts.O = [x0, z0 + CELL * f(a, d)];
      const k = Object.keys(pts);
      const seg = (u, v) => { p.moveTo(pts[u][0], pts[u][1]); p.lineTo(pts[v][0], pts[v][1]); };
      if (k.length === 2) seg(k[0], k[1]);
      else if (A && C){ seg("S", "E"); seg("N", "O"); }
      else { seg("S", "O"); seg("E", "N"); }
    } }
  PATH.cmin = minor; PATH.cmaj = major; })();

let SHADE = null;
function buildShade(){
  const n = DEM_N, c = document.createElement("canvas"); c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n);
  const hex = h => { const v = parseInt(h.replace("#", "").slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const sh = hex(css("--shade") || "#4a3c22"), li = hex(css("--lit") || "#ffffff");
  const L = [-.55, .55, .63], ex = 2.0, flat = L[2];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){
    const h0 = H(i, j); const o = (j * n + i) * 4;
    if (h0 <= 0){ img.data[o + 3] = 0; continue; }
    const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * CELL) * ex, dz = (H(i, j + 1) - H(i, j - 1)) / (2 * CELL) * ex;
    const nl = Math.hypot(dx, dz, 1), d = ((-dx) * L[0] + (-dz) * L[1] + L[2]) / nl - flat;
    const col = d < 0 ? sh : li, a = d < 0 ? Math.min(.4, -d * 1.6) : Math.min(.3, d * 1.1);
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0); SHADE = c;
}
let COL = {};
function readColors(){ ["paper","paper-2","ink","ink-2","ink-3","land","sea","sea-line","forest","contour","contour-2","bldg","trail","rail","coast","mark","cdf","wolves","vipers","crooks","troika","rule"].forEach(k => COL[k] = css("--" + k)); buildShade(); }
readColors();
themeHooks.unshift(readColors);
function drawLegend(){
  const it = [
    ["Base de facção", "<rect x='4' y='0' width='14' height='14' rx='2' fill='" + COL.wolves + "'/><rect x='9' y='5' width='4' height='4' fill='" + COL.paper + "'/>"],
    ["Esquadrão", "<circle cx='6' cy='7' r='3.5' fill='" + COL.vipers + "'/><circle cx='14' cy='7' r='3.5' fill='" + COL.vipers + "'/>"],
    ["Para onde vai", "<path d='M1 7 H21' stroke='" + COL.crooks + "' stroke-width='1.6' stroke-dasharray='3 3'/>"],
    ["Confronto", "<path d='M6 2 L16 12 M16 2 L6 12' stroke='" + COL.ink + "' stroke-width='2.2' stroke-linecap='round'/>"],
    ["Chefe", "<circle cx='11' cy='7' r='5.5' fill='" + COL.mark + "'/>"],
    ["Comboio", "<rect x='1' y='2' width='20' height='10' rx='2' fill='" + COL.land + "' stroke='" + COL.wolves + "' stroke-width='1.4'/><circle cx='6' cy='7' r='1.8' fill='" + COL.wolves + "'/><circle cx='11' cy='7' r='1.8' fill='" + COL.wolves + "'/><circle cx='16' cy='7' r='1.8' fill='" + COL.wolves + "'/>"],
    ["Invasão", "<path d='M1 7 H21' stroke='" + COL.vipers + "' stroke-width='3' stroke-dasharray='6 3'/>"],
    ["Base da CDF", "<path d='M11 1 L17 7 L11 13 L5 7Z' fill='" + COL.cdf + "'/>"],
    ["Comerciante", "<circle cx='11' cy='7' r='6' fill='none' stroke='" + COL.ink + "' stroke-dasharray='2 2'/><circle cx='11' cy='7' r='3' fill='" + COL.ink + "'/>"],
    ["Mata", "<rect x='1' y='1' width='20' height='12' rx='1' fill='" + COL.forest + "'/>"],
    ["Curva de nível, 20 m", "<path d='M1 9 C7 2, 14 12, 21 5' fill='none' stroke='" + COL.contour + "' stroke-width='1.3'/>"],
    ["Ferrovia", "<path d='M1 7 H21' stroke='" + COL.rail + "' stroke-width='3.4'/><path d='M1 7 H21' stroke='" + COL.land + "' stroke-width='1.3' stroke-dasharray='4 4'/>"],
    ["Trilha de mata", "<path d='M1 7 H21' stroke='" + COL.trail + "' stroke-width='1.2' stroke-dasharray='3 2'/>"]
  ];
  const lg = document.getElementById("legend");
  if (lg) lg.innerHTML = it.map(([t, g]) => "<span><svg viewBox='0 0 22 14' aria-hidden='true'>" + g + "</svg>" + t + "</span>").join("");
}
drawLegend();
themeHooks.push(drawLegend);

/* lugares com nome oficial (AILocationSettings) */
function drawLabels(ctx, v, w, h, s, opt){
  const placed = (opt && opt.avoid ? opt.avoid : []).map(([x, z, a, b, c, d]) => { const px = (x - v.x) * s, py = (W - z - v.y) * s; return [px + a, py + b, px + c, py + d]; }), tierMax = v.w < 2600 ? 5 : v.w < 4200 ? 4 : v.w < 6500 ? 3 : v.w < 10000 ? 2 : 1;
  const order = [...LUG].sort((a, b) => a[1] - b[1]);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  for (const [nome, tier, x, z, tipo] of order){
    if (tier > tierMax) continue;
    if (opt && opt.skip && opt.skip(nome)) continue;
    const px = (x - v.x) * s, py = (W - z - v.y) * s - 11;
    if (px < -60 || px > w + 60 || py < -20 || py > h + 20) continue;
    const t1 = tier === 1, hill = tipo === "Hill" || tipo === "Local";
    ctx.font = (t1 ? "700 13.5px " : hill ? "italic 400 11.5px " : tier === 2 ? "400 12.5px " : "italic 400 11.5px ") + "'PT Sans', sans-serif";
    const txt = t1 ? nome.toUpperCase().split("").join(String.fromCharCode(8202)) : nome;
    const tw = ctx.measureText(txt).width, box = [px - tw / 2 - 3, py - 8, px + tw / 2 + 3, py + 8];
    if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    ctx.lineWidth = 3.5; ctx.strokeStyle = COL.land; ctx.strokeText(txt, px, py);
    ctx.fillStyle = t1 ? COL.ink : COL["ink-2"]; ctx.fillText(txt, px, py);
    if (hill){ ctx.fillStyle = COL.contour; ctx.beginPath(); ctx.moveTo(px - tw / 2 - 9, py + 4); ctx.lineTo(px - tw / 2 - 5, py - 3); ctx.lineTo(px - tw / 2 - 1, py + 4); ctx.fill(); }
  }
}

/* desenha a carta; v = {x, y, w}: canto de cima a esquerda (x, y no sistema da tela, y = W - z) e largura em metros */
function drawBase(cv, v, opt){
  opt = opt || {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d"), s = w / v.w, px = 1 / s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COL["sea-line"]; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = 3; y < h; y += 7){ ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); } ctx.stroke();
  ctx.setTransform(dpr * s, 0, 0, -dpr * s, -v.x * s * dpr, (W - v.y) * s * dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.clip();
  ctx.fillStyle = COL.land; ctx.fill(PATH.coast, "evenodd");
  ctx.save(); ctx.clip(PATH.coast, "evenodd");
  ctx.fillStyle = COL.forest; ctx.fill(PATH.forest, "evenodd");
  if (SHADE){ ctx.imageSmoothingEnabled = true; ctx.globalAlpha = opt.shade || .75; ctx.drawImage(SHADE, 0, 0, W, W); ctx.globalAlpha = 1; }
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = .7 * px; ctx.strokeStyle = COL["contour-2"]; ctx.stroke(PATH.cmin);
  ctx.lineWidth = 1.2 * px; ctx.strokeStyle = COL.contour; ctx.stroke(PATH.cmaj);
  if (v.w < 9000){ ctx.setLineDash([4 * px, 3 * px]); ctx.lineWidth = 1 * px; ctx.strokeStyle = COL.trail; ctx.stroke(PATH.trail); ctx.setLineDash([]); }
  ctx.restore();
  const close = v.w < 6000;
  ctx.lineCap = "butt";
  ctx.lineWidth = (close ? 3.4 : 1.8) * px; ctx.strokeStyle = COL.rail; ctx.stroke(PATH.rail);
  if (close){ ctx.lineWidth = 1.4 * px; ctx.strokeStyle = COL.land; ctx.setLineDash([6 * px, 6 * px]); ctx.stroke(PATH.rail); ctx.setLineDash([]); }
  ctx.fillStyle = COL.bldg; ctx.fill(PATH.bldg);
  if (v.w > 9000){ ctx.lineWidth = .6 * px; ctx.strokeStyle = COL.bldg; ctx.stroke(PATH.bldg); }
  ctx.lineWidth = 1.1 * px; ctx.strokeStyle = COL.coast; ctx.stroke(PATH.coast);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opt.grid !== false){
    ctx.strokeStyle = COL.ink; ctx.globalAlpha = .14; ctx.lineWidth = 1; ctx.beginPath();
    const step = v.w > 7000 ? 1000 : v.w > 2500 ? 1000 : 500;
    for (let x = Math.ceil(v.x / step) * step; x < v.x + v.w; x += step){ const X = Math.round((x - v.x) * s) + .5; ctx.moveTo(X, 0); ctx.lineTo(X, h); }
    for (let z = Math.floor((W - v.y) / step) * step; z > W - v.y - h / s; z -= step){ const Y = Math.round((W - z - v.y) * s) + .5; ctx.moveTo(0, Y); ctx.lineTo(w, Y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (opt.gridLabels){
      ctx.font = "500 10px 'IBM Plex Mono', monospace"; ctx.textBaseline = "top"; ctx.textAlign = "left";
      const ls = 1000 * s >= 34 ? 1000 : 1000 * s >= 17 ? 2000 : 5000;
      for (let x = Math.ceil(v.x / ls) * ls; x < v.x + v.w; x += ls){ const X = (x - v.x) * s; if (X < 8 || X > w - 60) continue; const t = String(x / 100).padStart(3, "0"); ctx.fillStyle = COL.paper; ctx.fillRect(X + 2, 2, ctx.measureText(t).width + 6, 13); ctx.fillStyle = COL["ink-2"]; ctx.fillText(t, X + 5, 3); }
      for (let z = Math.floor((W - v.y) / ls) * ls; z > W - v.y - h / s; z -= ls){ const Y = (W - z - v.y) * s; if (Y < 18 || Y > h - 30) continue; const t = String(z / 100).padStart(3, "0"); ctx.fillStyle = COL.paper; ctx.fillRect(2, Y + 2, ctx.measureText(t).width + 6, 13); ctx.fillStyle = COL["ink-2"]; ctx.fillText(t, 5, Y + 3); }
    }
  }
  if (opt.labels !== false) drawLabels(ctx, v, w, h, s, opt);
  if (opt.after) opt.after(ctx, s);
}

/* ============ radio (transmissoes reais) ============ */
const Radio = (function(){
  const box = $("#radio"), t = $("#rt"), hh = $("#rh"), m = $("#rm"), ru = $("#rru"), log = $("#rlog"), btn = $("#somBtn");
  const msgs = SES.radio; let i = 0, typing = null, AC = null, noise = null, on = false;
  const tipo = {urgente:"TU", importante:"TI", rotina:"TR"};
  const KOMBAT = [["01", "Всем постам: доложить обстановку.", "Todos os postos: informem a situação."], ["05", "Это Комбат. Кто без формы — тот мародёр.", "Aqui é o Kombat. Quem está sem farda é saqueador."], ["21", "Отбой. Всем на позиции.", "Fim do alerta. Todos às posições."]];
  let kIdx = 0; const hist = [];
  function titulo(k, pri, tom){ const set = TIT[tipo[pri]][tom === "agressivo" ? "Agressivo" : "Profissional"]; return set[hashN(k, 7) % set.length]; }
  function type(text){ clearInterval(typing); if (reduce){ m.textContent = text; return; } let n = 0; m.textContent = ""; typing = setInterval(() => { n += 2; m.textContent = text.slice(0, n); if (n >= text.length) clearInterval(typing); }, 22); }
  function push(h, txt){ hist.unshift([h, txt]); hist.length = Math.min(hist.length, 3); log.innerHTML = hist.map(x => "<li><span>" + x[0] + "</span><span>" + esc(x[1]) + "</span></li>").join(""); }
  function next(){
    if (m.dataset.full) push(m.dataset.h, m.dataset.full);
    if (on && i % 6 === 5){
      const k = KOMBAT[kIdx++ % KOMBAT.length]; t.textContent = "Frequência de comando · CDF"; hh.textContent = "";
      m.dataset.full = "Kombat: " + k[2]; m.dataset.h = "CDF"; type(k[2]); ru.hidden = false; ru.textContent = k[1];
      squelch(); const a = new Audio(somURL("som/kombat_" + k[0] + ".ogg")); a.volume = .9; a.play().catch(() => {});
      i++; return;
    }
    ru.hidden = true;
    const [tt, pri, tom, txt] = msgs[i % msgs.length]; i++;
    t.textContent = titulo(i, pri, tom); hh.textContent = relogio(tt);
    m.dataset.full = txt; m.dataset.h = relogio(tt).slice(0, 5); type(txt);
    $("#freq").textContent = (80 + (hashN(i) % 200) / 10).toFixed(1);
    squelch();
  }
  function squelch(){ if (!AC || !noise) return; const g = noise.gain, now = AC.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(.14, now); g.exponentialRampToValueAtTime(.016, now + .28); }
  btn.addEventListener("click", () => {
    on = !on; btn.setAttribute("aria-pressed", on); btn.textContent = on ? "Desligar o som" : "Ligar o som"; box.classList.toggle("on", on);
    if (on){
      try {
        if (!AC){ AC = new (window.AudioContext || window.webkitAudioContext)(); const len = AC.sampleRate * 2, b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0); for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
          const src = AC.createBufferSource(); src.buffer = b; src.loop = true; const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = .7; noise = AC.createGain(); noise.gain.value = .016; src.connect(bp).connect(noise).connect(AC.destination); src.start(); }
        AC.resume(); i = i - (i % 6) + 5; next();
      } catch (e) { /* sem audio: o radio segue so com texto */ }
    } else if (AC){ AC.suspend(); }
    if (!looping) wave();
  });
  next(); setInterval(() => { if (!document.hidden) next(); }, 6800);
  const cv = $("#wave"), cx = cv.getContext("2d"); let ph = 0, looping = false, visivel = true;
  function wave(){ const w = cv.clientWidth; if (cv.width !== w) cv.width = w; cx.clearRect(0, 0, w, 30); cx.strokeStyle = on ? COL.mark : COL["ink-3"]; cx.lineWidth = 1; cx.beginPath();
    const amp = on ? 1 : .45; for (let x = 0; x < w; x += 2){ const y = 15 + (Math.sin(x * .07 + ph) * 4 * Math.sin(x * .013 + ph * .3) + (Math.random() - .5) * 6 * (.4 + .6 * Math.abs(Math.sin(ph * .5)))) * amp; x ? cx.lineTo(x, y) : cx.moveTo(x, y); }
    cx.stroke(); ph += .09;
    if (on && visivel && !reduce){ looping = true; requestAnimationFrame(wave); } else looping = false; }
  wave();
  themeHooks.push(() => { if (!looping) wave(); });
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { visivel = es.some(e => e.isIntersecting); if (visivel && on && !looping) wave(); }).observe(box);
  return {};
})();

/* ============ abertura: Berezino ============ */
const Hero = (function(){
  const cv = $("#heroMap"), notes = $("#heroNotes");
  const SPAWN = [12862, 9250];
  const NOTES = [
    [12862, 9250, "Spawn", "você desce do barco aqui", 1],
    [12892, 9300, "Yuri", "o rádio velho do píer", 2],
    [11929, 9071, "Hospital", "o Feldsher às vezes aparece", 3],
    [12708, 9690, "Serrarias", "o Leshiy espera nos pátios", 2],
    [12372, 9761, "Berezino", "", 3]
  ];
  function view(){
    const w = cv.clientWidth, h = cv.clientHeight, narrow = w < 900;
    const s = narrow ? w / 2700 : Math.max(w / 5000, h / 2300);
    const fx = narrow ? .6 : .67, fy = narrow ? .55 : .36;
    return { x: SPAWN[0] - fx * w / s, y: (W - SPAWN[1]) - fy * h / s, w: w / s, s, narrow };
  }
  function draw(){
    const v = view(); drawBase(cv, v, { shade: .85, gridLabels: false, skip: n => n === "Berezino" });
    const w = cv.clientWidth, h = cv.clientHeight; notes.setAttribute("viewBox", "0 0 " + w + " " + h); notes.innerHTML = "";
    $("#heroGrid").textContent = "кв. " + grade(SPAWN[0], SPAWN[1]);
    const P = (x, z) => [(x - v.x) * v.s, (W - z - v.y) * v.s];
    const lay = v.narrow ? [[1, 40, -26], [3, -70, 34], [4, -30, -40]] : [[1, 92, 12], [2, 110, -34], [3, -40, 92], [4, 120, -70], [5, -10, -64]];
    for (const [idx, ddx, dy] of lay){
      const [x, z, t1, t2] = NOTES[idx - 1]; const [px, py] = P(x, z); if (px < 0 || px > w || py < 0 || py > h) continue;
      const larg = Math.max(t1.length * 8.4, t2.length * 6.7) + 20;
      let dx = ddx;
      if (dx >= 0 && px + dx + larg > w - 8) dx = -Math.abs(dx);
      else if (dx < 0 && px + dx - larg < 8) dx = Math.abs(dx);
      const lx = px + dx, ly = py + dy, right = dx >= 0;
      el("circle", {cx: px, cy: py, r: idx === 1 ? 6 : 4, fill: idx === 1 ? COL.mark : COL.paper, stroke: idx === 1 ? COL.paper : COL.ink, "stroke-width": 2}, notes);
      if (idx === 1){ const r = el("circle", {cx: px, cy: py, r: 10, fill: "none", stroke: COL.mark, "stroke-width": 1.5}, notes); if (!reduce) el("animate", {attributeName: "r", values: "8;20;8", dur: "2.6s", repeatCount: "indefinite"}, r), el("animate", {attributeName: "opacity", values: "1;0;1", dur: "2.6s", repeatCount: "indefinite"}, r); }
      el("path", {d: "M" + px + " " + py + " L" + lx + " " + ly + " h" + (right ? 14 : -14), fill: "none", stroke: COL.ink, "stroke-width": 1}, notes);
      const g = el("g", {transform: "translate(" + (lx + (right ? 18 : -18)) + " " + ly + ")"}, notes);
      const anchor = right ? "start" : "end";
      const a = el("text", {x: 0, y: t2 ? -3 : 4, "text-anchor": anchor, "font-family": "'PT Sans', sans-serif", "font-size": 12.5, "font-weight": 700, "letter-spacing": ".1em", fill: idx === 1 ? COL.mark : COL.ink, stroke: COL.land, "stroke-width": 4, "paint-order": "stroke"}, g); a.textContent = t1.toUpperCase();
      if (t2){ const b = el("text", {x: 0, y: 12, "text-anchor": anchor, "font-family": "'PT Sans', sans-serif", "font-size": 12.5, fill: COL["ink-2"], stroke: COL.land, "stroke-width": 4, "paint-order": "stroke"}, g); b.textContent = t2; }
    }
  }
  new ResizeObserver(() => draw()).observe(cv);
  themeHooks.push(draw);
  return { draw };
})();

/* ============ mapa vivo ============ */
const EVITAR = Facs.map(f => [f.bx, f.bz, -13, -14, 96, 13]).concat(TRADE.map(t => t.k === "Spawn" ? [t.x, t.z, -78, -12, 12, 12] : [t.x, t.z, -86, -17, 17, 17]));
const MapView = (function(){
  const box = $("#mapBox"), cv = $("#mapCv"), svg = $("#map"), tip = $("#tip");
  const view = { x: 0, y: 0, w: W };
  const L = {}; ["fac", "cdf", "haunt", "trade", "trail", "ev", "sq", "boss"].forEach(k => L[k] = el("g", {"data-layer": k}, svg));
  const scaled = [];
  const Y = z => W - z;
  let raf = 0;
  function sizePx(){ return box.clientWidth || 1; }
  function upp(){ return view.w / sizePx(); }
  function vh(){ return view.w * (box.clientHeight || 1) / sizePx(); }
  function maxW(){ return W * Math.max(1, sizePx() / (box.clientHeight || 1)); }
  function fit(){ view.w = maxW(); view.x = (W - view.w) / 2; view.y = (W - vh()) / 2; clampView(); redraw(); }
  function redraw(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawBase(cv, view, { gridLabels: true, labels: $("#layers [data-l=names]").checked, avoid: EVITAR }); applyView(); }); }
  function applyView(){
    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + vh());
    const s = upp(); for (const g of scaled) if (g.__x !== undefined) g.setAttribute("transform", "translate(" + g.__x + " " + g.__y + ") scale(" + s + ")");
    const mPerPx = s; let m = 1000; for (const c of [250, 500, 1000, 2000, 5000]){ if (c / mPerPx > 50){ m = c; break; } }
    $("#sbar").style.width = Math.round(m / mPerPx) + "px"; $("#stxt").textContent = m >= 1000 ? (m / 1000) + " km" : m + " m";
    L.trail.querySelectorAll("path").forEach(p => p.setAttribute("stroke-width", 1.4 * s));
  }
  function clampView(){ view.w = Math.min(Math.max(view.w, 900), maxW()); const h = vh(); view.x = Math.min(Math.max(view.x, -view.w * .15), W - view.w * .85); view.y = Math.min(Math.max(view.y, -h * .15), W - h * .85); }
  function zoomAt(f, px, py){ const u = upp(), wx = view.x + px * u, wy = view.y + py * u; view.w *= f; clampView(); const u2 = upp(); view.x = wx - px * u2; view.y = wy - py * u2; clampView(); redraw(); }
  function flyTo(x, z, w){ view.w = w; clampView(); view.x = x - view.w / 2; view.y = Y(z) - vh() / 2; clampView(); redraw(); }

  function bind(g, data){
    g.__data = data; g.style.cursor = "pointer";
    g.addEventListener("pointerenter", e => showTip(g, e)); g.addEventListener("pointermove", e => showTip(g, e));
    g.addEventListener("pointerleave", () => { tip.hidden = true; });
    g.addEventListener("click", e => { e.stopPropagation(); select(typeof g.__data === "function" ? g.__data() : g.__data); });
    if (g.getAttribute("tabindex") === "0"){
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); select(g.__data); } });
      g.addEventListener("focus", () => { const r = box.getBoundingClientRect(); tipAt(g.__data, (g.__x - view.x) / upp(), (g.__y - view.y) / upp()); });
      g.addEventListener("blur", () => { tip.hidden = true; });
    }
  }
  function marker(layer, x, z, build, data, focus){ const g = el("g", {class: "mk"}, L[layer]); if (focus){ g.setAttribute("tabindex", "0"); g.setAttribute("role", "button"); g.setAttribute("aria-label", data.k); } g.__x = x; g.__y = Y(z); build(g); scaled.push(g); bind(g, data); return g; }
  function showTip(g, e){ const r = box.getBoundingClientRect(); tipAt(typeof g.__data === "function" ? g.__data() : g.__data, e.clientX - r.left, e.clientY - r.top); }
  function tipAt(d, x, y){ const r = box.getBoundingClientRect(); tip.innerHTML = "<b>" + esc(d.t) + "</b>" + esc(d.k) + (d.g ? " · <span class='mono'>" + d.g + "</span>" : ""); tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight; tip.style.left = Math.min(Math.max(8, x + 14), r.width - tw - 8) + "px"; tip.style.top = Math.min(Math.max(8, y - th - 10), r.height - th - 8) + "px"; }
  function select(d){ $("#info").innerHTML = "<h3>" + esc(d.t) + "</h3><div class='pb'><div class='k'>" + esc(d.k) + "</div>" + (d.g ? "<p class='mono'>grade " + d.g + "</p>" : "") + (d.d ? "<p>" + esc(d.d) + "</p>" : "") + "</div>"; }

  /* interacao */
  svg.addEventListener("wheel", e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
  const ptrs = new Map(); let last = null, pinch = null;
  svg.addEventListener("pointerdown", e => { if (e.target.closest(".mk")) return; svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY}); last = {x: e.clientX, y: e.clientY}; svg.classList.add("drag");
    if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  svg.addEventListener("pointermove", e => {
    const r = box.getBoundingClientRect(), u = upp(); const wx = view.x + (e.clientX - r.left) * u, wy = view.y + (e.clientY - r.top) * u;
    if (wx >= 0 && wx <= W && wy >= 0 && wy <= W) $("#coord").textContent = "grade " + grade(wx, W - wy);
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 2 && pinch){ const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(pinch / d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch = d; return; }
    if (last){ view.x -= (e.clientX - last.x) * upp(); view.y -= (e.clientY - last.y) * upp(); clampView(); redraw(); last = {x: e.clientX, y: e.clientY}; }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size){ last = null; svg.classList.remove("drag"); } else last = [...ptrs.values()][0]; };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("dblclick", e => { const r = box.getBoundingClientRect(); zoomAt(.55, e.clientX - r.left, e.clientY - r.top); });
  $("#zin").onclick = () => zoomAt(.68, sizePx() / 2, box.clientHeight / 2);
  $("#zout").onclick = () => zoomAt(1 / .68, sizePx() / 2, box.clientHeight / 2);
  $("#zreset").onclick = fit;
  new ResizeObserver(redraw).observe(box);
  $$("#layers input").forEach(i => { const on = () => { if (L[i.dataset.l]) L[i.dataset.l].style.display = i.checked ? "" : "none"; if (i.dataset.l === "sq") L.trail.style.display = i.checked ? "" : "none"; if (i.dataset.l === "names") redraw(); }; i.addEventListener("change", on); on(); });

  /* camadas fixas */
  const FAC = Facs;
  function build(){
    ["fac", "cdf", "haunt", "trade"].forEach(k => L[k].innerHTML = "");
    for (let i = scaled.length - 1; i >= 0; i--) if (!scaled[i].__live) scaled.splice(i, 1);
    for (const f of FAC){
      el("circle", {cx: f.bx, cy: Y(f.bz), r: 4000, fill: COL[f.id.toLowerCase()], "fill-opacity": .06, stroke: COL[f.id.toLowerCase()], "stroke-opacity": .75, "stroke-dasharray": "7 5", "vector-effect": "non-scaling-stroke", "stroke-width": 1.4}, L.fac);
      marker("fac", f.bx, f.bz, g => { el("rect", {x: -9, y: -9, width: 18, height: 18, rx: 2, fill: COL[f.id.toLowerCase()], stroke: COL.paper, "stroke-width": 2.5}, g); el("rect", {x: -3, y: -3, width: 6, height: 6, fill: COL.paper}, g);
        const t = el("text", {x: 14, y: 6, "font-family": "'Big Shoulders Display', 'Arial Narrow', sans-serif", "font-weight": 800, "font-size": 18, fill: COL.ink, stroke: COL.land, "stroke-width": 4, "paint-order": "stroke"}, g); t.textContent = f.id.toUpperCase(); },
        {t: "Base da facção", k: f.id + " · " + f.base, g: grade(f.bx, f.bz), d: "45 pessoas fixas, baú com estoque e caixa. Território de 4 km em volta. Renasce em " + f.renasce + " min, sem nada."}, true);
    }
    for (const [n, x, z] of KOMBAT) marker("cdf", x, z, g => { el("path", {d: "M0 -8 L8 0 L0 8 L-8 0Z", fill: COL.cdf, stroke: COL.paper, "stroke-width": 2}, g); }, {t: "Base da CDF", k: n, g: grade(x, z), d: "Guarnição de 3 soldados. Uma das 14 bases onde o Kombat pode estar."}, true);
    const kinds = [["Leshiy", "serraria", "serraria"], ["Myasnik", "fabrica", "fábrica"], ["Feldsher", "hospital", "hospital"], ["Sektanty", "igreja", "igreja"], ["Kapkan", "comedouro", "comedouro de caça"]];
    for (const [b, k, nome] of kinds) for (const [x, z] of LOCAIS[k]){ const small = k === "comedouro";
      marker("haunt", x, z, g => { el("circle", {r: small ? 3 : 5, fill: "none", stroke: COL.mark, "stroke-width": 1.5, "stroke-opacity": small ? .55 : .9}, g); }, {t: "Pode surgir aqui", k: b + " · " + nome, g: grade(x, z)}); }
    for (const t of TRADE) marker("trade", t.x, t.z, g => {
      if (t.k === "Spawn") el("path", {d: "M-9 7 L0 -9 L9 7Z", fill: COL.ink, stroke: COL.paper, "stroke-width": 2}, g);
      else if (t.k === "Yuri") el("circle", {r: 4.5, fill: COL.paper, stroke: COL.ink, "stroke-width": 2}, g);
      else { el("circle", {r: 15, fill: "none", stroke: COL.ink, "stroke-width": 1.3, "stroke-dasharray": "3 3"}, g); el("circle", {r: 6.5, fill: COL.ink, stroke: COL.paper, "stroke-width": 2}, g); }
      if (t.k !== "Yuri"){ const tx = el("text", {x: t.k === "Spawn" ? -14 : -21, y: 4, "text-anchor": "end", "font-family": "'PT Sans', sans-serif", "font-weight": 700, "font-size": 12, "letter-spacing": ".08em", fill: COL.ink, stroke: COL.land, "stroke-width": 4, "paint-order": "stroke"}, g); tx.textContent = t.k.toUpperCase(); }
    }, {t: t.t, k: t.k, g: grade(t.x, t.z), d: t.d}, true);
  }

  /* reproducao da sessao */
  const ESQ = SES.esq, QD = SES.quadros, sq = {}, fights = [], bosses = [], convoys = [], invs = [];
  const trails = {}; ["Wolves", "Vipers", "Crooks", "Troika"].forEach(f => trails[f] = el("path", {fill: "none", stroke: COL[f.toLowerCase()], "stroke-opacity": .55, "stroke-dasharray": "0", "stroke-linecap": "round"}, L.trail));
  function buildLive(){
    ["sq", "ev", "boss"].forEach(k => L[k].innerHTML = "");
    for (let i = scaled.length - 1; i >= 0; i--) if (scaled[i].__live) scaled.splice(i, 1);
    for (const f in trails){ trails[f].setAttribute("stroke", COL[f.toLowerCase()]); L.trail.appendChild(trails[f]); }
    for (const sid in QD){ const e = ESQ[sid]; if (!e) continue; const [fac, rot, n] = e;
      const g = el("g", {class: "mk"}, L.sq); const k = Math.min(n, 4);
      for (let m = 0; m < k; m++) el("circle", {cx: (m - (k - 1) / 2) * 6.5, cy: 0, r: 3.5, fill: COL[fac.toLowerCase()], stroke: COL.land, "stroke-width": 1.4}, g);
      g.__live = true; g.style.display = "none"; scaled.push(g); sq[sid] = {g, q: QD[sid], fac, rot, n, fim: e[3]};
      bind(g, () => { const s = sq[sid]; return {t: "Esquadrão · " + fac, k: fac + " #" + sid + " · " + s.rot, d: s.estado || ""}; });
    }
    fights.length = 0;
    for (const [t, x, z, fa, fb, txt] of SES.confrontos){ const g = el("g", {class: "mk"}, L.ev); g.__x = x; g.__y = Y(z); g.__live = true; g.style.display = "none";
      el("circle", {r: 13, fill: "none", stroke: COL.ink, "stroke-width": 1.5, class: "ring"}, g);
      el("path", {d: "M-5 -5 L5 5 M5 -5 L-5 5", stroke: COL.ink, "stroke-width": 2.4, "stroke-linecap": "round"}, g);
      scaled.push(g); bind(g, {t: "Confronto · " + relogio(t), k: fa + " × " + fb, g: grade(x, z), d: txt}); fights.push({t, g, ring: g.firstChild}); }
    bosses.length = 0;
    for (const [nome, t0, t1, x, z, lugar, caiu] of SES.chefes){ const g = el("g", {class: "mk"}, L.boss); g.__x = x; g.__y = Y(z); g.__live = true; g.style.display = "none";
      const pulse = el("circle", {r: 12, fill: COL.mark, "fill-opacity": .2}, g); if (!reduce){ el("animate", {attributeName: "r", values: "10;22;10", dur: "2.4s", repeatCount: "indefinite"}, pulse); }
      el("circle", {r: 7.5, fill: COL.mark, stroke: COL.land, "stroke-width": 2.5}, g);
      const tx = el("text", {x: 13, y: -8, "font-family": "'Big Shoulders Display', 'Arial Narrow', sans-serif", "font-weight": 900, "font-size": 17, fill: COL.mark, stroke: COL.land, "stroke-width": 4, "paint-order": "stroke", "letter-spacing": ".03em"}, g); tx.textContent = nome.toUpperCase();
      const dead = el("path", {d: "M-6 -6 L6 6 M6 -6 L-6 6", stroke: COL.paper, "stroke-width": 2.6, "stroke-linecap": "round"}, g); dead.style.display = "none";
      scaled.push(g); const b = BOSS.find(x => x.id === nome);
      bind(g, () => ({t: "Chefe · " + relogio(t0) + (caiu ? " até cair" : ""), k: nome + " · " + lugar, g: grade(x, z), d: b ? b.how : ""}));
      bosses.push({nome, t0, t1, x, z, lugar, caiu, g, dead}); }
    convoys.length = 0;
    for (const [fac, trader, t0, tc, t1, bx, bz, kx, kz, n] of SES.comboios){
      const line = el("path", {d: "M" + bx + " " + Y(bz) + " L" + kx + " " + Y(kz), fill: "none", stroke: COL[fac.toLowerCase()], "stroke-width": 2, "stroke-dasharray": "2 6", "vector-effect": "non-scaling-stroke", "stroke-linecap": "round"}, L.ev); line.style.display = "none";
      const g = el("g", {class: "mk"}, L.ev); g.__live = true; g.style.display = "none";
      el("rect", {x: -15, y: -8, width: 30, height: 16, rx: 2, fill: COL.land, stroke: COL[fac.toLowerCase()], "stroke-width": 1.6}, g);
      for (let m = 0; m < Math.min(n, 5); m++) el("circle", {cx: -9 + m * 4.5, cy: 0, r: 2.3, fill: COL[fac.toLowerCase()]}, g);
      const tx = el("text", {x: 19, y: 4, "font-family": "'PT Sans', sans-serif", "font-size": 11, "font-weight": 700, "letter-spacing": ".08em", fill: COL.ink, stroke: COL.land, "stroke-width": 3.5, "paint-order": "stroke"}, g); tx.textContent = "COMBOIO";
      scaled.push(g); bind(g, {t: "Comboio · " + relogio(t0), k: fac + " → " + trader, d: n + " de escolta levando tralha e notas para vender. Volta com arma montada para o baú."});
      convoys.push({fac, trader, t0, tc: tc == null ? (t1 == null ? SES.fim : (t0 + t1) / 2) : tc, t1: t1 == null ? SES.fim : t1, bx, bz, kx, kz, g, line}); }
    invs.length = 0;
    for (const [a, b, t0, tp, t1, rx, rz, bx, bz, res] of SES.invasoes){
      const sx = rx == null ? bx : rx, sz = rz == null ? bz : rz;
      const arrow = el("path", {d: "M" + sx + " " + Y(sz) + " L" + bx + " " + Y(bz), fill: "none", stroke: COL[a.toLowerCase()], "stroke-width": 3, "vector-effect": "non-scaling-stroke", "stroke-dasharray": "10 6"}, L.ev); arrow.style.display = "none";
      const g = el("g", {class: "mk"}, L.ev); g.__x = bx; g.__y = Y(bz); g.__live = true; g.style.display = "none";
      const ring = el("circle", {r: 26, fill: "none", stroke: COL[a.toLowerCase()], "stroke-width": 3}, g); if (!reduce) el("animate", {attributeName: "r", values: "18;34;18", dur: "1.8s", repeatCount: "indefinite"}, ring);
      const tx = el("text", {x: 0, y: -38, "text-anchor": "middle", "font-family": "'PT Sans', sans-serif", "font-size": 11.5, "font-weight": 700, "letter-spacing": ".08em", fill: COL.ink, stroke: COL.land, "stroke-width": 4, "paint-order": "stroke"}, g); tx.textContent = "INVASÃO";
      scaled.push(g); bind(g, {t: "Invasão · " + relogio(t0), k: "Os " + a + " contra a base dos " + b, d: "Reunião, ataque e cerco. Resultado: a base " + (res === "tomada" ? "caiu" : "resistiu") + " às " + relogio(t1) + "."});
      invs.push({t0, tp: tp == null ? t0 : tp, t1, arrow, g}); }
    applyView();
  }

  function at(q, t){ let lo = 0, hi = q.length - 1; if (t < q[0][0]) return null; if (t >= q[hi][0]) return [q[hi][1], q[hi][2], null, q[hi][3]];
    while (hi - lo > 1){ const m = (lo + hi) >> 1; if (q[m][0] <= t) lo = m; else hi = m; }
    const a = q[lo], b = q[hi], f = (t - a[0]) / Math.max(b[0] - a[0], 1), mov = a[1] !== b[1] || a[2] !== b[2];
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, mov ? b : null, a[3]]; }

  function update(t){
    const s = upp(), td = {Wolves: "", Vipers: "", Crooks: "", Troika: ""};
    for (const sid in sq){ const o = sq[sid]; const p = (o.fim != null && t > o.fim) ? null : at(o.q, t);
      if (!p){ if (o.vis){ o.g.style.display = "none"; o.vis = false; } continue; }
      if (!o.vis){ o.g.style.display = ""; o.vis = true; }
      o.g.__x = p[0]; o.g.__y = Y(p[1]); o.g.setAttribute("transform", "translate(" + p[0] + " " + Y(p[1]) + ") scale(" + s + ")");
      o.estado = p[2] ? "A caminho, " + Math.round(Math.hypot(p[2][1] - p[0], p[2][2] - p[1])) + " m até o próximo ponto." : (p[3] ? p[3].charAt(0).toUpperCase() + p[3].slice(1) + "." : "");
      if (p[2] && td[o.fac] !== undefined) td[o.fac] += "M" + p[0].toFixed(0) + " " + Y(p[1]).toFixed(0) + "L" + p[2][1] + " " + Y(p[2][2]);
    }
    for (const f in trails){ trails[f].setAttribute("d", td[f] || "M0 0"); trails[f].setAttribute("stroke-width", 1.3 * s); trails[f].setAttribute("stroke-dasharray", (5 * s) + " " + (5 * s)); }
    for (const f of fights){ const age = t - f.t; const vis = age >= 0 && age < 150;
      if (vis !== !!f.vis){ f.g.style.display = vis ? "" : "none"; f.vis = vis; }
      if (vis){ f.g.style.opacity = String(Math.max(.25, 1 - age / 150)); f.ring.setAttribute("r", String(8 + Math.min(age, 25) * .9)); } }
    for (const b of bosses){ const vis = t >= b.t0 && (t < b.t1 || (b.caiu && t < b.t1 + 240)); if (vis !== !!b.vis){ b.g.style.display = vis ? "" : "none"; b.vis = vis; }
      if (vis){ const dead = b.caiu && t >= b.t1; b.dead.style.display = dead ? "" : "none"; b.g.style.opacity = dead ? ".65" : "1"; } }
    for (const c of convoys){ const vis = t >= c.t0 && t <= c.t1 + 20; if (vis !== !!c.vis){ c.g.style.display = vis ? "" : "none"; c.line.style.display = vis ? "" : "none"; c.vis = vis; }
      if (!vis) continue; let x, z;
      if (t <= c.tc){ const f = (t - c.t0) / Math.max(c.tc - c.t0, 1); x = c.bx + (c.kx - c.bx) * f; z = c.bz + (c.kz - c.bz) * f; }
      else { const f = Math.min(1, (t - c.tc) / Math.max(c.t1 - c.tc, 1)); x = c.kx + (c.bx - c.kx) * f; z = c.kz + (c.bz - c.kz) * f; }
      c.g.__x = x; c.g.__y = Y(z); c.g.setAttribute("transform", "translate(" + x + " " + Y(z) + ") scale(" + s + ")"); }
    for (const v of invs){ const vis = t >= v.t0 && t <= v.t1; if (vis !== !!v.vis){ v.arrow.style.display = vis ? "" : "none"; v.vis = vis; }
      const atk = vis && t >= v.tp; if (atk !== !!v.atk){ v.g.style.display = atk ? "" : "none"; v.atk = atk; } }
  }

  build(); buildLive(); fit();
  themeHooks.push(() => { build(); buildLive(); redraw(); Replay.refresh(); });
  return { flyTo, update, select, upp, L, redraw };
})();

/* ============ controle da reproducao ============ */
const Replay = (function(){
  const scrub = $("#scrub"), clk = $("#clk"), play = $("#play"), feed = $("#feed"), list = $("#nowList");
  let t = +scrub.value, speed = 30, playing = false, lastTs = 0, lastFeed = -1, lastBossKey = "";
  scrub.max = SES.fim;
  const FEED = [];
  for (const e of SES.eventos) FEED.push({t: e[0], k: e[1], txt: e[2], x: e[3], z: e[4]});
  for (const c of SES.confrontos){ const m = c[5].match(/(\d+) acertos?/); if (m && +m[1] > 0) FEED.push({t: c[0], k: "tiro", txt: c[5], x: c[1], z: c[2]}); }
  for (const m of SES.mortes) FEED.push({t: m.t, k: "morte", txt: m.nome + " (" + m.f + ") morreu na " + m.vida + "ª vida, depois de " + hm(m.viveu) + ". Volta na base, sem nada.", x: null, z: null});
  FEED.sort((a, b) => a.t - b.t);
  const KN = {chefe: "chefe", abate: "chefe caiu", invasao: "invasão", comboio: "comboio", caca: "caçada", ajuda: "socorro", defesa: "defesa", ranking: "ranking", tiro: "tiro", morte: "morte"};
  function renderFeed(){
    let n = 0; while (n < FEED.length && FEED[n].t <= t) n++;
    if (n === lastFeed) return; lastFeed = n;
    const items = FEED.slice(Math.max(0, n - 7), n).reverse();
    feed.innerHTML = items.length ? items.map((e, i) => "<li class='" + (e.x != null ? "go" : "") + "' data-i='" + (n - 1 - i) + "'><span class='h'>" + relogio(e.t).slice(0, 5) + "</span><span><span class='k " + e.k + "'>" + KN[e.k] + "</span>" + esc(e.txt) + "</span></li>").join("") : "<li><span class='h'></span><span class='note'>Nada registrado ainda.</span></li>";
  }
  feed.addEventListener("click", e => { const li = e.target.closest("li.go"); if (!li) return; const ev = FEED[+li.dataset.i]; if (ev && ev.x != null){ MapView.flyTo(ev.x, ev.z, 2600); } });
  function renderBosses(){
    const act = SES.chefes.filter(c => t >= c[1] && (t < c[2] || (c[6] && t < c[2] + 240)));
    const key = act.map(c => c[0] + (c[6] && t >= c[2] ? "x" : "")).join(",");
    if (key === lastBossKey) return; lastBossKey = key;
    $("#nChefes").textContent = act.filter(c => !(c[6] && t >= c[2])).length + " no mapa";
    list.innerHTML = act.length ? "" : "<li class='empty'>Nenhum chefe no mapa neste minuto.</li>";
    for (const c of act){ const dead = c[6] && t >= c[2]; const li = document.createElement("li"); const b = document.createElement("button"); b.type = "button";
      b.innerHTML = "<i class='d'" + (dead ? " style='background:none;border:1.5px solid var(--mark)'" : "") + "></i><span>" + esc(c[0]) + " <span class='g'>" + esc(c[5]) + (dead ? " · derrubado" : "") + "</span></span><span class='g'>" + grade(c[3], c[4]) + "</span>";
      b.addEventListener("click", () => { MapView.flyTo(c[3], c[4], 3200); const bb = BOSS.find(x => x.id === c[0]); MapView.select({t: "Chefe em campo", k: c[0] + " · " + c[5], g: grade(c[3], c[4]), d: bb ? bb.how : ""}); });
      li.appendChild(b); list.appendChild(li); }
  }
  function set(nt){ t = Math.max(0, Math.min(SES.fim, nt)); scrub.value = Math.round(t); clk.textContent = relogio(t); MapView.update(t); renderFeed(); renderBosses(); }
  let rodando = false, visivel = true;
  function loop(ts){ if (!playing || !visivel){ rodando = false; lastTs = 0; return; } rodando = true; const dt = lastTs ? Math.min(.1, (ts - lastTs) / 1000) : 0; lastTs = ts; let nt = t + dt * speed; if (nt >= SES.fim) nt = 0; set(nt); requestAnimationFrame(loop); }
  function toggle(p){ playing = p; play.setAttribute("aria-pressed", p); play.textContent = p ? "Pausar" : "Reproduzir"; if (p && !rodando){ lastTs = 0; requestAnimationFrame(loop); } }
  play.addEventListener("click", () => toggle(!playing));
  scrub.addEventListener("input", () => set(+scrub.value));
  $$("[data-v]").forEach(b => b.addEventListener("click", () => { speed = +b.dataset.v; $$("[data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  // faixa de confrontos por minuto, com caçadas, invasões e chefes derrubados
  function strip(){
    const sv = $("#strip"); sv.innerHTML = ""; const mins = Math.ceil(SES.fim / 60), cnt = new Array(mins).fill(0);
    SES.confrontos.forEach(c => cnt[Math.min(mins - 1, Math.floor(c[0] / 60))]++);
    const mx = Math.max(...cnt), bw = 300 / mins;
    cnt.forEach((c, i) => { if (!c) return; const hgt = 4 + 22 * c / mx; el("rect", {x: i * bw + .5, y: 30 - hgt, width: Math.max(bw - 1, .5), height: hgt, fill: COL["ink-3"]}, sv); });
    SES.eventos.forEach(e => { if (e[1] !== "abate" && e[1] !== "invasao") return; const x = e[0] / SES.fim * 300; el("rect", {x: x - .75, y: 0, width: 1.5, height: 34, fill: e[1] === "abate" ? COL.mark : COL.ink}, sv); });
    el("line", {x1: 0, x2: 300, y1: 30.5, y2: 30.5, stroke: COL.ink, "stroke-width": 1, "vector-effect": "non-scaling-stroke"}, sv);
  }
  strip(); set(t);
  if ("IntersectionObserver" in window){ let started = false; new IntersectionObserver(es => { visivel = es.some(e => e.isIntersecting);
    if (visivel && !started && !reduce){ started = true; toggle(true); } else if (visivel && playing && !rodando){ lastTs = 0; requestAnimationFrame(loop); } }, {threshold: .2}).observe($("#mapBox")); }
  return { refresh(){ strip(); lastFeed = -1; lastBossKey = ""; set(t); } };
})();

"use strict";
/* ============ faccoes ============ */
(function(){
  const grid = $("#facGrid");
  grid.innerHTML = Facs.map(f => {
    const ws = Object.entries(f.pesos).map(([k, v]) => "<div><span>" + k + "</span><i class='" + (v ? "" : "zero") + "' style='width:" + (v ? v / 3 * 100 : 1) + "%'></i><em>" + v + "</em></div>").join("");
    return "<article class='fac' style='--c:var(" + COR[f.id] + ")'><canvas data-f='" + f.id + "' aria-label='Território dos " + f.id + "' role='img'></canvas><div class='fb'>" +
      "<div class='nm'><h3>" + f.id + "</h3><span class='band'><i></i>braçadeira " + f.brac + "</span></div>" +
      "<div class='base'>" + esc(f.base) + " · grade " + grade(f.bx, f.bz) + " · renasce em " + f.renasce + " min</div>" +
      "<p class='story'>" + esc(f.story) + "</p>" +
      "<div class='facts-real'><div><b>" + f.bau + "</b><span>itens no baú</span></div><div><b>" + num(f.caixa) + "</b><span>hryvnia em nota</span></div><div><b>" + f.comboios + "</b><span>comboios</span></div></div>" +
      "<p class='happened'>" + f.fato + "</p>" +
      "<div class='weights'><span class='lbl'>Para onde vão, por peso</span>" + ws + "</div>" +
      "<p class='note'>" + esc(f.farda) + "</p></div></article>";
  }).join("");
  function drawMinis(){
    $$("canvas[data-f]", grid).forEach(cv => {
      const f = Facs.find(x => x.id === cv.dataset.f); const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
      const mw = Math.max(9800, 9800 * w / h * .55); const v = {x: f.bx - mw / 2, y: (W - f.bz) - (mw * h / w) / 2, w: mw};
      drawBase(cv, v, {grid: true, labels: true, after: (ctx, s) => {
        const cx = (f.bx - v.x) * s, cy = (W - f.bz - v.y) * s, c = COL[f.id.toLowerCase()];
        ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.globalAlpha = .08; ctx.beginPath(); ctx.arc(cx, cy, 4000 * s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .85; ctx.stroke(); ctx.restore();
        ctx.fillStyle = c; ctx.strokeStyle = COL.paper; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.rect(cx - 8, cy - 8, 16, 16); ctx.fill(); ctx.stroke(); ctx.fillStyle = COL.paper; ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.font = "700 11px 'PT Sans', sans-serif"; const ru = f.ru.toUpperCase(), rw = ctx.measureText(ru).width; ctx.fillStyle = COL.paper; ctx.fillRect(8, 8, rw + 14, 18); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(8.5, 8.5, rw + 13, 17); ctx.fillStyle = COL.mark; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(ru, 15, 17);
        ctx.font = "700 11px 'PT Sans', sans-serif"; const lt = "TERRITÓRIO · RAIO DE 4 KM", lw = ctx.measureText(lt).width; ctx.fillStyle = COL.paper; ctx.fillRect(8, h - 26, lw + 14, 18); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(8.5, h - 25.5, lw + 13, 17); ctx.fillStyle = COL.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lt, 15, h - 17);
      }});
    });
  }
  new ResizeObserver(drawMinis).observe(grid); themeHooks.push(drawMinis);
})();

/* ============ chefes: agenda simulada ============ */
const Stage = { e: 1, dia: 8 };
const stageHooks = [];
(function(){
  $$("#stageSeg button").forEach(b => b.addEventListener("click", () => { Stage.e = +b.dataset.e; Stage.dia = [8, 20, 32][Stage.e - 1]; $$("#stageSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); stageHooks.forEach(f => f()); }));
})();
function noites(total){
  // hora do jogo comeca as 8h; de dia o relogio anda 4x, de noite 8x (4 x 2)
  const out = []; let hg = 8 * 60, m = 0, ini = null;
  while (m <= total){ const night = hg >= 22 * 60 || hg < 5 * 60; if (night && ini === null) ini = m; if (!night && ini !== null){ out.push([ini, m]); ini = null; }
    hg = (hg + (night ? 8 : 4)) % 1440; m++; }
  if (ini !== null) out.push([ini, total]);
  return out;
}
function simular(dia0, total){
  const R = rng(hashN(dia0, 2026)), rnd = (a, b) => a + R() * (b - a);
  const nts = noites(total), isNight = m => nts.some(([a, b]) => m >= a && m < b);
  const st = BOSS.filter(b => !b.roam).map(b => ({b, s: "D", ate: 0, bars: []}));
  let prox = 0;
  for (let m = 0; m <= total; m++){
    const dia = dia0 + m / 120, f = Math.min(dia / 30, 1);
    for (const o of [...st].sort(() => R() - .5)){
      const b = o.b, ch = b.ch[0] + (b.ch[1] - b.ch[0]) * f;
      if (o.s === "P" && (m >= o.ate || (b.night && !isNight(m)))){ o.s = "D"; o.ate = m + rnd(b.desc[0], b.desc[1]); o.bars[o.bars.length - 1][1] = m; }
      if (o.s === "D" && m >= o.ate){ if (R() < ch) o.s = "R"; else o.ate = m + rnd(b.desc[0], b.desc[1]); }
    }
    const night = isNight(m);
    for (const o of st) if (o.b.night && o.s === "R" && night && m >= prox){ o.s = "P"; o.ate = m + o.b.pres[0]; o.bars.push([m, total]); prox = m + rnd(15, 30); }
    const ativos = st.filter(o => o.s === "P" && !o.b.night).length;
    if (ativos < 5 && m >= prox){ const prontos = st.filter(o => o.s === "R" && !o.b.night); if (prontos.length){ const o = prontos[Math.floor(R() * prontos.length)]; o.s = "P"; o.ate = m + rnd(o.b.pres[0], o.b.pres[1]); o.bars.push([m, total]); prox = m + rnd(15, 30); } }
  }
  return {st, nts};
}
function drawAgenda(){
  const total = 720, {st, nts} = simular(Stage.dia, total), sv = $("#agendaSvg"); sv.innerHTML = "";
  const x0 = 104, x1 = 888, rowH = 28, top = 12, sx = m => x0 + (x1 - x0) * m / total, hgt = top + st.length * rowH + 30;
  sv.setAttribute("viewBox", "0 0 900 " + hgt);
  for (const [a, b] of nts){ el("rect", {x: sx(a), y: top - 6, width: sx(b) - sx(a), height: st.length * rowH + 6, fill: COL.ink, "fill-opacity": .09}, sv); const t = el("text", {x: (sx(a) + sx(b)) / 2, y: top + st.length * rowH + 26, "text-anchor": "middle", "font-size": 11, "font-family": "'IBM Plex Mono', monospace", fill: COL["ink-2"]}, sv); t.textContent = "noite"; }
  for (let hh = 0; hh <= 12; hh += 2){ const x = sx(hh * 60); el("line", {x1: x, x2: x, y1: top - 6, y2: top + st.length * rowH, stroke: COL.rule, "stroke-width": 1}, sv); const t = el("text", {x, y: top + st.length * rowH + 13, "text-anchor": "middle", "font-size": 11, "font-family": "'IBM Plex Mono', monospace", fill: COL["ink-3"]}, sv); t.textContent = hh + " h"; }
  let cobertos = 0; const cover = new Array(total).fill(0);
  st.forEach((o, i) => { const y = top + i * rowH;
    const l = el("text", {x: 0, y: y + rowH / 2 + 1, "dominant-baseline": "middle", "font-size": 13.5, "font-family": "'PT Sans', sans-serif", "font-weight": 700, fill: COL.ink}, sv); l.textContent = o.b.id;
    el("line", {x1: x0, x2: x1, y1: y + rowH / 2, y2: y + rowH / 2, stroke: COL.rule, "stroke-dasharray": "2 4", "stroke-width": 1}, sv);
    for (const [a, b] of o.bars){ const w = Math.max(sx(b) - sx(a), 2);
      const r = el("rect", {x: sx(a) + 1, y: y + 7, width: Math.max(w - 2, 1.5), height: rowH - 14, rx: 3, fill: o.b.night ? COL.ink : COL.mark}, sv);
      hover(r, "<b>" + o.b.id + "</b><br>" + hm(a) + " a " + hm(b) + " de servidor<br>" + hm(b - a) + " no mapa");
      if (!o.b.night) for (let m = Math.floor(a); m < Math.min(total, Math.ceil(b)); m++) cover[m]++; }
  });
  cobertos = cover.filter(c => c > 0).length;
  const media = cover.reduce((p, c) => p + c, 0) / total;
  $("#agendaBig").innerHTML = Math.round(cobertos / total * 100) + "%<small>do tempo com chefe de dia no mapa · média de " + media.toFixed(1).replace(".", ",") + " juntos</small>";
}

/* ============ chefes: dossies ============ */
function emblem(id){
  const T = {Kombat:["КОМБАТ","14 БАЗ ВСЧ"], Chugun:["ЧУГУН","ВЫСОТОВО"], Shtrafbat:["ШТРАФБАТ","АЭРОДРОМ"], Leshiy:["ЛЕШИЙ","ЛЕСОПИЛКИ"], Myasnik:["МЯСНИК","ЗАВОДЫ"], Feldsher:["ФЕЛЬДШЕР","БОЛЬНИЦЫ"], Kapkan:["КАПКАН","ЛЕС"], Sektanty:["СЕКТАНТЫ","ЦЕРКВИ"], Troika:["ТРОЙКА","ВЕЗДЕ"]}[id];
  const star = (cx, cy, r) => { let d = ""; for (let k = 0; k < 10; k++){ const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .42 : r; d += (k ? "L" : "M") + (cx + Math.cos(a) * rr).toFixed(1) + " " + (cy + Math.sin(a) * rr).toFixed(1); } return d + "Z"; };
  const G = {
    Kombat: "<path d='M49 88 V40 L60 31 L71 40 V88 Z' fill='none' stroke='currentColor' stroke-width='2.6'/><path d='M55.5 42 V86 M64.5 42 V86' stroke='currentColor' stroke-width='1.8'/><circle cx='60' cy='38' r='2.4' fill='currentColor'/><path d='" + star(60, 64, 9) + "' fill='currentColor'/>",
    Chugun: "<path d='M46 58 C46 36, 74 36, 74 58' fill='none' stroke='currentColor' stroke-width='6.5' stroke-linecap='round'/><circle cx='60' cy='70' r='17' fill='currentColor'/><rect x='50' y='84' width='20' height='5' fill='currentColor'/>",
    Shtrafbat: "<rect x='56.5' y='30' width='7' height='60' rx='3.5' fill='currentColor'/><path d='M30 55 L90 55 L88 61 L32 61 Z' fill='currentColor'/><rect x='38' y='51' width='4' height='12' fill='currentColor'/><rect x='47' y='51' width='4' height='12' fill='currentColor'/><rect x='69' y='51' width='4' height='12' fill='currentColor'/><rect x='78' y='51' width='4' height='12' fill='currentColor'/><path d='M47 84 L73 84 L72 89 L48 89 Z' fill='currentColor'/>",
    Leshiy: "<circle cx='60' cy='62' r='26' fill='none' stroke='currentColor' stroke-width='2.4'/><path d='M60 36 V48 M34 62 H46 M74 62 H86' stroke='currentColor' stroke-width='2.4'/><path d='M53 64 L60 55 L67 64' fill='none' stroke='currentColor' stroke-width='2.4'/><path d='M56 72 L60 67 L64 72 M57.5 79 L60 76 L62.5 79' fill='none' stroke='currentColor' stroke-width='1.8'/><path d='M38 70 H50 M40 70 v-3 M44 70 v-3 M48 70 v-3' stroke='currentColor' stroke-width='1.4'/>",
    Myasnik: "<g transform='rotate(-38 60 62)'><rect x='57.5' y='44' width='5' height='46' rx='2' fill='currentColor'/><rect x='43' y='31' width='34' height='15' rx='2' fill='currentColor'/></g>",
    Feldsher: "<rect x='46' y='31' width='28' height='34' rx='7' fill='none' stroke='currentColor' stroke-width='2.6'/><path d='M49 48 H71 V58 Q71 62 67 62 H53 Q49 62 49 58 Z' fill='currentColor'/><circle cx='60' cy='36' r='2' fill='currentColor'/><path d='M60 65 V73 C60 81, 52 79, 52 87' fill='none' stroke='currentColor' stroke-width='2.2'/><path d='M52 88 C49.5 91, 49.5 93.5, 52 94 C54.5 93.5, 54.5 91, 52 88 Z' fill='currentColor'/>",
    Kapkan: (() => { let up = "M32 60", dn = "M32 64"; for (let k = 0; k <= 12; k++){ const a = Math.PI + k * Math.PI / 12, r = k % 2 ? 19 : 26; up += " L" + (60 + Math.cos(a) * r).toFixed(1) + " " + (60 + Math.sin(a) * r * .8).toFixed(1); } for (let k = 0; k <= 12; k++){ const a = Math.PI - k * Math.PI / 12, r = k % 2 ? 19 : 26; dn += " L" + (60 + Math.cos(a) * r).toFixed(1) + " " + (64 + Math.sin(a) * r * .8).toFixed(1); } return "<path d='" + up + "' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linejoin='round'/><path d='" + dn + "' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linejoin='round'/><circle cx='60' cy='62' r='4' fill='currentColor'/><path d='M60 86 V94' stroke='currentColor' stroke-width='2.4'/><circle cx='60' cy='97' r='3' fill='none' stroke='currentColor' stroke-width='2'/>"; })(),
    Sektanty: "<path d='M60 28 C67 37, 67 45, 60 48 C53 45, 53 37, 60 28 Z' fill='currentColor'/><path d='M60 48 V53' stroke='currentColor' stroke-width='1.6'/><path d='M52 53 H68 V90 H52 Z' fill='currentColor'/><path d='M52 53 h5 v7 a2.5 2.5 0 0 1 -5 0 Z' style='fill:var(--paper)'/>",
    Troika: "<path d='M60 40 L44 70 L76 70 Z' fill='none' stroke='currentColor' stroke-width='1.6'/><circle cx='60' cy='40' r='8' fill='currentColor'/><circle cx='44' cy='70' r='8' fill='currentColor'/><circle cx='76' cy='70' r='8' fill='currentColor'/>"
  }[id];
  return "<svg class='emb' viewBox='0 0 120 120' aria-hidden='true' focusable='false'><g filter='url(#tinta)'>" +
    "<circle cx='60' cy='60' r='56' fill='none' stroke='currentColor' stroke-width='2.8'/><circle cx='60' cy='60' r='41' fill='none' stroke='currentColor' stroke-width='1.3'/>" +
    "<path id='at-" + id + "' d='M14 60 A46 46 0 0 1 106 60' fill='none'/><path id='ab-" + id + "' d='M8 60 A52 52 0 0 0 112 60' fill='none'/>" +
    "<text font-family='PT Sans, sans-serif' font-weight='700' font-size='11' letter-spacing='2' fill='currentColor'><textPath href='#at-" + id + "' xlink:href='#at-" + id + "' startOffset='50%' text-anchor='middle'>" + T[0] + "</textPath></text>" +
    "<text font-family='PT Sans, sans-serif' font-weight='700' font-size='8.5' letter-spacing='1.6' fill='currentColor'><textPath href='#ab-" + id + "' xlink:href='#ab-" + id + "' startOffset='50%' text-anchor='middle'>" + T[1] + "</textPath></text>" +
    "<circle cx='12.5' cy='60' r='2' fill='currentColor'/><circle cx='107.5' cy='60' r='2' fill='currentColor'/>" + G + "</g></svg>";
}
const VOICEFILE = {kombat: k => "som/kombat_" + k + ".ogg", chugun: k => "som/chugun_" + k + ".ogg", shtrafbat: k => "som/shtrafbat" + k.slice(1, 2) + "_" + k.slice(3) + ".ogg"};
const PLAY_ICO = "<svg viewBox='0 0 10 10' aria-hidden='true'><path d='M2 1 L9 5 L2 9 Z' fill='currentColor'/></svg>", STOP_ICO = "<svg viewBox='0 0 10 10' aria-hidden='true'><rect x='2' y='2' width='6' height='6' fill='currentColor'/></svg>";
(function(){
  const grid = $("#bossGrid"); let audio = null, playing = null;
  const h1 = a => (a / 60).toLocaleString("pt-BR", {maximumFractionDigits: 1});
  const rng2 = a => a[0] === a[1] ? h1(a[0]) + " h" : h1(a[0]) + "–" + h1(a[1]) + " h";
  const where = b => b.roam ? "o mapa todo" : b.lugares.length === 1 ? b.lugares[0][2] : b.lugares.length + " " + ({Serraria: "serrarias", "Fábrica": "fábricas", Hospital: "hospitais", "Comedouro de caça": "comedouros", Igreja: "igrejas"}[b.lugares[0][2]] || "bases da CDF");
  function render(){
    const e = Stage.e;
    grid.innerHTML = BOSS.map(b => {
      const chance = b.roam ? "rara" : b.night ? "toda noite" : Math.round(b.ch[0] * 100) + "→" + Math.round(b.ch[1] * 100) + "%";
      const kv = "<div class='kv'><div><b>" + esc(where(b)) + "</b><span>onde</span></div><div><b>" + (b.roam ? "sempre andando" : b.night ? "a noite inteira" : rng2(b.pres)) + "</b><span>fica</span></div><div><b>" + chance + "</b><span>chance de voltar</span></div><div><b>" + rng2(b.morte) + "</b><span>morto, some</span></div></div>";
      const voices = b.lines ? "<div class='voices'>" + b.lines.map(l => "<button type='button' class='voice' aria-pressed='false' data-src='" + VOICEFILE[b.voice](l[0]) + "'><span class='pl'>" + PLAY_ICO + "</span><span class='ruq' lang='ru'>" + esc(l[1]) + "<span class='pt' lang='pt-BR'>" + esc(l[2]) + "</span></span></button>").join("") + "</div>" : "";
      const head = "<div class='bh'><div><h3>" + b.id + "</h3><div class='who'>" + esc(b.who) + "</div></div>" + emblem(b.id) + "</div><p class='story'>" + esc(b.story) + "</p>";
      const body = kv + "<div class='kit'><span class='lbl'>Equipamento · etapa " + e + "</span>" + esc(b.kit.always) + ". <b>" + esc(b.kit.e[e - 1]) + ".</b></div>" + voices +
        "<details class='more' open><summary>Como luta e o que deixa</summary><div><p>" + esc(b.how) + "</p><p><b>Recompensa.</b> " + esc(b.loot) + "</p>" + (!b.roam ? "<p><button type='button' class='btn sm' data-fly='" + b.id + "'>Ver no mapa onde surge</button></p>" : "") + "</div></details>";
      return "<article class='boss" + (b.big ? " big" : "") + (b.roam ? " wide" : "") + "' id='chefe-" + b.id + "'>" + (b.roam ? "<div class='col'>" + head + "</div><div class='col'>" + body + "</div>" : head + body) + "</article>";
    }).join("");
    $$(".voice", grid).forEach(v => v.addEventListener("click", () => play(v)));
    $$("[data-fly]", grid).forEach(btn => btn.addEventListener("click", () => { const box = $("#layers [data-l=haunt]"); box.checked = true; box.dispatchEvent(new Event("change")); const b = BOSS.find(x => x.id === btn.dataset.fly); const xs = b.lugares.map(p => p[0]), zs = b.lugares.map(p => p[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2; const w = Math.max(3200, Math.max(...xs) - Math.min(...xs) + 2600, Math.max(...zs) - Math.min(...zs) + 2600); $("#mapa").scrollIntoView(); MapView.flyTo(cx, cz, Math.min(w, W)); }));
    $$("#timeline [data-e]").forEach(x => x.classList.toggle("cur", +x.dataset.e === e));
  }
  function reset(v){ v.classList.remove("on"); v.setAttribute("aria-pressed", "false"); v.querySelector(".pl").innerHTML = PLAY_ICO; }
  function play(v){
    if (playing === v && audio && !audio.paused){ audio.pause(); reset(v); playing = null; return; }
    if (audio){ audio.pause(); if (playing) reset(playing); }
    audio = new Audio(somURL(v.dataset.src)); playing = v; v.classList.add("on"); v.setAttribute("aria-pressed", "true"); v.querySelector(".pl").innerHTML = STOP_ICO;
    audio.addEventListener("ended", () => { reset(v); playing = null; });
    audio.play().catch(() => { reset(v); const pt = v.querySelector(".pt"); if (!pt.dataset.err){ pt.dataset.err = 1; pt.textContent += " (este navegador não toca .ogg)"; } });
  }
  stageHooks.push(render, drawAgenda); themeHooks.push(drawAgenda);
  render(); drawAgenda();
})();

/* ============ graficos ============ */
const ctip = $("#ctip");
function tipShow(e, html){ ctip.innerHTML = html; ctip.hidden = false; const w = ctip.offsetWidth, h = ctip.offsetHeight; ctip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + "px"; ctip.style.top = Math.max(8, e.clientY - h - 12) + "px"; }
function hover(node, html){ node.addEventListener("pointermove", e => tipShow(e, html)); node.addEventListener("pointerleave", () => { ctip.hidden = true; }); }
function labelInk(hex){ const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; return .2126 * r + .7152 * g + .0722 * b > .33 ? "#1b1e16" : "#ecebdf"; }
function curvaAt(d){ if (d >= 30) return CURVA[3][1].map(x => x); let i = 0; while (i < CURVA.length - 1 && CURVA[i + 1][0] <= d) i++; const [d0, a] = CURVA[i], [d1, b] = CURVA[i + 1]; const f = (d - d0) / (d1 - d0); const v = a.map((x, k) => x + (b[k] - x) * f); const s = v.reduce((p, c) => p + c, 0); return v.map(x => x / s * 100); }
function drawCurva(){
  const svg = $("#chCurva"); svg.innerHTML = ""; const ramp = [1, 2, 3, 4, 5, 6].map(i => css("--r" + i));
  const rows = CURVA.map(([d, v]) => ["Dia " + d, v.map(x => x / v.reduce((p, c) => p + c, 0) * 100), false]);
  rows.push(["Dia " + Stage.dia + " (etapa " + Stage.e + ")", curvaAt(Stage.dia), true]);
  const x0 = 122, x1 = 548, bh = 26, gap = 15, base = 6 + rows.length * (bh + gap) - gap;
  [0, 25, 50, 75, 100].forEach(p => { const x = x0 + (x1 - x0) * p / 100; el("line", {x1: x, x2: x, y1: 4, y2: base + 4, stroke: COL.rule, "stroke-width": 1}, svg); const t = el("text", {x, y: base + 18, "text-anchor": "middle", "font-size": 11, "font-family": "'IBM Plex Mono', monospace", fill: COL["ink-3"]}, svg); t.textContent = p + "%"; });
  rows.forEach(([lab, v, cur], r) => { const y = 6 + r * (bh + gap);
    const t = el("text", {x: 0, y: y + bh / 2 + 4, "font-size": 13, "font-family": "'PT Sans', sans-serif", "font-weight": cur ? 700 : 400, fill: COL.ink}, svg); t.textContent = lab;
    if (cur) el("rect", {x: x0 - 6, y: y - 5, width: x1 - x0 + 12, height: bh + 10, rx: 4, fill: "none", stroke: COL.mark, "stroke-width": 1.5}, svg);
    let acc = 0; v.forEach((p, k) => { const x = x0 + (x1 - x0) * acc / 100, w = (x1 - x0) * p / 100; acc += p; if (w <= 0) return;
      const rr = el("rect", {x: x + 1, y, width: Math.max(w - 2, .5), height: bh, rx: k === 0 || k === 5 ? 3 : 0, fill: ramp[k]}, svg);
      hover(rr, "<b>" + esc(lab) + "</b><br>" + PATENTES[k] + ": " + p.toFixed(1).replace(".", ",") + "%");
      if (w > 30){ const tx = el("text", {x: x + w / 2, y: y + bh / 2 + 4, "text-anchor": "middle", "font-size": 11, "font-family": "'IBM Plex Mono', monospace", fill: labelInk(ramp[k]), "pointer-events": "none"}, svg); tx.textContent = Math.round(p); } }); });
  $("#lgCurva").innerHTML = PATENTES.map((p, k) => "<span><i style='background:" + ramp[k] + "'></i>" + p + "</span>").join("");
  $("#tbCurva").innerHTML = "<table><tr><th>Dia</th>" + PATENTES.map(p => "<th class='n'>" + p + "</th>").join("") + "</tr>" + rows.map(([l, v]) => "<tr><td>" + esc(l) + "</td>" + v.map(x => "<td class='n'>" + x.toFixed(0) + "%</td>").join("") + "</tr>").join("") + "</table>";
}
function drawVisao(){
  const svg = $("#chVisao"); svg.innerHTML = ""; const data = NIVEIS.map((n, i) => [PATENTES[i], n[2], n[0], n[1]]).concat([["Chefe", 600, .7, .99]]);
  const x0 = 52, x1 = 552, y0 = 212, max = 600, bw = (x1 - x0) / data.length;
  [0, 200, 400, 600].forEach(v => { const y = y0 - (y0 - 16) * v / max; el("line", {x1: x0, x2: x1, y1: y, y2: y, stroke: COL.rule, "stroke-width": 1}, svg); const t = el("text", {x: x0 - 8, y: y + 4, "text-anchor": "end", "font-size": 11, "font-family": "'IBM Plex Mono', monospace", fill: COL["ink-3"]}, svg); t.textContent = v + " m"; });
  data.forEach(([n, v, pmin, pmax], i) => { const h = (y0 - 16) * v / max, x = x0 + i * bw + bw * .2, w = bw * .6, boss = n === "Chefe";
    const r = el("path", {d: "M" + x + " " + y0 + " V" + (y0 - h + 4) + " q0 -4 4 -4 H" + (x + w - 4) + " q4 0 4 4 V" + y0 + " Z", fill: boss ? COL.mark : COL["ink-2"]}, svg);
    hover(r, "<b>" + n + "</b><br>vê a " + v + " m<br>precisão de " + Math.round(pmin * 100) + " a " + Math.round(pmax * 100) + "%");
    const t = el("text", {x: x + w / 2, y: y0 - h - 8, "text-anchor": "middle", "font-size": 12, "font-family": "'IBM Plex Mono', monospace", "font-weight": 600, fill: COL.ink}, svg); t.textContent = v;
    const l = el("text", {x: x + w / 2, y: y0 + 18, "text-anchor": "middle", "font-size": 12, "font-family": "'PT Sans', sans-serif", fill: COL["ink-2"]}, svg); l.textContent = n; });
  el("line", {x1: x0, x2: x1, y1: y0, y2: y0, stroke: COL.ink, "stroke-width": 1}, svg);
  $("#tbVisao").innerHTML = "<table><tr><th>Patente</th><th class='n'>Visão</th><th class='n'>Precisão</th></tr>" + data.map(d => "<tr><td>" + d[0] + "</td><td class='n'>" + d[1] + " m</td><td class='n'>" + Math.round(d[2] * 100) + "–" + Math.round(d[3] * 100) + "%</td></tr>").join("") + "</table>";
}
function drawFac(){
  const svg = $("#chFac"); svg.innerHTML = ""; const x0 = 78, x1 = 440, min = -150, max = 500, sx = v => x0 + (x1 - x0) * (v - min) / (max - min), bh = 26, g = 15;
  [-100, 0, 100, 200, 300, 400, 500].forEach(v => { el("line", {x1: sx(v), x2: sx(v), y1: 2, y2: 4 + PLACAR.length * (bh + g) - g + 4, stroke: v === 0 ? COL.ink : COL.rule, "stroke-width": 1}, svg); const t = el("text", {x: sx(v), y: 4 + PLACAR.length * (bh + g) + 12, "text-anchor": "middle", "font-size": 10.5, "font-family": "'IBM Plex Mono', monospace", fill: COL["ink-3"]}, svg); t.textContent = v; });
  PLACAR.forEach(([n, v, ab, bs, bx], i) => { const y = 6 + i * (bh + g), a = sx(Math.min(0, v)), b = sx(Math.max(0, v));
    const l = el("text", {x: 0, y: y + bh / 2 + 5, "font-size": 14, "font-family": "'PT Sans', sans-serif", "font-weight": 700, fill: COL.ink}, svg); l.textContent = n;
    const r = el("rect", {x: a, y, width: b - a, height: bh, rx: 3, fill: COL[n.toLowerCase()]}, svg);
    hover(r, "<b>" + n + "</b><br>" + v + " pts<br>abates " + num(ab) + " · bases " + bs + " · baixas " + bx);
    const t = el("text", {x: v >= 0 ? b + 6 : a - 6, y: y + bh / 2 + 4, "text-anchor": v >= 0 ? "start" : "end", "font-size": 12, "font-family": "'IBM Plex Mono', monospace", "font-weight": 600, fill: COL.ink}, svg); t.textContent = v; });
  $("#tbFac").innerHTML = "<table><tr><th>Facção</th><th class='n'>Pontos</th><th class='n'>Abates</th><th class='n'>Bases</th><th class='n'>Baixas</th></tr>" + PLACAR.map(p => "<tr><td>" + p[0] + "</td>" + p.slice(1).map(x => "<td class='n'>" + x + "</td>").join("") + "</tr>").join("") + "</table>";
}
function drawRank(){
  $("#rankTbl").innerHTML = "<tr><th>#</th><th>Nome</th><th>Lado</th><th class='n'>NPC</th><th class='n'>Chefe</th><th class='n'>Mortes</th><th class='n'>Pontos</th></tr>" +
    RANK.map((r, i) => "<tr class='" + (i < 3 ? "top" : "") + "'><td class='pos'>" + (i + 1) + "º</td><td>" + esc(r[0]) + "</td><td><span class='tag'><i style='background:var(" + COR[r[1]] + ")'></i>" + r[1] + "</span></td><td class='n'>" + r[3] + "</td><td class='n'>" + r[5] + "</td><td class='n'>" + r[6] + "</td><td class='pts'>" + r[2] + "</td></tr>").join("");
}
function drawObit(){
  const rows = [...SES.mortes].sort((a, b) => b.vida - a.vida || b.viveu - a.viveu).slice(0, 10);
  $("#obitSub").textContent = SES.mortes.length + " mortes do elenco na sessão de 13/11. Vida = quantas vezes a pessoa já renasceu neste wipe. Traço vai de 1 (mais forte) a 5.";
  $("#obitTbl").innerHTML = "<tr><th>Nome</th><th>Facção</th><th>Perfil</th><th class='n'>Vida</th><th class='n'>Viveu</th><th class='n'>Traço</th></tr>" + rows.map(m => "<tr><td>" + esc(m.nome) + "</td><td><span class='tag'><i style='background:var(" + COR[m.f] + ")'></i>" + m.f + "</span></td><td>" + (PERFIL[m.perfil] || m.perfil) + "</td><td class='n'>" + m.vida + "ª</td><td class='n'>" + hm(m.viveu) + "</td><td class='n'>" + m.traco + "</td></tr>").join("");
}
function drawProfiles(){ $("#profiles").innerHTML = PERFIS.map(p => "<div class='prof'><h4>" + p.n + "</h4><span class='pct'>" + p.p + "% dos NPCs</span><p>" + esc(p.d) + "</p><ul>" + p.s.map(s => "<li>" + esc(s) + "</li>").join("") + "</ul></div>").join(""); }
function drawSkills(){
  const L = +$("#lvl").value; $("#lvlO").textContent = L;
  const fmt = v => { const x = v * L, a = Math.abs(x); return (x < 0 ? "−" : "+") + (a % 1 ? a.toFixed(1).replace(".", ",") : a) + "%"; };
  $("#skills").innerHTML = SKILLS.map(([n, g, up, ef, extra]) => "<div class='skill'><div class='sh'><h4>" + n + "</h4><span class='grp'>" + g + "</span></div><div class='pips' aria-hidden='true'>" + Array.from({length: 10}, (_, i) => "<i class='" + (i < L ? "on" : "") + "'></i>").join("") + "</div><span class='up'>Sobe: " + esc(up) + "</span><ul>" + ef.map(([t, v]) => "<li><span>" + esc(t) + "</span><b>" + fmt(v) + "</b></li>").join("") + "</ul>" + (extra ? "<span class='up'>" + esc(extra) + "</span>" : "") + "</div>").join("");
  const k = 1 + .03 * L, a = 40 * k, b = 55 * k, max = 80, f = x => x.toFixed(1).replace(".", ",");
  $("#kgBar").innerHTML = "<div class='a' style='width:" + (a / max * 100) + "%'></div><div class='b' style='left:" + (a / max * 100) + "%;width:" + ((b - a) / max * 100) + "%'></div><div class='c' style='width:" + ((max - b) / max * 100) + "%'></div>" +
    "<span style='left:0'>corre</span><span style='left:" + (a / max * 100) + "%'>" + f(a) + " kg · não corre</span><span style='left:" + (b / max * 100) + "%'>" + f(b) + " kg · só anda</span>";
}
function drawMods(){ $("#mods").innerHTML = MODS.map(([n, id, d]) => "<li><a href='https://steamcommunity.com/sharedfiles/filedetails/?id=" + id + "' target='_blank' rel='noopener'>" + esc(n) + "</a><span>" + esc(d) + " · " + id + "</span></li>").join(""); }
$("#lvl").addEventListener("input", drawSkills);
function drawCharts(){ drawCurva(); drawVisao(); drawFac(); }
drawCharts(); drawRank(); drawObit(); drawProfiles(); drawSkills(); drawMods();
themeHooks.push(drawCharts); stageHooks.push(drawCurva);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => themeHooks.forEach(f => f()));
