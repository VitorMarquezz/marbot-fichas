// Pedidos em texto livre ("chat") para a IA: rendimento, ingredientes da ficha e cadastro de ingredientes.
// A IA só propõe; quem aplica (e o usuário confere) é o app.
import { askAi } from './ai.js';
import { groupBySection } from './flow.js';
import { explain, parseYieldMessage, unitsFor } from './yieldCalc.js';

const YIELD_SCHEMA = {
  type: 'object',
  properties: {
    tamanho_peca_g: { type: 'number', description: 'Peso de uma unidade pronta, em gramas.' },
    perda_coccao_pct: { type: 'number', description: 'Perda de peso no cozimento, em %.' },
    unidades: { type: 'number', description: 'Rendimento final em unidades (inteiro).' },
    explicacao: { type: 'string', description: 'Uma ou duas frases curtas explicando a conta, em português.' },
  },
  required: ['unidades', 'explicacao'],
};

/**
 * @param {object} p
 * @param {{ name:string, mass:number, loss:number, piece:number, lines:string[] }} p.info situação atual da conta
 * @param {string} p.message o que a pessoa escreveu
 * @returns {Promise<{ units:number, piece:number, loss:number, text:string }>}
 */
export async function yieldChat({ settings, info, message, history = [] }) {
  const local = parseYieldMessage(message);
  try {
    const system = `Você calcula o rendimento de receitas de confeitaria do Marbot Ateliê, com precisão.
Conta: unidades = peso cru × (1 − perda/100) ÷ peso da peça pronta, arredondado para baixo.
Leve em conta o que a pessoa disser (tamanho da peça, perda, forma, quantas quer, se vai cobertura à parte etc.).
Se ela disser direto quantas unidades rende, use esse número.`;
    const user = `Receita: ${info.name}
Ingredientes (peso cru): ${info.lines.join('; ')}
Peso cru total: ${Math.round(info.mass)} g
Estimativa atual: perda ${info.loss}% · peça de ${info.piece} g · ${unitsFor(info.mass, info.loss, info.piece)} unidades
${history.map((h) => `${h.role === 'user' ? 'Pessoa' : 'Você'}: ${h.text}`).join('\n')}
Pessoa: ${message}`;
    const r = await askAi(settings, system, user, YIELD_SCHEMA);
    const piece = Number(r.tamanho_peca_g) || info.piece;
    const loss = r.perda_coccao_pct != null ? Number(r.perda_coccao_pct) : info.loss;
    const units = Math.round(Number(r.unidades)) || unitsFor(info.mass, loss, piece);
    return { units, piece, loss, text: r.explicacao || explain(info.mass, loss, piece) };
  } catch (e) {
    if (!local) throw e;
    // sem IA: aplica o que deu para entender do texto
    const piece = local.piece ?? info.piece;
    const loss = local.loss ?? info.loss;
    const units = local.units ?? unitsFor(info.mass, loss, piece);
    return { units, piece, loss, text: local.units ? `Rendimento de ${units} unidades, como você informou.` : `${explain(info.mass, loss, piece)}.` };
  }
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    ingredientes: {
      type: 'array',
      description: 'A lista COMPLETA de ingredientes depois da mudança pedida.',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome EXATO de um ingrediente cadastrado, quando existir.' },
          quantidade: { type: 'number', description: 'Em gramas, ou unidades quando o cadastrado for "un.".' },
          parte: { type: 'string', description: 'Parte da receita (ex.: "Massa", "Recheio 1"), igual à da ficha atual; "" se não houver partes.' },
        },
        required: ['nome', 'quantidade'],
      },
    },
    resumo: { type: 'string', description: 'Uma frase curta dizendo o que mudou.' },
  },
  required: ['ingredientes', 'resumo'],
};

