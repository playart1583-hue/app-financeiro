// Categorias, classificação padrão e palavras-chave para categorização automática.

export const CLASSIFICATIONS = {
  essencial: { label: 'Essencial', hint: 'Não dá para cortar: moradia, mercado, contas' },
  importante: { label: 'Importante', hint: 'Faz diferença, mas dá para ajustar' },
  superfluo: { label: 'Supérfluo', hint: 'Desejos: dá para reduzir sem prejuízo' },
};

export const EXPENSE_CATEGORIES = [
  { id: 'moradia', name: 'Moradia', icon: '🏠', cls: 'essencial', kw: ['aluguel', 'condominio', 'iptu', 'imobiliaria', 'reforma', 'material de construcao', 'leroy'] },
  { id: 'mercado', name: 'Mercado', icon: '🛒', cls: 'essencial', kw: ['mercado', 'supermercado', 'atacad', 'assai', 'carrefour', 'pao de acucar', 'hortifruti', 'sacolao', 'feira', 'acougue', 'dia %', 'mercadinho', 'atacadao', 'big bompreco', 'guanabara', 'zaffari', 'savegnago'] },
  { id: 'restaurantes', name: 'Restaurantes e delivery', icon: '🍔', cls: 'superfluo', kw: ['ifood', 'rappi', 'restaurante', 'lanchonete', 'pizza', 'burger', 'mcdonald', 'mc donald', 'bk ', 'burguer king', 'padaria', 'cafe', 'cafeteria', 'starbucks', 'almoco', 'jantar', 'lanche', 'bar ', 'boteco', 'sushi', 'acai', 'sorvete', 'subway', 'outback', 'habibs', 'giraffas', 'ze delivery', '99food', '99 food'] },
  { id: 'transporte', name: 'Transporte', icon: '🚗', cls: 'essencial', kw: ['uber', '99 ', '99app', '99pop', '99 corrida', 'corrida com a 99', 'sua corrida', 'viagem com a 99', 'taxi', 'onibus', 'metro', 'gasolina', 'combustivel', 'etanol', 'posto', 'shell', 'ipiranga', 'petrobras', 'br mania', 'estacionamento', 'pedagio', 'sem parar', 'conectcar', 'bilhete unico', 'oficina', 'mecanico', 'seguro auto', 'ipva', 'licenciamento'] },
  { id: 'contas', name: 'Contas da casa', icon: '💡', cls: 'essencial', kw: ['luz', 'energia', 'enel', 'cemig', 'copel', 'light', 'celpe', 'coelba', 'agua', 'sabesp', 'cedae', 'copasa', 'saneamento', 'internet', 'vivo', 'claro', 'tim ', 'oi fibra', 'celular', 'gas ', 'ultragaz', 'liquigas', 'telefone'] },
  { id: 'saude', name: 'Saúde', icon: '💊', cls: 'essencial', kw: ['farmacia', 'drogaria', 'droga raia', 'drogasil', 'pague menos', 'panvel', 'medico', 'consulta', 'exame', 'laboratorio', 'dentista', 'plano de saude', 'unimed', 'amil', 'hapvida', 'hospital', 'clinica', 'psicologo', 'remedio'] },
  { id: 'educacao', name: 'Educação', icon: '📚', cls: 'importante', kw: ['curso', 'escola', 'faculdade', 'mensalidade escolar', 'livro', 'livraria', 'udemy', 'alura', 'material escolar', 'idiomas', 'ingles'] },
  { id: 'assinaturas', name: 'Assinaturas', icon: '📺', cls: 'superfluo', kw: ['netflix', 'spotify', 'disney', 'hbo', 'max ', 'prime video', 'amazon prime', 'youtube premium', 'globoplay', 'deezer', 'apple.com', 'icloud', 'google one', 'assinatura', 'paramount', 'crunchyroll', 'chatgpt', 'claude.ai'] },
  { id: 'lazer', name: 'Lazer', icon: '🎉', cls: 'superfluo', kw: ['cinema', 'show', 'ingresso', 'sympla', 'teatro', 'parque', 'balada', 'steam', 'playstation', 'xbox', 'nintendo', 'jogo', 'cerveja', 'festa', 'clube'] },
  { id: 'compras', name: 'Compras', icon: '🛍️', cls: 'superfluo', kw: ['amazon', 'mercado livre', 'mercadolivre', 'shopee', 'shein', 'magalu', 'magazine luiza', 'americanas', 'aliexpress', 'casas bahia', 'kabum', 'loja', 'temu'] },
  { id: 'vestuario', name: 'Roupas e calçados', icon: '👕', cls: 'importante', kw: ['roupa', 'renner', 'riachuelo', 'c&a', 'cea ', 'zara', 'nike', 'adidas', 'centauro', 'netshoes', 'calcado', 'tenis', 'hering', 'marisa'] },
  { id: 'beleza', name: 'Beleza e cuidados', icon: '💇', cls: 'importante', kw: ['salao', 'cabeleireiro', 'barbearia', 'barbeiro', 'manicure', 'cosmetico', 'boticario', 'natura', 'sephora', 'academia', 'smart fit', 'estetica'] },
  { id: 'pets', name: 'Pets', icon: '🐾', cls: 'importante', kw: ['petshop', 'pet shop', 'veterinario', 'racao', 'cobasi', 'petz', 'banho e tosa'] },
  { id: 'viagem', name: 'Viagem', icon: '✈️', cls: 'superfluo', kw: ['hotel', 'pousada', 'passagem', 'airbnb', 'booking', 'latam', 'gol linhas', 'azul linhas', 'decolar', 'hurb', '123milhas', 'rodoviaria'] },
  { id: 'dividas', name: 'Dívidas e empréstimos', icon: '💳', cls: 'essencial', kw: ['emprestimo', 'parcela do emprestimo', 'fatura', 'juros', 'financiamento', 'consignado', 'acordo', 'renegociacao', 'serasa'] },
  { id: 'presentes', name: 'Presentes e doações', icon: '🎁', cls: 'importante', kw: ['presente', 'doacao', 'vaquinha', 'dizimo', 'oferta'] },
  { id: 'impostos', name: 'Impostos e taxas', icon: '🧾', cls: 'essencial', kw: ['imposto', 'taxa', 'multa', 'darf', 'tarifa', 'anuidade', 'iof', 'das mei'] },
  // "mercado pago" é carteira, não supermercado: a palavra-chave mais longa evita cair em "Mercado"
  { id: 'outros', name: 'Outros', icon: '📦', cls: 'importante', kw: ['mercado pago', 'mercadopago', '99pay'] },
];

