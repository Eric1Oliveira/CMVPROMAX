/**
 * CMV Pro — Helpers de UI
 * -----------------------
 * Blocos de interface reutilizados pelas páginas: estados vazios, skeletons,
 * KPI cards, badges de variação. Todos retornam strings de template — as
 * páginas montam com innerHTML e ligam eventos depois.
 */

import { icon } from './icons.js';
import { esc } from '../utils/format.js';

/** Estado vazio com ícone, título, texto e ação opcional. */
export function emptyState({ iconName = 'package', title, text = '', actionLabel, actionId }) {
  return `
    <div class="empty-state anim-in">
      <div class="empty-state__icon">${icon(iconName, 26)}</div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${actionLabel ? `<button class="btn btn--primary" id="${actionId}">${icon('plus', 16)} ${esc(actionLabel)}</button>` : ''}
    </div>`;
}

/** Estado de erro com ação de tentar novamente. */
export function errorState({ title = 'Algo deu errado', text = 'Tente novamente em instantes.', retryId }) {
  return `
    <div class="empty-state anim-in">
      <div class="empty-state__icon" style="color:var(--danger);background:var(--danger-soft)">
        ${icon('alert-triangle', 26)}
      </div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${retryId ? `<button class="btn btn--secondary" id="${retryId}">Tentar novamente</button>` : ''}
    </div>`;
}

/** Skeleton de tabela (usado enquanto listas carregam). */
export function tableSkeleton(rows = 6) {
  return `
    <div class="card" aria-hidden="true">
      <div style="padding:var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-3)">
        ${Array.from({ length: rows }, () => `
          <div style="display:flex;gap:var(--sp-3);align-items:center">
            <div class="skeleton" style="width:34px;height:34px;border-radius:var(--radius-md)"></div>
            <div class="skeleton" style="flex:1;height:14px"></div>
            <div class="skeleton" style="width:70px;height:14px"></div>
            <div class="skeleton" style="width:48px;height:14px"></div>
          </div>`).join('')}
      </div>
    </div>`;
}

/** Skeleton de dashboard (grid de KPIs + gráfico). */
export function dashSkeleton() {
  return `
    <div aria-hidden="true">
      <div class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
        ${Array.from({ length: 4 }, () => `
          <div class="card kpi">
            <div class="skeleton" style="width:90px;height:12px"></div>
            <div class="skeleton" style="width:130px;height:30px;margin-top:6px"></div>
            <div class="skeleton" style="width:70px;height:12px;margin-top:6px"></div>
          </div>`).join('')}
      </div>
      <div class="card"><div class="skeleton" style="height:260px;border-radius:var(--radius-lg)"></div></div>
    </div>`;
}

/**
 * Stat tile (KPI): label, valor, delta vs período anterior e hint.
 * delta > 0 exibe seta ↑; deltaGoodWhenUp inverte a semântica de cor
 * (ex.: CMV subir é RUIM → deltaGoodWhenUp=false).
 */
export function kpiCard({ label, value, delta = null, deltaGoodWhenUp = true, hint = '', sparkId = '' }) {
  let deltaHtml = '';
  if (delta !== null && Number.isFinite(delta)) {
    const dir = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
    const good = dir === 'flat' ? null : (dir === 'up') === deltaGoodWhenUp;
    const cls = dir === 'flat' ? 'kpi__delta--flat' : good ? 'kpi__delta--up' : 'kpi__delta--down';
    const arrow = dir === 'flat' ? '' : icon(dir === 'up' ? 'arrow-up' : 'arrow-down', 13);
    deltaHtml = `<span class="kpi__delta ${cls}">${arrow}${Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>`;
  }
  return `
    <div class="card kpi anim-in">
      <span class="kpi__label">${esc(label)}</span>
      <span class="kpi__value tnum">${value}</span>
      <div style="display:flex;align-items:center;gap:var(--sp-2);justify-content:space-between">
        <span style="display:flex;align-items:center;gap:var(--sp-2)">
          ${deltaHtml}
          ${hint ? `<span class="kpi__hint">${esc(hint)}</span>` : ''}
        </span>
        ${sparkId ? `<span id="${sparkId}"></span>` : ''}
      </div>
    </div>`;
}

/** Badge de variação de preço (▲ 12% vermelho = custo subiu). */
export function trendBadge(current, previous) {
  if (!previous || previous === current) {
    return `<span class="trend trend--flat">—</span>`;
  }
  const diff = ((current - previous) / previous) * 100;
  const up = diff > 0;
  return `
    <span class="trend ${up ? 'trend--up' : 'trend--down'}" title="Preço anterior: ${previous.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}">
      ${icon(up ? 'arrow-up' : 'arrow-down', 12)}
      ${Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>`;
}

/** Cabeçalho padrão de página (título, subtítulo e ações). */
export function pageHead({ title, subtitle = '', actions = '' }) {
  return `
    <div class="page-head anim-in">
      <div class="page-head__text">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
    </div>`;
}

/** Coloca um botão em estado "carregando" e devolve função para restaurar. */
export function btnLoading(btn, loadingText = 'Salvando…') {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn__spinner"></span> ${esc(loadingText)}`;
  return () => {
    btn.disabled = false;
    btn.innerHTML = original;
  };
}
