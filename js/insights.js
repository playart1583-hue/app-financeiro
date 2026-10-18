// Sugestões automáticas: onde cortar, quanto guardar e como sair das dívidas mais rápido.
import { averages, monthSummary, projectMonth, projectNextMonths, addMonths, keyOf, debtsForPlan, loanBalance, loanIsOpen, goalSaved, txOfMonth } from './analytics.js';
import { futureValue, simulatePayoff, monthlyToAnnual } from './finance.js';
import { getCategory } from './categories.js';

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * Cada insight: { id, level: 'alerta' | 'atencao' | 'dica' | 'ok', title, text, action?: { label, route } }
 * Ordem: alertas primeiro.
 */
export function buildInsights(state, today = new Date()) {
  const out = [];
  const key = keyOf(today);
  const sum = monthSummary(state, key);
  const avg = averages(state, key);
  const proj = projectMonth(state, today);
  const income = proj.income || avg.income;
  const savingsRate = state.settings.savingsRate ?? 0.008;

  // 1. Projeção do mês
  if (income > 0 && proj.projected > income) {
    out.push({
      id: 'proj-negativo',
      level: 'alerta',
      title: 'No ritmo atual, o mês fecha no vermelho',
      text: `Projeção de gastos ${brl(proj.projected)} para uma renda de ${brl(income)}. Para fechar no zero, gaste no máximo ${brl(proj.perDayBudget)} por dia até ${proj.endDate.slice(8)}/${proj.endDate.slice(5, 7)}.`,
      action: { label: 'Ver relatório', route: 'relatorios' },
    });
  } else if (income > 0 && proj.projected > 0) {
    const sobra = income - proj.projected;
    out.push({
      id: 'proj-ok',
      level: 'ok',
      title: `Deve sobrar cerca de ${brl(sobra)} este mês`,
      text: `Mande essa sobra para um cofrinho assim que o salário cair: em 12 meses, guardando ${brl(sobra)} por mês, você teria ${brl(futureValue(sobra, savingsRate, 12))}.`,
      action: { label: 'Abrir cofrinhos', route: 'cofrinhos' },
    });
  }

  // 2. Regra 50/30/20
  const base = income || sum.income;
  if (base > 0 && sum.expense > 0) {
    const ess = sum.byClass.essencial / base;
    const sup = sum.byClass.superfluo / base;
    if (sup > 0.3) {
      const corte = sum.byClass.superfluo - base * 0.3;
      out.push({
        id: '50-30-20-superfluo',
        level: 'atencao',
        title: `Supérfluos já levam ${pct(sup)} da sua renda`,
        text: `A referência é até 30% (regra 50/30/20). Reduzir ${brl(corte)} por mês coloca você no limite e libera esse valor para dívidas ou cofrinho.`,
        action: { label: 'Ver categorias', route: 'relatorios' },
      });
    }
    if (ess > 0.5) {
      out.push({
        id: '50-30-20-essencial',
        level: 'dica',
        title: `Gastos essenciais em ${pct(ess)} da renda`,
        text: 'O ideal é até 50%. Revise planos de celular e internet, troque marcas no mercado e compare tarifas de energia: são cortes que não mudam sua rotina.',
      });
    }
  }

  // 3. Categoria que disparou em relação à média
  for (const c of sum.byCategory.slice(0, 6)) {
    const prev = [1, 2, 3].map((k) => txOfMonth(state, addMonths(key, -k)).filter((t) => t.type === 'expense' && t.category === c.id).reduce((s, t) => s + t.amount, 0));
    const months = prev.filter((v) => v > 0).length;
    if (!months) continue;
    const media = prev.reduce((a, b) => a + b, 0) / months;
    if (c.total > media * 1.25 && c.total - media > 50) {
      const cat = getCategory(c.id);
      out.push({
        id: `alta-${c.id}`,
        level: 'atencao',
        title: `${cat.icon} ${cat.name}: ${pct(c.total / media - 1)} acima da média`,
        text: `Você gastou ${brl(c.total)} este mês contra ${brl(media)} de média nos meses anteriores.`,
        action: { label: 'Ver extrato', route: 'extrato' },
      });
    }
  }

  // 4. Orçamentos estourados
  for (const [catId, limit] of Object.entries(state.budgets || {})) {
    if (!limit) continue;
    const spent = sum.byCategory.find((c) => c.id === catId)?.total || 0;
    const cat = getCategory(catId);
    if (spent > limit) out.push({ id: `orc-${catId}`, level: 'alerta', title: `Orçamento de ${cat.name} estourado`, text: `${brl(spent)} gastos de ${brl(limit)} planejados (${brl(spent - limit)} acima).`, action: { label: 'Orçamentos', route: 'orcamentos' } });
    else if (spent > limit * 0.8) out.push({ id: `orc-${catId}`, level: 'atencao', title: `${cat.name}: ${pct(spent / limit)} do orçamento usado`, text: `Restam ${brl(limit - spent)} até o fim do mês.`, action: { label: 'Orçamentos', route: 'orcamentos' } });
  }

  // 5. Pequenos gastos
  const small = sum.txs.filter((t) => t.type === 'expense' && t.amount <= 30 && !t.installment);
  if (small.length >= 8) {
    const total = small.reduce((s, t) => s + t.amount, 0);
    out.push({
      id: 'pequenos',
      level: 'dica',
      title: `${small.length} gastos pequenos somam ${brl(total)}`,
      text: `Cafezinho, lanche e corrida curta passam despercebidos. Cortando metade, sobram ${brl(total / 2)} por mês, ${brl(futureValue(total / 2, savingsRate, 12))} em um ano no cofrinho.`,
    });
  }

  // 6. Arredondamento para o cofrinho
  const roundUp = sum.txs.filter((t) => t.type === 'expense').reduce((s, t) => s + (Math.ceil(t.amount / 10) * 10 - t.amount), 0);
  if (roundUp > 20) {
    out.push({
      id: 'arredonda',
      level: 'dica',
      title: `Arredondar seus gastos renderia ${brl(roundUp)} este mês`,
      text: 'Se cada compra fosse arredondada para a dezena seguinte e a diferença fosse para o cofrinho, você guardaria sem sentir.',
      action: { label: 'Guardar agora', route: 'cofrinhos' },
    });
  }

  // 7. Parcelas comprometendo a renda
  const next = projectNextMonths(state, today, 3);
  if (income > 0 && next.length && next[0].installments / income > 0.3) {
    out.push({
      id: 'parcelas',
      level: 'alerta',
      title: `Parcelas e dívidas tomam ${pct(next[0].installments / income)} da renda do próximo mês`,
      text: 'Acima de 30% o orçamento fica sem folga. Evite novos parcelamentos até essa fatia baixar.',
      action: { label: 'Ver dívidas', route: 'dividas' },
    });
  }

  // 8. Dívidas: caras, negativadas e plano
  const open = state.loans.filter(loanIsOpen);
  const caras = open.filter((l) => l.mode !== 'acordo' && l.rate >= 0.04).sort((a, b) => b.rate - a.rate);
  if (caras.length) {
    const l = caras[0];
    out.push({
      id: 'divida-cara',
      level: 'alerta',
      title: `${l.name}: ${pct(l.rate)} ao mês (${pct(monthlyToAnnual(l.rate))} ao ano)`,
      text: `É a dívida mais cara. Priorize quitá-la ou troque por crédito mais barato (consignado ou empréstimo pessoal costumam ter taxa bem menor). Saldo: ${brl(loanBalance(l))}.`,
      action: { label: 'Plano de quitação', route: 'dividas' },
    });
  }
  const acordos = open.filter((l) => l.mode === 'acordo' && l.offer);
  if (acordos.length) {
    const best = [...acordos].sort((a, b) => a.offer - b.offer)[0];
    out.push({
      id: 'serasa',
      level: 'atencao',
      title: `${acordos.length} dívida(s) negativada(s) com oferta de desconto`,
      text: `A menor é ${best.name}: quite por ${brl(best.offer)} em vez de ${brl(best.balance)}. Quitar acordos pequenos primeiro limpa o nome mais rápido.`,
      action: { label: 'Priorizar no plano', route: 'dividas' },
    });
  }
  const debts = debtsForPlan(state);
  if (debts.length >= 2) {
    const folga = Math.max(0, avg.income - avg.expense);
    const minimos = debts.reduce((s, d) => s + (d.minPayment || 0), 0);
    const budget = minimos + folga * 0.5;
    const a = simulatePayoff(debts, budget, 'avalanche');
    const b = simulatePayoff(debts, minimos + 0.01, 'avalanche');
    if (a.feasible && folga > 0) {
      out.push({
        id: 'plano',
        level: 'dica',
        title: `Com ${brl(folga * 0.5)} extras por mês, você zera as dívidas em ${a.months} meses`,
        text: b.feasible ? `Pagando só o mínimo seriam ${b.months} meses e ${brl(b.totalInterest - a.totalInterest)} a mais de juros.` : 'Pagando só o mínimo, algumas dívidas nunca acabariam: os juros comem o pagamento.',
        action: { label: 'Ver plano', route: 'dividas' },
      });
    }
  }

  // 9. Reserva de emergência
  const hasReserve = state.goals.some((g) => /reserva|emergencia|emergência/i.test(g.name));
  if (!hasReserve && avg.essencial > 0) {
    out.push({
      id: 'reserva',
      level: 'dica',
      title: 'Crie sua reserva de emergência',
      text: `O alvo é 6 meses de gastos essenciais: ${brl(avg.essencial * 6)}. Comece com 10% da renda por mês.`,
      action: { label: 'Criar cofrinho', route: 'cofrinhos' },
    });
  } else if (hasReserve) {
    const g = state.goals.find((x) => /reserva|emergencia|emergência/i.test(x.name));
    const s = goalSaved(g);
    if (avg.essencial > 0 && s < avg.essencial * 3) {
      out.push({ id: 'reserva-baixa', level: 'dica', title: `Reserva cobre ${(s / avg.essencial).toFixed(1).replace('.', ',')} mês de gastos essenciais`, text: 'Chegue a 3 meses antes de investir em coisas mais arriscadas e evite usar crédito caro em imprevistos.', action: { label: 'Guardar', route: 'cofrinhos' } });
    }
  }

  const rank = { alerta: 0, atencao: 1, dica: 2, ok: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
