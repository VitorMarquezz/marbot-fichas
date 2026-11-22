// Conta do rendimento: peso cru → perda no cozimento → peso da peça pronta → unidades.
import { norm } from './match.js';

// peso médio de 1 unidade, para ingredientes cadastrados em "un."
const UNIT_WEIGHT = [[/suco de limao/, 30], [/suco de laranja/, 90], [/raspas? de (limao|laranja)/, 3], [/gema/, 18], [/clara/, 32], [/ovo/, 50], [/banana/, 100], [/morango/, 15], [/limao/, 80], [/laranja/, 180]];

export function unitWeight(name) {
  const n = norm(name);
  return (UNIT_WEIGHT.find(([re]) => re.test(n)) || [null, 50])[1];
}

/**
 * Passa a medida da receita para a medida do cadastro (g ↔ un.) e explica a conta.
 * Ex.: 150 g de gema com "Ovos" em un. → { qty: 9, note: "150 g de gema ≈ 9 ovos (18 g cada)" }.
 * @param {{qty:number, unit:'g'|'un.', part:string}} src  medida como está na receita (volume já em g)
 * @param {boolean} toUnits  o cadastrado está em "un."
 * @param {string} target  nome do cadastrado
 */
export function fitUnit(src, toUnits, target) {
  const qty = Number(src?.qty) || 0;
  if (qty <= 0 || !src.unit) return null;
  const part = String(src.part || target || '').trim().toLowerCase();
  const w = unitWeight(src.part || target);
  if (toUnits && src.unit === 'g') {
    const u = Math.max(1, Math.ceil(qty / w - 0.1)); // arredonda para cima: sobra um pouco, não falta
    return { qty: u, note: `${fmt(qty)} g de ${part} ≈ ${u} ${String(target).toLowerCase()} (${w} g cada)` };
  }
  if (!toUnits && src.unit === 'un.') {
    const g = Math.round(qty * w);
    return { qty: g, note: `${fmt(qty)} un. de ${part} ≈ ${g} g (${w} g cada)` };
  }
  return null;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Peso cru total, em gramas. items: [{ qty, unitBased, name }] */
export function rawMass(items) {
  return items.reduce((a, it) => a + (Number(it.qty) || 0) * (it.unitBased ? unitWeight(it.name) : 1), 0);
}

// [tipo de doce, peça pronta (g), perda no cozimento (%)]
const KINDS = [
  [/bombom|trufa/, 18, 0],
  [/brigadeiro|docinho|beijinho|cajuzinho|bicho de pe/, 15, 20],
  [/brownie|blondie/, 45, 12],
  [/biscoito|cookie|amanteigado|sable/, 15, 12],
  [/tartelete|torta|tortinha/, 35, 8],
  [/choux|bomba|eclair|profiterole/, 25, 30],
  [/bolo|cake|cupcake/, 80, 10],
  [/pao|brioche|rosca/, 60, 12],
  [/ganache|creme|recheio|mousse|pudim|calda/, 30, 0],
];

export function guessKind(name, tab = '') {
  const n = norm(name);
  const t = norm(tab);
  for (const [re, piece, loss] of KINDS) if (re.test(n)) return { piece, loss };
  for (const [re, piece, loss] of KINDS) if (re.test(t)) return { piece, loss };
  return { piece: 25, loss: 10 };
}

export function unitsFor(mass, lossPct, piece) {
  if (!(mass > 0) || !(piece > 0)) return 0;
  return Math.max(1, Math.floor((mass * (1 - (lossPct || 0) / 100)) / piece));
}

const r1 = (n) => Math.round(n * 10) / 10;
export const g = (n) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)} g`;

/** Explica a conta em uma linha: "Massa crua 430 g − 20% no cozimento = 344 g ÷ peças de 15 g = 22 un." */
export function explain(mass, lossPct, piece) {
  const cooked = mass * (1 - (lossPct || 0) / 100);
  const lossTxt = lossPct ? ` − ${r1(lossPct)}% no cozimento = ${g(cooked)}` : ' (sem perda no cozimento)';
  return `Massa crua ${g(mass)}${lossTxt} ÷ peças de ${r1(piece)} g = ${unitsFor(mass, lossPct, piece)} unidades`;
}

/**
 * Lê pedidos simples sem IA: "peças de 12 g", "perde 10%", "rende 30", "30 unidades".
 * @returns {{ piece?: number, loss?: number, units?: number } | null}
 */
export function parseYieldMessage(text) {
  const s = norm(text).replace(/(\d) (\d)/g, '$1$2');
  const num = (re) => { const m = String(text).toLowerCase().match(re); return m ? Number(m[1].replace(',', '.')) : undefined; };
  const out = {
    piece: num(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\b(?![^,.;]*(massa|total|receita))/),
    loss: num(/(\d+(?:[.,]\d+)?)\s*%/),
    units: num(/(?:rend[eai]\w*|faz|fa[cç]o|quero)\s*(\d+)/) ?? num(/(\d+)\s*(?:unidades|un\b|pe[cç]as|bombons|brigadeiros|docinhos|fatias|cookies|biscoitos)/),
  };
  if (/sem perda|nao perde|cru/.test(s)) out.loss = 0;
  return Object.values(out).some((v) => v != null) ? out : null;
}
