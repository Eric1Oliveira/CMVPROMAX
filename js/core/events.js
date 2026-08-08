/**
 * CMV Pro — Barramento de eventos (pub/sub)
 * -----------------------------------------
 * Comunicação desacoplada entre módulos. Ex.: o db emite 'db:changed' e o
 * dashboard re-renderiza sem conhecer quem alterou os dados.
 *
 * Uso:
 *   import { bus } from '../core/events.js';
 *   const off = bus.on('db:changed', (payload) => { ... });
 *   bus.emit('db:changed', { collection: 'ingredientes' });
 *   off(); // cancela a inscrição
 */

const listeners = new Map(); // evento -> Set<handler>

export const bus = {
  /**
   * Inscreve um handler em um evento.
   * @returns {Function} função para cancelar a inscrição.
   */
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => bus.off(event, handler);
  },

  /** Remove um handler específico. */
  off(event, handler) {
    listeners.get(event)?.delete(handler);
  },

  /** Dispara um evento para todos os inscritos. */
  emit(event, payload) {
    listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        // Um handler com erro não pode derrubar os demais.
        console.error(`[bus] erro em handler de "${event}":`, err);
      }
    });
  },
};
