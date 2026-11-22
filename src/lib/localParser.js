// Leitor de receitas local: grátis, sem internet e sem IA.
// Entende linhas como "200 g de chocolate", "1 xícara de açúcar", "3 ovos", "1 lata de leite condensado".
// Devolve o mesmo formato da IA, para o resto do app funcionar igual.
import { applySubstitution, findExact, isUnitBased, norm, similar } from './match.js';
import { guessKind } from './yieldCalc.js';

const STOP_SECTION = /^(modo de (preparo|fazer)|preparo|como fazer|instru[cç][oõ]es|montagem|dicas?|observa[cç][oõ]es)\b/i;
const SKIP_HEADER = /^(ingredientes?|massa|recheio|cobertura|calda|ganache|creme|para (a|o) .+)\s*:?\s*$/i;

const WORD_NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meia: 0.5, meio: 0.5 };
const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

// [regex da unidade, tipo]
const UNITS = [
  [/^(kg|quilos?|kilos?)\b/, 'kg'],
  [/^(g|gr|grs|gramas?)\b/, 'g'],
  [/^(ml|mililitros?)\b/, 'ml'],
  [/^(l|litros?)\b/, 'l'],
  [/^(x[ií]c(ara)?s?|xic\.?|x\.)\b/, 'xic'],
  [/^(colher(es)?|c\.)\s*(\(?de\s*)?(sopa|s\.)\)?/, 'cs'],
  [/^(colher(es)?|c\.)\s*(\(?de\s*)?(ch[aá]|c\.)\)?/, 'cc'],
  [/^(colher(es)?|cs)\b/, 'cs'],
  [/^(cc)\b/, 'cc'],
  [/^(latas?)\b/, 'lata'],
  [/^(caixas?|caixinhas?)\b/, 'caixa'],
  [/^(pitadas?)\b/, 'pitada'],
  [/^(unidades?|un\.?)\b/, 'un'],
  [/^(pacotes?)\b/, 'pacote'],
  [/^(tabletes?|barras?)\b/, 'barra'],
];

// gramas por xícara / colher de sopa, conforme o ingrediente
const DENSITY = [
  [/farinha|amido|maisena|fecula/, 120, 8],
  [/acucar de confeiteiro|glacucar|glaçucar/, 120, 8],
  [/acucar|mascavo|demerara/, 180, 12],
  [/cacau|chocolate em po|achocolatado/, 90, 6],
  [/leite em po|ninho/, 100, 7],
  [/coco ralado/, 80, 5],
  [/aveia/, 80, 5],
  [/manteiga|margarina/, 200, 15],
  [/oleo|azeite/, 220, 13],
  [/leite|agua|creme de leite|nata|suco|cafe/, 240, 15],
  [/nozes|castanha|amendoa|amendoim|pistache/, 120, 8],
  [/chocolate/, 150, 10],
];

