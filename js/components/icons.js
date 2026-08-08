/**
 * CMV Pro — Biblioteca de ícones
 * ------------------------------
 * Ícones SVG de traço (estilo Lucide/Feather), embutidos como strings —
 * zero requisições de rede, cor herdada via currentColor.
 *
 * Uso: icon('home')            → SVG 20px
 *      icon('home', 24)        → SVG 24px
 */

const PATHS = {
  /* navegação */
  home: '<path d="M3 10.5 10 4l7 6.5"/><path d="M5 9.5V16a1 1 0 0 0 1 1h2.5v-4h3v4H14a1 1 0 0 0 1-1V9.5"/>',
  carrot: '<path d="M9.3 6.8c-1.9.4-4.2 3.4-6 8.7-.3.9.3 1.5 1.2 1.2 5.3-1.8 8.3-4.1 8.7-6"/><path d="M9.3 6.8c-.4-1.7.6-3.3 2.2-3.8.3 1 .1 2-.5 2.9 1-.6 2-.8 2.9-.5-.4 1.7-2.1 2.7-3.8 2.2-.3.4-.5 1-.8 1.2"/><path d="M9.3 6.8c1.1 1 2.4 2.3 3.9 3.9"/>',
  tag: '<path d="M3 3h6l8 8-6 6-8-8V3z"/><circle cx="7" cy="7" r="1.4"/>',
  package: '<path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5z"/><path d="M3 6l7 3.5L17 6"/><path d="M10 9.5V17"/>',
  clipboard: '<rect x="4" y="4" width="12" height="14" rx="2"/><path d="M7.5 4a2.5 2.5 0 0 1 5 0"/><path d="M7 9.5h6M7 13h4"/>',
  percent: '<path d="M15.5 4.5l-11 11"/><circle cx="6" cy="6" r="2.2"/><circle cx="14" cy="14" r="2.2"/>',
  coins: '<ellipse cx="10" cy="5.5" rx="6" ry="2.8"/><path d="M4 5.5v4.5c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8V5.5"/><path d="M4 10v4.5c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8V10"/>',
  flask: '<path d="M8 3h4M9 3v5l-5 8a1.5 1.5 0 0 0 1.3 2.3h9.4A1.5 1.5 0 0 0 16 16l-5-8V3"/><path d="M6.5 13.5h7"/>',
  boxes: '<rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/><rect x="7" y="3" width="6" height="6" rx="1"/>',
  cart: '<circle cx="8" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/><path d="M2.5 3.5h2l2 10h9l2-7H6"/>',
  wallet: '<path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/><path d="M13 11.5h4M3 8h14"/>',
  chart: '<path d="M3 3v13a1 1 0 0 0 1 1h13"/><path d="M7 12v2M11 8v6M15 5v9"/>',
  settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8l1 2 2.2.4 1.8-1.2 1.5 1.5-1.2 1.8.4 2.2 2 1-2 1-.4 2.2 1.2 1.8-1.5 1.5-1.8-1.2-2.2.4-1 2-1-2-2.2-.4-1.8 1.2-1.5-1.5 1.2-1.8-.4-2.2-2-1 2-1 .4-2.2L4.3 4l1.5-1.5 1.8 1.2 2.2-.4 1-2z" fill="none"/>',
  users: '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 17c.5-3 2.6-4.5 5-4.5s4.5 1.5 5 4.5"/><circle cx="14" cy="7.5" r="2.2"/><path d="M14.5 12.6c1.7.4 2.8 1.7 3.1 3.9"/>',
  user: '<circle cx="10" cy="7" r="3"/><path d="M4 17.5c.6-3.4 3-5 6-5s5.4 1.6 6 5"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M7.8 7.6A2.3 2.3 0 0 1 12.3 8c0 1.5-2.3 1.8-2.3 3.2"/><circle cx="10" cy="14.2" r=".2" fill="currentColor"/>',
  menu: '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>',

  /* ações */
  plus: '<path d="M10 4v12M4 10h12"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3.5 3.5"/>',
  edit: '<path d="m12.5 4 3.5 3.5L7.5 16H4v-3.5L12.5 4z"/>',
  trash: '<path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6"/><path d="M5.5 6l.8 9.5A1.5 1.5 0 0 0 7.8 17h4.4a1.5 1.5 0 0 0 1.5-1.5L14.5 6"/><path d="M8.5 9v5M11.5 9v5"/>',
  copy: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M10 3v9M6.5 9 10 12.5 13.5 9"/><path d="M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5"/>',
  upload: '<path d="M10 12.5V3.5M6.5 7 10 3.5 13.5 7"/><path d="M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5"/>',
  x: '<path d="m5 5 10 10M15 5 5 15"/>',
  check: '<path d="m4 10.5 4 4 8-9"/>',
  'chevron-down': '<path d="m5 8 5 5 5-5"/>',
  'chevron-right': '<path d="m8 5 5 5-5 5"/>',
  'arrow-up': '<path d="M10 16V4M5 9l5-5 5 5"/>',
  'arrow-down': '<path d="M10 4v12M5 11l5 5 5-5"/>',
  'more-v': '<circle cx="10" cy="4.5" r=".9" fill="currentColor"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="10" cy="15.5" r=".9" fill="currentColor"/>',
  logout: '<path d="M8 17H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 3h3"/><path d="m13 6.5 3.5 3.5-3.5 3.5M16.5 10H8"/>',
  eye: '<path d="M2.5 10S5.5 4.8 10 4.8 17.5 10 17.5 10 14.5 15.2 10 15.2 2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.4"/>',
  'eye-off': '<path d="M3 3l14 14"/><path d="M8.3 5.2A7.6 7.6 0 0 1 10 4.8c4.5 0 7.5 5.2 7.5 5.2a13.2 13.2 0 0 1-2.1 2.7M5 6.7A13 13 0 0 0 2.5 10S5.5 15.2 10 15.2a7 7 0 0 0 3-.7"/><path d="M8.3 8.4a2.4 2.4 0 0 0 3.3 3.3"/>',

  /* estado / feedback */
  'alert-triangle': '<path d="M10 3.5 18 16H2L10 3.5z"/><path d="M10 8.5v4M10 15.2v.1"/>',
  'alert-circle': '<circle cx="10" cy="10" r="7.5"/><path d="M10 6.5v4.5M10 14v.1"/>',
  'check-circle': '<circle cx="10" cy="10" r="7.5"/><path d="m6.8 10.4 2.2 2.2 4.4-5"/>',
  info: '<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6v.1"/>',
  'trending-up': '<path d="m3 13.5 4.5-4.5 3 3L17 5.5"/><path d="M13 5.5h4v4"/>',
  'trending-down': '<path d="m3 6.5 4.5 4.5 3-3 6.5 6.5"/><path d="M13 14.5h4v-4"/>',
  sun: '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M15.3 4.7 14 6M6 14l-1.3 1.3"/>',
  moon: '<path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z"/>',
  sparkles: '<path d="M10 3l1.4 3.6L15 8l-3.6 1.4L10 13l-1.4-3.6L5 8l3.6-1.4L10 3z"/><path d="M15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>',
  'wifi-off': '<path d="M3 3l14 14"/><path d="M6.5 9.5a8 8 0 0 1 2.4-1.4M3.5 7A11.6 11.6 0 0 1 7 5.1M13.5 8.1c1.1.5 2.1 1.2 3 2M10 12.6a3.6 3.6 0 0 1 2.5 1"/><circle cx="10" cy="16" r=".5" fill="currentColor"/>',
  calendar: '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5"/>',
  clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.2l2.8 1.6"/>',
  factory: '<path d="M3 17V8l4.5 3V8l4.5 3V4.5A1.5 1.5 0 0 1 13.5 3H16a1 1 0 0 1 1 1v13H3z"/><path d="M6 14h1.5M10 14h1.5M13.5 14H15"/>',
  layers: '<path d="m10 3 7.5 4L10 11 2.5 7 10 3z"/><path d="m4 10.5-1.5.8L10 15l7.5-3.7-1.5-.8"/>',
};

/**
 * Retorna a string SVG de um ícone.
 * @param {string} name  chave em PATHS
 * @param {number} size  lado em px (default 20)
 */
export function icon(name, size = 20) {
  const path = PATHS[name] ?? PATHS['alert-circle'];
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
