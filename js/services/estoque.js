/**
 * CMV Pro — Serviço de estoque
 * ----------------------------
 * Regras de negócio de estoque e compras, independentes de tela:
 *
 *  - registrarMovimento(): entrada/saída/perda/ajuste + atualização do saldo;
 *  - sugestaoCompra(): o que comprar (itens no mínimo), agrupado por fornecedor;
 *  - gerarCompras(): transforma a sugestão em pedidos de compra (rascunho);
 *  - receberCompra(): dá entrada no estoque e atualiza preço do ingrediente
 *    quando o fornecedor mudou o valor (alimenta o histórico e os alertas);
 *  - baixaPorVenda(): consome o estoque conforme a ficha técnica — usada
 *    pelo lançamento de vendas (fase Financeiro/PDV).
 *
 * Convenção de unidades: o SALDO (ingrediente.estoque) é sempre na unidade
 * da embalagem do ingrediente (kg, l, un…). Movimentos também.
 */

import { db } from './db.js';
import { toBase, UNIDADES } from '../utils/format.js';

/**
 * Registra um movimento e atualiza o saldo do ingrediente.
 * @param {object} mov { ingredienteId, tipo: 'entrada'|'saida'|'perda'|'ajuste',
 *                       qtd, custo?, lote?, validade?, observacoes? }
 * @returns {{ movimento, ingrediente }} documentos atualizados
 */
export async function registrarMovimento(mov) {
  const ing = await db.get('ingredientes', mov.ingredienteId);
  if (!ing) throw new Error('Ingrediente não encontrado.');
  if (!(mov.qtd > 0) && mov.tipo !== 'ajuste') throw new Error('Informe uma quantidade maior que zero.');

  const atual = ing.estoque ?? 0;
  let novo;
  switch (mov.tipo) {
    case 'entrada': novo = atual + mov.qtd; break;
    case 'saida':
    case 'perda':   novo = Math.max(0, atual - mov.qtd); break;
    case 'ajuste':  novo = Math.max(0, mov.qtd); break; // inventário: saldo vira o contado
    default: throw new Error(`Tipo de movimento inválido: ${mov.tipo}`);
  }

  const movimento = await db.insert('movimentos', {
    ingredienteId: ing.id,
    tipo: mov.tipo,
    qtd: mov.qtd,
    custo: mov.custo ?? null,
    lote: mov.lote ?? '',
    validade: mov.validade || null,
    observacoes: mov.observacoes ?? '',
    data: new Date().toISOString(),
  });
  const ingrediente = await db.update('ingredientes', ing.id, { estoque: novo });
  return { movimento, ingrediente };
}

/** Valor imobilizado em estoque (R$) de um ingrediente. */
export function valorEstoque(ing) {
  if (ing.estoque == null || !ing.qtdEmbalagem) return 0;
  return ing.estoque * ((ing.preco ?? 0) / ing.qtdEmbalagem);
}

/**
 * Sugestão de compra: itens no mínimo (ou abaixo), repondo até 2× o mínimo,
 * arredondado para embalagens inteiras.
 * @returns {Array<{ fornecedorId, itens: [{ingrediente, embalagens, qtd, custo}] , total }>}
 */
export function sugestaoCompra(ingredientes) {
  const porFornecedor = new Map();

  for (const ing of ingredientes) {
    if (ing.estoqueMin == null || ing.estoque == null) continue;
    if (ing.estoque > ing.estoqueMin) continue;

    const alvo = ing.estoqueMin * 2;
    const faltam = Math.max(0, alvo - ing.estoque);
    const embalagens = Math.max(1, Math.ceil(faltam / (ing.qtdEmbalagem || 1)));
    const item = {
      ingrediente: ing,
      embalagens,
      qtd: embalagens * (ing.qtdEmbalagem || 1), // na unidade do ingrediente
      custo: embalagens * (ing.preco ?? 0),
    };

    const key = ing.fornecedorId ?? 'sem-fornecedor';
    if (!porFornecedor.has(key)) porFornecedor.set(key, { fornecedorId: ing.fornecedorId ?? null, itens: [], total: 0 });
    const grupo = porFornecedor.get(key);
    grupo.itens.push(item);
    grupo.total += item.custo;
  }

  return [...porFornecedor.values()];
}

