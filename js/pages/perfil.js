/**
 * CMV Pro — Perfil
 * ----------------
 * Dados do usuário logado: nome, e-mail, troca de senha e preferências.
 */

import { auth, getSession } from '../core/auth.js';
import { getThemePref, setThemePref } from '../core/theme.js';
import { navigate } from '../core/router.js';
import { esc, initials } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { pageHead, btnLoading } from '../components/ui.js';

export default {
  async render(container, ctx) {
    const session = getSession();

    container.innerHTML = pageHead({
      title: 'Perfil',
      subtitle: 'Seus dados e preferências.',
    }) + `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4);max-width:620px">

        <div class="card anim-in">
          <div class="card__body" style="display:flex;align-items:center;gap:var(--sp-4)">
            <div class="entity__avatar" style="width:56px;height:56px;font-size:var(--text-lg);background:var(--primary-soft);color:var(--primary)">
              ${esc(initials(session?.name ?? ''))}
            </div>
            <div style="min-width:0">
              <div style="font-weight:650;font-size:var(--text-lg)">${esc(session?.name ?? '')}</div>
              <div class="text-2 truncate">${esc(session?.email ?? '')}</div>
            </div>
          </div>
        </div>

        <div class="card anim-in">
          <div class="card__head"><h2>${icon('user', 18)} Dados pessoais</h2></div>
          <div class="card__body form-grid">
            <div class="field">
              <label class="field__label">Nome</label>
              <input class="input" name="nome" value="${esc(session?.name ?? '')}" />
            </div>
            <div class="field">
              <label class="field__label">E-mail</label>
              <input class="input" value="${esc(session?.email ?? '')}" disabled />
              <span class="field__hint">O e-mail de acesso não pode ser alterado por aqui.</span>
            </div>
            <div class="span-2" style="display:flex;justify-content:flex-end">
              <button class="btn btn--primary" data-salvar-nome>Salvar</button>
            </div>
          </div>
        </div>

        <div class="card anim-in">
          <div class="card__head"><h2>${icon('eye-off', 18)} Alterar senha</h2></div>
          <div class="card__body form-grid">
            <div class="field">
              <label class="field__label">Nova senha</label>
              <input class="input" name="senha1" type="password" autocomplete="new-password"
                placeholder="Mínimo de 8 caracteres" />
              <span class="field__error" role="alert"></span>
            </div>
            <div class="field">
              <label class="field__label">Confirmar nova senha</label>
              <input class="input" name="senha2" type="password" autocomplete="new-password" placeholder="Repita a senha" />
              <span class="field__error" role="alert"></span>
            </div>
            <div class="span-2" style="display:flex;justify-content:flex-end">
              <button class="btn btn--secondary" data-salvar-senha>Alterar senha</button>
            </div>
          </div>
        </div>

        <div class="card anim-in">
          <div class="card__head"><h2>${icon('moon', 18)} Preferências</h2></div>
          <div class="card__body">
            <div class="field" style="max-width:280px">
              <label class="field__label">Tema</label>
              <select class="input" data-tema>
                <option value="auto" ${getThemePref() === 'auto' ? 'selected' : ''}>Automático (segue o sistema)</option>
                <option value="light" ${getThemePref() === 'light' ? 'selected' : ''}>Claro</option>
                <option value="dark" ${getThemePref() === 'dark' ? 'selected' : ''}>Escuro</option>
              </select>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-start">
          <button class="btn btn--ghost" data-sair style="color:var(--danger)">
            ${icon('logout', 16)} Sair da conta
          </button>
        </div>
      </div>
    `;

    const $ = (s) => container.querySelector(s);
    const err = (name, msg) => {
      const f = $(`[name="${name}"]`).closest('.field');
      f.classList.toggle('has-error', Boolean(msg));
      if (msg) f.querySelector('.field__error').textContent = msg;
    };

    $('[data-salvar-nome]').addEventListener('click', async (e) => {
      const nome = $('[name="nome"]').value.trim();
      if (nome.length < 2) {
        toast.warning('Nome muito curto');
        return;
      }
      const restore = btnLoading(e.currentTarget);
      try {
        await auth.updateProfile({ name: nome });
        restore();
        toast.success('Perfil atualizado', nome);
      } catch (errr) {
        restore();
        toast.error('Não foi possível salvar', errr.message);
      }
    });

    $('[data-salvar-senha]').addEventListener('click', async (e) => {
      const s1 = $('[name="senha1"]').value;
      const s2 = $('[name="senha2"]').value;
      err('senha1', s1.length >= 8 ? '' : 'A senha precisa de pelo menos 8 caracteres.');
      err('senha2', s1 === s2 ? '' : 'As senhas não conferem.');
      if (s1.length < 8 || s1 !== s2) return;

      const restore = btnLoading(e.currentTarget, 'Alterando…');
      try {
        await auth.changePassword(s1);
        restore();
        $('[name="senha1"]').value = '';
        $('[name="senha2"]').value = '';
        toast.success('Senha alterada', 'Use a nova senha no próximo login.');
      } catch (errr) {
        restore();
        toast.error('Não foi possível alterar', errr.message);
      }
    });

    $('[data-tema]').addEventListener('change', (e) => {
      setThemePref(e.target.value);
      toast.success('Tema atualizado');
    });

    $('[data-sair]').addEventListener('click', async () => {
      await auth.signOut();
      toast.info('Sessão encerrada', 'Até logo!');
      navigate('login');
      location.reload(); // remonta o shell limpo na tela de login
    });
  },

  destroy() {},
};
