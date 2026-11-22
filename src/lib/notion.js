// Salva a receita completa (ingredientes + modo de preparo) no Notion, numa base de dados ou dentro de uma página.
import { http } from './http.js';

const API = 'https://api.notion.com/v1/';
const VERSION = '2022-06-28';

/** Aceita o link da base/página ou o ID puro. */
export function notionId(v) {
  const m = String(v || '').replace(/-/g, '').match(/([0-9a-f]{32})(?!.*[0-9a-f]{32})/i);
  return m ? m[1] : '';
}

export function isNotionReady(s) {
  return !!(s.notionToken?.trim() && notionId(s.notionTarget));
}

async function call(s, path, init = {}) {
  const res = await http(API + path, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${s.notionToken.trim()}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(notionError(res.status, data));
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

function notionError(status, data) {
  if (status === 401) return 'O token do Notion foi recusado. Confira nas configurações.';
  if (status === 404) return 'O Notion não achou a base/página. Abra-a no Notion, clique em ••• → Conexões e adicione a integração do app.';
  return `Notion respondeu com erro ${status}${data?.message ? `: ${data.message}` : ''}.`;
}

/** Descobre se o destino é uma base de dados (cria uma linha) ou uma página (cria uma subpágina). */
async function resolveTarget(s) {
  const id = notionId(s.notionTarget);
  try {
    const db = await call(s, `databases/${id}`);
    const props = Object.entries(db.properties || {});
    return {
      kind: 'database',
      id,
      title: props.find(([, p]) => p.type === 'title')?.[0] || 'Name',
      props,
    };
  } catch (e) {
    if (e.status !== 404 && e.code !== 'validation_error' && e.status !== 400) throw e;
    await call(s, `pages/${id}`); // confirma que é uma página que o app pode ver
    return { kind: 'page', id };
  }
}

/** Testa a conexão e diz o que foi encontrado. */
export async function testNotion(s) {
  const t = await resolveTarget(s);
  return {
    kind: t.kind,
    text: t.kind === 'database' ? 'Conectado a uma base de dados do Notion: cada receita vira uma linha nova.' : 'Conectado a uma página do Notion. Você pode criar a base de receitas dentro dela.',
  };
}

/** Cria a base "Receitas Marbot" dentro da página configurada e devolve o link dela. */
export async function createRecipesDatabase(s) {
  const page = notionId(s.notionTarget);
  const db = await call(s, 'databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: page },
      icon: { type: 'emoji', emoji: '🧁' },
      title: text('Receitas Marbot'),
      properties: {
        Nome: { title: {} },
        Aba: { select: {} },
        Rendimento: { number: { format: 'number' } },
        'Modo de preparo': { checkbox: {} },
        'Criada em': { created_time: {} },
      },
    },
  });
  return db.url;
}

const text = (t) => [{ type: 'text', text: { content: String(t).slice(0, 1990) } }];
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plain = (rt) => (rt || []).map((x) => x.plain_text || x.text?.content || '').join('');
const pretty = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1).toLowerCase();

// Colunas de cada tabela de categoria, iguais ao quadro de custos da ficha.
const RECIPE_SCHEMA = {
  Nome: { title: {} },
  Ingredientes: { multi_select: {} },
  Rendimento: { number: { format: 'number' } },
  Custo: { number: { format: 'real' } },
  Valor: { number: { format: 'real' } },
  'Preço da receita': { number: { format: 'real' } },
  Lucro: { number: { format: 'real' } },
  'Tempo de Preparo': { number: { format: 'number' } },
  'Modo de preparo': { checkbox: {} },
  'Ficha na planilha': { url: {} },
};

/** Acha (ou cria) a página da categoria ligada à aba e devolve a tabela de receitas dela. */
async function categoryDatabase(s, target, tab, create = true) {
  const abaKey = target.props.find(([k]) => norm(k) === 'aba na planilha')[0];
  let rows = [];
  let cursor;
  do {
    const res = await call(s, `databases/${target.id}/query`, { method: 'POST', body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } });
    rows = rows.concat(res.results || []);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  const want = norm(tab);
  let page = rows.find((p) => norm(plain(p.properties?.[abaKey]?.rich_text)) === want)
    || rows.find((p) => norm(plain(p.properties?.[target.title]?.title)) === want);
  if (!page && !create) return null;
  if (!page) {
    page = await call(s, 'pages', {
      method: 'POST',
      body: { parent: { database_id: target.id }, properties: { [target.title]: { title: text(pretty(tab)) }, [abaKey]: { rich_text: text(tab) } } },
    });
  }

  const kids = await call(s, `blocks/${page.id}/children?page_size=100`);
  const child = (kids.results || []).find((b) => b.type === 'child_database');
  if (child) return call(s, `databases/${child.id}`);
  if (!create) return null;
  return call(s, 'databases', {
    method: 'POST',
    body: { parent: { type: 'page_id', page_id: page.id }, is_inline: true, title: text(pretty(tab)), properties: RECIPE_SCHEMA },
  });
}