/** Cria pedidos de compra (rascunho) a partir da sugestão. */
export async function gerarCompras(sugestoes) {
  const criadas = [];
  for (const s of sugestoes) {
    criadas.push(await db.insert('compras', {
      fornecedorId: s.fornecedorId,
      status: 'rascunho',
      itens: s.itens.map((i) => ({
        ingredienteId: i.ingrediente.id,
        qtdEmbalagens: i.embalagens,
        precoUnit: i.ingrediente.preco ?? 0, // preço por embalagem
      })),
      total: s.total,
      data: new Date().toISOString(),
    }));
  }
  return criadas;
}

/**
 * Recebe um pedido: entrada no estoque de cada item + atualização de preço
 * do ingrediente quando o fornecedor cobrou diferente (histórico/alertas).
 * @returns {{ entradas: number, precosAtualizados: number }}
 */
export async function receberCompra(compra) {
  if (compra.status === 'recebido') throw new Error('Este pedido já foi recebido.');

  let entradas = 0;
  let precosAtualizados = 0;

  for (const item of compra.itens ?? []) {
    const ing = await db.get('ingredientes', item.ingredienteId);
    if (!ing) continue;

    const qtd = (item.qtdEmbalagens ?? 0) * (ing.qtdEmbalagem || 1);
    await registrarMovimento({
      ingredienteId: ing.id,
      tipo: 'entrada',
      qtd,
      custo: (item.qtdEmbalagens ?? 0) * (item.precoUnit ?? 0),
      observacoes: `Recebimento do pedido de compra`,
    });
    entradas++;

    // Fornecedor mudou o preço da embalagem? Atualiza cadastro + histórico.
    if (item.precoUnit != null && item.precoUnit > 0 && item.precoUnit !== ing.preco) {
      await db.update('ingredientes', ing.id, {
        preco: item.precoUnit,
        precoAnterior: ing.preco,
        historico: [...(ing.historico ?? []), { data: new Date().toISOString(), preco: item.precoUnit }],
      });
      precosAtualizados++;
    }
  }

  await db.update('compras', compra.id, { status: 'recebido' });
  return { entradas, precosAtualizados };
}

/**
 * Baixa automática por venda: consome o estoque de cada ingrediente conforme
 * a ficha técnica (com perdas), na unidade do ingrediente.
 * Preparada para o lançamento de vendas (fase Financeiro/PDV).
 */
export async function baixaPorVenda(produto, qtdVendida, { registrarMovimentos = true } = {}) {
  const itens = produto?.ficha?.itens ?? [];
  const porcoes = qtdVendida / Math.max(1, produto?.ficha?.rendimento || 1);
  const consumos = [];

  for (const item of itens) {
    const ing = await db.get('ingredientes', item.ingredienteId);
    if (!ing || ing.estoque == null) continue;

    // quantidade da ficha → base (g/ml/un) → unidade do ingrediente (kg/l/un)
    const { qtd: qtdBase } = toBase(item.qtd || 0, item.unidade || ing.unidade);
    const fatorIng = UNIDADES.find((u) => u.id === ing.unidade)?.fator ?? 1;
    const consumo = (qtdBase * (1 + (item.perda || 0) / 100) * porcoes) / fatorIng;
    if (!(consumo > 0)) continue;

    if (registrarMovimentos) {
      await registrarMovimento({
        ingredienteId: ing.id,
        tipo: 'saida',
        qtd: consumo,
        observacoes: `Baixa automática — venda de ${qtdVendida}× ${produto.nome}`,
      });
    }
    consumos.push({ ingredienteId: ing.id, qtd: consumo });
  }
  return consumos;
}
