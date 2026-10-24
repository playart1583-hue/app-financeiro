// Impacto de um empréstimo no seu mês: custo real, o que melhora, o que piora e o efeito no dia a dia.
import { addMonths, addMonthsISO, averageOf, goalSaved, interestCommitments, keyOf, monthKey, projectNextMonths } from './analytics.js';
import { analyzeLoanOffer, monthlyToReach, round2 } from './finance.js';
import { toISO } from './parser.js';

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace('.', ',')}%`;

/**
 * offer: { released, financed, pmt, n, statedRate, cetMonthly, firstDue, kind, creditor, iof, tariff, insurance }
 * payoffIds: compromissos (de interestCommitments) que serão quitados com o dinheiro do empréstimo.
 */
export function loanImpact(state, offer, payoffIds = [], today = new Date()) {
  const a = analyzeLoanOffer(offer);
  if (!a) return null;
  const base = today;
  const key = keyOf(base);
  const firstDue = offer.firstDue || addMonthsISO(toISO(today), 1);
  const endDate = addMonthsISO(firstDue, offer.n - 1);
  const next = projectNextMonths(state, base, 6);
  const income = next[0]?.income || 0;
  const commitBefore = next[0]?.installments || 0;

  const all = interestCommitments(state, today);
  const chosen = all.filter((c) => payoffIds.includes(c.id));
  const debtSum = chosen.reduce((s, c) => s + c.payoffToday, 0);
  const freed = chosen.reduce((s, c) => s + (c.pmt || 0), 0);
  const oldInterest = chosen.reduce((s, c) => s + c.savings, 0);
  const share = Math.min(1, debtSum / a.base);
  const loanInterestShare = a.cost * share;
  const leftover = Math.max(0, a.base - debtSum);

  const commitAfter = commitBefore + offer.pmt - freed;
  const ratioBefore = income > 0 ? commitBefore / income : 0;
  const ratioAfter = income > 0 ? commitAfter / income : 0;
  const surplusBefore = next[0]?.balance ?? 0;
  const surplusAfter = surplusBefore - offer.pmt + freed;

  const months = next.map((m, k) => {
    const due = m.key >= monthKey(firstDue) && m.key <= monthKey(endDate) ? offer.pmt : 0;
    const relief = chosen.reduce((s, c) => s + (c.remaining == null || c.remaining > k ? c.pmt || 0 : 0), 0);
    return { key: m.key, before: m.balance, after: round2(m.balance - due + relief) };
  });
  // meses que o empréstimo empurra (ou deixa mais fundo) no vermelho
  const negativeMonths = months.filter((m) => m.after < 0 && m.after < m.before - 0.5).length;
  const improves = surplusAfter >= surplusBefore;

  const mercado = averageOf(state, key, 3, (txs) => txs.filter((t) => t.type === 'expense' && t.category === 'mercado').reduce((s, t) => s + t.amount, 0));
  const goalNeed = state.goals
    .filter((g) => g.deadline && goalSaved(g) < g.target)
    .reduce((s, g) => {
      const d = new Date(g.deadline + 'T12:00:00');
      const mm = Math.max(1, (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth());
      return s + monthlyToReach(g.target, goalSaved(g), state.settings.savingsRate || 0, mm);
    }, 0);

  const good = [];
  const bad = [];
  const daily = [];

  // custo
  bad.push(`Você recebe ${brl(a.base)} e devolve ${brl(a.total)}: ${brl(a.cost)} de juros e custos (${pct(a.costPct)} a mais).`);
  if (a.fees > 0) bad.push(`${brl(a.fees)} de IOF, tarifas e seguro entram no valor financiado e também pagam juros.`);
  if (offer.cetMonthly && a.nominal && offer.cetMonthly - a.nominal > 0.003) bad.push(`O custo efetivo (CET ${pct(offer.cetMonthly, 2)} a.m.) é maior que a taxa anunciada (${pct(a.nominal, 2)} a.m.). Compare ofertas sempre pelo CET.`);
  // taxa só a calculada com os números do próprio contrato (cada banco tem a sua; o app não compara com "média")
  if (a.effRate > 0) bad.push(`Taxa real de ${pct(a.effRate, 2)} ao mês, calculada com o valor recebido, as parcelas e o prazo do contrato. Para comparar, peça a proposta de outro banco e coloque aqui.`);
  if (offer.n > 36) bad.push(`Prazo longo (${offer.n} meses): a parcela fica menor, mas você paga juros por mais tempo. Cada ano a menos de prazo reduz bastante o total.`);

  // troca de dívida
  if (chosen.length) {
    const net = oldInterest - loanInterestShare;
    const names = chosen.map((c) => c.name).join(', ');
    if (net > 0) good.push(`Quitando ${names}, você deixa de pagar ${brl(oldInterest)} de juros e paga ${brl(loanInterestShare)} neste empréstimo: economia de ${brl(net)}.`);
    else bad.push(`Trocar ${names} por este empréstimo sai ${brl(-net)} mais caro: as dívidas atuais têm juros menores que a oferta.`);
    if (freed > 0) good.push(`Libera ${brl(freed)} por mês das parcelas que você encerra.`);
    if (leftover > 1) daily.push(`Sobram ${brl(leftover)} depois de quitar as dívidas escolhidas. Guarde no cofrinho em vez de gastar: você está pagando juros por esse dinheiro.`);
  } else {
    const caras = all.filter((c) => !c.interestFree && c.rate > a.effRate + 0.005);
    if (caras.length) good.push(`Só compensa se for para quitar dívidas mais caras: ${caras.slice(0, 3).map((c) => `${c.name} (${pct(c.rate, 1)} a.m.)`).join(', ')}. Marque-as abaixo para ver a economia.`);
  }

  // renda e dia a dia
  if (income > 0) {
    const line = `Parcelas e dívidas passam de ${pct(ratioBefore)} para ${pct(ratioAfter)} da sua renda.`;
    if (ratioAfter > 0.35) bad.push(`${line} Acima de 30–35% o orçamento fica sem folga para imprevistos.`);
    else if (ratioAfter > ratioBefore) daily.push(line);
    else good.push(line);
  }
  daily.push(`A parcela de ${brl(offer.pmt)} equivale a ${brl(offer.pmt / 30)} por dia${income > 0 ? `, ou ${Math.max(1, Math.round(offer.pmt / (income / 30)))} dia(s) da sua renda a cada mês` : ''}${mercado > 0 ? ` (${pct(offer.pmt / mercado)} do que você gasta no mercado)` : ''}.`);
  const perDay = surplusBefore > 0 || surplusAfter > 0 ? ` (${brl(Math.max(0, surplusBefore) / 30)} → ${brl(Math.max(0, surplusAfter) / 30)} por dia livres)` : '';
  daily.push(`Sobra por mês: ${brl(surplusBefore)} hoje → ${brl(surplusAfter)} com o empréstimo${perDay}.`);
  daily.push(`Compromisso até ${endDate.slice(8)}/${endDate.slice(5, 7)}/${endDate.slice(0, 4)} (${offer.n} parcelas).`);
  if (negativeMonths) bad.push(`Nos próximos 6 meses, ${negativeMonths} ${negativeMonths === 1 ? 'mês fecha' : 'meses fecham'} no vermelho (ou mais no vermelho) por causa dessa parcela.`);
  if (surplusBefore < 0) daily.push('Seu orçamento já está fechando no vermelho. Além de resolver as dívidas, corte gastos supérfluos para não precisar de crédito de novo.');
  if (goalNeed > 0 && surplusAfter < goalNeed) bad.push(`Seus cofrinhos com prazo precisam de ${brl(goalNeed)} por mês; com a parcela, a sobra não cobre e as metas atrasam.`);

  const swapPays = chosen.length > 0 && oldInterest > loanInterestShare;
  let level = 'ok';
  let title = 'Cabe no orçamento';
  if (swapPays && improves) {
    level = surplusAfter < 0 ? 'atencao' : 'ok';
    title = surplusAfter < 0 ? 'Melhora seu mês, mas o orçamento continua no vermelho' : 'Faz sentido: troca dívida cara por uma mais barata';
  } else if (surplusAfter < 0 || ratioAfter > 0.35 || negativeMonths >= 2) {
    level = 'alerta';
    title = 'Não recomendado agora: aperta demais o seu mês';
  } else if (ratioAfter > 0.3 || (chosen.length && !swapPays)) {
    level = 'atencao';
    title = 'Dá para fazer, mas com cuidado';
  }

  return {
    offer: a,
    income,
    commitBefore: round2(commitBefore),
    commitAfter: round2(commitAfter),
    ratioBefore,
    ratioAfter,
    surplusBefore: round2(surplusBefore),
    surplusAfter: round2(surplusAfter),
    months,
    endDate,
    payoff: { items: chosen, debtSum: round2(debtSum), freed: round2(freed), oldInterest: round2(oldInterest), loanInterestShare: round2(loanInterestShare), leftover: round2(leftover) },
    candidates: all.filter((c) => !c.interestFree),
    good,
    bad,
    daily,
    verdict: { level, title },
    nextKey: addMonths(key, 1),
  };
}
