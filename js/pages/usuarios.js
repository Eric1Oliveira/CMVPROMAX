/**
 * CMV Pro — Usuários
 * ------------------
 * Membros da empresa (multiusuário). No Supabase, lista os profiles da
 * empresa (isolados por RLS); no modo local, as contas deste dispositivo.
 * Convites por e-mail chegam com a função de backend dedicada (em breve) —
 * a arquitetura de papéis (owner/admin/member) já está no banco.
 */

import { auth, isLocalMode } from '../core/auth.js';
import { esc, initials, dateShort } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { pageHead, tableSkeleton, errorState } from '../components/ui.js';

const ROLES = { owner: 'Proprietário', admin: 'Administrador', member: 'Equipe' };

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Usuários',
      subtitle: isLocalMode()
        ? 'Contas locais deste dispositivo (modo demonstração).'
        : 'Quem acessa a sua empresa no CMV Pro.',
      actions: `<button class="btn btn--primary" data-convidar>${icon('plus', 17)} Convidar</button>`,
    }) + `<div data-list>${tableSkeleton(3)}</div>`;

    const listEl = container.querySelector('[data-list]');

    container.querySelector('[data-convidar]').addEventListener('click', () => {
      openModal({
        title: 'Convidar usuário',
        content: `
          <div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <p class="text-2">
              O convite por e-mail (com papel e permissões) chega junto com a
              função de backend de convites — <strong>em breve</strong>.
            </p>
            <p class="text-2">
              A base já está pronta: a tabela <code>profiles</code> suporta os papéis
              <strong>Proprietário</strong>, <strong>Administrador</strong> e
              <strong>Equipe</strong>, com isolamento por empresa via RLS.
            </p>
          </div>`,
      });
    });

    try {
      const membros = await auth.listMembers();
      listEl.innerHTML = `
        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table" style="min-width:480px">
              <thead>
                <tr><th>Usuário</th><th>Papel</th><th>Desde</th><th></th></tr>
              </thead>
              <tbody>
                ${membros.map((u) => `
                  <tr>
                    <td>
                      <div class="entity">
                        <div class="entity__avatar" style="background:var(--primary-soft);color:var(--primary)">
                          ${esc(initials(u.nome))}
                        </div>
                        <div style="min-width:0">
                          <div class="entity__name truncate">${esc(u.nome)}</div>
                          <div class="entity__meta truncate">${esc(u.email)}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge badge--primary">${ROLES[u.role] ?? u.role}</span></td>
                    <td class="text-2">${u.createdAt ? dateShort(u.createdAt) : '—'}</td>
                    <td>${u.atual ? '<span class="badge badge--success">Você</span>' : ''}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
          ${membros.length} usuário(s)${isLocalMode() ? ' neste dispositivo' : ' na empresa'}.
        </p>`;
    } catch (err) {
      listEl.innerHTML = errorState({
        title: 'Não foi possível carregar os usuários',
        text: err.message,
      });
    }
  },

  destroy() {},
};