export function parseRecipeLocally({ recipeText, catalog, tabs, substitutions }) {
  const lines = String(recipeText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let name = '';
  const found = [];
  const questions = [];

  const ingredientLines = [];
  const method = [];
  let inMethod = false;
  let stated = 0;
  let section = ''; // parte da receita (massa, recheio…) dos ingredientes que vêm a seguir
  for (const raw of lines) {
    const line = raw.replace(/^[-•*·–]\s*/, '').replace(/^\d+[.)]\s+(?=\D)/, '');
    const y = lite(raw).match(/\b(rende|rendimento:?)\s*(?:aproximadamente|cerca de|~)?\s*(\d+)/);
    if (y) { stated = Number(y[2]); continue; }
    if (STOP_SECTION.test(norm(line)) || STOP_SECTION.test(line)) {
      inMethod = true;
      if (section && method[method.length - 1] !== `${section}:`) method.push(`${section}:`);
      const rest = line.replace(/^[^:]*:\s*/, '');
      if (rest !== line && rest.length > 3) method.push(rest);
      continue;
    }
    const part = partTitle(line, !!name || found.length > 0);
    if (inMethod) {
      if (part) { method.push(`${part}:`); continue; }
      // receita com o preparo de cada parte: depois do preparo da massa vêm os ingredientes do recheio
      const head = /:$/.test(method[method.length - 1] || '') ? method[method.length - 1].slice(0, -1) : '';
      const ing = head && parseLine(line);
      if (ing) {
        method.pop();
        inMethod = false;
        section = head;
        ingredientLines.push(`${section}:`, raw);
        found.push({ ...ing, section });
        continue;
      }
      if (!/^(montagem|finaliza[cç][aã]o|dicas?|observa[cç][oõ]es)\s*:?\s*$/i.test(line)) method.push(line);
      continue;
    }
    if (part) { section = part; ingredientLines.push(`${part}:`); continue; }
    if (SKIP_HEADER.test(line)) continue; // "Ingredientes:"
    const ing = parseLine(line);
    if (!ing) {
      if (!name && found.length === 0) name = line.replace(/[:.]$/, '');
      continue;
    }
    ingredientLines.push(raw);
    found.push({ ...ing, section });
  }

  // junta ingredientes repetidos dentro da mesma parte (massa e recheio ficam separados)
  const merged = [];
  for (const ing of found) {
    const match = matchCatalog(ing.name, catalog, substitutions);
    const key = `${ing.section}|${match ? `m:${match.name}` : `n:${norm(ing.name)}`}`;
    const grams = toAmount(ing, match);
    const prev = merged.find((m) => m.key === key && m.unidade_receita === grams.unit); // 150 g de gemas e 3 ovos ficam em linhas separadas
    if (prev) {
      prev.quantidade += grams.qty;
      prev.quantidade_receita += grams.qty;
      prev.texto_original += ` + ${ing.text}`;
      continue;
    }
    merged.push({
      key,
      secao: ing.section,
      texto_original: ing.text,
      quantidade: grams.qty,
      ingrediente_cadastrado: match?.name || '',
      similares: match ? [] : similar(ing.name, catalog, 3).map((x) => x.name),
      nome_sugerido_novo: cap(ing.name),
      unidade_cadastro: grams.unit,
      // a troca g ↔ un. (ex.: 150 g de gema → ovos) é feita em flow.js, igual para IA e leitor local
      quantidade_receita: grams.qty,
      unidade_receita: grams.unit,
      parte: ing.text.replace(/\(.*?\)/g, ' ').replace(/^[\d\s.,/½¼¾⅓⅔]+(g|kg|ml|l|un\.?|unidades?|x[ií]caras?( \(?ch[aá]\)?)?|colher(es)?( de)? (sopa|ch[aá])|latas?|caixinhas?|caixas?|pacotes?|barras?)?\s*(de\s+)?/i, '').replace(/\s+/g, ' ').trim() || ing.name,
      _ambiguous: grams.ambiguous,
    });
  }

  merged.forEach((m, i) => {
    if (m._ambiguous) {
      const q = m.quantidade;
      questions.push({
        pergunta: `Quanto pesa “${m.texto_original}”?`,
        indice_ingrediente: i,
        opcoes: [
          { rotulo: `${Math.round(q * 0.85)} g (medida rasa)`, quantidade: Math.round(q * 0.85) },
          { rotulo: `${Math.round(q)} g (padrão)`, quantidade: Math.round(q) },
          { rotulo: `${Math.round(q * 1.15)} g (medida cheia)`, quantidade: Math.round(q * 1.15) },
        ],
      });
    }
  });

  // a conta do rendimento é refeita em flow.js com o peso de cada ingrediente
  const kind = guessKind(name, suggestTab(name, tabs));

  return {
    nome_receita: name || 'Nova receita',
    aba_sugerida: suggestTab(name, tabs),
    nomes_aba_sugeridos: [],
    tamanho_peca_g: kind.piece,
    perda_coccao_pct: kind.loss,
    rendimento_informado: stated,
    rendimentos_sugeridos: [],
    ingredientes: merged.map(({ key, _ambiguous, ...rest }) => ({ ...rest, quantidade: round(rest.quantidade) })),
    perguntas: questions,
    tem_modo_preparo: method.length > 0,
    modo_preparo: method,
    ingredientes_texto: ingredientLines,
  };
}

