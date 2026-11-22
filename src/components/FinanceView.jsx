import { useEffect, useMemo, useState } from 'react';
import { money } from '../lib/costs.js';
import { bankStatus, connectBank, demoFinance, loadFinance, syncFinance, updateTransaction } from '../lib/finance.js';
import { norm } from '../lib/match.js';
import Combo from './Combo.jsx';
import { IconAlert, IconExternal } from './Icons.jsx';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ym = (iso) => iso.slice(0, 7);
const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dateBr = (iso) => iso.split('-').reverse().join('/');

/** Entradas e saídas das contas bancárias (Meu Pluggy → função na Vercel → planilha Marbot Financeiro). */
export default function FinanceView({ settings, demo, readOnly, onOpenSettings, onSaveSettings }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [kind, setKind] = useState('all');
  const [account, setAccount] = useState('');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(''); // categoria escolhida em "Para onde foi o dinheiro"
  const [status, setStatus] = useState(null); // última e próxima atualização de cada banco no Meu Pluggy
  const [statusErr, setStatusErr] = useState('');

  async function loadStatus() {
    setStatusErr('');
    if (demo) { setStatus(demoStatus()); return; }
    if (!settings.financeFunctionUrl || !(settings.financeItems || []).length) { setStatus(null); return; }
    try {
      setStatus(await bankStatus(settings));
    } catch (e) {
      setStatusErr(e.message);
    }
  }
  useEffect(() => { loadStatus(); }, [demo, (settings.financeItems || []).map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setError('');
    try {
      setData(demo ? demoFinance() : await loadFinance(settings));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [demo, settings.financeSheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await syncFinance(settings);
      onSaveSettings({ ...settings, financeSyncedAt: Date.now() });
      loadStatus();
      setNote(`${r.added ? `${r.added} lançamento${r.added === 1 ? '' : 's'} novo${r.added === 1 ? '' : 's'}` : 'Nenhum lançamento novo'} · ${r.total} no total.${r.problems.length ? ` Atenção: ${r.problems.join(' ')}` : ''}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addBank() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const item = await connectBank(settings);
      if (item) {
        const others = (settings.financeItems || []).filter((x) => x.id !== item.id);
        onSaveSettings({ ...settings, financeItems: [...others, item] });
        setNote(`${item.bank} conectado. Clique em "Buscar no banco" para trazer o extrato (a primeira leitura pode levar alguns minutos).`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function removeBank(id) {
    onSaveSettings({ ...settings, financeItems: (settings.financeItems || []).filter((x) => x.id !== id) });
  }

  const tx = data?.transactions || [];
  const accounts = useMemo(() => [...new Set(tx.map((t) => t.account))].sort(), [tx]);
  const inMonth = tx.filter((t) => ym(t.date) === month && (!account || t.account === account));
  const income = inMonth.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const spent = inMonth.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const byCat = Object.entries(inMonth.filter((t) => t.amount < 0).reduce((m, t) => ({ ...m, [t.category || 'Sem categoria']: (m[t.category || 'Sem categoria'] || 0) - t.amount }), {}))
    .sort((a, b) => b[1] - a[1]);
  const topCat = byCat[0]?.[1] || 1;
  const list = inMonth
    .filter((t) => !cat || (t.amount < 0 && (t.category || 'Sem categoria') === cat))
    .filter((t) => kind === 'all' || (kind === 'in' ? t.amount > 0 : t.amount < 0))
    .filter((t) => !query || norm(`${t.description} ${t.category} ${t.note}`).includes(norm(query)));
  const balances = (data?.accounts || []).filter((a) => a.type !== 'Cartão');
  const cards = (data?.accounts || []).filter((a) => a.type === 'Cartão');
  const [y, m] = month.split('-').map(Number);
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${settings.financeSheetId}/edit`;
  const categories = useMemo(() => [...new Set(tx.map((t) => t.category).filter(Boolean))].sort(), [tx]);

  async function setCategory(t, category) {
    if (demo) { setData({ ...data, transactions: tx.map((x) => (x.id === t.id ? { ...x, category } : x)) }); return; }
    try {
      await updateTransaction(settings, t.id, { category });
      setData({ ...data, transactions: tx.map((x) => (x.id === t.id ? { ...x, category } : x)) });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="finance">
      <div className="browser-bar">
        <div>
          <h1 className="display browser-title">Financeiro</h1>
          <p className="muted small">Entradas e saídas das suas contas pelo Open Finance (Meu Pluggy)</p>
        </div>
        <div className="browser-tools">
          {!demo && <a className="btn small ghost" href={sheetUrl} target="_blank" rel="noreferrer"><IconExternal width={16} height={16} /> Abrir planilha</a>}
          <button className="btn small" onClick={addBank} disabled={busy || readOnly || demo || !settings.financeFunctionUrl}>Conectar banco</button>
          <button className="btn small primary" onClick={sync} disabled={busy || readOnly || demo || !settings.financeFunctionUrl || !(settings.financeItems || []).length}>{busy ? 'Aguarde…' : 'Buscar no banco'}</button>
        </div>
      </div>

      {!demo && (
        <div className="fin-banks">
          {(settings.financeItems || []).length === 0 ? (
            <p className="muted small">Nenhum banco conectado. Clique em <strong>Conectar banco</strong>, escolha <strong>MeuPluggy</strong> e entre com a sua conta do meu.pluggy.ai.</p>
          ) : (settings.financeItems || []).map((b) => (
            <span key={b.id} className="chip on fin-bank">{b.bank}<button className="icon-btn" aria-label={`Desligar ${b.bank} do app`} onClick={() => removeBank(b.id)} disabled={busy}>×</button></span>
          ))}
        </div>
      )}

      {(status || statusErr) && <SyncInfo status={status} error={statusErr} syncedAt={demo ? Date.now() - 5 * 3_600_000 : settings.financeSyncedAt} onRefresh={loadStatus} />}

      {!demo && !settings.financeFunctionUrl && (
        <div className="callout info">
          <div>
            <p><strong>Falta ligar o banco.</strong> Depois de publicar a função na Vercel (passo a passo no LEIAME), cole o endereço dela em Configurações → Financeiro.</p>
            <button className="btn small" onClick={onOpenSettings}>Abrir configurações</button>
          </div>
        </div>
      )}
      {error && <div className="callout bad" role="alert"><IconAlert /><p>{error}</p></div>}
      {note && <div className="callout info" role="status"><p>{note}</p></div>}

      {!data ? (
        !error && <section className="panel browser-empty"><span className="spinner" aria-hidden="true" /> Lendo o extrato…</section>
      ) : (<>
        <div className="fin-month">
          <button className="carousel-arrow" onClick={() => { setMonth(shiftMonth(month, -1)); setCat(''); }} aria-label="Mês anterior">‹</button>
          <h2 className="display">{MONTHS[m - 1]} {y}</h2>
          <button className="carousel-arrow" onClick={() => { setMonth(shiftMonth(month, 1)); setCat(''); }} aria-label="Próximo mês">›</button>
          <select aria-label="Conta" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Todas as contas</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="fin-cards">
          <div className="fin-card in"><span>Entradas</span><strong>{money(income)}</strong></div>
          <div className="fin-card out"><span>Saídas</span><strong>{money(spent)}</strong></div>
          <div className={`fin-card ${income - spent >= 0 ? 'in' : 'out'}`}><span>Resultado do mês</span><strong>{money(income - spent)}</strong></div>
          <div className="fin-card"><span>Saldo nas contas</span><strong>{money(balances.reduce((a, x) => a + x.balance, 0))}</strong>
            <small>{balances.map((a) => `${a.bank} ${money(a.balance)}`).join(' · ')}{cards.length ? ` · Fatura ${cards.map((c) => money(c.balance)).join(' + ')}` : ''}</small>
          </div>
        </div>

        <div className="fin-cols">
          <section className="panel">
            <h2 className="section-title">Para onde foi o dinheiro</h2>
            {byCat.length > 0 && <p className="muted small">Clique numa categoria para ver só aqueles gastos.</p>}
            {byCat.length === 0 ? <p className="muted small">Nenhuma saída neste mês.</p> : (
              <ul className="fin-bars">
                {byCat.map(([c, v]) => (
                  <li key={c}>
                    <button className={`fin-bar-btn ${cat === c ? 'on' : ''} ${cat && cat !== c ? 'dim' : ''}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>
                      <span className="fin-bar-label">{c}</span>
                      <span className="num">{money(v)}</span>
                      <span className="fin-bar"><span style={{ width: `${Math.max(4, (v / topCat) * 100)}%` }} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2 className="section-title">Lançamentos</h2>
              {cat && <span className="chip on fin-bank">{cat}<button className="icon-btn" aria-label="Mostrar todas as categorias" onClick={() => setCat('')}>×</button></span>}
              <div className="segmented mini three" role="radiogroup" aria-label="Tipo">
                {[['all', 'Todos'], ['in', 'Entradas'], ['out', 'Saídas']].map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
                ))}
              </div>
            </div>
            <label className="search fin-search"><span className="sr-only">Buscar</span><input type="search" placeholder="Buscar lançamento" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <div className="table-wrap">
              <table className="mini-table wide fin-table">
                <thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col" className="num">Valor</th></tr></thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{dateBr(t.date)}</td>
                      <td>{t.description}<span className="orig">{t.account}{t.note ? ` · ${t.note}` : ''}</span></td>
                      <td>
                        <CategoryCell t={t} options={categories} disabled={readOnly} onSave={(v) => setCategory(t, v)} />
                      </td>
                      <td className={`num strong ${t.amount >= 0 ? 'pos' : 'neg'}`}>{money(t.amount)}</td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={4} className="muted">Nenhum lançamento neste mês{query ? ' com essa busca' : ''}.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>)}
    </div>
  );
}

/** Categoria editável de um lançamento: grava ao escolher na lista ou ao sair do campo. */
function CategoryCell({ t, options, disabled, onSave }) {
  const [v, setV] = useState(t.category);
  useEffect(() => { setV(t.category); }, [t.category]);
  const commit = (x) => { const c = String(x).trim(); if (c && c !== t.category) onSave(c); };
  return <Combo className="cat-in" aria-label="Categoria" value={v} options={options} disabled={disabled} onChange={setV} onPick={commit} onBlur={() => commit(v)} />;
}

const HOUR = 3_600_000;

/** "hoje às 06:12", "amanhã às 06:12", "05/11 às 06:12" */
function whenBr(ms) {
  const d = new Date(ms);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86_400_000);
  const label = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff === -1 ? 'ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${label} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** "há 3 h", "em 21 h", "há 2 dias" */
function fromNow(ms) {
  const h = (ms - Date.now()) / HOUR;
  const a = Math.abs(h);
  const txt = a < 1 ? `${Math.max(1, Math.round(a * 60))} min` : a < 48 ? `${Math.round(a)} h` : `${Math.round(a / 24)} dias`;
  return h < 0 ? `há ${txt}` : `em ${txt}`;
}

/** Quando o Meu Pluggy atualizou cada banco, quando atualiza de novo e se já foi trazido para o app. */
function SyncInfo({ status, error, syncedAt, onRefresh }) {
  return (
    <section className="fin-sync" aria-label="Atualização dos extratos">
      <div className="fin-sync-head">
        <strong>Atualização dos extratos</strong>
        <button className="btn text small" onClick={onRefresh}>Conferir de novo</button>
      </div>
      {error && <p className="warn-text small">Não consegui ver a situação no Meu Pluggy: {error}</p>}
      {(status || []).map((b) => {
        const last = b.lastUpdatedAt ? Date.parse(b.lastUpdatedAt) : 0;
        // sem data marcada pela Pluggy, a atualização automática costuma vir a cada 24 h
        const next = b.nextAutoSyncAt ? Date.parse(b.nextAutoSyncAt) : last && !b.autoSyncDisabledAt ? last + 24 * HOUR : 0;
        return (
          <div key={b.id} className="fin-sync-row">
            <span className="fin-sync-bank">{b.bank}</span>
            {b.error ? <span className="warn-text small">{b.error}</span> : (
              <>
                <span>
                  <small>Última atualização</small>
                  {b.status === 'UPDATING' ? 'atualizando agora…' : last ? <>{whenBr(last)} <em>({fromNow(last)})</em></> : '—'}
                </span>
                <span>
                  <small>Próxima{b.nextAutoSyncAt ? '' : ' (previsão)'}</small>
                  {b.autoSyncDisabledAt ? 'automática desligada: reconecte o banco' : next ? <>{whenBr(next)} <em>({next < Date.now() ? 'a qualquer momento' : fromNow(next)})</em></> : '—'}
                </span>
                {b.status && !['UPDATED', 'UPDATING'].includes(b.status) && <span className="tag bad">conexão com problema: reconecte</span>}
              </>
            )}
          </div>
        );
      })}
      <p className="muted small fin-sync-foot">
        {syncedAt ? <>Você trouxe o extrato para o app {whenBr(syncedAt)}.</> : <>Você ainda não trouxe o extrato para o app.</>}
        {(status || []).some((b) => b.lastUpdatedAt && Date.parse(b.lastUpdatedAt) > (syncedAt || 0)) && <strong> Tem novidade no Meu Pluggy: clique em “Buscar no banco”.</strong>}
      </p>
    </section>
  );
}

function demoStatus() {
  const now = Date.now();
  return [
    { id: 'd1', bank: 'Banco Inter', status: 'UPDATED', lastUpdatedAt: new Date(now - 3 * HOUR).toISOString(), nextAutoSyncAt: new Date(now + 21 * HOUR).toISOString() },
    { id: 'd2', bank: 'Nubank', status: 'UPDATED', lastUpdatedAt: new Date(now - 7 * HOUR).toISOString(), nextAutoSyncAt: null },
  ];
}
