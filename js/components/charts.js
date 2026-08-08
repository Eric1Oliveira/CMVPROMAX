/**
 * CMV Pro — Gráficos SVG (sem bibliotecas)
 * ----------------------------------------
 * Implementa as specs do design system de dados:
 *  - linhas 2px (round join/cap), marcador final ≥8px com anel da superfície;
 *  - colunas ≤24px, topo arredondado 4px, base reta, folga entre vizinhas;
 *  - gridlines hairline sólidas e recessivas; texto sempre em tokens de texto;
 *  - hover: crosshair + tooltip (linhas) e tooltip por marca (colunas);
 *  - cores: somente var(--chart-N) — paleta validada em tokens.css.
 *
 * API:
 *   lineChart(el, { labels, series: [{ name, values, color }], fmt })
 *   barChart(el,  { labels, series: [{ name, values, color }], fmt })
 *   legend(el, series) — legenda HTML (obrigatória para ≥2 séries)
 */

import { esc } from '../utils/format.js';

const W = 620;          // largura lógica do viewBox (escala via CSS)
const H = 240;
const PAD = { top: 14, right: 16, bottom: 26, left: 46 };

/* ------------------------------ tooltip ------------------------------- */

let tipEl = null;

/** Tooltip único, reutilizado por todos os gráficos. */
function tip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'chart-tooltip';
  document.getElementById('overlay-root').appendChild(tipEl);
  return tipEl;
}

