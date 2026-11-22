import { applySubstitution, findExact, isUnitBased, similar } from './match.js';
import { explain, fitUnit, guessKind, rawMass, unitsFor } from './yieldCalc.js';

export const NEW = '__new__';
export const PICK = '__pick__'; // escolher qualquer ingrediente cadastrado
export const SKIP = '__skip__'; // não usar este ingrediente na ficha

/** Confere e completa o que a IA devolveu contra a lista real de ingredientes. */
export function prepareAnalysis(raw, catalog, settings, tabs) {
  const items = (raw.ingredientes || []).map((ing) => {
    const original = String(ing.texto_original || ing.nome_sugerido_novo || '').trim();
    let match = null;
    const sub = applySubstitution(original, settings.substitutions);
    if (sub) match = findExact(sub, catalog);
    if (!match && ing.ingrediente_cadastrado) match = findExact(ing.ingrediente_cadastrado, catalog);

    const aiSimilar = (ing.similares || []).map((n) => findExact(n, catalog)).filter(Boolean);
    const local = similar(ing.nome_sugerido_novo || original, catalog, 3);
    const similars = uniq([...aiSimilar, ...local].map((x) => x.name)).slice(0, 3);

    // medida como a receita pede; serve para trocar g ↔ un. quando o cadastrado usa outra medida
    const src = Number(ing.quantidade_receita) > 0 && ing.unidade_receita
      ? { qty: Number(ing.quantidade_receita), unit: ing.unidade_receita === 'un.' ? 'un.' : 'g', part: ing.parte || ing.nome_sugerido_novo || original }
      : null;
    let qty = round(Number(ing.quantidade) || 0);
    let note = String(ing.observacao_conversao || '').trim();
    if (match && !note) {
      const fit = fitUnit(src, isUnitBased(match), match.name);
      if (fit) ({ qty, note } = fit);
    }

    return {
      original,
      section: String(ing.secao || '').trim(),
      qty,
      note,
      src,
      match: match?.name || null,
      unitBased: isUnitBased(match),
      similars,
      newName: titleCase(ing.nome_sugerido_novo || original.replace(/^[\d\s.,/]+(g|kg|ml|l|xícaras?|colher(es)?( de)? (sopa|chá))?\s*(de\s+)?/i, '')),
      newUnit: ing.unidade_cadastro || 'g',
    };
  });

  const tabTitles = tabs.map((t) => t.title);
  const tabSuggestion = tabTitles.find((t) => t === raw.aba_sugerida) || null;
  const name = String(raw.nome_receita || 'Nova receita').trim();

  // Rendimento: o app refaz a conta com o peso real dos ingredientes; da IA vêm o tamanho da peça e a perda.
  const kind = guessKind(name, tabSuggestion || '');
  const mass = rawMass(items.map((it) => ({ qty: it.qty, name: it.match || it.newName, unitBased: it.unitBased || (!it.match && it.newUnit === 'un.') })));
  const piece = Number(raw.tamanho_peca_g) > 0 ? Number(raw.tamanho_peca_g) : kind.piece;
  const loss = Number.isFinite(Number(raw.perda_coccao_pct)) && raw.perda_coccao_pct !== '' && raw.perda_coccao_pct != null ? Math.min(60, Math.max(0, Number(raw.perda_coccao_pct))) : kind.loss;
  const stated = Math.round(Number(raw.rendimento_informado) || 0);
  const sizes = uniq([piece, Math.round(piece * 0.8), Math.round(piece * 1.25)].filter((p) => p > 0));
  const yields = [
    ...(stated > 0 ? [{ u: stated, d: 'informado na receita', stated: true }] : []),
    ...sizes.map((p) => ({ u: unitsFor(mass, loss, p), d: `peças de ${p} g${loss ? ` · ${loss}% de perda no cozimento` : ''}`, piece: p })),
  ].filter((y, i, a) => y.u > 0 && a.findIndex((z) => z.u === y.u) === i);

  const extra = (raw.perguntas || [])
    .filter((q) => q.pergunta && (q.opcoes || []).length)
    .map((q) => ({
      question: q.pergunta,
      ingIndex: Number.isInteger(q.indice_ingrediente) && q.indice_ingrediente >= 0 && q.indice_ingrediente < items.length ? q.indice_ingrediente : -1,
      options: q.opcoes.map((o) => ({ label: o.rotulo, qty: o.quantidade != null ? Number(o.quantidade) : null })),
    }));

  const method = (raw.modo_preparo || []).map((x) => String(x).trim()).filter(Boolean);
  return {
    name,
    tabSuggestion,
    tabNames: uniq((raw.nomes_aba_sugeridos || []).map((n) => String(n).toUpperCase().trim()).filter(Boolean)).slice(0, 3),
    totalMass: mass || null,
    pieceSize: piece,
    loss,
    yields,
    items,
    extra,
    hasMethod: method.length > 0 && raw.tem_modo_preparo !== false,
    method,
    ingredientLines: (raw.ingredientes_texto || []).map((x) => String(x).trim()).filter(Boolean),
  };
}