/** Preenche só as colunas que existirem na tabela da categoria. */
function recipeProperties(db, r) {
  const props = Object.entries(db.properties || {});
  const has = (name, type) => props.find(([k, p]) => norm(k) === norm(name) && p.type === type)?.[0];
  const t = r.totals || {};
  const out = { [props.find(([, p]) => p.type === 'title')?.[0] || 'Nome']: { title: text(r.name) } };
  const num = (name, v) => { const k = has(name, 'number'); if (k && Number.isFinite(v)) out[k] = { number: Math.round(v * 100) / 100 }; };
  num('Rendimento', Number(r.yieldUnits));
  num('Custo', t.recipePrice - t.profit);
  num('Valor', t.unitPrice);
  num('Preço da receita', t.recipePrice);
  num('Lucro', t.profit);
  const ms = has('Ingredientes', 'multi_select');
  if (ms) out[ms] = { multi_select: [...new Set(r.ingredients.filter((x) => !x.type || x.type === 'item').map((x) => x.name.replace(/,/g, ' ').trim().slice(0, 100)))].filter(Boolean).map((name) => ({ name })) };
  const cb = has('Modo de preparo', 'checkbox');
  if (cb) out[cb] = { checkbox: !!r.method?.length };
  const url = has('Ficha na planilha', 'url');
  if (url && r.sheetUrl) out[url] = { url: r.sheetUrl };
  return out;
}
const block = (type, t) => ({ object: 'block', type, [type]: { rich_text: text(t) } });

/**
 * @param {object} r { name, tab, yieldUnits, ingredientLines:string[], ingredients:{qty,name,unit}[], method:string[], sheetUrl }
 * @returns {Promise<string>} link da página criada
 */
export async function saveRecipeToNotion(s, r) {
  const target = await resolveTarget(s);
  const children = [];
  const info = [`Rendimento: ${r.yieldUnits} unidades`, r.tab ? `Ficha de custo na aba ${r.tab}` : ''].filter(Boolean).join(' · ');
  children.push({ object: 'block', type: 'callout', callout: { rich_text: text(info), icon: { type: 'emoji', emoji: '🧁' } } });

  children.push(block('heading_2', 'Ingredientes'));
  const lines = r.ingredientLines?.length ? r.ingredientLines : r.ingredients.map((x) => `${x.qty} ${x.unit} ${x.name}`);
  for (const l of lines) {
    const clean = l.replace(/^[-•*·–]\s*/, '');
    if (/:\s*$/.test(clean) && clean.length < 60) children.push(block('heading_3', clean.replace(/:\s*$/, '')));
    else children.push(block('bulleted_list_item', clean));
  }
  if (r.method?.length) {
    children.push(block('heading_2', 'Modo de preparo'));
    children.push(...methodBlocks(r.method));
  }
  if (r.sheetUrl) {
    children.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Abrir a ficha na planilha', link: { url: r.sheetUrl } } }] } });
  }

  let parent;
  let properties;
  if (target.kind === 'database' && target.props.some(([k]) => norm(k) === 'aba na planilha')) {
    // base organizada por categoria (como a de Ateliê › Cozinha): cada aba da planilha tem sua página e sua tabela
    const db = await categoryDatabase(s, target, r.tab);
    parent = { database_id: db.id };
    properties = recipeProperties(db, r);
  } else if (target.kind === 'database') {
    parent = { database_id: target.id };
    properties = { [target.title]: { title: text(r.name) } };
    // preenche colunas comuns, se a base tiver
    for (const [key, p] of target.props) {
      const k = key.toLowerCase();
      if (/^(aba|categoria|tipo)$/.test(k) && r.tab) {
        if (p.type === 'select') properties[key] = { select: { name: r.tab } };
        else if (p.type === 'multi_select') properties[key] = { multi_select: [{ name: r.tab }] };
        else if (p.type === 'rich_text') properties[key] = { rich_text: text(r.tab) };
      }
      if (/preparo/.test(k) && p.type === 'checkbox') properties[key] = { checkbox: !!r.method?.length };
      if (/^rendimento/.test(k)) {
        if (p.type === 'number') properties[key] = { number: Number(r.yieldUnits) };
        else if (p.type === 'rich_text') properties[key] = { rich_text: text(`${r.yieldUnits} unidades`) };
      }
    }
  } else {
    parent = { page_id: target.id };
    properties = { title: { title: text(r.name) } };
  }

  // o Notion aceita até 100 blocos por chamada
  const page = await call(s, 'pages', { method: 'POST', body: { parent, properties, children: children.slice(0, 100) } });
  for (let i = 100; i < children.length; i += 100) {
    await call(s, `blocks/${page.id}/children`, { method: 'PATCH', body: { children: children.slice(i, i + 100) } });
  }
  return page.url;
}

/**
 * Manda para a lixeira do Notion a receita com esse nome (na categoria da aba). Dá para restaurar pela lixeira.
 * @returns {Promise<number>} quantas páginas foram para a lixeira
 */
