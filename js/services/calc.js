/**
 * CMV Pro — Motor de cálculo
 * --------------------------
 * Funções PURAS (sem I/O) de custo, CMV, margem, markup, precificação e
 * alertas. Testáveis isoladamente e reutilizadas por todas as telas.
 *
 * Conceitos:
 *  - Ingrediente: comprado em embalagem (ex.: 5 kg por R$ 180) → custo por
 *    unidade-base (g/ml/un).
 *  - Ficha técnica: itens { ingredienteId, qtd, unidade, perda% } +
 *    rendimento (porções por receita).
 *  - CMV% de um produto/canal = custo da porção ÷ preço de venda líquido.
 */

import { toBase } from '../utils/format.js';

/* ------------------------- custo de ingrediente ------------------------- */

/**
 * Custo por unidade-base (R$/g, R$/ml ou R$/un) de um ingrediente.
 * Ex.: 5 kg por R$ 180 → 180 / 5000 = R$ 0,036/g.
 */
export function custoUnitario(ing) {
  const { qtd: qtdBase } = toBase(ing.qtdEmbalagem || 1, ing.unidade || 'un');
  if (!qtdBase) return 0;
  return (ing.preco || 0) / qtdBase;
}

/** Preço médio do histórico (fallback: preço atual). */
export function precoMedio(ing) {
  const hist = ing.historico ?? [];
  if (!hist.length) return ing.preco ?? 0;
  return hist.reduce((s, h) => s + h.preco, 0) / hist.length;
}

/* --------------------------- custo de ficha ----------------------------- */

/**
 * Custo de UM item da ficha técnica, já considerando a perda (%).
 * A perda aumenta o consumo real: usar 100 g com 10% de perda custa 110 g.
 */
export function custoItem(item, ing) {
  if (!ing) return 0;
  const { qtd: qtdBase } = toBase(item.qtd || 0, item.unidade || ing.unidade || 'un');
  const fatorPerda = 1 + (item.perda || 0) / 100;
  return qtdBase * fatorPerda * custoUnitario(ing);
}

/**
 * Custo da PORÇÃO de um produto (soma dos itens ÷ rendimento).
 * @param {object} produto  precisa de produto.ficha { itens, rendimento }
 * @param {Map} ingMap      Map<id, ingrediente>
 */
export function custoPorcao(produto, ingMap) {
  const ficha = produto.ficha;
  if (!ficha?.itens?.length) return 0;
  const total = ficha.itens.reduce((s, item) => s + custoItem(item, ingMap.get(item.ingredienteId)), 0);
  return total / Math.max(1, ficha.rendimento || 1);
}

/* --------------------------- CMV e margens ------------------------------ */

/**
 * Análise completa de um produto em um canal de venda.
 *
 * @param {number} custo       custo da porção (R$)
 * @param {number} preco       preço de venda no canal (R$)
 * @param {object} taxas       { comissao %, embalagem R$ }
 * @returns {{ receitaLiquida, cmvPct, lucro, margemPct, markup }}
 */
export function analisarCanal(custo, preco, { comissao = 0, embalagem = 0 } = {}) {
  if (!preco) {
    return { receitaLiquida: 0, cmvPct: 0, lucro: -custo, margemPct: 0, markup: 0 };
  }
  const receitaLiquida = preco * (1 - comissao / 100) - embalagem;
  const custoTotal = custo;
  const lucro = receitaLiquida - custoTotal;
  return {
    receitaLiquida,
    cmvPct: (custoTotal / preco) * 100,          // CMV clássico: custo ÷ preço bruto
    lucro,
    margemPct: receitaLiquida > 0 ? (lucro / preco) * 100 : 0,
    markup: custoTotal > 0 ? preco / custoTotal : 0,
  };
}

/**
 * Preços recomendados a partir do custo e das metas.
 *  - ideal:   margem-alvo sobre o preço, compensando comissão do canal
 *  - minimo:  margem mínima aceitável
 *  - psicologico: ideal arredondado para terminar em ,90
 */
export function precosSugeridos(custo, { margemIdeal = 65, margemMinima = 50, comissao = 0, embalagem = 0 } = {}) {
  // preço tal que: preço*(1-comissão) - embalagem - custo = margem% * preço
  const denomIdeal = 1 - comissao / 100 - margemIdeal / 100;
  const denomMin = 1 - comissao / 100 - margemMinima / 100;
  const ideal = denomIdeal > 0 ? (custo + embalagem) / denomIdeal : 0;
  const minimo = denomMin > 0 ? (custo + embalagem) / denomMin : 0;
  const psicologico = ideal > 0 ? Math.max(0.9, Math.ceil(ideal) - 0.1) : 0;
  return { ideal, minimo, psicologico };
}

/* ------------------------- agregações (dashboard) ----------------------- */

/**
 * Resumo financeiro de um conjunto de vendas.
 * Cada venda: { data, produtoId, canal, qtd, precoUnit }.
 */
export function resumirVendas(vendas, produtos, ingredientes, settings) {
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  const prodMap = new Map(produtos.map((p) => [p.id, p]));
  const canais = settings?.canais ?? {};

  let receita = 0;
  let custoProdutos = 0;  // CMV puro: só insumos
  let comissoes = 0;      // taxas de canal entram na margem, não no CMV

  for (const v of vendas) {
    const p = prodMap.get(v.produtoId);
    if (!p) continue;
    const bruto = v.qtd * v.precoUnit;
    receita += bruto;
    custoProdutos += v.qtd * custoPorcao(p, ingMap);
    comissoes += ((canais[v.canal]?.comissao ?? 0) / 100) * bruto;
  }

  const lucro = receita - custoProdutos - comissoes;
  return {
    receita,
    custo: custoProdutos,
    comissoes,
    lucro,
    cmvPct: receita > 0 ? (custoProdutos / receita) * 100 : 0,
    margemPct: receita > 0 ? (lucro / receita) * 100 : 0,
  };
}

