/**
 * CMV Pro — Telas de autenticação
 * -------------------------------
 * Um único módulo cobre as três rotas públicas (login, cadastro, recuperar),
 * alternando o formulário conforme a rota — o layout e o comportamento
 * (validação, loading, toasts) são compartilhados.
 */

import { auth, isLocalMode } from '../core/auth.js';
import { navigate } from '../core/router.js';
import { toast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { btnLoading } from '../components/ui.js';
import { esc } from '../utils/format.js';
import { logoHtml } from '../main.js';
import { HOME } from '../core/nav.js';

/* ------------------------------ validação ------------------------------- */

const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Marca/limpa erro visual de um campo (.field). */
function setFieldError(input, message) {
  const field = input.closest('.field');
  field.classList.toggle('has-error', Boolean(message));
  const err = field.querySelector('.field__error');
  if (err && message) err.textContent = message;
}

/** Campo de formulário com label e slot de erro. */
function field({ id, label, type = 'text', placeholder = '', autocomplete = '' }) {
  return `
    <div class="field">
      <label class="field__label" for="${id}">${esc(label)}</label>
      <input class="input" id="${id}" type="${type}" placeholder="${esc(placeholder)}"
        ${autocomplete ? `autocomplete="${autocomplete}"` : ''} />
      <span class="field__error" role="alert"></span>
    </div>`;
}

/* ------------------------------ templates ------------------------------- */

function loginHtml() {
  return `
    <h1>Bem-vindo de volta</h1>
    <p class="auth-card__subtitle">Entre para acompanhar o CMV do seu negócio.</p>
    <form class="auth-form" novalidate>
      ${field({ id: 'email', label: 'E-mail', type: 'email', placeholder: 'voce@restaurante.com', autocomplete: 'email' })}
      ${field({ id: 'senha', label: 'Senha', type: 'password', placeholder: '••••••••', autocomplete: 'current-password' })}
      <div class="auth-form__row">
        <span></span>
        <a href="#/recuperar">Esqueci minha senha</a>
      </div>
      <button class="btn btn--primary btn--lg btn--full" type="submit">Entrar</button>
      ${isLocalMode() ? `
      <div class="auth-divider">ou</div>
      <button class="btn btn--secondary btn--full" type="button" data-demo>
        ${icon('sparkles', 17)} Explorar com conta demo
      </button>` : ''}
    </form>
    <p class="auth-card__footer">Ainda não tem conta? <a href="#/cadastro">Criar conta grátis</a></p>`;
}

function cadastroHtml() {
  return `
    <h1>Crie sua conta</h1>
    <p class="auth-card__subtitle">Comece a controlar seu CMV em minutos.</p>
    <form class="auth-form" novalidate>
      ${field({ id: 'nome', label: 'Seu nome', placeholder: 'Maria Silva', autocomplete: 'name' })}
      ${field({ id: 'email', label: 'E-mail', type: 'email', placeholder: 'voce@restaurante.com', autocomplete: 'email' })}
      ${field({ id: 'senha', label: 'Senha', type: 'password', placeholder: 'Mínimo de 8 caracteres', autocomplete: 'new-password' })}
      <button class="btn btn--primary btn--lg btn--full" type="submit">Criar conta</button>
    </form>
    <p class="auth-card__footer">Já tem conta? <a href="#/login">Entrar</a></p>`;
}

function recuperarHtml() {
  return `
    <h1>Recuperar senha</h1>
    <p class="auth-card__subtitle">Informe seu e-mail e enviaremos as instruções.</p>
    <form class="auth-form" novalidate>
      ${field({ id: 'email', label: 'E-mail', type: 'email', placeholder: 'voce@restaurante.com', autocomplete: 'email' })}
      <button class="btn btn--primary btn--lg btn--full" type="submit">Enviar instruções</button>
    </form>
    <p class="auth-card__footer"><a href="#/login">← Voltar para o login</a></p>`;
}

/* -------------------------------- página -------------------------------- */

export default {
  async render(container, { route }) {
    const bodies = { login: loginHtml, cadastro: cadastroHtml, recuperar: recuperarHtml };

    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card anim-in">
          <div class="auth-card__brand">${logoHtml(34)} CMV Pro</div>
          ${bodies[route.path]()}
        </div>
      </div>`;

    const form = container.querySelector('form');
    const $ = (id) => container.querySelector(`#${id}`);

    /* Login demo: cria a conta demo, entra e semeia os dados */
    container.querySelector('[data-demo]')?.addEventListener('click', async (e) => {
      const restore = btnLoading(e.currentTarget, 'Preparando demo…');
      try {
        await auth.signInDemo();
        navigate(HOME);
      } catch (err) {
        restore();
        toast.error('Não foi possível entrar', err.message);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');

      /* validação em campo, com mensagens específicas */
      let ok = true;
      const email = $('email');
      if (email) {
        setFieldError(email, validEmail(email.value) ? '' : 'Informe um e-mail válido.');
        ok = ok && validEmail(email.value);
      }
      const senha = $('senha');
      if (senha && route.path !== 'recuperar') {
        const msg = senha.value.length >= 8 ? '' : 'A senha precisa de pelo menos 8 caracteres.';
        setFieldError(senha, route.path === 'cadastro' ? msg : (senha.value ? '' : 'Informe sua senha.'));
        ok = ok && (route.path === 'cadastro' ? senha.value.length >= 8 : Boolean(senha.value));
      }
      const nome = $('nome');
      if (nome) {
        setFieldError(nome, nome.value.trim().length >= 2 ? '' : 'Informe seu nome.');
        ok = ok && nome.value.trim().length >= 2;
      }
      if (!ok) return;

      const restore = btnLoading(submitBtn, 'Aguarde…');
      try {
        if (route.path === 'login') {
          await auth.signIn({ email: email.value, password: senha.value });
          navigate(HOME);
        } else if (route.path === 'cadastro') {
          const { needsConfirm } = await auth.signUp({
            name: nome.value, email: email.value, password: senha.value,
          });
          if (needsConfirm) {
            // Projeto Supabase com confirmação de e-mail habilitada
            restore();
            toast.info('Confirme seu e-mail', 'Enviamos um link de confirmação. Depois é só entrar.');
            navigate('login');
          } else {
            toast.success('Conta criada!', 'Bem-vindo ao CMV Pro.');
            navigate(HOME);
          }
        } else {
          await auth.recover(email.value);
          restore();
          toast.success('Verifique seu e-mail', 'Se a conta existir, você receberá as instruções.');
          navigate('login');
        }
      } catch (err) {
        restore();
        toast.error('Ops!', err.message);
      }
    });
  },
};
