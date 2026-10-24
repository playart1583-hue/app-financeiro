// Cálculos financeiros puros (sem DOM). Taxas sempre em fração ao mês: 0.05 = 5% a.m.

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Converte taxa mensal em anual equivalente (juros compostos). */
export const monthlyToAnnual = (i) => Math.pow(1 + i, 12) - 1;
export const annualToMonthly = (a) => Math.pow(1 + a, 1 / 12) - 1;

/** Parcela pela Tabela Price. */
export function pricePayment(pv, i, n) {
  if (n <= 0) return 0;
  if (i === 0) return pv / n;
  return (pv * i) / (1 - Math.pow(1 + i, -n));
}

/** Valor presente de n parcelas iguais. `antecipada` = 1ª parcela no ato. */
export function presentValue(pmt, i, n, antecipada = false) {
  if (i === 0) return pmt * n;
  const pv = (pmt * (1 - Math.pow(1 + i, -n))) / i;
  return antecipada ? pv * (1 + i) : pv;
}

/**
 * Descobre a taxa mensal embutida num parcelamento (ex.: Pix parcelado).
 * pv = valor à vista, pmt = valor da parcela, n = nº de parcelas.
 * Retorna 0 quando não há juros (ou há desconto).
 */
export function rateFromInstallments(pv, pmt, n, antecipada = false) {
  if (!(pv > 0) || !(pmt > 0) || !(n > 0)) return 0;
  if (pmt * n <= pv + 0.005) return 0;
  if (antecipada && n === 1) return 0;
  let lo = 0;
  let hi = 5; // 500% a.m. é mais do que suficiente
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (presentValue(pmt, mid, n, antecipada) > pv) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Resumo completo de um parcelamento com juros. */
export function analyzeInstallments({ cashPrice, installment, n, antecipada = false, investRate = 0 }) {
  const total = installment * n;
  const interest = total - cashPrice;
  const rate = rateFromInstallments(cashPrice, installment, n, antecipada);
  // Quanto as parcelas "valem hoje" se o dinheiro ficasse rendendo à taxa investRate
  const pvAtInvest = presentValue(installment, investRate, n, antecipada);
  return {
    total: round2(total),
    interest: round2(Math.max(0, interest)),
    interestPct: cashPrice > 0 ? Math.max(0, interest) / cashPrice : 0,
    rate,
    annualRate: monthlyToAnnual(rate),
    // Parcelar compensa quando o valor presente das parcelas (descontado pelo rendimento) é menor que o à vista
    worthIt: pvAtInvest < cashPrice,
    pvAtInvest: round2(pvAtInvest),
  };
}

/** Saldo devedor (Price) depois de k parcelas pagas. */
export function outstandingBalance(pv, i, n, k) {
  if (k >= n) return 0;
  if (i === 0) return pv - (pv / n) * k;
  const pmt = pricePayment(pv, i, n);
  const f = Math.pow(1 + i, k);
  return Math.max(0, pv * f - (pmt * (f - 1)) / i);
}

/** Nº de parcelas necessárias para quitar saldo `b` pagando `pmt` à taxa i. Infinity se nunca quita. */
export function periodsToPayoff(b, i, pmt) {
  if (b <= 0) return 0;
  if (pmt <= 0) return Infinity;
  if (i === 0) return Math.ceil(b / pmt);
  if (pmt <= b * i) return Infinity;
  return Math.ceil(-Math.log(1 - (b * i) / pmt) / Math.log(1 + i));
}

/** Tabela de amortização Price. */
export function amortizationSchedule(pv, i, n) {
  const pmt = pricePayment(pv, i, n);
  const rows = [];
  let bal = pv;
  for (let k = 1; k <= n; k++) {
    const juros = bal * i;
    const amort = pmt - juros;
    bal = Math.max(0, bal - amort);
    rows.push({ k, pmt: round2(pmt), juros: round2(juros), amort: round2(amort), saldo: round2(bal) });
  }
  return rows;
}

/**
 * Amortização extraordinária: paga `extra` hoje sobre o saldo e mantém a parcela (reduz prazo).
 * Retorna economia de juros e meses a menos.
 */
export function simulateExtraPayment({ balance, rate, pmt, extra }) {
  const before = periodsToPayoff(balance, rate, pmt);
  const newBal = Math.max(0, balance - extra);
  const after = periodsToPayoff(newBal, rate, pmt);
  const paidBefore = totalPaidSimulated(balance, rate, pmt);
  const paidAfter = totalPaidSimulated(newBal, rate, pmt) + Math.min(extra, balance);
  return {
    monthsBefore: before,
    monthsAfter: after,
    monthsSaved: Number.isFinite(before) && Number.isFinite(after) ? before - after : 0,
    interestSaved: round2(Math.max(0, paidBefore - paidAfter)),
  };
}

function totalPaidSimulated(balance, rate, pmt) {
  let b = balance;
  let paid = 0;
  for (let m = 0; m < 1200 && b > 0.005; m++) {
    b *= 1 + rate;
    const p = Math.min(pmt, b);
    b -= p;
    paid += p;
  }
  return paid;
}

/**
 * Simula um plano para zerar dívidas.
 *
 * debts: [{ id, name, kind: 'juros' | 'acordo', balance, rate, minPayment }]
 *   - 'juros': dívida que cresce com juros (cartão, cheque especial, empréstimo). Paga mínimo todo mês.
 *   - 'acordo': dívida negativada com oferta de quitação à vista (ex.: Serasa). Valor fixo, paga de uma vez.
 * budget: quanto a pessoa consegue destinar às dívidas por mês (mínimos + extra).
 * strategy:
 *   - 'avalanche': maior juros primeiro (menos juros pagos)
 *   - 'bola-de-neve': menor saldo primeiro (vitórias rápidas)
 *   - 'nome-limpo': acordos/negativadas primeiro (menor oferta primeiro), depois avalanche
 */
export function simulatePayoff(debts, budget, strategy = 'avalanche', maxMonths = 600) {
  const ds = debts
    .filter((d) => d.balance > 0.005)
    .map((d) => ({ ...d, rate: d.kind === 'acordo' ? 0 : d.rate || 0, minPayment: d.kind === 'acordo' ? 0 : d.minPayment || 0, left: d.balance }));
  const order = priorityOrder(ds, strategy);
  const events = [];
  let interest = 0;
  let paid = 0;
  let pot = 0;
  let shortfall = false;
  let month = 0;
  let cleanNameMonth = ds.some((d) => d.kind === 'acordo') ? null : 0;

  while (ds.some((d) => d.left > 0.005) && month < maxMonths) {
    month++;
    let free = budget;
    for (const d of ds) {
      if (d.left <= 0.005 || d.kind === 'acordo') continue;
      const j = d.left * d.rate;
      d.left += j;
      interest += j;
      const p = Math.min(d.minPayment, d.left);
      d.left -= p;
      paid += p;
      free -= p;
      if (d.left <= 0.005) events.push({ month, id: d.id, name: d.name });
    }
    if (free < 0) {
      shortfall = true;
      free = 0;
    }
    pot += free;
    for (const id of order) {
      const d = ds.find((x) => x.id === id);
      if (d.left <= 0.005) continue;
      if (d.kind === 'acordo') {
        if (pot + 0.005 >= d.left) {
          pot -= d.left;
          paid += d.left;
          d.left = 0;
          events.push({ month, id: d.id, name: d.name });
          continue;
        }
        break;
      }
      const p = Math.min(pot, d.left);
      d.left -= p;
      pot -= p;
      paid += p;
      if (d.left <= 0.005) {
        events.push({ month, id: d.id, name: d.name });
        continue;
      }
      break;
    }
    if (cleanNameMonth === null && !ds.some((d) => d.kind === 'acordo' && d.left > 0.005)) cleanNameMonth = month;
  }
  const done = !ds.some((d) => d.left > 0.005);
  return {
    strategy,
    feasible: done,
    months: done ? month : Infinity,
    totalInterest: round2(interest),
    totalPaid: round2(paid),
    events,
    cleanNameMonth,
    shortfall,
  };
}

function priorityOrder(ds, strategy) {
  const byRate = (a, b) => b.rate - a.rate || a.left - b.left;
  const bySize = (a, b) => a.left - b.left;
  let list;
  if (strategy === 'bola-de-neve') list = [...ds].sort(bySize);
  else if (strategy === 'nome-limpo') {
    const acordos = ds.filter((d) => d.kind === 'acordo').sort(bySize);
    const juros = ds.filter((d) => d.kind !== 'acordo').sort(byRate);
    list = [...acordos, ...juros];
  } else list = [...ds].sort(byRate);
  return list.map((d) => d.id);
}

/** Rendimento de aportes mensais (cofrinho). */
export function futureValue(monthly, i, months, initial = 0) {
  if (i === 0) return initial + monthly * months;
  const f = Math.pow(1 + i, months);
  return initial * f + (monthly * (f - 1)) / i;
}

/** Quanto guardar por mês para chegar no alvo em `months` meses. */
export function monthlyToReach(target, saved, i, months) {
  const missing = target - saved;
  if (missing <= 0) return 0;
  if (months <= 0) return missing;
  if (i === 0) return missing / months;
  const f = Math.pow(1 + i, months);
  return (target - saved * f) * i / (f - 1);
}

/**
 * Custo real de uma oferta de empréstimo.
 * released = quanto cai na conta; financed = valor total financiado (inclui IOF, tarifas, seguro).
 * A taxa efetiva compara o que você recebe com o que vai pagar: é o custo de verdade (próximo do CET).
 */
export function analyzeLoanOffer({ released, financed, pmt, n, statedRate = null }) {
  const base = released || financed;
  if (!(base > 0) || !(pmt > 0) || !(n > 0)) return null;
  const total = pmt * n;
  const effRate = rateFromInstallments(base, pmt, n);
  const nominal = statedRate ?? (financed ? rateFromInstallments(financed, pmt, n) : effRate);
  const fees = financed && released && financed > released ? financed - released : 0;
  const expectedPmt = statedRate != null && financed ? pricePayment(financed, statedRate, n) : null;
  return {
    base,
    total: round2(total),
    cost: round2(total - base),
    costPct: (total - base) / base,
    effRate,
    effAnnual: monthlyToAnnual(effRate),
    nominal,
    nominalAnnual: monthlyToAnnual(nominal),
    fees: round2(fees),
    expectedPmt: expectedPmt ? round2(expectedPmt) : null,
    // parcela bem acima da que a taxa informada daria: há custo embutido que não aparece na taxa
    pmtMismatch: expectedPmt ? Math.abs(expectedPmt - pmt) / pmt > 0.03 : false,
  };
}

/** Juros pagos ao longo de `months` meses pagando `pmt` por mês num saldo que cresce à taxa i. */
export function interestOver(balance, i, pmt, months) {
  let b = balance;
  let interest = 0;
  for (let m = 0; m < months && b > 0.005; m++) {
    const j = b * i;
    interest += j;
    b = b + j - Math.min(pmt, b + j);
  }
  return { interest: round2(interest), left: round2(Math.max(0, b)) };
}