export const INCOME_CATEGORIES = [
  { id: 'salario', name: 'Salário', icon: '💼', kw: ['salario', 'holerite', 'folha', 'pagamento empresa', 'adiantamento', '13o', 'decimo terceiro', 'ferias', 'plr'] },
  { id: 'extra', name: 'Renda extra', icon: '💻', kw: ['freela', 'freelance', 'job', 'extra', 'bico', 'comissao', 'uber ganhos', 'corrida'] },
  { id: 'investimentos', name: 'Investimentos', icon: '📈', kw: ['rendimento', 'dividendo', 'juros recebidos', 'cdb', 'tesouro', 'resgate', 'jcp'] },
  { id: 'vendas', name: 'Vendas', icon: '🏷️', kw: ['venda', 'vendi', 'olx', 'enjoei'] },
  { id: 'emprestimo-recebido', name: 'Empréstimo recebido', icon: '🏦', kw: ['emprestimo recebido', 'credito liberado', 'valor liberado'] },
  { id: 'reembolso', name: 'Reembolso', icon: '↩️', kw: ['reembolso', 'estorno', 'devolucao', 'cashback'] },
  { id: 'outros-ganhos', name: 'Outros ganhos', icon: '🎁', kw: ['pix recebido', 'presente', 'transferencia recebida'] },
];

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export function getCategory(id) {
  return ALL_CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Sugere categoria a partir de um texto livre. Retorna id ou null. */
export function categorize(text, type = 'expense') {
  const t = ' ' + normalize(text) + ' ';
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  let best = null;
  let bestLen = 0;
  for (const c of list) {
    for (const k of c.kw) {
      // palavra-chave mais longa vence ("mercado livre" > "mercado")
      if (k.length > bestLen && t.includes(k)) {
        best = c.id;
        bestLen = k.length;
      }
    }
  }
  return best;
}

export function defaultClassification(categoryId) {
  return EXPENSE_CATEGORIES.find((c) => c.id === categoryId)?.cls || 'importante';
}

export const PAYMENT_METHODS = {
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  pix_parcelado: 'Pix parcelado',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};