export async function deleteRecipeFromNotion(s, tab, name) {
  const target = await resolveTarget(s);
  if (target.kind !== 'database') return 0;
  const nested = target.props.some(([k]) => norm(k) === 'aba na planilha');
  const db = nested ? await categoryDatabase(s, target, tab, false) : { id: target.id, properties: Object.fromEntries(target.props) };
  if (!db) return 0;
  const titleKey = Object.entries(db.properties || {}).find(([, p]) => p.type === 'title')?.[0] || 'Nome';
  const res = await call(s, `databases/${db.id}/query`, { method: 'POST', body: { filter: { property: titleKey, title: { equals: name } }, page_size: 20 } });
  for (const pg of res.results || []) await call(s, `pages/${pg.id}`, { method: 'PATCH', body: { archived: true } });
  return (res.results || []).length;
}

// ---------- edição de uma receita já gravada ----------

/** Acha a página da receita (pelo nome) na tabela da categoria da aba. */
async function findRecipePage(s, tab, name) {
  const target = await resolveTarget(s);
  if (target.kind !== 'database') return null;
  const nested = target.props.some(([k]) => norm(k) === 'aba na planilha');
  const db = nested ? await categoryDatabase(s, target, tab, false) : { id: target.id, properties: Object.fromEntries(target.props) };
  if (!db) return null;
  const titleKey = Object.entries(db.properties || {}).find(([, p]) => p.type === 'title')?.[0] || 'Nome';
  const res = await call(s, `databases/${db.id}/query`, { method: 'POST', body: { filter: { property: titleKey, title: { equals: name } }, page_size: 1 } });
  return { db, page: res.results?.[0] || null };
}

async function listChildren(s, id) {
  let out = [];
  let cursor;
  do {
    const res = await call(s, `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out = out.concat(res.results || []);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

const blockText = (b) => plain(b?.[b.type]?.rich_text);
const isMethodHeading = (b) => /^heading_[123]$/.test(b.type) && norm(blockText(b)) === 'modo de preparo';
const isPlaceholder = (t) => /^ainda nao registrado/.test(norm(t));

/** Passos numerados; uma linha terminada em ":" (ex.: "Recheio 1:") vira título da parte. */
function methodBlocks(steps) {
  return steps.map((t) => (/:\s*$/.test(t) && t.length < 60
    ? block('heading_3', t.replace(/:\s*$/, ''))
    : block('numbered_list_item', t.replace(/^\d+[.)]\s*/, ''))));
}

/** Passos do modo de preparo já salvos no Notion (null se a receita não estiver lá). */

export async function getRecipeMethod(s, tab, name) {
  const found = await findRecipePage(s, tab, name);
  if (!found?.page) return null;
  const blocks = await listChildren(s, found.page.id);
  const i = blocks.findIndex(isMethodHeading);
  if (i < 0) return [];
  const steps = [];
  for (const b of blocks.slice(i + 1)) {
    if (/^heading_[12]$/.test(b.type)) break;
    const t = blockText(b).trim();
    if (t && !isPlaceholder(t)) steps.push(b.type === 'heading_3' ? `${t.replace(/:$/, '')}:` : t); // título de uma parte
  }
  return steps;
}

/**
 * Atualiza no Notion a receita editada no app: nome, custos, ingredientes e o modo de preparo
 * (só a seção "Modo de preparo" da página é trocada; o resto do que você escreveu lá fica).
 * Se a receita ainda não estiver no Notion, cria a página.
 * @param {object} r { name, tab, yieldUnits, ingredients:[{qty,name}], packaging, method:string[], totals, sheetUrl }
 */
export async function updateRecipeInNotion(s, oldName, r) {
  const found = await findRecipePage(s, r.tab, oldName);
  if (!found?.page) {
    const ingredientLines = r.ingredients
      .filter((x) => x.type !== 'note')
      .map((x) => (x.type === 'section' ? `${x.name}:` : `${String(x.qty).replace('.', ',')} ${x.name}`));
    return saveRecipeToNotion(s, { ...r, ingredientLines, ingredients: r.ingredients.filter((x) => !x.type || x.type === 'item') });
  }
  const { db, page } = found;
  await call(s, `pages/${page.id}`, { method: 'PATCH', body: { properties: recipeProperties(db, r) } });

  if (r.method === undefined) return page.url; // modo de preparo não foi lido: não mexe nele
  const blocks = await listChildren(s, page.id);
  const i = blocks.findIndex(isMethodHeading);
  const steps = methodBlocks(r.method || []);
  const content = steps.length ? steps : [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Ainda não registrado.' }, annotations: { italic: true } }] } }];
  if (i < 0) {
    await call(s, `blocks/${page.id}/children`, { method: 'PATCH', body: { children: [block('heading_2', 'Modo de preparo'), ...content] } });
  } else {
    for (const b of blocks.slice(i + 1)) {
      if (/^heading_[12]$/.test(b.type)) break;
      await call(s, `blocks/${b.id}`, { method: 'DELETE' });
    }
    await call(s, `blocks/${page.id}/children`, { method: 'PATCH', body: { children: content, after: blocks[i].id } });
  }
  return page.url;
}
