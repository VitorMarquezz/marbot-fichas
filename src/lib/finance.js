// Marbot Financeiro: extrato das contas (Meu Pluggy via função na Vercel) guardado na planilha "Marbot Financeiro".
import { getGoogleToken } from './google.js';
import { http } from './http.js';
import { assertOnline } from './net.js';
import { SheetsClient } from './sheets.js';

// Categorias da Pluggy (em inglês) → nomes em português
// Categorias automáticas da Pluggy (em inglês) → nomes em português
const CATEGORIES = {
  income: 'Receitas', salary: 'Salário', retirement: 'Aposentadoria', 'entrepreneurial activities': 'Atividade empresarial', 'government aid': 'Auxílio do governo',
  'non-recurring income': 'Receita eventual', 'loans and financing': 'Empréstimos e financiamentos', loans: 'Empréstimos', 'interests charged': 'Juros cobrados',
  financing: 'Financiamentos', investments: 'Investimentos', 'automatic investment': 'Investimento automático', 'fixed income': 'Renda fixa', 'mutual funds': 'Fundos',
  'variable income': 'Renda variável', margin: 'Margem', 'proceeds interests and dividends': 'Rendimentos e dividendos', pension: 'Previdência',
  'same person transfer': 'Transferência entre contas', transfers: 'Transferências', 'transfer - bank slip': 'Boleto', 'transfer - cash': 'Dinheiro',
  'transfer - check': 'Cheque', 'transfer - doc': 'DOC', 'transfer - foreign exchange': 'Câmbio', 'transfer - internal': 'Transferência interna',
  'transfer - pix': 'Pix', 'transfer - ted': 'TED', 'third party transfers': 'Transferências para terceiros', 'credit card payment': 'Pagamento de cartão',
  'legal obligations': 'Obrigações legais', 'blocked balances': 'Saldo bloqueado', alimony: 'Pensão alimentícia',
  services: 'Serviços', telecommunications: 'Telefone e internet', internet: 'Internet', mobile: 'Celular', tv: 'TV',
  education: 'Educação', 'online courses': 'Cursos online', university: 'Faculdade', school: 'Escola', kindergarten: 'Creche',
  'wellness and fitness': 'Bem-estar e academia', 'gyms and fitness centers': 'Academia', 'sports practice': 'Esportes', wellness: 'Bem-estar',
  tickets: 'Ingressos', 'stadiums and arenas': 'Estádios e arenas', 'landmarks and museums': 'Passeios e museus', 'cinema, theater and concerts': 'Cinema, teatro e shows',
  shopping: 'Compras', 'online shopping': 'Compras online', electronics: 'Eletrônicos', 'pet supplies and vet': 'Pet e veterinário', clothing: 'Roupas',
  'kids and toys': 'Crianças e brinquedos', bookstore: 'Livraria', 'sports goods': 'Artigos esportivos', 'office supplies': 'Material de escritório', cashback: 'Cashback',
  'digital services': 'Serviços digitais', digital_services: 'Serviços digitais', gaming: 'Jogos', 'video streaming': 'Streaming de vídeo', 'music streaming': 'Streaming de música',
  groceries: 'Mercado', 'food and drinks': 'Alimentação', 'eating out': 'Restaurantes', restaurants: 'Restaurantes', 'food delivery': 'Delivery de comida',
  travel: 'Viagem', 'airport and airlines': 'Aéreo', accomodation: 'Hospedagem', accommodation: 'Hospedagem', 'mileage programs': 'Milhas', 'bus tickets': 'Passagens de ônibus',
  donations: 'Doações', gambling: 'Apostas', lottery: 'Loteria', 'online bet': 'Apostas online',
  taxes: 'Impostos', 'income taxes': 'Imposto de renda', 'taxes on investments': 'Impostos sobre investimentos', 'tax on financial operations': 'IOF',
  'bank fees': 'Tarifas bancárias', 'account fees': 'Tarifa de conta', 'wire transfer fees and atm fees': 'Tarifas de transferência e saque', 'credit card fees': 'Tarifas do cartão',
  housing: 'Moradia', rent: 'Aluguel', utilities: 'Contas de consumo', water: 'Água', electricity: 'Energia', gas: 'Gás', houseware: 'Casa e utilidades',
  'urban land and building tax': 'IPTU', healthcare: 'Saúde', health: 'Saúde', dentist: 'Dentista', pharmacy: 'Farmácia', optometry: 'Ótica', 'hospital clinics and labs': 'Hospitais, clínicas e exames',
  transportation: 'Transporte', 'taxi and ride-hailing': 'Táxi e aplicativos (Uber, 99)', 'public transportation': 'Transporte público', 'car rental': 'Aluguel de carro',
  bicycle: 'Bicicleta', automotive: 'Automotivo', 'gas stations': 'Combustível', parking: 'Estacionamento', 'tolls and in vehicle payment': 'Pedágio',
  'vehicle ownership taxes and fees': 'IPVA e taxas do veículo', 'vehicle maintenance': 'Manutenção do veículo', 'traffic tickets': 'Multas',
  insurance: 'Seguros', 'life insurance': 'Seguro de vida', 'home insurance': 'Seguro residencial', 'health insurance': 'Plano de saúde', 'vehicle insurance': 'Seguro do veículo',
  leisure: 'Lazer', other: 'Outros',
};
export const translateCategory = (c) => CATEGORIES[String(c || '').toLowerCase()] || c || 'Sem categoria';

