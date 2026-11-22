// Monta a ficha no mesmo modelo das abas da planilha (quadro de custos ligado à aba PARÂMETROS).
// R = linha do título. Colunas B..I viram índices 0..7 da matriz de valores.
//
// Quadro de custos (H:I), linha a linha a partir de R:
//  R    Custos da receita            R+7  Custo total da receita
//  R+1  Custo de Ingredientes        R+8  Custo por unidade
//  R+2  Perda de ingredientes        R+9  Margem (sobre o preço de venda)
//  R+3  Custo fixo                   R+10 Preço final de venda por unidade
//  R+4  Embalagens                   R+11 PREÇO DE VENDA FINAL DA RECEITA
//  R+5  Rendimento                   R+12 Taxa do cartão
//  R+6  Contas Finais                R+13 LUCRO DA RECEITA

const COL = { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, I: 7 };
export const BOX_ROWS = { ingredients: 1, loss: 2, fixed: 3, packaging: 4, yieldUnits: 5, total: 7, unitCost: 8, margin: 9, unitPrice: 10, recipePrice: 11, card: 12, profit: 13 };

/** @param {number} nPack linhas de embalagem (no mínimo 1) */
export function fichaLayout(startRow, nIngredients, nPack = 3) {
  const R = startRow;
  const n = nIngredients;
  const p = Math.max(1, nPack);
  const firstIng = R + 2;
  const lastIng = R + 1 + n;
  const M = R + 2 + n; // linha "Embalagem"
  const firstPack = M + 1;
  const lastPack = M + p;
  const end = Math.max(lastPack, R + 13);
  return { R, n, p, firstIng, lastIng, M, firstPack, lastPack, end };
}

/**
 * @param {object} o
 * @param {string} o.name nome da receita
 * @param {{qty:number,name:string}[]} o.ingredients
 * @param {{qty:number,name:string}[]} [o.packaging] embalagens; vazio = 3 linhas em branco
 * @param {number} o.yieldUnits
 * @param {number} o.startRow
 * @param {'ptbr'|'intl'} o.syntax
 * @param {string} o.tab aba onde a ficha fica (usada para buscar custo fixo e margem em PARÂMETROS)
 * @param {string|number} [o.margin] fórmula ou valor da margem já existente na ficha (margem própria)
 */
export function buildFichaValues({ name, ingredients, packaging = [], yieldUnits, startRow, syntax, tab, margin, ingredientsTab = 'INGREDIENTES', paramsTab = 'PARÂMETROS' }) {
  const S = syntax === 'intl' ? ',' : ';';
  const T = quoteTabForFormula(ingredientsTab);
  const P = quoteTabForFormula(paramsTab);
  const tabLit = `"${String(tab).replace(/"/g, '""')}"`;

  const L = fichaLayout(startRow, ingredients.length, packaging.length || 3);
  const { R, M, end, firstIng, lastIng, firstPack, lastPack } = L;
  const rows = Array.from({ length: end - R + 1 }, () => Array(8).fill(''));
  const set = (row, col, v) => { rows[row - R][COL[col]] = v; };

  set(R, 'B', name);
  set(R + 1, 'B', 'Medidas');
  set(R + 1, 'C', 'Ingredientes');
  set(R + 1, 'D', 'Custo dos ingredientes');
  set(R + 1, 'E', 'Gramas na embalagem fechada');
  set(R + 1, 'F', 'Custo na Receita');

  ingredients.forEach((ing, i) => {
    const r = firstIng + i;
    if (ing.type === 'section') { set(r, 'B', ing.name); return; } // subtítulo da ficha
    if (ing.type === 'note') { set(r, 'C', ing.name); return; } // observação
    set(r, 'B', Number(ing.qty));
    set(r, 'C', ing.name);
    set(r, 'D', `=IFERROR(VLOOKUP(C${r}${S}${T}!B:E${S}4${S}0)${S}"")`);
    set(r, 'E', `=IFERROR(VLOOKUP(C${r}${S}${T}!B:E${S}2${S}0)${S}"")`);
    set(r, 'F', `=IFERROR(D${r}/E${r}*B${r}${S}0)`);
  });

  set(M, 'B', 'Embalagem');
  for (let r = firstPack; r <= lastPack; r++) {
    const pk = packaging[r - firstPack];
    if (pk?.type === 'section') { set(r, 'B', pk.name); continue; }
    if (pk?.type === 'note') { set(r, 'C', pk.name); continue; }
    if (pk) {
      set(r, 'B', Number(pk.qty));
      set(r, 'C', pk.name);
    }
    set(r, 'D', `=IFERROR(VLOOKUP(C${r}${S}${T}!G:I${S}3${S}0)${S}"")`);
    set(r, 'E', `=IFERROR(VLOOKUP(C${r}${S}${T}!G:I${S}2${S}0)${S}"")`);
    set(r, 'F', `=IF(C${r}=""${S}""${S}IFERROR(D${r}/E${r}*B${r}${S}0))`);
  }

  const I = (k) => `I${R + k}`;
  const box = [
    ['Custos da receita', ''],
    ['Custo de Ingredientes', `=SUM(F${firstIng}:F${lastIng})`],
    ['Perda de ingredientes', `=${I(1)}*${P}!$C$5`],
    ['Custo fixo (aluguel, limpeza, energia, água…)', `=IFERROR(VLOOKUP(${tabLit}${S}${P}!$B$12:$C$60${S}2${S}0)${S}${P}!$C$8)*${I(5)}`],
    ['Embalagens', `=SUM(F${firstPack}:F${lastPack})`],
    ['Rendimento / quantas unidades', Number(yieldUnits)],
    ['Contas Finais', ''],
    ['Custo total da receita', `=SUM(${I(1)}:${I(4)})`],
    ['Custo por unidade', `=IF(${I(5)}=0${S}0${S}${I(7)}/${I(5)})`],
    ['Margem (sobre o preço de venda)', margin != null && margin !== '' ? margin : `=IFERROR(VLOOKUP(${tabLit}${S}${P}!$B$12:$D$60${S}3${S}0)${S}${P}!$C$7)`],
    ['Preço final de venda por unidade', `=IF(1-${I(9)}-${P}!$C$6<=0${S}0${S}${I(8)}/(1-${I(9)}-${P}!$C$6))`],
    ['PREÇO DE VENDA FINAL DA RECEITA', `=${I(10)}*${I(5)}`],
    ['Taxa do cartão', `=${I(11)}*${P}!$C$6`],
    ['LUCRO DA RECEITA', `=${I(11)}-${I(7)}-${I(12)}`],
  ];
  box.forEach(([label, val], k) => {
    set(R + k, 'H', label);
    set(R + k, 'I', val);
  });

  return { values: rows, layout: L };
}

