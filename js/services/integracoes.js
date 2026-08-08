/**
 * CMV Pro — Integrações de delivery e PDV (arquitetura preparada)
 * ---------------------------------------------------------------
 * Contrato único para conectores externos. NENHUMA API é chamada nesta
 * fase (decisão de produto): cada adapter declara o que fará quando a
 * integração for contratada, e a UI pode listar/exibir status.
 *
 * Para implementar um conector no futuro:
 *   1. Preencha connect() com o fluxo de OAuth/token do provedor;
 *   2. Em sincronizar(), traduza os pedidos do provedor para o formato
 *      de `vendas` ({ produtoId, canal, qtd, precoUnit, data }) e insira
 *      via db.insert('vendas', …) — a baixa de estoque e o financeiro
 *      passam a funcionar automaticamente;
 *   3. Mude status para 'disponivel'.
 */

export const INTEGRACOES = [
  {
    id: 'ifood',
    nome: 'iFood',
    tipo: 'delivery',
    canal: 'ifood',            // canal de venda correspondente no app
    status: 'planejado',       // 'planejado' | 'disponivel' | 'conectado'
    descricao: 'Importação automática de pedidos e conciliação de repasses.',
  },
  {
    id: 'app99',
    nome: '99Food',
    tipo: 'delivery',
    canal: 'app99',
    status: 'planejado',
    descricao: 'Pedidos do 99Food lançados como vendas, com comissão aplicada.',
  },
  {
    id: 'keeta',
    nome: 'Keeta',
    tipo: 'delivery',
    canal: 'keeta',
    status: 'planejado',
    descricao: 'Sincronização de pedidos e cardápio.',
  },
  {
    id: 'anotaai',
    nome: 'Anota AI',
    tipo: 'atendimento',
    canal: 'delivery',
    status: 'planejado',
    descricao: 'Pedidos do atendente virtual direto no financeiro.',
  },
  {
    id: 'cardapio',
    nome: 'Cardápio Digital',
    tipo: 'cardapio',
    canal: 'delivery',
    status: 'planejado',
    descricao: 'Publicação do cardápio com preços calculados pelo CMV Pro.',
  },
  {
    id: 'pdv',
    nome: 'PDV / Caixa',
    tipo: 'pdv',
    canal: 'balcao',
    status: 'planejado',
    descricao: 'Vendas do caixa com baixa automática de estoque.',
  },
];

/** Contrato dos conectores (todos lançam "em breve" nesta fase). */
export function connect(id) {
  const item = INTEGRACOES.find((i) => i.id === id);
  throw new Error(`${item?.nome ?? id}: integração em desenvolvimento — em breve.`);
}

export function sincronizar(id) {
  return connect(id); // mesmo comportamento até a integração existir
}
