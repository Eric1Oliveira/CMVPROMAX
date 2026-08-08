/**
 * CMV Pro — Dados de demonstração
 * -------------------------------
 * Popula o banco local na primeira utilização para que o produto "nasça
 * vivo": dashboard com números reais, alertas disparados e listas cheias.
 * Determinístico (PRNG com semente) — os mesmos dados a cada instalação.
 */

import { db, uid } from './db.js';
import { isSupabaseConfigured } from '../config.js';

/** PRNG mulberry32 — pseudoaleatório determinístico. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_FLAG = 'cmvpro:seeded';

/**
 * Seed AUTOMÁTICO: só no modo local, na primeira utilização (a flag evita
 * repovoar o banco caso o usuário apague os próprios dados de propósito).
 * No Supabase, quem decide é o usuário — botão "Carregar dados de
 * demonstração" no estado vazio do dashboard, que chama seedDemo().
 */
export async function ensureSeed() {
  if (isSupabaseConfigured()) return false;
  if (localStorage.getItem(SEED_FLAG)) return false;
  localStorage.setItem(SEED_FLAG, new Date().toISOString());
  if (!(await db.isEmpty())) return false;
  return seedDemo();
}

/** Popula o banco ATIVO (local ou Supabase) com dados de demonstração. */
export async function seedDemo() {
  const rnd = mulberry32(20260710);
  const now = new Date();
  const iso = (d) => d.toISOString();
  const past = (dias) => {
    const d = new Date(now);
    d.setDate(d.getDate() - dias);
    return d;
  };

  /* ------------------------------ categorias ---------------------------- */
  const catIng = [
    { id: uid(), nome: 'Carnes', tipo: 'ingrediente', cor: '#DC2626' },
    { id: uid(), nome: 'Laticínios', tipo: 'ingrediente', cor: '#F59E0B' },
    { id: uid(), nome: 'Hortifruti', tipo: 'ingrediente', cor: '#16A34A' },
    { id: uid(), nome: 'Padaria', tipo: 'ingrediente', cor: '#B45309' },
    { id: uid(), nome: 'Mercearia', tipo: 'ingrediente', cor: '#7C3AED' },
    { id: uid(), nome: 'Embalagens', tipo: 'ingrediente', cor: '#0E9888' },
  ];
  const catProd = [
    { id: uid(), nome: 'Hambúrgueres', tipo: 'produto', cor: '#2563EB' },
    { id: uid(), nome: 'Acompanhamentos', tipo: 'produto', cor: '#0E9888' },
    { id: uid(), nome: 'Bebidas', tipo: 'produto', cor: '#7C3AED' },
  ];
  await db.setAll('categorias', [...catIng, ...catProd]);

  /* ----------------------------- fornecedores --------------------------- */
  const forn = [
    { id: uid(), nome: 'Frigorífico Boi Nobre', contato: '(11) 98888-1234' },
    { id: uid(), nome: 'Laticínios Serra Azul', contato: '(11) 97777-5678' },
    { id: uid(), nome: 'CEASA — Box 42', contato: '(11) 96666-9012' },
    { id: uid(), nome: 'Atacadão Central', contato: '(11) 95555-3456' },
  ];
  await db.setAll('fornecedores', forn);

  /* ----------------------------- ingredientes --------------------------- */
  // helper: cria ingrediente com histórico de 4 preços
  const dias90 = [90, 60, 30, 0];
  const ing = (nome, cat, fornIdx, unidade, qtdEmb, precos, extra = {}) => ({
    id: uid(),
    nome,
    categoriaId: cat.id,
    fornecedorId: forn[fornIdx].id,
    codigo: `ING-${String(Math.floor(rnd() * 9000) + 1000)}`,
    unidade,                 // unidade da embalagem (kg, l, un…)
    qtdEmbalagem: qtdEmb,    // tamanho da embalagem (ex.: 5 kg)
    preco: precos.at(-1),    // preço atual da embalagem
    precoAnterior: precos.at(-2),
    historico: precos.map((p, i) => ({ data: iso(past(dias90[i])), preco: p })),
    estoque: extra.estoque ?? Math.round(rnd() * 20 + 5),
    estoqueMin: extra.estoqueMin ?? 3,
    observacoes: extra.obs ?? '',
    imagem: '',
    createdAt: iso(past(120)),
    updatedAt: iso(past(0)),
  });

  const ingredientes = [
    // Carnes — blend com ALTA de preço (dispara alerta de fornecedor)
    ing('Blend bovino 160 g', catIng[0], 0, 'kg', 5, [175, 180, 190, 210], { obs: 'Blend 60/40 peito e acém.' }),
    ing('Bacon defumado', catIng[0], 0, 'kg', 2, [58, 60, 62, 64]),
    ing('Frango empanado', catIng[0], 0, 'kg', 3, [72, 70, 71, 73]),
    // Laticínios — mussarela com ESTOQUE BAIXO (dispara alerta)
    ing('Queijo cheddar fatiado', catIng[1], 1, 'kg', 2, [98, 102, 106, 110]),
    ing('Mussarela', catIng[1], 1, 'kg', 4, [180, 176, 184, 188], { estoque: 2, estoqueMin: 5 }),
    ing('Maionese artesanal', catIng[1], 1, 'l', 3, [54, 54, 57, 57]),
    // Hortifruti
    ing('Alface americana', catIng[2], 2, 'un', 12, [42, 40, 44, 46]),
    ing('Tomate italiano', catIng[2], 2, 'kg', 10, [62, 55, 58, 66]),
    ing('Cebola roxa', catIng[2], 2, 'kg', 10, [48, 46, 45, 47]),
    // Padaria
    ing('Pão brioche', catIng[3], 3, 'un', 24, [52, 54, 56, 58], { obs: 'Entrega às terças e sextas.' }),
    // Mercearia
    ing('Batata palito congelada', catIng[4], 3, 'kg', 10, [95, 92, 96, 99]),
    ing('Óleo de fritura', catIng[4], 3, 'l', 18, [162, 158, 164, 168]),
    ing('Refrigerante lata 350 ml', catIng[4], 3, 'un', 12, [42, 42, 44, 45]),
    // Embalagens
    ing('Caixa para hambúrguer', catIng[5], 3, 'un', 100, [65, 65, 68, 70]),
    ing('Copo 500 ml + tampa', catIng[5], 3, 'un', 100, [48, 48, 50, 52]),
  ];
  await db.setAll('ingredientes', ingredientes);

  // Índice por nome para montar fichas legíveis
  const byName = Object.fromEntries(ingredientes.map((i) => [i.nome, i.id]));

  /* ------------------------------- produtos ----------------------------- */
  const prod = (nome, cat, precoBalcao, ficha, extra = {}) => ({
    id: uid(),
    nome,
    categoriaId: cat.id,
    descricao: extra.descricao ?? '',
    precos: {
      balcao: precoBalcao,
      delivery: extra.delivery ?? Math.round(precoBalcao * 1.1 * 10) / 10,
      ifood: extra.ifood ?? Math.round(precoBalcao * 1.25 * 10) / 10,
      app99: extra.app99 ?? Math.round(precoBalcao * 1.2 * 10) / 10,
      keeta: extra.keeta ?? Math.round(precoBalcao * 1.18 * 10) / 10,
    },
    taxaEmbalagem: extra.taxaEmbalagem ?? 1.2,
    margemMinima: 50,
    margemIdeal: 65,
    ficha, // { itens:[{ingredienteId, qtd, unidade, perda}], rendimento, pesoFinal, preparo, tempoMin }
    imagem: '',
    createdAt: iso(past(110)),
    updatedAt: iso(past(2)),
  });

  const item = (nome, qtd, unidade, perda = 0) => ({
    ingredienteId: byName[nome], qtd, unidade, perda,
  });

  const produtos = [
    prod('Burger Clássico', catProd[0], 34.9, {
      itens: [
        item('Pão brioche', 1, 'un'),
        item('Blend bovino 160 g', 160, 'g', 5),
        item('Queijo cheddar fatiado', 30, 'g'),
        item('Alface americana', 0.08, 'un'),
        item('Tomate italiano', 40, 'g', 10),
        item('Maionese artesanal', 25, 'ml'),
        item('Caixa para hambúrguer', 1, 'un'),
      ],
      rendimento: 1, pesoFinal: 320,
      preparo: 'Grelhar o blend 3 min por lado. Montar com maionese na base, salada, carne e queijo derretido.',
      tempoMin: 12,
    }, { descricao: 'O carro-chefe da casa: blend 160 g, cheddar e maionese artesanal.' }),

    prod('Burger Duplo Bacon', catProd[0], 44.9, {
      itens: [
        item('Pão brioche', 1, 'un'),
        item('Blend bovino 160 g', 320, 'g', 5),
        item('Queijo cheddar fatiado', 60, 'g'),
        item('Bacon defumado', 40, 'g', 8),
        item('Cebola roxa', 30, 'g', 12),
        item('Maionese artesanal', 25, 'ml'),
        item('Caixa para hambúrguer', 1, 'un'),
      ],
      rendimento: 1, pesoFinal: 480,
      preparo: 'Dois blends grelhados, bacon crocante, cebola caramelizada.',
      tempoMin: 15,
    }),

    prod('Chicken Crispy', catProd[0], 32.9, {
      itens: [
        item('Pão brioche', 1, 'un'),
        item('Frango empanado', 150, 'g', 4),
        item('Alface americana', 0.08, 'un'),
        item('Maionese artesanal', 30, 'ml'),
        item('Caixa para hambúrguer', 1, 'un'),
      ],
      rendimento: 1, pesoFinal: 300,
      preparo: 'Fritar o frango a 180 °C por 6 min. Montar com maionese e alface.',
      tempoMin: 10,
    }),

    // Produto DEFICITÁRIO de propósito (dispara alerta de prejuízo):
    // porção generosa (600 g) vendida a preço de porção pequena.
    prod('Batata da Casa G', catProd[1], 8.9, {
      itens: [
        item('Batata palito congelada', 600, 'g', 6),
        item('Óleo de fritura', 200, 'ml', 0),
        item('Caixa para hambúrguer', 1, 'un'),
      ],
      rendimento: 1, pesoFinal: 560,
      preparo: 'Fritar em óleo a 180 °C até dourar. Salgar na hora.',
      tempoMin: 8,
    }, { descricao: 'Porção generosa — revisar precificação.', taxaEmbalagem: 0.7 }),

    prod('Batata da Casa P', catProd[1], 14.9, {
      itens: [
        item('Batata palito congelada', 250, 'g', 6),
        item('Óleo de fritura', 80, 'ml'),
        item('Caixa para hambúrguer', 1, 'un'),
      ],
      rendimento: 1, pesoFinal: 240,
      preparo: 'Fritar em óleo a 180 °C até dourar.',
      tempoMin: 7,
    }, { taxaEmbalagem: 0.7 }),

    prod('Refrigerante Lata', catProd[2], 7.9, {
      itens: [item('Refrigerante lata 350 ml', 1, 'un')],
      rendimento: 1, pesoFinal: 350, preparo: 'Servir gelado.', tempoMin: 1,
    }, { taxaEmbalagem: 0 }),

    // Produto SEM ficha técnica (dispara alerta informativo)
    prod('Milk-shake Ovomaltine', catProd[2], 24.9, { itens: [], rendimento: 1 },
      { descricao: 'Novidade do cardápio — ficha técnica pendente.', taxaEmbalagem: 1.5 }),
  ];
  await db.setAll('produtos', produtos);

  /* -------------------------------- vendas ------------------------------ */
  // 8 semanas de vendas com sazonalidade (fim de semana vende ~2x mais)
  const vendas = [];
  const mixCanais = ['balcao', 'balcao', 'ifood', 'ifood', 'delivery', 'app99'];
  const populares = [0, 0, 0, 1, 1, 2, 3, 4, 5]; // índice em `produtos`, ponderado

  for (let d = 55; d >= 0; d--) {
    const dia = past(d);
    const fimDeSemana = [0, 5, 6].includes(dia.getDay());
    const pedidos = Math.round((fimDeSemana ? 26 : 12) + rnd() * 10);

    for (let k = 0; k < pedidos; k++) {
      const p = produtos[populares[Math.floor(rnd() * populares.length)]];
      const canal = mixCanais[Math.floor(rnd() * mixCanais.length)];
      const hora = 11 + Math.floor(rnd() * 11); // 11h às 22h
      const data = new Date(dia);
      data.setHours(hora, Math.floor(rnd() * 60), 0, 0);
      vendas.push({
        id: uid(),
        data: iso(data),
        produtoId: p.id,
        canal,
        qtd: rnd() < 0.2 ? 2 : 1,
        precoUnit: p.precos[canal] ?? p.precos.balcao,
      });
    }
  }
  await db.setAll('vendas', vendas);

  /* ------------------------------- despesas ----------------------------- */
  await db.setAll('despesas', [
    { id: uid(), nome: 'Aluguel', valor: 4200, tipo: 'fixa', data: iso(past(9)) },
    { id: uid(), nome: 'Folha de pagamento', valor: 9800, tipo: 'fixa', data: iso(past(9)) },
    { id: uid(), nome: 'Energia elétrica', valor: 1350, tipo: 'variavel', data: iso(past(12)) },
    { id: uid(), nome: 'Gás', valor: 620, tipo: 'variavel', data: iso(past(15)) },
    { id: uid(), nome: 'Marketing (tráfego pago)', valor: 900, tipo: 'variavel', data: iso(past(20)) },
  ]);

  /* ----------------------------- configurações -------------------------- */
  await db.saveSettings({
    empresa: 'Hamburgueria Demo',
    segmento: 'hamburgueria',
    moeda: 'BRL',
    metas: { cmvMax: 35, margemIdeal: 65, margemMinima: 50 },
    canais: {
      balcao: { nome: 'Balcão', comissao: 0 },
      delivery: { nome: 'Delivery próprio', comissao: 0 },
      ifood: { nome: 'iFood', comissao: 25 },
      app99: { nome: '99Food', comissao: 20 },
      keeta: { nome: 'Keeta', comissao: 18 },
    },
  });

  return true;
}
