// Modo demonstração: dados de exemplo, nenhuma chamada externa e nada é gravado.
import { computeCosts } from './costs.js';
import { buildFichaValues, fichaLayout } from './formulas.js';

export const SAMPLE_RECIPE = `Brownie de chocolate meio amargo

200 g de chocolate meio amargo
150 g de manteiga sem sal
3 ovos
1 xícara de açúcar
1/2 xícara de farinha de trigo
2 colheres de sopa de cacau em pó
1 pitada de sal
100 g de nozes picadas

Modo de preparo: derreta o chocolate com a manteiga, misture os ovos e o açúcar, incorpore os secos e as nozes. Asse a 180 °C por 25 minutos.`;

const CATALOG = {
  title: 'Claude Marbot (exemplo)',
  tabs: ['BRIGADEIROS', 'BOMBONS', 'TARTELETE', 'CHOUX', 'OUTROS', 'BROWNIES', 'BISCOITOS'].map((t, i) => ({ title: t, sheetId: 100 + i, index: i + 1 })),
  ingredients: [
    ['Leite condensado', 395, 'g', 7.49],
    ['Nata', 1000, 'g', 32.9],
    ['Manteiga', 500, 'g', 27.5],
    ['Chocolate meio amargo', 2100, 'g', 139.9],
    ['Chocolate ao leite', 2100, 'g', 129.9],
    ['Cacau em pó 100%', 200, 'g', 21.9],
    ['Glaçucar', 1000, 'g', 12.9],
    ['Açúcar', 1000, 'g', 5.29],
    ['Farinha de trigo', 1000, 'g', 6.49],
    ['Ovos', 30, 'un.', 24.9],
    ['Sal', 1000, 'g', 3.2],
    ['Castanha de caju', 500, 'g', 39.9],
    ['Amêndoas laminadas', 200, 'g', 22.5],
    ['Pistache', 250, 'g', 59.9],
  ].map(([name, pack, unit, price], i) => ({ name, pack, unit, price, row: 5 + i })),
  packaging: [
    { name: 'Forminha nº 4', qty: 100, price: 6.9, row: 6 },
    { name: 'Caixa brownie individual', qty: 50, price: 42, row: 7 },
  ],
  nextIngredientRow: 19,
  params: {
    loss: 0.05, card: 0, margin: 0.5, fixed: 0.6, nextRow: 19,
    perTab: [['BRIGADEIROS', 0.6, 0.5], ['BOMBONS', 1.3, 0.5], ['TARTELETE', 0.6, 0.5], ['CHOUX', 0.9, 0.5], ['OUTROS', 0.9, 0.5], ['BROWNIES', 0, 0.5], ['BISCOITOS', 0.6, 0.5]]
      .map(([tab, fixed, margin], i) => ({ tab, fixed, margin, row: 12 + i })),
  },
};

export function demoCatalog() {
  const c = structuredClone(CATALOG);
  c.allSheets = [{ title: 'INGREDIENTES', sheetId: 1, index: 0 }, { title: 'PARÂMETROS', sheetId: 2, index: 1 }, ...c.tabs];
  return c;
}