const EXTRATO = 'EXTRATO';
const CONTAS = 'CONTAS';

function financeClient(s) {
  return new SheetsClient({ ...s, spreadsheetId: s.financeSheetId });
}

// a planilha devolve datas como número de série (dias desde 30/12/1899)
function toIsoDate(v) {
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  const s = String(v || '');
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : s.slice(0, 10);
}
const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0);

/** Lê o extrato e as contas da planilha (funciona offline com a cópia salva). */
export async function loadFinance(s) {
  const c = financeClient(s);
  const [tx, acc] = await c.getValues([`${EXTRATO}!A2:I`, `${CONTAS}!A2:F`]);
  return {
    transactions: tx.filter((r) => r[0]).map((r) => ({
      id: String(r[0]), date: toIsoDate(r[1]), description: String(r[2] || ''), amount: num(r[3]),
      kind: String(r[4] || ''), category: translateCategory(String(r[5] || '')), account: String(r[6] || ''), bank: String(r[7] || ''), note: String(r[8] || ''),
    })),
    accounts: acc.filter((r) => r[0]).map((r) => ({
      id: String(r[0]), bank: String(r[1] || ''), name: String(r[2] || ''), type: String(r[3] || ''), balance: num(r[4]), updatedAt: String(r[5] || ''),
    })),
  };
}

/**
 * Busca as novidades no banco (função na Vercel → Meu Pluggy) e grava na planilha.
 * Categoria e observação editadas na planilha são mantidas.
 * @returns {{ added:number, total:number, problems:string[] }}
 */
export async function syncFinance(s) {
  assertOnline();
  const items = (s.financeItems || []).map((x) => x.id).join(',');
  const data = await callFunction(s, `days=365&items=${encodeURIComponent(items)}`);

  const current = await loadFinance(s);
  const byId = new Map(current.transactions.map((t) => [t.id, t]));
  let added = 0;
  for (const t of data.transactions || []) {
    const old = byId.get(t.id);
    if (!old) added++;
    byId.set(t.id, {
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      kind: t.amount >= 0 ? 'Entrada' : 'Saída',
      category: old?.category ? translateCategory(old.category) : translateCategory(t.category),
      account: t.account,
      bank: t.bank,
      note: old?.note || '',
    });
  }
  const rows = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const c = financeClient(s);
  const now = new Date().toLocaleString('pt-BR');
  await c.setValues([
    { range: `${EXTRATO}!A2:I${rows.length + 1}`, values: rows.map((t) => [t.id, t.date, t.description, t.amount, t.kind, t.category, t.account, t.bank, t.note]) },
    ...(data.accounts?.length ? [{ range: `${CONTAS}!A2:F${data.accounts.length + 1}`, values: data.accounts.map((a) => [a.id, a.bank, a.name, a.type, a.balance, a.updatedAt ? new Date(a.updatedAt).toLocaleString('pt-BR') : now]) }] : []),
  ]);
  return { added, total: rows.length, problems: data.problems || [] };
}

/**
 * Situação de cada banco no Meu Pluggy: última atualização e a próxima automática.
 * @returns {Promise<{ id, bank, status, lastUpdatedAt, nextAutoSyncAt, autoSyncDisabledAt, error? }[]>}
 */
export async function bankStatus(s) {
  assertOnline();
  const items = (s.financeItems || []).map((x) => x.id).join(',');
  const data = await callFunction(s, `action=status&items=${encodeURIComponent(items)}`);
  if (!Array.isArray(data.items)) throw new Error('a função na Vercel ainda é a versão antiga; publique a nova para ver as datas.');
  const names = new Map((s.financeItems || []).map((x) => [x.id, x.bank]));
  return (data.items || []).map((x) => ({ ...x, bank: x.bank === 'Banco' && names.get(x.id) ? names.get(x.id) : x.bank }));
}