/** Situação atual da conta do rendimento, para mostrar e mandar ao chat. */
export function yieldInfo(a) {
  return {
    name: a.name,
    mass: a.totalMass || 0,
    loss: a.loss,
    piece: a.pieceSize,
    lines: a.items.map((it) => `${it.qty} ${it.unitBased || (!it.match && it.newUnit === 'un.') ? 'un.' : 'g'} ${it.match || it.newName}`),
  };
}

/** Perguntas com opções clicáveis, na mesma ordem que fazemos no chat. */
export function buildQuestions(a, tabs) {
  const qs = [];
  const tabOpts = tabs.map((t) => ({ label: t.title, value: t.title, recommended: t.title === a.tabSuggestion }));
  tabOpts.sort((x, y) => Number(!!y.recommended) - Number(!!x.recommended));
  qs.push({
    id: 'tab',
    kind: 'tab',
    header: 'Aba',
    title: 'Em qual aba adicionar?',
    options: [...tabOpts, { label: 'Criar nova aba', value: NEW, description: 'Duplica a BISCOITOS com o mesmo visual' }],
  });

  qs.push({
    id: 'yield',
    kind: 'yield',
    header: 'Rendimento',
    title: 'Qual o rendimento (unidades)?',
    hint: a.totalMass ? explain(a.totalMass, a.loss, a.pieceSize) : null,
    options: a.yields.map((y, i) => ({ label: `${y.u} unidades`, value: String(y.u), description: y.d, recommended: i === 0 })),
    other: 'number',
    chat: true,
  });

  a.items.forEach((it, i) => {
    if (it.match) return;
    qs.push({
      id: `ing-${i}`,
      kind: 'ingredient',
      ingIndex: i,
      header: 'Ingrediente',
      title: `“${it.original}”${it.section ? ` (${it.section})` : ''} não está cadastrado. Qual usar?`,
      options: [
        ...it.similars.map((n) => ({ label: n, value: n })),
        { label: 'Escolher outro da lista', value: PICK, description: 'Qualquer ingrediente já cadastrado' },
        { label: 'Cadastrar novo ingrediente', value: NEW, description: 'Entra na aba INGREDIENTES' },
        { label: 'Não usar este ingrediente', value: SKIP, description: 'Fica fora da ficha' },
      ],
    });
  });

  a.extra.forEach((q, k) => {
    qs.push({
      id: `q-${k}`,
      kind: 'extra',
      header: 'Dúvida',
      title: q.question,
      options: q.options.map((o, j) => ({ label: o.label, value: String(j) })),
      other: q.ingIndex >= 0 ? 'number' : 'text',
      otherLabel: q.ingIndex >= 0 ? 'Outra quantidade' : 'Outra resposta',
    });
  });
  return qs;
}