export function demoAnalysis() {
  return {
    nome_receita: 'Brownie de chocolate meio amargo',
    aba_sugerida: 'BROWNIES',
    nomes_aba_sugeridos: ['BROWNIES ESPECIAIS', 'BOLOS'],
    peso_total_massa_g: 861,
    tamanho_peca_g: 40,
    perda_coccao_pct: 12,
    rendimento_informado: 0,
    tem_modo_preparo: true,
    ingredientes_texto: ['200 g de chocolate meio amargo', '150 g de manteiga sem sal', '3 ovos', '1 xícara de açúcar', '1/2 xícara de farinha de trigo', '2 colheres de sopa de cacau em pó', '1 pitada de sal', '100 g de nozes picadas'],
    modo_preparo: [
      'Derreta o chocolate com a manteiga em banho-maria e deixe amornar.',
      'Bata os ovos com o açúcar até clarear e junte o chocolate derretido.',
      'Peneire a farinha, o cacau e o sal sobre a massa e misture delicadamente.',
      'Junte as nozes, espalhe numa forma de 20 × 30 cm e asse a 180 °C por 25 minutos.',
    ],
    rendimentos_sugeridos: [
      { unidades: 20, descricao: 'quadrados de ~43 g' },
      { unidades: 24, descricao: 'quadrados de ~35 g' },
      { unidades: 16, descricao: 'quadrados de ~54 g' },
    ],
    ingredientes: [
      { texto_original: '200 g de chocolate meio amargo', quantidade: 200, ingrediente_cadastrado: 'Chocolate meio amargo' },
      { texto_original: '150 g de manteiga sem sal', quantidade: 150, ingrediente_cadastrado: 'Manteiga' },
      { texto_original: '3 ovos', quantidade: 3, ingrediente_cadastrado: 'Ovos' },
      { texto_original: '1 xícara de açúcar', quantidade: 180, ingrediente_cadastrado: 'Açúcar' },
      { texto_original: '1/2 xícara de farinha de trigo', quantidade: 60, ingrediente_cadastrado: 'Farinha de trigo' },
      { texto_original: '2 colheres de sopa de cacau em pó', quantidade: 20, ingrediente_cadastrado: 'Cacau em pó 100%' },
      { texto_original: '1 pitada de sal', quantidade: 1, ingrediente_cadastrado: 'Sal' },
      { texto_original: '100 g de nozes picadas', quantidade: 100, ingrediente_cadastrado: '', similares: ['Castanha de caju', 'Amêndoas laminadas'], nome_sugerido_novo: 'Nozes', unidade_cadastro: 'g' },
    ],
    perguntas: [
      {
        pergunta: 'Quanto pesa a “1 xícara de açúcar” que você usa?',
        indice_ingrediente: 3,
        opcoes: [
          { rotulo: '160 g (xícara rasa)', quantidade: 160 },
          { rotulo: '180 g (padrão)', quantidade: 180 },
          { rotulo: '200 g (cheia)', quantidade: 200 },
        ],
      },
    ],
  };
}

export class DemoClient {
  constructor(settings) {
    this.s = settings;
    this.paramsTab = 'PARÂMETROS';
    this.catalog = demoCatalog();
    this.last = null;
    this.fichas = structuredClone(DEMO_FICHAS); // aba → [{ name, yieldUnits, ingredients, packaging }]
  }
  wait(ms = 450) { return new Promise((r) => setTimeout(r, ms)); }
  async loadCatalog() { await this.wait(300); return { ...this.catalog, ingredients: [...this.catalog.ingredients], params: structuredClone(this.catalog.params) }; }
  async loadParams() { return structuredClone(this.catalog.params); }
  async saveParams(p) { await this.wait(); this.catalog.params = { ...this.catalog.params, ...p, perTab: p.perTab.map((x, i) => ({ ...x, row: 12 + i })) }; }
  async prefetchAll() {}
  async deleteFicha(tab, _sheetId, ficha) { await this.wait(); this.fichas[tab] = (this.fichas[tab] || []).filter((f) => f.name !== ficha.name); }
  async rewriteFicha(tab, _sheetId, ficha, data) {
    await this.wait();
    this.fichas[tab] = (this.fichas[tab] || []).map((f) => (f.name === ficha.name ? { ...data } : f));
    return { syntax: 'ptbr' };
  }
  async updateIngredient(row, _old, x) {
    await this.wait();
    this.catalog.ingredients = this.catalog.ingredients.map((i) => (i.row === row ? { ...x, pack: Number(x.pack), price: Number(x.price), row } : i));
  }
  async removeIngredient(row) {
    await this.wait();
    this.catalog.ingredients = this.catalog.ingredients.filter((i) => i.row !== row).map((i) => (i.row > row ? { ...i, row: i.row - 1 } : i));
    this.catalog.nextIngredientRow--;
  }
  async addIngredients(list) {
    await this.wait();
    list.forEach((x) => this.catalog.ingredients.push({ ...x, row: this.catalog.nextIngredientRow++ }));
  }
  async createTabFromTemplate(name) {
    await this.wait();
    this.catalog.tabs.push({ title: name, sheetId: 999, index: this.catalog.tabs.length + 1 });
    return 999;
  }
  async nextStartRow() { await this.wait(200); return 64; }
  async writeFicha({ tab, startRow, recipe }) {
    await this.wait();
    this.last = { startRow, recipe, tab };
    (this.fichas[tab] = this.fichas[tab] || []).push({ ...recipe });
    return fichaLayout(startRow, recipe.ingredients.length, (recipe.packaging || []).length || 3);
  }
  /** Monta as linhas de uma ficha com os valores já calculados (como a planilha mostraria). */
  render(f, tab, startRow) {
    const { values, layout } = buildFichaValues({ name: f.name, ingredients: f.ingredients, packaging: f.packaging || [], yieldUnits: f.yieldUnits, startRow, syntax: 'ptbr', tab });
    const c = computeCosts(f.ingredients, this.catalog.ingredients, f.yieldUnits, { params: this.catalog.params, tab, packaging: f.packaging || [], packCatalog: this.catalog.packaging });
    const rows = values.map((r) => r.map((v) => (typeof v === 'string' && v.startsWith('=') ? '' : v)));
    c.lines.forEach((l, i) => { const r = rows[layout.firstIng - layout.R + i]; r[2] = l.price ?? ''; r[3] = l.pack ?? ''; r[4] = l.cost; });
    c.packLines.forEach((l, i) => { const r = rows[layout.firstPack - layout.R + i]; r[2] = l.price ?? ''; r[3] = l.pack ?? ''; r[4] = l.cost; });
    const box = { 1: c.ingCost, 2: c.loss, 3: c.fixed, 4: c.packaging, 5: f.yieldUnits, 7: c.total, 8: c.unit, 9: c.margin, 10: c.sale, 11: c.recipe, 12: c.cardFee, 13: c.profit };
    Object.entries(box).forEach(([k, v]) => { rows[Number(k)][7] = v; });
    return rows;
  }
  async loadTabRows(tab) {
    await this.wait(250);
    const rows = [['MARBOT ATELIÊ  ·  ' + tab], [], []];
    for (const f of this.fichas[tab] || []) rows.push(...this.render(f, tab, rows.length + 1), []);
    return rows;
  }
  async formatFicha() { await this.wait(350); }
  async readFicha() {
    await this.wait(300);
    return this.render(this.last.recipe, this.last.tab, this.last.startRow);
  }
}