function showTip(x, y, label, rows) {
  const t = tip();
  t.innerHTML = `
    <div class="chart-tooltip__label">${esc(label)}</div>
    ${rows.map((r) => `
      <div class="chart-tooltip__row">
        <span class="legend-key__swatch" style="background:${r.color}"></span>
        <span class="text-2">${esc(r.name)}</span>
        <strong>${esc(r.value)}</strong>
      </div>`).join('')}
  `;
  t.classList.add('is-visible');
  const rect = t.getBoundingClientRect();
  // mantém o tooltip dentro da janela
  const left = Math.min(Math.max(8, x - rect.width / 2), innerWidth - rect.width - 8);
  const top = y - rect.height - 12 < 8 ? y + 16 : y - rect.height - 12;
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

function hideTip() {
  tipEl?.classList.remove('is-visible');
}

/* ----------------------------- utilidades ----------------------------- */

/** Máximo "bonito" e ticks arredondados (0 / 1.000 / 2.000…). */
function niceScale(maxValue, tickCount = 4) {
  const max = Math.max(1, maxValue);
  const rawStep = max / tickCount;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

/** Formata valores do eixo de forma compacta (1,2 mil). */
function axisFmt(v) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Base do SVG com grid e eixos (retorna svg + área útil). */
function baseSvg(labels, top, ticks) {
  const iw = W - PAD.left - PAD.right;   // largura da área de dados
  const ih = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + ih - (v / top) * ih;

  const grid = ticks.map((t) =>
    `<line x1="${PAD.left}" y1="${y(t)}" x2="${W - PAD.right}" y2="${y(t)}"
       stroke="var(--chart-grid)" stroke-width="1"/>
     <text x="${PAD.left - 8}" y="${y(t) + 3.5}" text-anchor="end"
       font-size="10.5" fill="var(--text-3)" class="tnum">${axisFmt(t)}</text>`
  ).join('');

  // Rótulos do eixo X: mostra no máximo ~8 para não colidir
  const stride = Math.ceil(labels.length / 8);
  const xLabels = labels.map((lb, i) => {
    if (i % stride !== 0 && i !== labels.length - 1) return '';
    const x = PAD.left + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${esc(lb)}</text>`;
  }).join('');

  return {
    iw, ih, y,
    open: `<svg viewBox="0 0 ${W} ${H}" role="img">
      ${grid}
      <line x1="${PAD.left}" y1="${PAD.top + ih}" x2="${W - PAD.right}" y2="${PAD.top + ih}"
        stroke="var(--chart-axis)" stroke-width="1"/>
      ${xLabels}`,
    close: '</svg>',
  };
}

/* ---------------------------- gráfico de linha ------------------------ */

/**
 * Gráfico de linhas com área suave, crosshair e tooltip.
 * series: [{ name, values:number[], color:'var(--chart-1)' }]
 */
export function lineChart(el, { labels, series, fmt = axisFmt }) {
  const maxV = Math.max(...series.flatMap((s) => s.values));
  const { top, ticks } = niceScale(maxV);
  const { iw, ih, y, open, close } = baseSvg(labels, top, ticks);
  const x = (i) => PAD.left + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);

  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
    const line = `M${pts.join(' L')}`;
    const area = `M${x(0)},${y(0)} L${pts.join(' L')} L${x(s.values.length - 1)},${PAD.top + ih} Z`;
    const lastI = s.values.length - 1;
    return `
      <!-- style= em vez de atributo: var() só é garantido em propriedades CSS -->
      <path d="${area}" fill="${s.color}" style="opacity:var(--chart-area-alpha)"/>
      <path d="${line}" fill="none" stroke="${s.color}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
      <!-- marcador do último ponto: r=4 (8px) + anel de 2px da superfície -->
      <circle cx="${x(lastI)}" cy="${y(s.values[lastI])}" r="6" fill="var(--surface)"/>
      <circle cx="${x(lastI)}" cy="${y(s.values[lastI])}" r="4" fill="${s.color}"/>`;
  }).join('');

  // camadas de hover: crosshair + pontos realçados
  const hover = `
    <line data-crosshair x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + ih}"
      stroke="var(--chart-axis)" stroke-width="1" opacity="0"/>
    ${series.map((s) => `
      <circle data-hoverdot r="6" fill="var(--surface)" opacity="0"/>
      <circle data-hoverdot2 r="4" fill="${s.color}" opacity="0"/>`).join('')}
    <rect data-hit x="${PAD.left}" y="${PAD.top}" width="${iw}" height="${ih}" fill="transparent"/>`;

  el.innerHTML = open + paths + hover + close;

  /* interação: encontra o índice mais próximo do cursor */
  const svg = el.querySelector('svg');
  const hit = svg.querySelector('[data-hit]');
  const cross = svg.querySelector('[data-crosshair]');
  const dots = [...svg.querySelectorAll('[data-hoverdot]')];
  const dots2 = [...svg.querySelectorAll('[data-hoverdot2]')];

  function onMove(e) {
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const rel = (mx - PAD.left) / iw;
    const i = Math.round(rel * (labels.length - 1));
    if (i < 0 || i >= labels.length) return;

    const cx = x(i);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('opacity', '1');

    series.forEach((s, k) => {
      dots[k].setAttribute('cx', cx);
      dots[k].setAttribute('cy', y(s.values[i]));
      dots[k].setAttribute('opacity', '1');
      dots2[k].setAttribute('cx', cx);
      dots2[k].setAttribute('cy', y(s.values[i]));
      dots2[k].setAttribute('opacity', '1');
    });

    showTip(
      rect.left + cx / scaleX,
      e.clientY,
      labels[i],
      series.map((s) => ({ name: s.name, color: s.color, value: fmt(s.values[i]) }))
    );
  }

  function onLeave() {
    cross.setAttribute('opacity', '0');
    [...dots, ...dots2].forEach((d) => d.setAttribute('opacity', '0'));
    hideTip();
  }

  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerleave', onLeave);
}

/* --------------------------- gráfico de colunas ------------------------ */

/**
 * Colunas (1–2 séries agrupadas), topo arredondado 4px, base reta.
 */
export function barChart(el, { labels, series, fmt = axisFmt }) {
  const maxV = Math.max(...series.flatMap((s) => s.values));
  const { top, ticks } = niceScale(maxV);
  const { iw, ih, y, open, close } = baseSvg(labels, top, ticks);

  const groupW = iw / labels.length;
  const n = series.length;
  // largura da coluna: cap de 24px, folga mínima de 2px entre vizinhas
  const barW = Math.min(24, (groupW * 0.62 - (n - 1) * 2) / n);

  const bars = labels.map((lb, i) => {
    const cx = PAD.left + groupW * i + groupW / 2;
    const totalW = n * barW + (n - 1) * 2;
    return series.map((s, k) => {
      const v = s.values[i];
      const bx = cx - totalW / 2 + k * (barW + 2);
      const by = y(v);
      const h = PAD.top + ih - by;
      const r = Math.min(4, h); // topo arredondado, nunca maior que a coluna
      // path: cantos superiores arredondados, base reta (cresce da baseline)
      const d = `M${bx},${PAD.top + ih}
                 L${bx},${by + r} Q${bx},${by} ${bx + r},${by}
                 L${bx + barW - r},${by} Q${bx + barW},${by} ${bx + barW},${by + r}
                 L${bx + barW},${PAD.top + ih} Z`;
      return `<path d="${d}" fill="${s.color}" data-bar="${i}" data-s="${k}"/>`;
    }).join('');
  }).join('');

  // zonas de hover por grupo (hit target maior que a marca)
  const hits = labels.map((lb, i) =>
    `<rect data-hitbar="${i}" x="${PAD.left + groupW * i}" y="${PAD.top}"
       width="${groupW}" height="${ih}" fill="transparent"/>`
  ).join('');

  el.innerHTML = open + bars + hits + close;

  const svg = el.querySelector('svg');
  svg.querySelectorAll('[data-hitbar]').forEach((zone) => {
    const i = Number(zone.dataset.hitbar);

    zone.addEventListener('pointermove', (e) => {
      // realce: demais grupos ficam levemente esmaecidos
      svg.querySelectorAll('[data-bar]').forEach((b) => {
        b.style.opacity = Number(b.dataset.bar) === i ? '1' : '0.45';
      });
      showTip(
        e.clientX, e.clientY,
        labels[i],
        series.map((s) => ({ name: s.name, color: s.color, value: fmt(s.values[i]) }))
      );
    });

    zone.addEventListener('pointerleave', () => {
      svg.querySelectorAll('[data-bar]').forEach((b) => (b.style.opacity = '1'));
      hideTip();
    });
  });
}

/* ------------------------------- legenda ------------------------------- */

/** Legenda HTML — presente sempre que houver 2+ séries. */
export function legend(el, series) {
  if (series.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = series.map((s) => `
    <span class="legend-key">
      <span class="legend-key__swatch" style="background:${s.color}"></span>${esc(s.name)}
    </span>`).join('');
}

/** Sparkline minimalista para stat tiles (sem eixos, 2px). */
export function sparkline(el, values, color = 'var(--chart-1)') {
  const w = 96, h = 28, pad = 3;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' L');
  const last = values.length - 1;
  el.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="M${pts}" fill="none" stroke="${color}" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
      <circle cx="${x(last)}" cy="${y(values[last])}" r="3" fill="${color}"/>
    </svg>`;
}
