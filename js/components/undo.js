/**
 * CMV Pro — Excluir com "Desfazer"
 * --------------------------------
 * Padrão moderno (Gmail/Notion): a exclusão acontece na hora e um toast
 * oferece "Desfazer" por alguns segundos — sem diálogo de confirmação
 * bloqueando o fluxo. Reduz muito o atrito das ações do dia a dia.
 *
 * O documento é reinserido com o MESMO id (db.insert preserva id vindo no
 * doc), então referências continuam válidas ao desfazer.
 */

import { db } from '../services/db.js';
import { toast } from './toast.js';

/**
 * Exclui um documento oferecendo desfazer.
 * @param {string} collection
 * @param {object} doc  documento completo (para reinserir ao desfazer)
 * @param {{ nome?: string }} [opts]
 */
export async function removeWithUndo(collection, doc, { nome } = {}) {
  await db.remove(collection, doc.id);

  toast.action('success', 'Excluído', nome ?? '', {
    label: 'Desfazer',
    onAction: async () => {
      try {
        // reinsere preservando id/campos originais
        await db.insert(collection, { ...doc });
        toast.info('Restaurado', nome ?? '');
      } catch (err) {
        toast.error('Não foi possível desfazer', err.message);
      }
    },
  });
}