function parseLine(text) {
  let s = lite(text).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  // "a gosto" / "q.b."
  const toTaste = /\b(a gosto|q\.?b\.?|quanto baste)\b/.test(s);

  let qty = null;
  let rest = s;
  const orig = text;
  // frações unicode no texto original
  const uni = orig.match(/^(\d+)?\s*([½⅓⅔¼¾⅛])/);
  if (uni) {
    qty = (Number(uni[1]) || 0) + FRACTIONS[uni[2]];
    rest = lite(orig.slice(uni[0].length)).replace(/\(.*?\)/g, ' ');
  } else {
    const m = s.match(/^(\d+)\s+(\d+)\/(\d+)\b|^(\d+)\/(\d+)\b|^(\d+(?:[.,]\d+)?)\s*(?:a|-|ou)\s*(\d+(?:[.,]\d+)?)\b|^(\d+(?:[.,]\d+)?)/);
    if (m) {
      if (m[1]) qty = Number(m[1]) + Number(m[2]) / Number(m[3]);
      else if (m[4]) qty = Number(m[4]) / Number(m[5]);
      else if (m[6]) qty = (toN(m[6]) + toN(m[7])) / 2;
      else qty = toN(m[8]);
      rest = s.slice(m[0].length);
    } else {
      const w = s.match(/^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meia|meio)\b/);
      if (w) { qty = WORD_NUM[w[1]]; rest = s.slice(w[0].length); }
    }
  }
  rest = rest.trim();
  // "1 e 1/2 xícara"
  const half = rest.match(/^e\s+(meia|meio|1\/2)\b/);
  if (half && qty != null) { qty += 0.5; rest = rest.slice(half[0].length).trim(); }

  let unit = null;
  for (const [re, u] of UNITS) {
    const m = rest.match(re);
    if (m) { unit = u; rest = rest.slice(m[0].length).trim(); break; }
  }
  if (/^(de |do |da |dos |das )/.test(rest)) rest = rest.replace(/^(de|do|da|dos|das)\s+/, '');
  // "(de sopa)" que sobrou
  rest = rest.replace(/^(de )?(sopa|cha)\s+(de\s+)?/, '');
  const name = rest.replace(/[,;.].*$/, '').replace(/\s+(a gosto|q\.?b\.?|quanto baste)$/, '').replace(/\s+(picad[oa]s?|derretid[oa]s?|em temperatura ambiente|peneirad[oa]s?|gelad[oa]s?|ralad[oa]s?|em cubos)$/g, '').trim();

  if (!name || name.length < 2) return null;
  if (qty == null && !unit && !toTaste) return null;
  return { text: orig, qty: qty ?? (toTaste ? 1 : 1), unit: unit || (toTaste ? 'pitada' : 'un'), name };
}

