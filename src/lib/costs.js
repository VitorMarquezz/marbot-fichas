// Mesma conta das fórmulas da ficha (ligadas à aba PARÂMETROS), para mostrar o preço antes de gravar.

/** Perda, taxa do cartão, custo fixo e margem que valem para uma aba. */
export function paramsFor(params, tab) {
  const p = params || { loss: 0.05, card: 0, margin: 0.5, fixed: 0.6, perTab: [] };
  const row = (p.perTab || []).find((x) => x.tab.toLowerCase() === String(tab || '').toLowerCase());
  return {
    loss: p.loss ?? 0,
    card: p.card ?? 0,
    fixed: row?.fixed ?? p.fixed ?? 0,
    margin: row?.margin ?? p.margin ?? 0.5,
  };
}

/**
 * @param {object[]} ingredients [{ qty, name, newIng? }]
 * @param {object[]} catalog ingredientes cadastrados
 * @param {number} yieldUnits
 * @param {object} [opts] { params, tab, packaging:[{qty,name}], packCatalog }
 */
export function computeCosts(ingredients, catalog, yieldUnits, opts = {}) {
  const { loss: lossPct, card, fixed: fixedPer, margin } = paramsFor(opts.params, opts.tab);
  const lines = ingredients.map((ing) => {
    const item = catalog.find((c) => c.name === ing.name);
    const price = ing.newIng ? Number(ing.newIng.price) : item?.price;
    const pack = ing.newIng ? Number(ing.newIng.pack) : item?.pack;
    const cost = price && pack ? (price / pack) * Number(ing.qty || 0) : 0;
    return { ...ing, price, pack, cost, found: !!(price && pack) };
  });
  const packLines = (opts.packaging || []).map((pk) => {
    const item = (opts.packCatalog || []).find((c) => c.name === pk.name);
    const cost = item?.price && item?.qty ? (item.price / item.qty) * Number(pk.qty || 0) : 0;
    return { ...pk, price: item?.price, pack: item?.qty, cost, found: !!item };
  });
  const ingCost = lines.reduce((a, l) => a + l.cost, 0);
  const loss = ingCost * lossPct;
  const y = Number(yieldUnits) || 0;
  const fixed = fixedPer * y;
  const packaging = packLines.reduce((a, l) => a + l.cost, 0);
  const total = ingCost + loss + fixed + packaging;
  const unit = y ? total / y : 0;
  const sale = 1 - margin - card <= 0 ? 0 : unit / (1 - margin - card);
  const recipe = sale * y;
  const cardFee = recipe * card;
  const profit = recipe - total - cardFee;
  return { lines, packLines, ingCost, loss, fixed, packaging, total, unit, sale, recipe, cardFee, profit, lossPct, fixedPer, margin, card };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (v) => brl.format(Number.isFinite(v) ? v : 0);
export const qtyFmt = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(v) || 0);
export const pctFmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(Number(v) || 0);
