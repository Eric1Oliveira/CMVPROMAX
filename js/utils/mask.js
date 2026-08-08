/**
 * CMV Pro — Máscaras de entrada
 * -----------------------------
 * Facilitadores de digitação: o usuário digita naturalmente e o campo se
 * formata sozinho, como nos apps de banco. Opt-in por atributo:
 *   <input data-mask="money"> → digita 1250, vira "12,50"
 *   <input data-mask="int">   → só números inteiros
 *   <input data-mask="percent"> → número com no máx. 1 casa
 *
 * A leitura no submit continua usando parseMoney() — a máscara só melhora a
 * experiência, não muda o dado.
 */

import { parseMoney } from './format.js';

const fmtMoney = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Máscara de moeda baseada em centavos (digitação da direita p/ esquerda). */
function attachMoney(input) {
  const render = (cents) => fmtMoney.format(cents / 100);

  // valor inicial já preenchido → normaliza o display
  if (input.value.trim() !== '') {
    input.value = render(Math.round(parseMoney(input.value) * 100));
  }

  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    input.value = digits ? render(parseInt(digits, 10)) : '';
    // caret sempre no fim (valores curtos, comportamento previsível)
    requestAnimationFrame(() => {
      const end = input.value.length;
      input.setSelectionRange?.(end, end);
    });
  });

  input.setAttribute('inputmode', 'decimal');
}

/** Somente dígitos inteiros. */
function attachInt(input) {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
  });
  input.setAttribute('inputmode', 'numeric');
}

/** Número com até uma casa decimal (comissões, margens). */
function attachPercent(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/[^\d,.]/g, '').replace('.', ',');
    const [int, dec] = v.split(',');
    input.value = dec !== undefined ? `${int},${dec.slice(0, 1)}` : int;
  });
  input.setAttribute('inputmode', 'decimal');
}

const HANDLERS = { money: attachMoney, int: attachInt, percent: attachPercent };

/** Aplica as máscaras a todos os [data-mask] dentro de `root`. */
export function applyMasks(root) {
  root.querySelectorAll('[data-mask]').forEach((input) => {
    if (input.dataset.masked) return; // evita anexar duas vezes
    const fn = HANDLERS[input.dataset.mask];
    if (fn) {
      fn(input);
      input.dataset.masked = '1';
    }
  });
}
