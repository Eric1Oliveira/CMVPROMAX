/**
 * CMV Pro — Configurações
 * -----------------------
 * Central de ajustes da empresa: dados do negócio, metas de CMV/margem,
 * comissões dos canais de venda, integrações (arquitetura preparada),
 * aparência e gestão de dados (backup/restauração/demo/zerar).
 */

import { db } from '../services/db.js';
import { INTEGRACOES } from '../services/integracoes.js';
import { isSupabaseConfigured } from '../config.js';
import { getThemePref, setThemePref } from '../core/theme.js';
import { money, esc, parseMoney } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { pageHead, btnLoading } from '../components/ui.js';

const SEGMENTOS = [
  'restaurante', 'hamburgueria', 'pizzaria', 'cafeteria', 'bar',
  'adega', 'padaria', 'confeitaria', 'cozinha industrial',
];

/** Coleções incluídas no backup JSON. */
const COLECOES = [
  'categorias', 'fornecedores', 'ingredientes', 'produtos', 'fichaVersoes',
  'vendas', 'despesas', 'movimentos', 'compras',
];

export default {
  async render(container, ctx) {
    const settings = await db.getSettings();
    const supabase = isSupabaseConfigured();

    container.innerHTML = pageHead({
      title: 'Configurações',
      subtitle: 'Empresa, metas, canais de venda e dados.',
    }) + `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4);max-width:860px">

        <!-- Empresa -->
        <div class="card anim-in">
          <div class="card__head"><h2>${icon('factory', 18)} Empresa</h2></div>
          <div class="card__body form-grid">
            <div class="field">
              <label class="field__label">Nome do negócio</label>
              <input class="input" name="empresa" value="${esc(settings.empresa ?? '')}" />
            </div>
            <div class="field">
              <label class="field__label">Segmento</label>
              <select class="input" name="segmento">
                ${SEGMENTOS.map((s) => `
                  <option value="${s}" ${settings.segmento === s ? 'selected' : ''}>
                    ${s[0].toUpperCase() + s.slice(1)}
                  </option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Metas -->
        <div class="card anim-in">
          <div class="card__head"><h2>${icon('percent', 18)} Metas de gestão</h2></div>
          <div class="card__body form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
            <div class="field">
              <label class="field__label">CMV máximo (%)</label>
              <input class="input" name="cmvMax" inputmode="decimal" value="${settings.metas?.cmvMax ?? 35}" />
              <span class="field__hint">Acima disso, o produto gera alerta.</span>
            </div>
            <div class="field">
              <label class="field__label">Margem ideal (%)</label>
              <input class="input" name="margemIdeal" inputmode="decimal" value="${settings.metas?.margemIdeal ?? 65}" />
            </div>
            <div class="field">
              <label class="field__label">Margem mínima (%)</label>
              <input class="input" name="margemMinima" inputmode="decimal" value="${settings.metas?.margemMinima ?? 50}" />
            </div>
          </div>
        </div>

        <!-- Canais -->
        <div class="card anim-in">
          <div class="card__head">
            <h2>${icon('layers', 18)} Canais de venda e comissões</h2>
          </div>
          <div class="card__body">
            <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
              ${Object.entries(settings.canais ?? {}).map(([id, c]) => `
                <div class="field">
                  <label class="field__label">${esc(c.nome)}</label>
                  <div class="input-group">
                    <input class="input" data-canal="${id}" inputmode="decimal" value="${c.comissao ?? 0}"
                      style="border-radius:var(--radius-md) 0 0 var(--radius-md)" />
                    <span class="input-group__affix" style="border-left:1px solid var(--border-strong);border-right:none;border-radius:0 var(--radius-md) var(--radius-md) 0">%</span>
                  </div>
                </div>`).join('')}
            </div>
            <p class="text-3" style="font-size:var(--text-sm);margin-top:var(--sp-3)">
              As comissões entram no cálculo de margem, precificação e simulador.
            </p>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn--primary" data-salvar>${icon('check', 16)} Salvar configurações</button>
        </div>

        <!-- Integrações -->
        <div class="card anim-in">
          <div class="card__head"><h2>${icon('sparkles', 18)} Integrações</h2></div>
          <div class="card__body card__body--flush">
            ${INTEGRACOES.map((i) => `
              <div class="alert-item">
                <div class="alert-item__icon alert-item__icon--info">${icon('layers', 15)}</div>
                <div style="flex:1;min-width:0">
                  <div class="alert-item__title">${esc(i.nome)}</div>
                  <div class="alert-item__desc">${esc(i.descricao)}</div>
                </div>
                <span class="badge badge--neutral">Em breve</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Aparência -->
        <div class="card anim-in">
          <div class="card__head"><h2>${icon('moon', 18)} Aparência</h2></div>
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

        <!-- Dados -->
        <div class="card anim-in">
          <div class="card__head">
            <h2>${icon('boxes', 18)} Dados</h2>
            <span class="badge ${supabase ? 'badge--success' : 'badge--neutral'}">
              ${supabase ? 'Supabase (nuvem)' : 'Local (este dispositivo)'}
            </span>
          </div>
          <div class="card__body" style="display:flex;flex-wrap:wrap;gap:var(--sp-2)">
            <button class="btn btn--secondary" data-backup>${icon('download', 16)} Exportar backup (JSON)</button>
            <button class="btn btn--secondary" data-restaurar>${icon('upload', 16)} Restaurar backup</button>
            <button class="btn btn--ghost" data-demo>${icon('sparkles', 16)} Carregar dados de demonstração</button>
            <button class="btn btn--danger" data-zerar>${icon('trash', 16)} Apagar todos os dados</button>
          </div>
        </div>
      </div>
    `;

    const $ = (sel) => container.querySelector(sel);

    /* ------------------------------ salvar ------------------------------ */
    $('[data-salvar]').addEventListener('click', async (e) => {
      const canais = { ...settings.canais };
      container.querySelectorAll('[data-canal]').forEach((input) => {
        canais[input.dataset.canal] = {
          ...canais[input.dataset.canal],
          comissao: Math.max(0, Math.min(99, parseMoney(input.value))),
        };
      });
      const novo = {
        ...settings,
        empresa: $('[name="empresa"]').value.trim() || 'Meu Negócio',
        segmento: $('[name="segmento"]').value,
        metas: {
          cmvMax: parseMoney($('[name="cmvMax"]').value) || 35,
          margemIdeal: parseMoney($('[name="margemIdeal"]').value) || 65,
          margemMinima: parseMoney($('[name="margemMinima"]').value) || 50,
        },
        canais,
      };
      const restore = btnLoading(e.currentTarget);
      try {
        await db.saveSettings(novo);
        restore();
        toast.success('Configurações salvas', 'Metas e comissões já valem em todo o app.');
      } catch (err) {
        restore();
        toast.error('Não foi possível salvar', err.message);
      }
    });

    /* ------------------------------ tema -------------------------------- */
    $('[data-tema]').addEventListener('change', (e) => {
      setThemePref(e.target.value);
      toast.success('Tema atualizado');
    });

    /* ------------------------------ backup ------------------------------ */
    $('[data-backup]').addEventListener('click', async () => {
      const dump = { app: 'cmvpro', versao: 1, exportadoEm: new Date().toISOString(), settings: await db.getSettings() };
      for (const c of COLECOES) dump[c] = await db.all(c);
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cmvpro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Backup exportado', 'Guarde o arquivo em local seguro.');
    });

    $('[data-restaurar]').addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const dump = JSON.parse(await file.text());
          if (dump.app !== 'cmvpro') throw new Error('Este arquivo não é um backup do CMV Pro.');
          const ok = await confirmDialog({
            title: 'Restaurar este backup?',
            message: `Os dados atuais serão SUBSTITUÍDOS pelos do arquivo (${dump.exportadoEm?.slice(0, 10) ?? 'data desconhecida'}). Esta ação não pode ser desfeita.`,
            confirmLabel: 'Restaurar',
            danger: true,
          });
          if (!ok) return;
          for (const c of COLECOES) {
            if (Array.isArray(dump[c])) await db.setAll(c, dump[c]);
          }
          if (dump.settings) await db.saveSettings(dump.settings);
          toast.success('Backup restaurado', 'Todos os dados foram substituídos.');
        } catch (err) {
          toast.error('Não foi possível restaurar', err.message);
        }
      };
      input.click();
    });

    /* ------------------------------- demo ------------------------------- */
    $('[data-demo]').addEventListener('click', async (e) => {
      const btn = e.currentTarget; // antes do await: currentTarget expira
      const ok = await confirmDialog({
        title: 'Carregar dados de demonstração?',
        message: 'Os dados atuais serão substituídos pelos da hamburgueria demo (ingredientes, produtos, 8 semanas de vendas).',
        confirmLabel: 'Carregar demo',
        danger: true,
      });
      if (!ok) return;
      const restore = btnLoading(btn, 'Carregando…');
      try {
        const { seedDemo } = await import('../services/seed.js');
        await seedDemo();
        restore();
        toast.success('Dados demo carregados');
      } catch (err) {
        restore();
        toast.error('Falhou', err.message);
      }
    });

    /* ------------------------------- zerar ------------------------------ */
    $('[data-zerar]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Apagar TODOS os dados?',
        message: 'Ingredientes, produtos, fichas, vendas, estoque e financeiro serão apagados. Exporte um backup antes se tiver dúvida. Esta ação não pode ser desfeita.',
        confirmLabel: 'Apagar tudo',
        danger: true,
      });
      if (!ok) return;
      await db.wipe();
      toast.success('Dados apagados', 'O app está zerado.');
    });
  },

  destroy() {},
};