/** Agrupa vendas por dia (últimos n dias) → { labels, receita[], custo[] }. */
export function serieDiaria(vendas, produtos, ingredientes, dias = 7) {
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  const prodMap = new Map(produtos.map((p) => [p.id, p]));
  const hoje = new Date();
  const buckets = [];

  for (let d = dias - 1; d >= 0; d--) {
    const day = new Date(hoje);
    day.setDate(hoje.getDate() - d);
    buckets.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      receita: 0,
      custo: 0,
    });
  }

  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const v of vendas) {
    const key = v.data.slice(0, 10);
    const i = idx.get(key);
    if (i === undefined) continue;
    const p = prodMap.get(v.produtoId);
    buckets[i].receita += v.qtd * v.precoUnit;
    buckets[i].custo += p ? v.qtd * custoPorcao(p, ingMap) : 0;
  }
  return buckets;
}

/** Agrupa vendas por semana (últimas n semanas) para o gráfico mensal. */
export function serieSemanal(vendas, produtos, ingredientes, semanas = 8) {
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  const prodMap = new Map(produtos.map((p) => [p.id, p]));
  const hoje = new Date();
  const buckets = Array.from({ length: semanas }, (_, k) => {
    const start = new Date(hoje);
    start.setDate(hoje.getDate() - (semanas - k) * 7 + 1);
    return { start, label: `${start.getDate()}/${start.getMonth() + 1}`, receita: 0, custo: 0 };
  });

  for (const v of vendas) {
    const t = new Date(v.data).getTime();
    for (let k = buckets.length - 1; k >= 0; k--) {
      if (t >= buckets[k].start.getTime()) {
        const p = prodMap.get(v.produtoId);
        buckets[k].receita += v.qtd * v.precoUnit;
        buckets[k].custo += p ? v.qtd * custoPorcao(p, ingMap) : 0;
        break;
      }
    }
  }
  return buckets;
}

/** Ranking de produtos por margem no balcão. Retorna [{produto, analise}]. */
export function rankingMargem(produtos, ingredientes, settings) {
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  return produtos
    // Sem ficha técnica não há custo real — margem seria falsa (fica de fora)
    .filter((p) => p.ficha?.itens?.length)
    .map((p) => {
      const custo = custoPorcao(p, ingMap);
      const analise = analisarCanal(custo, p.precos?.balcao ?? 0, {
        comissao: 0,
        embalagem: p.taxaEmbalagem ?? 0,
      });
      return { produto: p, custo, ...analise };
    })
    .filter((r) => r.produto.precos?.balcao)
    .sort((a, b) => b.margemPct - a.margemPct);
}

/* ------------------------------- alertas -------------------------------- */

/**
 * Gera os alertas inteligentes exibidos no dashboard.
 * Cada alerta: { nivel: 'danger'|'warning'|'info', titulo, desc }
 */
export function gerarAlertas({ ingredientes, produtos, settings }) {
  const alertas = [];
  const metaCmv = settings?.metas?.cmvMax ?? 35;
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));

  // 1) Ingredientes com alta de preço relevante (>5% vs anterior)
  for (const ing of ingredientes) {
    const ant = ing.precoAnterior;
    if (ant && ing.preco > ant * 1.05) {
      const pctAlta = ((ing.preco - ant) / ant) * 100;
      alertas.push({
        nivel: pctAlta > 15 ? 'danger' : 'warning',
        titulo: `${ing.nome} subiu ${pctAlta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`,
        desc: `Fornecedor alterou o preço. Revise as fichas técnicas que usam este insumo.`,
      });
    }
  }

  // 2) Estoque abaixo do mínimo
  for (const ing of ingredientes) {
    if (ing.estoqueMin != null && ing.estoque != null && ing.estoque <= ing.estoqueMin) {
      alertas.push({
        nivel: ing.estoque <= 0 ? 'danger' : 'warning',
        titulo: `${ing.nome} ${ing.estoque <= 0 ? 'acabou' : 'está acabando'}`,
        desc: `Estoque: ${ing.estoque} ${ing.unidade} (mínimo ${ing.estoqueMin} ${ing.unidade}). Inclua na próxima compra.`,
      });
    }
  }

  // 3) Produtos sem ficha técnica / sem margem / CMV alto
  for (const p of produtos) {
    if (!p.ficha?.itens?.length) {
      alertas.push({
        nivel: 'info',
        titulo: `${p.nome} está sem ficha técnica`,
        desc: 'Sem ficha, o CMV não é calculado. Cadastre os ingredientes do produto.',
      });
      continue;
    }
    const custo = custoPorcao(p, ingMap);
    const a = analisarCanal(custo, p.precos?.balcao ?? 0, { embalagem: p.taxaEmbalagem ?? 0 });
    if (p.precos?.balcao && a.lucro <= 0) {
      alertas.push({
        nivel: 'danger',
        titulo: `${p.nome} está dando prejuízo`,
        desc: `Custo de ${custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} contra preço de ${p.precos.balcao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      });
    } else if (p.precos?.balcao && a.cmvPct > metaCmv) {
      alertas.push({
        nivel: 'warning',
        titulo: `CMV de ${p.nome} passou de ${metaCmv}%`,
        desc: `CMV atual: ${a.cmvPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%. Considere reajustar o preço ou renegociar insumos.`,
      });
    }
  }

  // Ordena por severidade
  const peso = { danger: 0, warning: 1, info: 2 };
  return alertas.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
