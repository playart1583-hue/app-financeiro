// Dados de exemplo para o protótipo abrir com cara de uso real. Tudo marcado com demo: true.
import { addMonthsISO } from './analytics.js';
import { pad, toISO } from './parser.js';
import { pricePayment, round2 } from './finance.js';
import { defaultClassification } from './categories.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function buildDemo(today) {
  const r = rng(42);
  const tx = [];
  let n = 0;
  const id = () => `demo${(n++).toString(36)}`;
  const add = (type, amount, description, category, date, extra = {}) =>
    tx.push({
      id: id(),
      type,
      amount: round2(amount),
      description,
      category,
      classification: type === 'expense' ? extra.classification || defaultClassification(category) : null,
      date,
      time: extra.time || `${pad(8 + Math.floor(r() * 13))}:${pad(Math.floor(r() * 60))}`,
      method: extra.method || 'pix',
      card: extra.card || '',
      merchant: extra.merchant || '',
      location: '',
      source: 'demo',
      demo: true,
      createdAt: 0,
      ...(extra.installment ? { installment: extra.installment } : {}),
      ...(extra.recurringId ? { recurringId: extra.recurringId } : {}),
    });

  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = toISO(today);
  const nubank = 'Nubank · Mastercard · final 4321';

  // 4 meses passados + mês atual (até hoje); fixos também nos próximos meses
  for (let k = -4; k <= 0; k++) {
    const day = (d) => toISO(new Date(y, m + k, d));
    const upTo = (d) => k < 0 || d <= today.getDate();
    if (upTo(5)) add('income', 4200, 'Salário', 'salario', day(5), { time: '06:10' });
    if (k % 2 === 0 && upTo(20)) add('income', 650 + r() * 300, 'Freela de design', 'extra', day(20));
    if (upTo(10)) add('expense', 1350, 'Aluguel', 'moradia', day(10), { method: 'boleto' });
    if (upTo(12)) add('expense', 118 + r() * 40, 'Conta de luz', 'contas', day(12), { method: 'boleto' });
    if (upTo(15)) add('expense', 99.9, 'Internet Vivo Fibra', 'contas', day(15), { method: 'debito' });
    if (upTo(8)) add('expense', 55.9, 'Netflix', 'assinaturas', day(8), { method: 'credito', card: nubank });
    if (upTo(8)) add('expense', 21.9, 'Spotify', 'assinaturas', day(8), { method: 'credito', card: nubank });
    for (const d of [3, 11, 18, 25]) if (upTo(d)) add('expense', 180 + r() * 140, 'Mercado Assaí', 'mercado', day(d), { method: 'debito', merchant: 'ASSAI ATACADISTA' });
    const deliveries = 4 + Math.floor(r() * 5) + (k === 0 ? 3 : 0);
    for (let i = 0; i < deliveries; i++) {
      const d = 1 + Math.floor(r() * 27);
      if (upTo(d)) add('expense', 32 + r() * 45, 'iFood', 'restaurantes', day(d), { method: 'credito', card: nubank, merchant: 'IFOOD *RESTAURANTE' });
    }
    for (let i = 0; i < 6; i++) {
      const d = 1 + Math.floor(r() * 27);
      if (upTo(d)) add('expense', 12 + r() * 22, 'Uber', 'transporte', day(d), { method: 'credito', card: nubank });
    }
    for (let i = 0; i < 5; i++) {
      const d = 1 + Math.floor(r() * 27);
      if (upTo(d)) add('expense', 6 + r() * 14, 'Café e lanche', 'restaurantes', day(d), { method: 'pix' });
    }
    if (upTo(22)) add('expense', 60 + r() * 90, 'Farmácia Drogasil', 'saude', day(22), { method: 'debito' });
    if (upTo(16)) add('expense', 90 + r() * 160, k === 0 ? 'Show + bar' : 'Cinema e jantar', 'lazer', day(16), { method: 'credito', card: nubank });
    if (k === -2) add('expense', 239.9, 'Tênis Centauro', 'vestuario', day(14), { method: 'credito', card: nubank });
    if (upTo(24)) add('expense', 220, 'Gasolina', 'transporte', day(24), { method: 'debito' });
  }

  // contas fixas recorrentes nos próximos meses (para a projeção)
  const rec = { aluguel: 'demo-rec-aluguel', salario: 'demo-rec-salario' };
  for (let k = 1; k <= 6; k++) {
    const day = (d) => toISO(new Date(y, m + k, d));
    add('income', 4200, 'Salário', 'salario', day(5), { recurringId: rec.salario, time: '06:10' });
    add('expense', 1350, 'Aluguel', 'moradia', day(10), { method: 'boleto', recurringId: rec.aluguel });
  }

  // celular parcelado em 10x no cartão (começou há 3 meses)
  const start = toISO(new Date(y, m - 3, 9));
  for (let i = 0; i < 10; i++) add('expense', 239.9, 'Celular Samsung', 'compras', addMonthsISO(start, i), { method: 'credito', card: nubank, installment: { i: i + 1, n: 10, groupId: 'demo-cel', cash: 2399 }, time: '19:42' });

  // Pix parcelado com juros: R$ 450 à vista em 6x de R$ 89,90
  const pixStart = toISO(new Date(y, m - 1, 14));
  for (let i = 0; i < 6; i++) add('expense', 89.9, 'Geladeira usada (Pix parcelado)', 'compras', addMonthsISO(pixStart, i), { method: 'pix_parcelado', installment: { i: i + 1, n: 6, groupId: 'demo-pix', cash: 450 }, time: '11:05' });

  const loans = [
    (() => {
      const principal = 5000;
      const rate = 0.045;
      const nn = 24;
      return { id: 'demo-emp', name: 'Empréstimo pessoal', kind: 'emprestimo', mode: 'parcelado', principal, rate, n: nn, pmt: round2(pricePayment(principal, rate, nn)), firstDue: toISO(new Date(y, m - 8, 20)), paid: 8, payments: [], demo: true, createdAt: 0 };
    })(),
    { id: 'demo-rot', name: 'Cartão rotativo', kind: 'cartao', mode: 'rotativo', balance: 1800, rate: 0.14, minPayment: 270, payments: [], demo: true, createdAt: 0 },
    { id: 'demo-ser1', name: 'Vivo (conta antiga)', creditor: 'Telefônica Brasil S.A.', kind: 'serasa', mode: 'acordo', balance: 412.33, offer: 99.9, offerInstallments: null, since: '2024-03-05', status: 'aberta', rate: 0, payments: [], source: 'serasa', demo: true, createdAt: 0 },
    { id: 'demo-ser2', name: 'Banco Santander', creditor: 'Banco Santander', kind: 'serasa', mode: 'acordo', balance: 3245.1, offer: 649.02, offerInstallments: { n: 12, pmt: 98 }, since: '2023-07-18', status: 'aberta', rate: 0, payments: [], source: 'serasa', demo: true, createdAt: 0 },
  ];

  const goals = [
    { id: 'demo-g1', name: 'Reserva de emergência', emoji: '🛟', target: 12000, deadline: toISO(new Date(y + 1, m + 6, 1)), history: [{ date: toISO(new Date(y, m - 3, 6)), amount: 1500 }, { date: toISO(new Date(y, m - 1, 6)), amount: 500 }], demo: true, createdAt: 0 },
    { id: 'demo-g2', name: 'Viagem de fim de ano', emoji: '🏖️', target: 3000, deadline: toISO(new Date(y, 11, 15)), history: [{ date: toISO(new Date(y, m - 2, 6)), amount: 600 }, { date: iso, amount: 250 }], demo: true, createdAt: 0 },
  ];

  return {
    version: 1,
    updatedAt: 0,
    settings: { name: 'Ana', hideValues: false, theme: 'system', savingsRate: 0.008, demo: true },
    transactions: tx.sort((a, b) => (a.date < b.date ? -1 : 1)),
    budgets: { mercado: 1100, restaurantes: 350, lazer: 250, transporte: 500 },
    goals,
    loans,
  };
}