/** Edita a lista de ingredientes da ficha conforme o pedido. */
export async function draftChat({ settings, draft, catalog, message }) {
  const system = `Você ajusta a lista de ingredientes de uma ficha de custo do Marbot Ateliê.
Faça só o que for pedido (trocar, tirar, pôr, mudar quantidade, dobrar a receita…) e devolva a lista completa.
Use nomes EXATOS da lista de cadastrados sempre que houver correspondência. Quantidades em gramas, ou unidades para itens "un.".
Mantenha cada ingrediente na sua parte (massa, recheio…); se o pedido criar uma parte nova, dê um nome a ela.`;
  const user = `CADASTRADOS: ${catalog.map((i) => `${i.name} (${i.unit || 'g'})`).join('; ')}

FICHA ATUAL (${draft.name}):
${draft.ingredients.map((x) => `- ${x.section ? `[${x.section}] ` : ''}${x.qty} | ${x.name}`).join('\n')}

PEDIDO: ${message}`;
  const r = await askAi(settings, system, user, DRAFT_SCHEMA);
  const ingredients = (r.ingredientes || [])
    .filter((x) => x.nome)
    .map((x) => {
      const section = String(x.parte || '').trim();
      const same = (p) => p.name.toLowerCase() === String(x.nome).toLowerCase();
      const prev = draft.ingredients.find((p) => same(p) && (p.section || '') === section) || draft.ingredients.find(same);
      const qty = Math.round(Number(x.quantidade) * 100) / 100 || 0;
      return { qty, name: String(x.nome).trim(), newIng: prev?.newIng || null, original: prev?.original, note: prev && prev.qty === qty ? prev.note : '', section };
    });
  return { ingredients: groupBySection(ingredients), text: r.resumo || 'Lista atualizada.' };
}

const CATALOG_SCHEMA = {
  type: 'object',
  properties: {
    mudancas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['adicionar', 'editar', 'remover'] },
          nome: { type: 'string', description: 'Para editar/remover: nome EXATO do cadastrado. Para adicionar: nome novo.' },
          novo_nome: { type: 'string', description: 'Só ao renomear.' },
          pacote: { type: 'number', description: 'Peso ou quantidade do pacote.' },
          unidade: { type: 'string', enum: ['g', 'ml', 'un.'] },
          preco: { type: 'number', description: 'Preço do pacote em reais.' },
        },
        required: ['acao', 'nome'],
      },
    },
    resumo: { type: 'string', description: 'Uma frase curta descrevendo as mudanças, ou a dúvida se o pedido não estiver claro.' },
  },
  required: ['mudancas', 'resumo'],
};

/**
 * Transforma o pedido em mudanças no cadastro de ingredientes (ainda não aplicadas).
 * @returns {Promise<{ changes: {action:'add'|'edit'|'remove', row?:number, from?:object, to?:object}[], text:string }>}
 */
export async function catalogChat({ settings, catalog, message }) {
  const system = `Você cuida do cadastro de ingredientes do Marbot Ateliê (aba INGREDIENTES da planilha de custos).
Cada ingrediente tem: nome, peso/quantidade do pacote, medida (g, ml ou un.) e preço do pacote em reais.
Transforme o pedido em mudanças. Para editar ou remover, use o nome EXATO da lista. Em edições, mande só os campos que mudam.`;
  const user = `CADASTRO ATUAL (nome | pacote | medida | preço):
${catalog.map((i) => `${i.name} | ${i.pack} | ${i.unit || 'g'} | ${i.price}`).join('\n')}

PEDIDO: ${message}`;
  const r = await askAi(settings, system, user, CATALOG_SCHEMA);
  const find = (n) => catalog.find((i) => i.name.toLowerCase() === String(n || '').trim().toLowerCase());
  const changes = [];
  for (const m of r.mudancas || []) {
    const cur = find(m.nome);
    if (m.acao === 'remover' && cur) changes.push({ action: 'remove', row: cur.row, from: cur });
    else if (m.acao === 'editar' && cur) {
      changes.push({
        action: 'edit',
        row: cur.row,
        from: cur,
        to: { name: m.novo_nome?.trim() || cur.name, pack: m.pacote ?? cur.pack, unit: m.unidade || cur.unit || 'g', price: m.preco ?? cur.price },
      });
    } else if (m.acao === 'adicionar' && !cur && m.nome && m.pacote > 0 && m.preco > 0) {
      changes.push({ action: 'add', to: { name: m.nome.trim(), pack: m.pacote, unit: m.unidade || 'g', price: m.preco } });
    }
  }
  return { changes, text: r.resumo || '' };
}