function toAmount(ing, match) {
  const n = norm(ing.name);
  const unitItem = isUnitBased(match);
  const dens = DENSITY.find(([re]) => re.test(n)) || [null, 200, 12];
  switch (ing.unit) {
    case 'kg': return { qty: ing.qty * 1000, unit: 'g' };
    case 'g': return { qty: ing.qty, unit: 'g' };
    case 'ml': return { qty: ing.qty, unit: 'g' };
    case 'l': return { qty: ing.qty * 1000, unit: 'g' };
    case 'xic': return { qty: ing.qty * dens[1], unit: 'g', ambiguous: true };
    case 'cs': return { qty: ing.qty * dens[2], unit: 'g' };
    case 'cc': return { qty: ing.qty * Math.max(2, Math.round(dens[2] / 3)), unit: 'g' };
    case 'lata': return { qty: ing.qty * (/creme de leite|nata/.test(n) ? 300 : 395), unit: 'g' };
    case 'caixa': return { qty: ing.qty * (/creme de leite|nata/.test(n) ? 200 : /leite condensado/.test(n) ? 395 : 200), unit: 'g' };
    case 'pitada': return { qty: ing.qty * 1, unit: 'g' };
    case 'pacote': return { qty: ing.qty * (match?.pack || 200), unit: unitItem ? 'un.' : 'g', ambiguous: !match };
    case 'barra': return { qty: ing.qty * (/chocolate/.test(n) ? 90 : 100), unit: 'g', ambiguous: true };
    default: // unidades (ovos, gemas…)
      if (unitItem || /^(ovo|ovos|gema|gemas|clara|claras)\b/.test(n)) return { qty: ing.qty, unit: 'un.' };
      return { qty: ing.qty, unit: 'un.', ambiguous: false };
  }
}

// começo do título de uma parte: "Massa choux", "Recheio 1", "Ingredientes do recheio", "Para a cobertura"
const PART = /^(ingredientes?\s+(d[aoe]s?|para)\s+(a\s+|o\s+)?)?(massas?|recheios?|cobertura|calda|ganache|glac[eê]|farofa|crocante|para (a|o)\s)/i;

/** Nome da parte se a linha for o título de uma (sem quantidade); senão ''. */
function partTitle(line, afterName) {
  const s = line.trim();
  if (s.length > 60 || STOP_SECTION.test(s) || parseLine(s.replace(/:$/, ''))) return '';
  if (!PART.test(s) && !(afterName && /:$/.test(s))) return '';
  const t = s
    .replace(/:\s*$/, '')
    .replace(/^ingredientes?\s+(d[aoe]s?|para)\s+(a\s+|o\s+)?/i, '')
    .replace(/^para (a|o)\s+/i, '')
    .trim();
  if (!t || /^ingredientes?$/i.test(t)) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function matchCatalog(name, catalog, substitutions) {
  const sub = applySubstitution(name, substitutions);
  if (sub) { const m = findExact(sub, catalog); if (m) return m; }
  const exact = findExact(name, catalog);
  if (exact) return exact;
  // aceita o parecido só se todas as palavras do cadastrado aparecerem no texto
  const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && /^[a-z]+$/.test(w) && !['com', 'sem', 'para'].includes(w));
  const target = new Set(words(name).map(stem));
  const best = similar(name, catalog, 3).find((c) => words(c.name).every((w) => target.has(stem(w))));
  if (best) return best;
  // gema e clara saem do ovo: usa o cadastro de ovos (a troca g → un. vem depois, em flow.js)
  if (/^(gemas?|claras?)\b/.test(norm(name))) return catalog.find((c) => /^ovos?\b/.test(norm(c.name))) || null;
  return null;
}

function suggestTab(name, tabs) {
  const n = norm(name);
  const map = [['brigadeiro', /brigadeiro|docinho|beijinho/], ['bombo', /bombom|trufa/], ['tartelet', /tartelete|torta/], ['choux', /choux|bomba|eclair|profiterole/], ['browni', /brownie|blondie/], ['biscoit', /biscoito|cookie|amanteigado/]];
  for (const [tabKey, re] of map) {
    if (re.test(n)) {
      const t = tabs.find((x) => norm(x).includes(tabKey));
      if (t) return t;
    }
  }
  return tabs.find((x) => norm(x) === 'outros') || '';
}

const lite = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stem = (w) => w.replace(/(oes|aes|es|s)$/, '');
const toN = (v) => Number(String(v).replace(',', '.'));
const round = (n) => Math.round(n * 100) / 100;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