async function callFunction(s, query) {
  if (!s.financeFunctionUrl.trim()) throw new Error('Informe o endereço da função da Vercel em Configurações → Financeiro.');
  const token = await getGoogleToken(s.googleClientId, s.googleClientSecret);
  const res = await http(`${s.financeFunctionUrl.trim().replace(/\/$/, '')}?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `A função do financeiro respondeu com erro ${res.status}.`);
  return data;
}

/**
 * Abre a janela oficial da Pluggy para ligar um banco (pelo Meu Pluggy) e devolve a conexão criada.
 * @returns {Promise<{ id:string, bank:string } | null>} null se a pessoa fechar a janela
 */
export async function connectBank(s) {
  assertOnline();
  const { connectToken } = await callFunction(s, 'action=connect_token');
  const { PluggyConnect } = await import('pluggy-connect-sdk');
  return new Promise((resolve, reject) => {
    let done = false;
    const widget = new PluggyConnect({
      connectToken,
      includeSandbox: false,
      onSuccess: ({ item }) => { done = true; resolve({ id: item.id, bank: item.connector?.name || 'Banco' }); },
      onError: (e) => { done = true; reject(new Error(e?.message || 'A conexão com o banco não deu certo.')); },
      onClose: () => { if (!done) resolve(null); },
    });
    widget.init();
  });
}

/** Grava a categoria/observação de um lançamento (linha achada pelo ID). */
export async function updateTransaction(s, id, patch) {
  assertOnline();
  const c = financeClient(s);
  const [ids] = await c.getValues([`${EXTRATO}!A2:A`]);
  const i = ids.findIndex((r) => String(r[0]) === id);
  if (i < 0) throw new Error('Lançamento não encontrado na planilha. Atualize e tente de novo.');
  const row = i + 2;
  await c.setValues([
    ...(patch.category != null ? [{ range: `${EXTRATO}!F${row}`, values: [[patch.category]] }] : []),
    ...(patch.note != null ? [{ range: `${EXTRATO}!I${row}`, values: [[patch.note]] }] : []),
  ]);
}

/** Dados de exemplo para o modo demonstração. */
export function demoFinance() {
  const today = new Date();
  const d = (n) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const tx = [
    [1, 'PIX RECEBIDO - ENCOMENDA BRIGADEIROS', 480, 'Receitas'], [2, 'ATACADÃO - INSUMOS', -312.45, 'Mercado'],
    [3, 'PIX RECEBIDO - BOMBONS NATAL', 920, 'Receitas'], [5, 'CEMIG ENERGIA', -186.3, 'Contas de consumo'],
    [6, 'EMBALAGENS CIA', -245.9, 'Compras'], [9, 'PIX RECEBIDO - TARTELETES', 350, 'Receitas'],
    [12, 'TARIFA PACOTE SERVIÇOS', -39.9, 'Tarifas bancárias'], [15, 'SIMPLES NACIONAL DAS', -76.6, 'Impostos'],
    [18, 'CASA DO CONFEITEIRO', -428.2, 'Compras'], [22, 'PIX RECEBIDO - BOLO ANIVERSÁRIO', 260, 'Receitas'],
    [35, 'PIX RECEBIDO - CASAMENTO BEM CASADOS', 1800, 'Receitas'], [38, 'ATACADÃO - INSUMOS', -530.1, 'Mercado'],
  ];
  return {
    transactions: tx.map(([n, desc, amount, category], i) => ({
      id: `demo${i}`, date: d(n), description: desc, amount, kind: amount >= 0 ? 'Entrada' : 'Saída', category,
      account: i % 3 ? 'Banco Inter · Conta PJ' : 'Nubank · Conta', bank: i % 3 ? 'Banco Inter' : 'Nubank', note: '',
    })),
    accounts: [
      { id: 'a1', bank: 'Banco Inter', name: 'Conta PJ', type: 'Conta', balance: 4210.55, updatedAt: '' },
      { id: 'a2', bank: 'Nubank', name: 'Conta', type: 'Conta', balance: 1385.2, updatedAt: '' },
      { id: 'a3', bank: 'Nubank', name: 'Cartão', type: 'Cartão', balance: 742.9, updatedAt: '' },
    ],
  };
}
