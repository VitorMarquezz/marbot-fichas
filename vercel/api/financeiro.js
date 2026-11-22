// Marbot Financeiro — função da Vercel que busca contas e extratos no Meu Pluggy (Open Finance).
// O segredo da Pluggy fica só aqui, nas "Environment Variables" do projeto na Vercel. O app de desktop chama
// esta função com o login do Google; ela só responde para quem consegue abrir a planilha Marbot Financeiro.

const PLUGGY = 'https://api.pluggy.ai';
// tira espaços, quebras de linha e aspas que às vezes vêm junto ao colar o valor no painel
const env = (k) => String(process.env[k] || '').trim().replace(/^["']|["']$/g, '');

let apiKey = null; // { key, expiresAt } — a chave da Pluggy vale 2 horas

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function pluggyKey() {
  if (apiKey && apiKey.expiresAt > Date.now()) return apiKey.key;
  const res = await fetch(`${PLUGGY}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: env('PLUGGY_CLIENT_ID'), clientSecret: env('PLUGGY_CLIENT_SECRET') }),
  });
  if (!res.ok) {
    // mostra só o tamanho dos valores (o Client ID tem 36 caracteres), nunca o conteúdo
    throw new HttpError(502, `A Pluggy recusou as credenciais (erro ${res.status}). Na Vercel: PLUGGY_CLIENT_ID com ${env('PLUGGY_CLIENT_ID').length} caracteres (o certo são 36) e PLUGGY_CLIENT_SECRET com ${env('PLUGGY_CLIENT_SECRET').length}.`);
  }
  const data = await res.json();
  apiKey = { key: data.apiKey, expiresAt: Date.now() + 100 * 60_000 };
  return apiKey.key;
}

async function pluggy(path) {
  const res = await fetch(`${PLUGGY}${path}`, { headers: { 'X-API-KEY': await pluggyKey() } });
  if (res.status === 401 || res.status === 403) apiKey = null;
  if (!res.ok) throw new HttpError(502, `Pluggy respondeu ${res.status} em ${path.split('?')[0]}.`);
  return res.json();
}

/** Só libera quem tem acesso à planilha financeira (o próprio token do Google de quem chamou). */
async function allowed(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const sheet = env('FINANCE_SHEET_ID');
  if (!token || !sheet) return false;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}?fields=spreadsheetId`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

/** Token de 30 minutos para a janela de conexão da Pluggy (Pluggy Connect) aberta no app. */
async function connectToken() {
  const res = await fetch(`${PLUGGY}/connect_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': await pluggyKey() },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new HttpError(502, `A Pluggy não gerou o token de conexão (erro ${res.status}).`);
  return (await res.json()).accessToken;
}

// conexões salvas pelo app (botão "Conectar banco") + as configuradas na Vercel, sem repetir
function itemIdsFrom(extraItems = '') {
  return [...new Set(`${env('PLUGGY_ITEM_IDS')},${extraItems}`.split(/[\s,;]+/).filter((x) => /^[\w-]{8,}$/.test(x)))];
}

/** Quando cada conexão foi atualizada pela Pluggy e quando será a próxima atualização automática. */
async function itemsStatus(extraItems) {
  const out = [];
  for (const id of itemIdsFrom(extraItems)) {
    try {
      const it = await pluggy(`/items/${id}`);
      out.push({
        id,
        bank: it.connector?.name || 'Banco',
        status: it.status || '',
        executionStatus: it.executionStatus || '',
        lastUpdatedAt: it.lastUpdatedAt || it.updatedAt || null,
        nextAutoSyncAt: it.nextAutoSyncAt || null,
        autoSyncDisabledAt: it.autoSyncDisabledAt || null,
      });
    } catch (e) {
      out.push({ id, bank: 'Banco', error: e.message });
    }
  }
  return out;
}

async function accountsAndTransactions(from, extraItems = '') {
  const itemIds = itemIdsFrom(extraItems);
  const accounts = [];
  const transactions = [];
  const problems = [];
  for (const itemId of itemIds) {
    let item;
    try {
      item = await pluggy(`/items/${itemId}`);
    } catch (e) {
      problems.push(`Conexão ${itemId.slice(0, 8)}…: ${e.message}`);
      continue;
    }
    const bank = item.connector?.name || 'Banco';
    if (item.status && !['UPDATED', 'UPDATING'].includes(item.status)) {
      problems.push(`${bank}: a conexão está ${item.status}${item.executionStatus ? ` (${item.executionStatus})` : ''}. Reconecte no Meu Pluggy.`);
    }
    const accs = (await pluggy(`/accounts?itemId=${itemId}`)).results || [];
    for (const a of accs) {
      accounts.push({
        id: a.id,
        bank,
        name: a.name || a.marketingName || a.number || 'Conta',
        type: a.type === 'CREDIT' ? 'Cartão' : 'Conta',
        balance: a.balance ?? 0,
        updatedAt: item.lastUpdatedAt || item.updatedAt || null,
      });
      // /v2/transactions: 500 por página; "next" traz a query pronta da próxima página (null no fim)
      let path = `/v2/transactions?accountId=${a.id}&dateFrom=${from}`;
      for (let guard = 0; path && guard < 40; guard++) {
        const r = await pluggy(path);
        for (const t of r.results || []) {
          // em cartão de crédito, compra vem como DEBIT; em conta, valor negativo é saída
          const out = t.type === 'DEBIT';
          transactions.push({
            id: t.id,
            date: String(t.date).slice(0, 10),
            description: t.description || t.descriptionRaw || '',
            amount: Math.abs(Number(t.amount) || 0) * (out ? -1 : 1),
            category: t.category || '',
            account: `${bank} · ${a.name || a.number || ''}`.trim(),
            bank,
          });
        }
        const next = r.next;
        path = !next ? null : next.startsWith('/') ? next : `/v2/transactions${next.startsWith('?') ? '' : '?'}${next}`;
      }
    }
  }
  return { accounts, transactions, problems };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (!(await allowed(req))) return res.status(403).json({ error: 'Acesso negado: entre no app com a conta Google dona da planilha Marbot Financeiro.' });
    if (!env('PLUGGY_CLIENT_ID') || !env('PLUGGY_CLIENT_SECRET')) throw new HttpError(500, 'Faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente da Vercel.');
    if (req.query.action === 'connect_token') return res.status(200).json({ connectToken: await connectToken() });
    const items = String(req.query.items || '');
    if (req.query.action === 'status') return res.status(200).json({ items: await itemsStatus(items) });
    if (!env('PLUGGY_ITEM_IDS').trim() && !items.trim()) throw new HttpError(400, 'Nenhum banco conectado ainda. Use o botão "Conectar banco" no app.');
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return res.status(200).json({ from, ...(await accountsAndTransactions(from, items)) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}

// a busca de até 12 meses em várias contas pode passar dos 10 s padrão
export const config = { maxDuration: 60 };
