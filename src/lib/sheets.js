import { http } from './http.js';
import { getGoogleToken, invalidateGoogleToken } from './google.js';
import { BOX_ROWS, buildFichaRequests, buildFichaValues, fichaLayout, quoteTab } from './formulas.js';
import { parseFichas, readBox } from './browse.js';
import { assertOnline, cacheGet, cacheSet, isNetworkError, setOffline } from './net.js';

// Linhas fixas da aba PARÂMETROS
const P_GENERAL = 'C5:C8'; // perda, taxa do cartão, margem padrão, custo fixo padrão
const P_TABLE_FIRST = 12; // tabela "Valores por aba": B=aba, C=custo fixo, D=margem
const P_TABLE_LAST = 60;

/** Cliente fino da API do Google Sheets (v4). Leituras ficam guardadas para uso offline. */
export class SheetsClient {
  constructor(settings) {
    this.s = settings;
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId.trim())}`;
  }

  get paramsTab() { return this.s.paramsTab || 'PARÂMETROS'; }

  async api(path, { method = 'GET', body } = {}, retried = false) {
    const read = method === 'GET';
    if (!read) assertOnline();
    const key = `${this.s.spreadsheetId}:${path}`;
    let res;
    try {
      const token = await getGoogleToken(this.s.googleClientId, this.s.googleClientSecret);
      res = await http(this.base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // sem internet: leituras usam a cópia salva neste computador
      if (read && isNetworkError(e)) {
        setOffline(true);
        const cached = cacheGet(key);
        if (cached) return cached;
        throw new Error('Sem internet e ainda não há cópia salva desta parte da planilha neste computador.');
      }
      throw e;
    }
    setOffline(false);
    if (res.status === 401 && !retried) {
      await invalidateGoogleToken();
      return this.api(path, { method, body }, true);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `Erro ${res.status} ao falar com o Google Sheets.`;
      if (res.status === 404) throw new Error('Planilha não encontrada. Confira o ID da planilha nas configurações.');
      if (res.status === 403) throw new Error(`Sem permissão nesta planilha: ${msg}`);
      throw new Error(msg);
    }
    const data = await res.json();
    if (read) cacheSet(key, data);
    return data;
  }

  async meta() {
    return this.api('?fields=properties.title,sheets.properties(sheetId,title,index,hidden)');
  }

  async getValues(ranges, render = 'UNFORMATTED_VALUE') {
    const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const data = await this.api(`/values:batchGet?${q}&valueRenderOption=${render}`);
    return data.valueRanges.map((v) => v.values || []);
  }

  async setValues(data) {
    return this.api('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'USER_ENTERED', data } });
  }

  async batch(requests) {
    return this.api(':batchUpdate', { method: 'POST', body: { requests } });
  }

  // ---------- operações de alto nível ----------

  async loadCatalog() {
    const { s } = this;
    const meta = await this.meta();
    const sheets = meta.sheets.map((x) => x.properties);
    const ingTab = sheets.find((x) => x.title === s.ingredientsTab);
    if (!ingTab) throw new Error(`A aba "${s.ingredientsTab}" não existe nesta planilha.`);
    const hasParams = sheets.some((x) => x.title === this.paramsTab);
    const [ing, pack] = await this.getValues([`${quoteTab(s.ingredientsTab)}!B5:E`, `${quoteTab(s.ingredientsTab)}!G5:I`]);
    const header = (n) => /^(ingrediente|produto)s?$/.test(norm(n));
    const ingredients = ing
      .map((r, i) => ({ name: str(r[0]), pack: num(r[1]), unit: str(r[2]), price: num(r[3]), row: 5 + i }))
      .filter((x) => x.name && !header(x.name));
    const packaging = pack
      .map((r, i) => ({ name: str(r[0]), qty: num(r[1]), price: num(r[2]), row: 5 + i }))
      .filter((x) => x.name && !header(x.name));
    const tabs = sheets
      .filter((x) => x.title !== s.ingredientsTab && x.title !== this.paramsTab && !x.hidden)
      .sort((a, b) => a.index - b.index)
      .map((x) => ({ title: x.title, sheetId: x.sheetId, index: x.index }));
    return {
      title: meta.properties.title,
      tabs,
      allSheets: sheets,
      ingredients,
      packaging,
      nextIngredientRow: 5 + ing.length,
      params: hasParams ? await this.loadParams() : null,
    };
  }

  /** Lê a aba PARÂMETROS: valores gerais e a tabela por aba. */
  async loadParams() {
    const t = quoteTab(this.paramsTab);
    const [gen, table] = await this.getValues([`${t}!${P_GENERAL}`, `${t}!B${P_TABLE_FIRST}:D${P_TABLE_LAST}`]);
    const g = (i) => num(gen[i]?.[0]);
    const perTab = table
      .map((r, i) => ({ tab: str(r[0]), fixed: r[1] === '' || r[1] == null ? null : num(r[1]), margin: r[2] === '' || r[2] == null ? null : num(r[2]), row: P_TABLE_FIRST + i }))
      .filter((x) => x.tab);
    return { loss: g(0), card: g(1), margin: g(2), fixed: g(3), perTab, nextRow: P_TABLE_FIRST + table.length };
  }

  /** Grava os parâmetros. p = { loss, card, margin, fixed, perTab:[{tab,fixed,margin,row?}] } (percentuais em fração: 0,05 = 5%). */
  async saveParams(p) {
    const t = quoteTab(this.paramsTab);
    const data = [{ range: `${t}!${P_GENERAL}`, values: [[p.loss], [p.card], [p.margin], [p.fixed]] }];
    const rows = p.perTab.map((x) => [x.tab, x.fixed ?? '', x.margin ?? '']);
    // reescreve a tabela inteira (linhas removidas ficam em branco)
    while (rows.length < P_TABLE_LAST - P_TABLE_FIRST + 1) rows.push(['', '', '']);
    data.push({ range: `${t}!B${P_TABLE_FIRST}:D${P_TABLE_LAST}`, values: rows });
    await this.setValues(data);
  }

  async addIngredients(list, nextRow) {
    if (!list.length) return;
    const tab = quoteTab(this.s.ingredientsTab);
    await this.setValues(
      list.map((x, i) => ({ range: `${tab}!B${nextRow + i}:E${nextRow + i}`, values: [[x.name, Number(x.pack), x.unit, Number(x.price)]] }))
    );
  }

  async createTabFromTemplate(newName, catalog) {
    const tpl = catalog.allSheets.find((x) => x.title === this.s.templateTab);
    if (!tpl) throw new Error(`A aba modelo "${this.s.templateTab}" não foi encontrada.`);
    if (catalog.allSheets.some((x) => x.title.toLowerCase() === newName.toLowerCase())) {
      throw new Error(`Já existe uma aba chamada "${newName}".`);
    }
    const res = await this.batch([
      { duplicateSheet: { sourceSheetId: tpl.sheetId, insertSheetIndex: catalog.allSheets.length, newSheetName: newName } },
    ]);
    const sheetId = res.replies[0].duplicateSheet.properties.sheetId;
    // apaga tudo da linha 4 para baixo: mesclas, valores e menus suspensos (mantém formatos e formatação condicional)
    await this.batch([
      { unmergeCells: { range: { sheetId, startRowIndex: 3 } } },
      { repeatCell: { range: { sheetId, startRowIndex: 3 }, cell: {}, fields: 'userEnteredValue,dataValidation' } },
    ]);
    await this.setValues([{ range: `${quoteTab(newName)}!B1`, values: [[`MARBOT ATELIÊ  ·  ${newName}`]] }]);
    // a aba nova ganha sua linha em PARÂMETROS, com os valores padrão
    const params = catalog.params;
    if (params && !params.perTab.some((x) => x.tab.toLowerCase() === newName.toLowerCase()) && params.nextRow <= P_TABLE_LAST) {
      await this.setValues([{ range: `${quoteTab(this.paramsTab)}!B${params.nextRow}:D${params.nextRow}`, values: [[newName, params.fixed, params.margin]] }]);
    }
    return sheetId;
  }

  async nextStartRow(tab) {
    const [rows] = await this.getValues([`${quoteTab(tab)}!B1:I`], 'FORMULA');
    let last = rows.length;
    while (last > 0 && (rows[last - 1] || []).every((c) => c === '' || c == null)) last--;
    return last + 2;
  }

  async writeFicha({ tab, startRow, recipe, syntax, margin }) {
    const { values, layout } = buildFichaValues({
      name: recipe.name,
      ingredients: recipe.ingredients,
      packaging: recipe.packaging || [],
      yieldUnits: recipe.yieldUnits,
      startRow,
      syntax,
      tab,
      margin,
      ingredientsTab: this.s.ingredientsTab,
      paramsTab: this.paramsTab,
    });
    await this.setValues([{ range: `${quoteTab(tab)}!B${layout.R}:I${layout.end}`, values }]);
    return layout;
  }

  async formatFicha({ sheetId, layout }) {
    await this.batch(buildFichaRequests({ sheetId, layout, ingredientsTab: this.s.ingredientsTab }));
  }

  async loadTabRows(tab) {
    const [rows] = await this.getValues([`${quoteTab(tab)}!B1:I`]);
    return rows;
  }

  async readFicha(tab, layout) {
    const [rows] = await this.getValues([`${quoteTab(tab)}!B${layout.R}:I${layout.end}`]);
    return rows;
  }

  /** Guarda neste computador todas as abas, para ver tudo offline. */
  async prefetchAll(catalog) {
    for (const t of catalog.tabs) await this.loadTabRows(t.title);
  }

  /** Confere que a ficha ainda está onde o app acha que está (a planilha pode ter mudado). */
  async freshFicha(tab, ficha) {
    const fresh = parseFichas(await this.loadTabRows(tab)).find((f) => f.row === ficha.row && f.name === ficha.name);
    if (!fresh) throw new Error('A planilha mudou desde a última leitura. Clique em Atualizar e tente de novo.');
    return fresh;
  }

  /** Apaga as linhas da ficha. Relê a aba antes, para não apagar nada se a planilha mudou. */
  async deleteFicha(tab, sheetId, ficha) {
    assertOnline();
    const fresh = await this.freshFicha(tab, ficha);
    await this.batch([
      { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: fresh.row - 1, endIndex: fresh.endRow } } },
    ]);
  }

  /**
   * Reescreve uma ficha existente com ingredientes/embalagens editados, no mesmo lugar.
   * Acrescenta ou tira linhas conforme o tamanho novo e mantém uma margem própria, se houver.
   * @param {object} data { name, yieldUnits, ingredients:[{qty,name}], packaging:[{qty,name}] }
   */
  async rewriteFicha(tab, sheetId, ficha, data, syntax) {
    assertOnline();
    const fresh = await this.freshFicha(tab, ficha);
    const R = fresh.row;
    const [[marginCell] = []] = await this.getValues([`${quoteTab(tab)}!I${R + BOX_ROWS.margin}`], 'FORMULA');
    const margin = marginCell?.[0];
    const keepMargin = margin !== undefined && margin !== '' && !String(margin).includes(this.paramsTab) ? margin : null;

    const L = fichaLayout(R, data.ingredients.length, data.packaging.length || 1);
    const oldLast = fresh.lastRow;
    const diff = L.end - oldLast;
    const reqs = [{ unmergeCells: { range: { sheetId, startRowIndex: R - 1, endRowIndex: oldLast, startColumnIndex: 1, endColumnIndex: 9 } } }];
    if (diff > 0) {
      reqs.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: oldLast, endIndex: oldLast + diff }, inheritFromBefore: true } });
    } else if (diff < 0) {
      reqs.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: L.end, endIndex: oldLast } } });
    }
    reqs.push({ repeatCell: { range: { sheetId, startRowIndex: R - 1, endRowIndex: L.end, startColumnIndex: 1, endColumnIndex: 9 }, cell: {}, fields: 'userEnteredValue,dataValidation' } });
    await this.batch(reqs);

    const recipe = { ...data, packaging: data.packaging.length ? data.packaging : [] };
    let usedSyntax = syntax;
    let layout = await this.writeFicha({ tab, startRow: R, recipe, syntax, margin: keepMargin });
    let rows = await this.readFicha(tab, layout);
    if (hasParseError(rows)) {
      usedSyntax = syntax === 'ptbr' ? 'intl' : 'ptbr';
      layout = await this.writeFicha({ tab, startRow: R, recipe, syntax: usedSyntax, margin: keepMargin });
    }
    await this.formatFicha({ sheetId, layout });
    return { layout, syntax: usedSyntax };
  }

  // ---------- aba de ingredientes ----------

  async ingredientsSheetId() {
    const meta = await this.meta();
    const tab = meta.sheets.map((x) => x.properties).find((x) => x.title === this.s.ingredientsTab);
    if (!tab) throw new Error(`A aba "${this.s.ingredientsTab}" não existe nesta planilha.`);
    return tab.sheetId;
  }

  /** Confere se a linha ainda tem o ingrediente esperado (a lista pode ter mudado na planilha). */
  async checkIngredientRow(row, name) {
    const [vals] = await this.getValues([`${quoteTab(this.s.ingredientsTab)}!B${row}:B${row}`]);
    if (str(vals?.[0]?.[0]).toLowerCase() !== String(name).trim().toLowerCase()) {
      throw new Error('A lista de ingredientes mudou na planilha. Clique em Atualizar e tente de novo.');
    }
  }

  async updateIngredient(row, oldName, x) {
    assertOnline();
    await this.checkIngredientRow(row, oldName);
    await this.setValues([{ range: `${quoteTab(this.s.ingredientsTab)}!B${row}:E${row}`, values: [[x.name, Number(x.pack), x.unit, Number(x.price)]] }]);
  }

  /** Remove só as células B:E da linha (as embalagens, em G:I, ficam onde estão). */
  async removeIngredient(row, name) {
    assertOnline();
    await this.checkIngredientRow(row, name);
    const sheetId = await this.ingredientsSheetId();
    await this.batch([
      { deleteRange: { range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 1, endColumnIndex: 5 }, shiftDimension: 'ROWS' } },
    ]);
  }
}

// ---------- orquestração: o mesmo roteiro que seguimos no chat ----------

const PARSE_ERRORS = ['#ERROR!', '#NAME?', '#ERRO!', '#NOME?'];

/**
 * @param {SheetsClient} client
 * @param {object} plan { tab:{title,isNew}, recipe:{name, ingredients:[{qty,name}], packaging?, yieldUnits}, newIngredients:[...] }
 * @param {object} catalog
 * @param {(step:string, state:'run'|'done'|'skip')=>void} onStep
 */
export async function publishRecipe(client, plan, catalog, onStep, syntax) {
  assertOnline();
  const notes = [];

  onStep('ingredients', plan.newIngredients.length ? 'run' : 'skip');
  if (plan.newIngredients.length) {
    await client.addIngredients(plan.newIngredients, catalog.nextIngredientRow);
    onStep('ingredients', 'done');
    notes.push(`Ingrediente novo cadastrado na aba ${client.s.ingredientsTab}: ${plan.newIngredients.map((x) => x.name).join(', ')}.`);
  }

  let sheetId;
  let startRow;
  onStep('tab', plan.tab.isNew ? 'run' : 'skip');
  if (plan.tab.isNew) {
    sheetId = await client.createTabFromTemplate(plan.tab.title, catalog);
    startRow = 4;
    onStep('tab', 'done');
  } else {
    sheetId = catalog.tabs.find((t) => t.title === plan.tab.title)?.sheetId;
    if (sheetId == null) throw new Error(`A aba "${plan.tab.title}" não foi encontrada.`);
    startRow = await client.nextStartRow(plan.tab.title);
  }

  onStep('write', 'run');
  let layout = await client.writeFicha({ tab: plan.tab.title, startRow, recipe: plan.recipe, syntax });
  onStep('write', 'done');

  onStep('format', 'run');
  await client.formatFicha({ sheetId, layout });
  onStep('format', 'done');

  onStep('verify', 'run');
  let rows = await client.readFicha(plan.tab.title, layout);
  let usedSyntax = syntax;
  if (hasParseError(rows)) {
    // a planilha não entendeu o separador: regrava com a outra sintaxe
    usedSyntax = syntax === 'ptbr' ? 'intl' : 'ptbr';
    layout = await client.writeFicha({ tab: plan.tab.title, startRow, recipe: plan.recipe, syntax: usedSyntax });
    rows = await client.readFicha(plan.tab.title, layout);
  }
  const check = inspectFicha(rows, layout);
  onStep('verify', 'done');

  return { tab: plan.tab.title, sheetId, startRow, layout, ...check, notes, syntax: usedSyntax };
}

function hasParseError(rows) {
  return rows.some((r) => (r || []).some((c) => typeof c === 'string' && PARSE_ERRORS.includes(c.trim())));
}

/** Lê a ficha de volta e procura erros e ingredientes sem preço. */
export function inspectFicha(rows, layout) {
  const { R, firstIng, lastIng } = layout;
  const cell = (row, colIdx) => (rows[row - R] || [])[colIdx];
  const errors = [];
  rows.forEach((r, i) =>
    (r || []).forEach((c, j) => {
      if (typeof c === 'string' && /^#(N\/A|REF!|DIV\/0!|VALUE!|ERROR!|NAME\?|NUM!|ERRO!|NOME\?|VALOR!)/.test(c.trim())) {
        errors.push(`${'BCDEFGHI'[j]}${R + i}: ${c}`);
      }
    })
  );
  const missingPrice = [];
  for (let r = firstIng; r <= lastIng; r++) {
    const d = cell(r, 2);
    if (d === '' || d == null || typeof d === 'string') missingPrice.push(cell(r, 1));
  }
  const b = readBox(rows, 0, rows.length);
  return {
    errors,
    missingPrice,
    totals: { ingredients: b.ingredients || 0, unitPrice: b.unitPrice || 0, recipePrice: b.recipePrice || 0, profit: b.profit || 0, yieldUnits: b.yieldUnits || 0, total: b.total || 0 },
  };
}

export { fichaLayout };

function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function str(v) {
  return v == null ? '' : String(v).trim();
}
function num(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
