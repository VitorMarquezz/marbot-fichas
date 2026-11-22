// Lê as fichas de uma aba de receitas a partir dos valores B:I.
import { norm } from './match.js';

const B = 0, C = 1, D = 2, E = 3, F = 4, H = 6, I = 7;

// rótulo do quadro de custos (coluna H) → campo; aceita os nomes antigos e os atuais
const BOX = [
  ['ingredients', ['custo de ingredientes']],
  ['loss', ['perda']],
  ['fixed', ['custo fixo', 'taxa fixa']],
  ['packaging', ['embalagens']],
  ['yieldUnits', ['rendimento']],
  ['total', ['custo total', 'custo taxas aplicadas']],
  ['unitCost', ['custo por unidade', 'preco por unidade']],
  ['margin', ['margem']],
  ['unitPrice', ['preco final de venda por unidade']],
  ['recipePrice', ['preco de venda final da receita']],
  ['card', ['taxa do cartao', 'taxa cartao']],
  ['profit', ['lucro da receita']],
];

const num = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};
const txt = (v) => (v == null ? '' : String(v).trim());
const filled = (row) => (row || []).some((v) => txt(v));

/** Lê o quadro de custos (H:I) a partir da linha do título. rows[0] = linha do título. */
export function readBox(rows, from = 0, to = rows.length) {
  const box = {};
  for (let r = from; r < Math.min(to, from + 20); r++) {
    const label = norm((rows[r] || [])[H]);
    if (!label) continue;
    for (const [key, prefixes] of BOX) {
      if (box[key] === undefined && prefixes.some((p) => label.startsWith(p))) box[key] = num((rows[r] || [])[I]);
    }
  }
  return box;
}

/** @param {any[][]} rows valores de B1:I (linha 1 = índice 0) */
export function parseFichas(rows) {
  const cell = (r, c) => (rows[r] || [])[c];
  const headers = [];
  rows.forEach((row, i) => {
    if (norm(cell(i, B)) === 'medidas' && norm(cell(i, C)).startsWith('ingrediente')) headers.push(i);
  });

  return headers.map((h, k) => {
    const R = h - 1; // linha do título (índice)
    const next = k + 1 < headers.length ? headers[k + 1] - 1 : rows.length;

    const ingredients = [];
    const packaging = [];
    let inPack = false;
    for (let r = h + 1; r < next; r++) {
      const b = cell(r, B);
      const c = txt(cell(r, C));
      if (norm(b) === 'embalagem' || norm(b) === 'embalagens') { inPack = true; continue; }
      const list = inPack ? packaging : ingredients;
      // subtítulo dentro da ficha ("Massa Sablée", "Ganache"…): texto em B, nada em C
      if (!c) {
        if (txt(b) && num(b) == null) list.push({ type: 'section', name: txt(b), row: r + 1 });
        continue;
      }
      // observação: texto em C sem medida em B
      if (txt(b) === '') { list.push({ type: 'note', name: c, row: r + 1 }); continue; }
      list.push({ type: 'item', qty: num(b), name: c, price: num(cell(r, D)), pack: num(cell(r, E)), cost: num(cell(r, F)) ?? 0, row: r + 1 });
    }

    // última linha com conteúdo da ficha, e última linha do bloco (inclui a linha em branco que separa)
    let lastContent = next - 1;
    while (lastContent > R && !filled(rows[lastContent])) lastContent--;
    const last = k + 1 === headers.length ? lastContent : next - 1;

    return {
      name: txt(cell(R, B)) || 'Receita sem nome',
      row: R + 1,
      lastRow: lastContent + 1,
      endRow: last + 1,
      ingredients,
      packaging,
      totals: readBox(rows, R, next),
      hasErrors: rows.slice(R, next).some((row) => (row || []).some((v) => typeof v === 'string' && /^#(N\/A|REF!|DIV\/0!|VALUE!|ERROR!|NAME\?)/.test(v))),
    };
  });
}