const DEMO_FICHAS = {
  BOMBONS: [
    { name: 'Pistache com cereja', yieldUnits: 30, ingredients: [
      { qty: 395, name: 'Leite condensado' }, { qty: 100, name: 'Nata' }, { qty: 60, name: 'Pistache' },
      { qty: 15, name: 'Manteiga' }, { qty: 300, name: 'Chocolate ao leite' }] },
    { name: 'Ninho com morango', yieldUnits: 28, ingredients: [
      { qty: 395, name: 'Leite condensado' }, { qty: 80, name: 'Nata' }, { qty: 15, name: 'Manteiga' },
      { qty: 300, name: 'Chocolate ao leite' }] },
    { name: 'Tiramisu', yieldUnits: 26, ingredients: [
      { qty: 395, name: 'Leite condensado' }, { qty: 120, name: 'Nata' }, { qty: 10, name: 'Cacau em pó 100%' },
      { qty: 300, name: 'Chocolate meio amargo' }] },
  ],
  BRIGADEIROS: [
    { name: 'Brigadeiro tradicional', yieldUnits: 25, ingredients: [
      { qty: 395, name: 'Leite condensado' }, { qty: 20, name: 'Cacau em pó 100%' }, { qty: 15, name: 'Manteiga' }, { qty: 50, name: 'Nata' }], packaging: [{ qty: 25, name: 'Forminha nº 4' }] },
  ],
  BROWNIES: [
    { name: 'Brownie clássico', yieldUnits: 16, ingredients: [
      { qty: 200, name: 'Chocolate meio amargo' }, { qty: 150, name: 'Manteiga' }, { qty: 3, name: 'Ovos' },
      { qty: 180, name: 'Açúcar' }, { qty: 60, name: 'Farinha de trigo' }] },
  ],
  BISCOITOS: [
    { name: 'Amanteigado', yieldUnits: 40, ingredients: [
      { qty: 200, name: 'Manteiga' }, { qty: 80, name: 'Glaçucar' }, { qty: 280, name: 'Farinha de trigo' }, { qty: 1, name: 'Ovos' }] },
  ],
};