export function isAnswered(q, ans) {
  if (!ans || ans.value == null || ans.value === '') return false;
  if (ans.value === '__other__') return String(ans.other ?? '').trim() !== '' && (q.other !== 'number' || Number(ans.other) > 0);
  if (q.kind === 'tab' && ans.value === NEW) return !!String(ans.newName || '').trim();
  if (q.kind === 'ingredient' && ans.value === PICK) return !!String(ans.pick || '').trim();
  if (q.kind === 'ingredient' && ans.value === NEW) {
    const f = ans.form || {};
    return !!String(f.name || '').trim() && toNum(f.pack) > 0 && toNum(f.price) > 0;
  }
  return true;
}

/** Junta análise + respostas num rascunho editável da ficha. */
export function resolveDraft(a, answers, questions, catalog = []) {
  const ingredients = a.items.map((it) => ({ qty: it.qty, name: it.match || '', newIng: null, original: it.original, note: it.note || '', section: it.section || '' }));

  for (const q of questions) {
    const ans = answers[q.id];
    if (!ans) continue;
    if (q.kind === 'ingredient') {
      const target = ingredients[q.ingIndex];
      if (ans.value === NEW) {
        const f = ans.form;
        target.name = f.name.trim();
        target.newIng = { name: f.name.trim(), pack: toNum(f.pack), unit: f.unit || 'g', price: toNum(f.price) };
      } else if (ans.value === PICK) {
        target.name = ans.pick.trim();
      } else if (ans.value === SKIP) {
        target.skip = true;
      } else {
        target.name = ans.value;
      }
      // o escolhido pode usar outra medida (ex.: receita em g de gema, cadastro de ovos em un.)
      const src = a.items[q.ingIndex].src;
      if (!target.skip && src) {
        const toUnits = target.newIng ? target.newIng.unit === 'un.' : isUnitBased(catalog.find((x) => x.name === target.name));
        const fit = fitUnit(src, toUnits, target.name);
        target.qty = fit ? fit.qty : round(src.qty);
        target.note = fit ? fit.note : '';
      }
    }
    if (q.kind === 'extra') {
      const ex = a.extra[Number(q.id.slice(2))];
      if (ex.ingIndex < 0) continue;
      const qty = ans.value === '__other__' ? Number(String(ans.other).replace(',', '.')) : ex.options[Number(ans.value)]?.qty;
      if (Number.isFinite(qty) && qty > 0) ingredients[ex.ingIndex].qty = round(qty);
    }
  }

  const tabAns = answers.tab;
  const yAns = answers.yield;
  const yieldUnits = yAns?.value === '__other__' ? Math.round(Number(String(yAns.other).replace(',', '.'))) : Number(yAns?.value);
  return {
    name: a.name,
    tab: tabAns?.value === NEW ? { title: tabAns.newName.trim().toUpperCase(), isNew: true } : { title: tabAns?.value, isNew: false },
    yieldUnits,
    yieldEstimated: yAns?.value !== '__other__' && !a.yields.find((y) => String(y.u) === yAns?.value)?.stated,
    yieldNote: yAns?.note || (yAns?.value !== '__other__' ? `Rendimento: ${a.yields.find((y) => String(y.u) === yAns?.value)?.d || ''}.` : ''),
    ingredients: groupBySection(ingredients.filter((x) => !x.skip)),
    hasMethod: a.hasMethod,
    method: a.method,
    ingredientLines: a.ingredientLines,
    saveNotion: a.hasMethod,
  };
}

/** Aceita "29,90", "29.90" e "1.000". */
export function toNum(v) {
  let s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Deixa os ingredientes de cada parte (massa, recheio…) juntos, na ordem em que as partes aparecem. */
export function groupBySection(list) {
  const order = uniq(list.map((x) => x.section || ''));
  return order.flatMap((sec) => list.filter((x) => (x.section || '') === sec));
}

function uniq(arr) {
  return [...new Set(arr)];
}
function round(n) {
  return Math.round(n * 100) / 100;
}
function titleCase(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
