const KEY = 'marbot.settings.v1';
const HISTORY_KEY = 'marbot.history.v1';

// Valores da sua instalação (IDs das planilhas, chaves…) vêm do arquivo .env.local, que não vai para o GitHub.
// A lista completa está em .env.example.
const env = (k) => String(import.meta.env?.[k] || '').trim();

export const DEFAULT_SETTINGS = {
  provider: 'gemini', // 'gemini' (grátis) | 'local' (sem IA, grátis) | 'claude' (pago)
  claudeKey: '',
  claudeModel: 'claude-sonnet-5-5',
  geminiKey: '',
  geminiModel: 'gemini-3.8-flash',
  googleClientId: '',
  googleClientSecret: '', // só no app de desktop
  spreadsheetId: env('VITE_DEFAULT_SPREADSHEET_ID'), // planilha das fichas de custo
  templateTab: 'BISCOITOS',
  ingredientsTab: 'INGREDIENTES',
  paramsTab: 'PARÂMETROS',
  formulaSyntax: 'ptbr', // 'ptbr' (; e 0,5) | 'intl' (, e 0.5) — trocado sozinho se a planilha recusar
  substitutions: [
    { from: 'Creme de leite fresco', to: 'Nata' },
    { from: 'Manteiga sem sal', to: 'Manteiga' },
    { from: 'Açúcar de confeiteiro', to: 'Glaçucar' },
  ],
  notionToken: '', // token da integração interna do Notion (ntn_…)
  notionTarget: '', // link ou ID da base de dados / página onde salvar as receitas
  financeSheetId: env('VITE_DEFAULT_FINANCE_SHEET_ID'), // planilha Marbot Financeiro (extrato)
  financeItems: [], // bancos ligados pelo botão "Conectar banco": [{ id, bank }]
  financeSyncedAt: 0, // última vez que o app trouxe o extrato para a planilha (ms)
  financeFunctionUrl: '', // endereço da função na Vercel que busca o extrato no Meu Pluggy
  demo: false,
  updatedAt: 0, // quando as configurações mudaram (para sincronizar com a conta Google)
};

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeSet(storage, key, value) {
  try { storage.setItem(key, value); } catch { /* armazenamento indisponível */ }
}

// Chave do Gemini e cliente do Google embutidos só na versão portátil (arquivo .env.local, fora do código-fonte).
const BUILT_IN_GEMINI_KEY = env('VITE_DEFAULT_GEMINI_KEY');
const BUILT_IN_GOOGLE_CLIENT_ID = env('VITE_DEFAULT_GOOGLE_CLIENT_ID');
const BUILT_IN_GOOGLE_CLIENT_SECRET = env('VITE_DEFAULT_GOOGLE_CLIENT_SECRET');

export function loadSettings() {
  let s = { ...DEFAULT_SETTINGS };
  const raw = safeGet(localStorage, KEY);
  if (raw) {
    try { s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { /* usa o padrão */ }
  }
  if (BUILT_IN_GEMINI_KEY && !s.geminiKey) {
    s.geminiKey = BUILT_IN_GEMINI_KEY;
    if (s.provider === 'claude' && !s.claudeKey) s.provider = 'gemini';
  }
  if (!s.financeFunctionUrl?.trim()) s.financeFunctionUrl = env('VITE_DEFAULT_FINANCE_FUNCTION_URL');
  const builtInNotion = env('VITE_DEFAULT_NOTION_TARGET');
  if (builtInNotion && !s.notionTarget.trim()) s.notionTarget = builtInNotion;
  if (BUILT_IN_GOOGLE_CLIENT_ID && !s.googleClientId.trim()) {
    s.googleClientId = BUILT_IN_GOOGLE_CLIENT_ID;
    s.googleClientSecret = BUILT_IN_GOOGLE_CLIENT_SECRET;
  }
  return s;
}

export function saveSettings(s) {
  safeSet(localStorage, KEY, JSON.stringify(s));
}

// Gemini sem chave ainda funciona: o app usa o leitor local (grátis).
export function isAiReady(s) {
  return s.provider === 'claude' ? !!s.claudeKey.trim() : true;
}

export function isSheetsReady(s) {
  const desktop = typeof window !== 'undefined' && window.marbotDesktop?.isDesktop;
  return !!s.googleClientId.trim() && !!s.spreadsheetId.trim() && (!desktop || !!s.googleClientSecret.trim());
}

export function loadHistory() {
  try { return JSON.parse(safeGet(localStorage, HISTORY_KEY) || '[]'); } catch { return []; }
}

export function pushHistory(entry) {
  const list = [entry, ...loadHistory()].slice(0, 30);
  safeSet(localStorage, HISTORY_KEY, JSON.stringify(list));
  return list;
}

export function saveHistory(list) {
  safeSet(localStorage, HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  return list;
}

export function clearHistory() {
  return saveHistory([]);
}
