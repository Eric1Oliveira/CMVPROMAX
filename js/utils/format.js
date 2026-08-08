/**
 * CMV Pro — Utilitários de formatação (pt-BR)
 * -------------------------------------------
 * Todas as telas usam estes helpers; nenhuma página formata número "na mão".
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** R$ 1.234,56 */
export const money = (v) => BRL.format(Number.isFinite(v) ? v : 0);

/** 1.234,56 */
export const num = (v) => NUM.format(Number.isFinite(v) ? v : 0);

/** 34,5% (recebe fração 0–100) */
export const pct = (v) => `${PCT.format(Number.isFinite(v) ? v : 0)}%`;

/** Valor compacto para KPIs: 1,2 mil / 3,4 mi */
export function compact(v) {
  if (!Number.isFinite(v)) return '0';
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Data curta: 08/07/2026 */
export function dateShort(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

/** Data relativa amigável: hoje, ontem, há 3 dias, 12/06 */
export function dateRelative(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Converte entrada do usuário ("12,50", "R$ 12,50") em número. */
export function parseMoney(str) {
  if (typeof str === 'number') return str;
  const clean = String(str ?? '')
    .replace(/[^\d,.-]/g, '')  // remove R$, espaços…
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove separador de milhar
    .replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

/** Iniciais para avatares: "Pão Brioche" → "PB" */
export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Escapa HTML ao interpolar dados do usuário em templates. */
export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Saudação conforme a hora do dia. */
export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Rótulos de unidades de medida usados no produto. */
export const UNIDADES = [
  { id: 'kg', nome: 'Quilograma (kg)', base: 'g', fator: 1000 },
  { id: 'g',  nome: 'Grama (g)',       base: 'g', fator: 1 },
  { id: 'l',  nome: 'Litro (L)',       base: 'ml', fator: 1000 },
  { id: 'ml', nome: 'Mililitro (ml)',  base: 'ml', fator: 1 },
  { id: 'un', nome: 'Unidade (un)',    base: 'un', fator: 1 },
];

/** Converte quantidade para a unidade-base ('g' | 'ml' | 'un'). */
export function toBase(qtd, unidadeId) {
  const u = UNIDADES.find((x) => x.id === unidadeId);
  if (!u) return { qtd, base: 'un' };
  return { qtd: qtd * u.fator, base: u.base };
}