/** Pedidos de batchUpdate: mesclas, menus suspensos e formatos. Nada de cor (a aba usa formatação condicional). */
export function buildFichaRequests({ sheetId, layout, ingredientsTab = 'INGREDIENTES' }) {
  const { R, M, firstIng, lastIng, firstPack, lastPack } = layout;
  const T = quoteTabForFormula(ingredientsTab);
  const rowRange = (r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1 - 1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 });
  // índices de coluna 0-based na planilha: B=1 ... I=8
  const B = 1, C = 2, D = 3, E = 4, F = 5, H = 7, I = 8;

  const merge = (r, c1, c2) => ({ mergeCells: { range: rowRange(r, r, c1, c2 + 1), mergeType: 'MERGE_ALL' } });
  const listRule = (formula) => ({ condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: formula }] }, strict: false, showCustomUi: true });
  const fmt = (r1, r2, col, numberFormat) => ({
    repeatCell: { range: rowRange(r1, r2, col, col + 1), cell: { userEnteredFormat: { numberFormat } }, fields: 'userEnteredFormat.numberFormat' },
  });
  const money = { type: 'CURRENCY', pattern: '[$R$ -416]#,##0.00' };
  const int = { type: 'NUMBER', pattern: '0' };
  const pct = { type: 'PERCENT', pattern: '0%' };

  const reqs = [
    merge(R, B, F),
    merge(M, B, F),
    merge(R, H, I),
    merge(R + 6, H, I),
    { setDataValidation: { range: rowRange(firstIng, lastIng, C, C + 1), rule: listRule(`=${T}!$B$6:$B`) } },
    { setDataValidation: { range: rowRange(firstPack, lastPack, C, C + 1), rule: listRule(`=${T}!$G$6:$G`) } },
  ];
  for (const [a, b] of [[firstIng, lastIng], [firstPack, lastPack]]) {
    reqs.push(fmt(a, b, D, money), fmt(a, b, E, int), fmt(a, b, F, money));
  }
  reqs.push(fmt(R + 1, R + 4, I, money), fmt(R + 5, R + 5, I, int), fmt(R + 7, R + 8, I, money), fmt(R + 9, R + 9, I, pct), fmt(R + 10, R + 13, I, money));
  return reqs;
}

export function quoteTab(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function quoteTabForFormula(title) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(title) ? title : quoteTab(title);
}
