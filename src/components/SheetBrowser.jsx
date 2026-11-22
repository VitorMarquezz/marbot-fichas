import { useEffect, useMemo, useState } from 'react';
import { parseFichas } from '../lib/browse.js';
import { catalogChat } from '../lib/chat.js';
import { deleteRecipeFromNotion, isNotionReady, updateRecipeInNotion } from '../lib/notion.js';
import { money, qtyFmt } from '../lib/costs.js';
import { toNum } from '../lib/flow.js';
import { norm } from '../lib/match.js';
import ChatBox from './ChatBox.jsx';
import FichaEditor from './FichaEditor.jsx';
import ParamsView from './ParamsView.jsx';
import TabCarousel from './TabCarousel.jsx';
import { IconAlert, IconCheck, IconExternal, IconPencil, IconPlus, IconTrash, IconX } from './Icons.jsx';

const Caret = ({ open }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 18l6-6-6-6" /></svg>);

/**
 * Navegação pela planilha: uma aba por botão no topo e, abaixo,
 * as receitas da aba em cartões que abrem e fecham.
 */
export default function SheetBrowser({ client, catalog, loadCatalog, sheetUrl, onNewInTab, onError, settings, readOnly, onSyntax }) {
  const tabs = useMemo(() => {
    if (!catalog) return [];
    const ing = catalog.allSheets.find((s) => s.title === client.s.ingredientsTab);
    const par = catalog.params && catalog.allSheets.find((s) => s.title === client.paramsTab);
    return [
      ...(ing ? [{ title: ing.title, sheetId: ing.sheetId, isIngredients: true, kind: 'ing' }] : []),
      ...(par ? [{ title: par.title, sheetId: par.sheetId, isParams: true, kind: 'par' }] : []),
      ...catalog.tabs,
    ].map((t) => ({ ...t, label: pretty(t.title) }));
  }, [catalog, client]);

  const [active, setActive] = useState(() => safeRead('marbot.tab'));
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!catalog) loadCatalog().catch((e) => onError(e.message));
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.title === active)) setActive(tabs.find((t) => !t.isIngredients && !t.isParams)?.title || tabs[0].title);
  }, [tabs, active]);

  useEffect(() => { setCache({}); }, [client]);

  const tab = tabs.find((t) => t.title === active);
  const notionOn = !settings.demo && isNotionReady(settings);

  async function load(force = false) {
    if (!tab || tab.isIngredients || tab.isParams || (!force && cache[tab.title])) return cache[tab?.title];
    setLoading(true);
    try {
      const rows = await client.loadTabRows(tab.title);
      const list = parseFichas(rows);
      setCache((c) => ({ ...c, [tab.title]: list }));
      return list;
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); setQuery(''); safeWrite('marbot.tab', active); }, [active, tab?.sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    if (tab?.isIngredients || tab?.isParams) await loadCatalog(true).catch((e) => onError(e.message));
    else await load(true);
  }

  async function removeFicha(f) {
    await client.deleteFicha(tab.title, tab.sheetId, f);
    // a mesma receita sai do Notion (vai para a lixeira de lá); se falhar, a planilha já foi apagada e só avisa
    if (notionOn) {
      try {
        await deleteRecipeFromNotion(settings, tab.title, f.name);
      } catch (e) {
        onError(`"${f.name}" foi apagada da planilha, mas não consegui apagar no Notion: ${e.message}`);
      }
    }
    setOpen((s) => { const n = new Set(s); n.delete(`${active}:${f.row}`); return n; });
    await load(true);
  }

  async function editFicha(f, data) {
    const { method, ...sheetData } = data;
    const res = await client.rewriteFicha(tab.title, tab.sheetId, f, sheetData, settings.formulaSyntax);
    if (res.syntax !== settings.formulaSyntax) onSyntax?.(res.syntax);
    const list = await load(true);
    // a mesma receita é atualizada no Notion (custos recalculados pela planilha + modo de preparo)
    if (notionOn) {
      const fresh = (list || []).find((x) => x.row === f.row) || f;
      try {
        await updateRecipeInNotion(settings, f.name, {
          name: data.name,
          tab: tab.title,
          yieldUnits: data.yieldUnits,
          ingredients: data.ingredients,
          packaging: data.packaging,
          method,
          totals: fresh.totals,
          sheetUrl: sheetUrl ? sheetUrl(tab.sheetId, f.row) : '',
        });
      } catch (e) {
        onError(`A ficha foi salva na planilha, mas não consegui atualizar o Notion: ${e.message}`);
      }
    }
  }

  if (!catalog) {
    return <section className="panel browser-empty"><span className="spinner" aria-hidden="true" /> Lendo a planilha…</section>;
  }

  const fichas = cache[active] || [];
  const filtered = query ? fichas.filter((f) => norm(f.name).includes(norm(query))) : fichas;
  const toggle = (key) => setOpen((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="browser">
      <TabCarousel tabs={tabs} active={active} onPick={setActive} label="Abas da planilha" />

      <div className="browser-bar">
        <div>
          <h1 className="display browser-title">{pretty(active || '')}</h1>
          <p className="muted small">
            {tab?.isParams ? 'Margem, taxa do cartão, perda e custo fixo' : tab?.isIngredients
              ? `${catalog.ingredients.length} ingredientes · ${catalog.packaging.length} embalagens`
              : loading && !cache[active] ? 'Carregando receitas…' : `${fichas.length} ${fichas.length === 1 ? 'receita' : 'receitas'}`}
          </p>
        </div>
        <div className="browser-tools">
          {!tab?.isParams && <label className="search">
            <span className="sr-only">Buscar</span>
            <input type="search" placeholder={tab?.isIngredients ? 'Buscar ingrediente' : 'Buscar receita'} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>}
          <button className="btn small ghost" onClick={refresh} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
          {sheetUrl && tab && (
            <a className="btn small ghost" href={sheetUrl(tab.sheetId)} target="_blank" rel="noreferrer"><IconExternal width={16} height={16} /> Abrir aba</a>
          )}
          {tab && !tab.isIngredients && !tab.isParams && (
            <button className="btn small primary" onClick={() => onNewInTab(tab.title)} disabled={readOnly}><IconPlus width={16} height={16} /> Nova receita aqui</button>
          )}
        </div>
      </div>

      {tab?.isParams ? (
        <ParamsView params={catalog.params} tabs={catalog.tabs} client={client} reload={() => loadCatalog(true)} onError={onError} readOnly={readOnly} />
      ) : tab?.isIngredients ? (
        <IngredientsView catalog={catalog} query={query} client={client} settings={settings} reload={() => loadCatalog(true)} onError={onError} readOnly={readOnly} />
      ) : (
        <ul className="fichas">
          {filtered.map((f) => {
            const key = `${active}:${f.row}`;
            const isOpen = open.has(key);
            return (
              <li key={key} className={`ficha ${isOpen ? 'open' : ''}`}>
                <button className="ficha-head" aria-expanded={isOpen} onClick={() => toggle(key)}>
                  <span className="ficha-name">{f.name}</span>
                  {f.hasErrors && <span className="tag bad">com erro</span>}
                  <span className="ficha-price">{f.totals.unitPrice != null ? <>{money(f.totals.unitPrice)}<small>/un.</small></> : null}</span>
                  <span className="ficha-toggle" aria-hidden="true" />
                </button>
                {isOpen && <FichaBody f={f} tab={tab.title} notionOn={notionOn} settings={settings} sheetUrl={sheetUrl} sheetId={tab.sheetId} catalog={catalog} readOnly={readOnly} onDelete={() => removeFicha(f)} onSave={(data) => editFicha(f, data)} />}
              </li>
            );
          })}
          {!loading && cache[active] && filtered.length === 0 && (
            <li className="browser-empty muted">
              {query ? 'Nenhuma receita com esse nome nesta aba.' : 'Esta aba ainda não tem receitas. Use “Nova receita aqui” para cadastrar a primeira.'}
            </li>
          )}
          {loading && !cache[active] && <li className="browser-empty"><span className="spinner" aria-hidden="true" /> Carregando receitas…</li>}
        </ul>
      )}
    </div>
  );
}

function FichaBody({ f, tab, sheetUrl, sheetId, catalog, onDelete, onSave, readOnly, notionOn, settings }) {
  const t = f.totals;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const unitOf = (name) => {
    const u = catalog.ingredients.find((i) => i.name === name)?.unit || 'g';
    return /^un/i.test(u) ? 'un.' : u;
  };

  async function doDelete() {
    setBusy(true);
    setErr('');
    try {
      await onDelete();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="ficha-body">
        <FichaEditor ficha={f} tab={tab} catalog={catalog} settings={settings} notionOn={notionOn} onCancel={() => setEditing(false)} onSave={async (data) => { await onSave(data); setEditing(false); }} />
      </div>
    );
  }

  return (
    <div className="ficha-body">
      <div className="ficha-cols">
        <div className="ficha-ings">
          <table className="mini-table">
            <thead>
              <tr><th scope="col" className="num">Medida</th><th scope="col">Ingrediente</th><th scope="col" className="num">Custo</th></tr>
            </thead>
            <tbody>
              {f.ingredients.map((l, i) => (l.type === 'section' ? (
                <tr key={i} className="sub"><td colSpan={3}>{l.name}</td></tr>
              ) : l.type === 'note' ? (
                <tr key={i} className="note"><td /><td colSpan={2} className="muted small">{l.name}</td></tr>
              ) : (
                <tr key={i} className={l.price == null ? 'row-bad' : ''}>
                  <td className="num">{l.qty != null ? <>{qtyFmt(l.qty)} <span className="unit">{unitOf(l.name)}</span></> : '—'}</td>
                  <td>{l.name}{l.price == null && <span className="tag bad">sem preço</span>}</td>
                  <td className="num">{money(l.cost)}</td>
                </tr>
              )))}
              {f.packaging.length > 0 && (
                <tr className="sep"><td colSpan={3}>Embalagem</td></tr>
              )}
              {f.packaging.map((l, i) => (l.type !== 'item' ? (
                <tr key={`p${i}`} className="note"><td /><td colSpan={2} className="muted small">{l.name}</td></tr>
              ) : (
                <tr key={`p${i}`}>
                  <td className="num">{l.qty != null ? qtyFmt(l.qty) : '—'}</td>
                  <td>{l.name}</td>
                  <td className="num">{money(l.cost)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <dl className="ficha-sum">
          <div><dt>Custo dos ingredientes</dt><dd>{money(t.ingredients)}</dd></div>
          <div><dt>Embalagens</dt><dd>{money(t.packaging)}</dd></div>
          <div><dt>Custo total</dt><dd>{money(t.total)}</dd></div>
          <div><dt>Rendimento</dt><dd>{t.yieldUnits != null ? `${qtyFmt(t.yieldUnits)} un.` : '—'}</dd></div>
          <div className="big"><dt>Preço por unidade</dt><dd>{money(t.unitPrice)}</dd></div>
          <div><dt>Preço da receita</dt><dd>{money(t.recipePrice)}</dd></div>
          <div className="profit"><dt>Lucro</dt><dd>{money(t.profit)}</dd></div>
        </dl>
      </div>
      {err && <p className="warn-text small" role="alert">{err}</p>}
      <div className="ficha-foot">
        <span className="muted small">Linhas {f.row} a {f.endRow} da planilha</span>
        <div className="ficha-foot-actions">
          {sheetUrl && <a className="btn text" href={sheetUrl(sheetId, f.row)} target="_blank" rel="noreferrer"><IconExternal width={15} height={15} /> Editar na planilha</a>}
          <button className="btn small" onClick={() => setEditing(true)} disabled={readOnly}><IconPencil width={15} height={15} /> Editar receita</button>
          {confirm ? (
            <span className="confirm-del" role="group" aria-label="Confirmar exclusão">
              <span className="small">Excluir “{f.name}” da planilha{notionOn ? ' e do Notion' : ''}?</span>
              <button className="btn small ghost" onClick={() => setConfirm(false)} disabled={busy}>Cancelar</button>
              <button className="btn small danger" onClick={doDelete} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</button>
            </span>
          ) : (
            <button className="icon-btn trash" aria-label={`Excluir ${f.name} da planilha`} title="Excluir receita da planilha" onClick={() => setConfirm(true)} disabled={readOnly}>
              <IconTrash width={17} height={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY = { name: '', pack: '', unit: 'g', price: '' };

function IngredientsView({ catalog, query, client, settings, reload, onError, readOnly }) {
  const q = norm(query);
  const [order, setOrder] = useState(() => safeRead('marbot.ingOrder') || 'added');
  const [shut, setShut] = useState(() => new Set(JSON.parse(safeRead('marbot.ingShut') || '[]')));
  const sorter = order === 'az' ? (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) : (a, b) => a.row - b.row;
  const ings = catalog.ingredients.filter((i) => !q || norm(i.name).includes(q)).sort(sorter);
  const packs = catalog.packaging.filter((i) => !q || norm(i.name).includes(q)).sort(sorter);
  const pickOrder = (o) => { setOrder(o); safeWrite('marbot.ingOrder', o); };
  const toggleShut = (k) => setShut((st) => { const n = new Set(st); n.has(k) ? n.delete(k) : n.add(k); safeWrite('marbot.ingShut', JSON.stringify([...n])); return n; });
  const [editing, setEditing] = useState(null); // linha em edição, ou 'new'
  const [form, setForm] = useState(EMPTY);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);

  const startEdit = (i) => { setEditing(i.row); setForm({ name: i.name, pack: String(i.pack), unit: i.unit || 'g', price: String(i.price).replace('.', ',') }); setRemoving(null); };
  const valid = form.name.trim() && toNum(form.pack) > 0 && toNum(form.price) > 0;
  const dup = (name, row) => catalog.ingredients.some((i) => i.row !== row && norm(i.name) === norm(name));

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => {
    const x = { name: form.name.trim(), pack: toNum(form.pack), unit: form.unit, price: toNum(form.price) };
    if (editing === 'new') await client.addIngredients([x], catalog.nextIngredientRow);
    else await client.updateIngredient(editing, catalog.ingredients.find((i) => i.row === editing).name, x);
    setEditing(null);
  });

  const remove = (i) => run(async () => { await client.removeIngredient(i.row, i.name); setRemoving(null); });

  async function applyProposal() {
    await run(async () => {
      const ch = proposal.changes;
      for (const c of ch.filter((c) => c.action === 'edit')) await client.updateIngredient(c.row, c.from.name, c.to);
      for (const c of ch.filter((c) => c.action === 'remove').sort((a, b) => b.row - a.row)) await client.removeIngredient(c.row, c.from.name);
      const adds = ch.filter((c) => c.action === 'add').map((c) => c.to);
      if (adds.length) await client.addIngredients(adds, (await client.loadCatalog()).nextIngredientRow);
      setProposal(null);
    });
  }

  const editRow = (key) => (
    <tr key={key} className="row-edit">
      <td><input aria-label="Nome do ingrediente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></td>
      <td className="num">
        <span className="pack-edit">
          <input aria-label="Peso ou quantidade do pacote" inputMode="decimal" value={form.pack} onChange={(e) => setForm({ ...form, pack: e.target.value })} placeholder="500" />
          <select aria-label="Medida" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="g">g</option><option value="ml">ml</option><option value="un.">un.</option>
          </select>
        </span>
      </td>
      <td className="num"><input aria-label="Preço do pacote" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="29,90" /></td>
      <td className="num row-tools">
        <button className="icon-btn" aria-label="Cancelar" onClick={() => setEditing(null)} disabled={busy}><IconX width={16} height={16} /></button>
        <button className="icon-btn ok" aria-label="Salvar" onClick={save} disabled={busy || !valid || dup(form.name, editing)}><IconCheck width={16} height={16} /></button>
      </td>
    </tr>
  );

  const renamed = editing && editing !== 'new' && form.name.trim() && catalog.ingredients.find((i) => i.row === editing)?.name !== form.name.trim();

  return (
    <div className="ing-view">
      <div className="ing-toolbar">
        <span className="muted small">Ordem:</span>
        <div className="segmented mini" role="radiogroup" aria-label="Ordem da lista">
          <button role="radio" aria-checked={order === 'added'} className={order === 'added' ? 'on' : ''} onClick={() => pickOrder('added')}>Ordem de adição</button>
          <button role="radio" aria-checked={order === 'az'} className={order === 'az' ? 'on' : ''} onClick={() => pickOrder('az')}>A → Z</button>
        </div>
      </div>

      {!readOnly && <section className="panel">
        <ChatBox
          title="Editar ingredientes com a IA"
          placeholder="Ex.: o leite condensado subiu para R$ 8,49 · cadastre Nutella 650 g por R$ 45,90"
          suggestions={['O leite condensado agora custa R$ 8,49', 'Cadastre pasta de pistache 200 g por R$ 79,90', 'Remova o ingrediente duplicado']}
          onSend={async (message) => {
            const r = await catalogChat({ settings, catalog: catalog.ingredients, message });
            setProposal(r.changes.length ? r : null);
            return r.changes.length ? `${r.text} Confira abaixo e clique em “Aplicar”.` : (r.text || 'Não encontrei nenhuma mudança para fazer. Tente explicar de outro jeito.');
          }}
        />
        {proposal && (
          <div className="proposal">
            <ul>
              {proposal.changes.map((c, k) => (
                <li key={k} className={`chg ${c.action}`}>
                  {c.action === 'add' && <>Cadastrar <strong>{c.to.name}</strong> · {qtyFmt(c.to.pack)} {c.to.unit} · {money(c.to.price)}</>}
                  {c.action === 'remove' && <>Remover <strong>{c.from.name}</strong></>}
                  {c.action === 'edit' && <>Mudar <strong>{c.from.name}</strong>: {describeEdit(c.from, c.to)}</>}
                </li>
              ))}
            </ul>
            <div className="inline">
              <button className="btn small ghost" onClick={() => setProposal(null)} disabled={busy}>Descartar</button>
              <button className="btn small primary" onClick={applyProposal} disabled={busy}>{busy ? 'Aplicando…' : 'Aplicar na planilha'}</button>
            </div>
          </div>
        )}
      </section>}

      <section className="panel">
        <div className="section-head">
          <button className="collapse-head" aria-expanded={!shut.has('ing')} onClick={() => toggleShut('ing')}>
            <Caret open={!shut.has('ing')} /> <h2 className="section-title">Ingredientes</h2> <span className="muted small">{ings.length}</span>
          </button>
          {!shut.has('ing') && <button className="btn small" onClick={() => { setEditing('new'); setForm(EMPTY); setRemoving(null); }} disabled={busy || editing === 'new' || readOnly}><IconPlus width={16} height={16} /> Adicionar ingrediente</button>}
        </div>
        {!shut.has('ing') && (<>
        <div className="table-wrap">
          <table className="mini-table wide ing-edit">
            <thead>
              <tr><th scope="col">Ingrediente</th><th scope="col" className="num">Pacote</th><th scope="col" className="num">Preço</th><th scope="col" className="num">Preço por g / un.</th></tr>
            </thead>
            <tbody>
              {editing === 'new' && editRow('new')}
              {ings.map((i) => (editing === i.row ? editRow(i.row) : (
                <tr key={i.row} className={removing === i.row ? 'row-bad' : ''}>
                  <td>{i.name}</td>
                  <td className="num">{qtyFmt(i.pack)} {i.unit || 'g'}</td>
                  <td className="num">{money(i.price)}</td>
                  <td className="num muted row-tools">
                    {removing === i.row ? (
                      <span className="confirm-del">
                        <span className="small">Remover?</span>
                        <button className="btn small ghost" onClick={() => setRemoving(null)} disabled={busy}>Não</button>
                        <button className="btn small danger" onClick={() => remove(i)} disabled={busy}>{busy ? '…' : 'Remover'}</button>
                      </span>
                    ) : (<>
                      <span>{i.pack ? perUnit(i.price / i.pack) : '—'}</span>
                      {!readOnly && <button className="icon-btn" aria-label={`Editar ${i.name}`} onClick={() => startEdit(i)} disabled={busy}><IconPencil width={15} height={15} /></button>}
                      {!readOnly && <button className="icon-btn trash" aria-label={`Remover ${i.name}`} onClick={() => { setRemoving(i.row); setEditing(null); }} disabled={busy}><IconTrash width={15} height={15} /></button>}
                    </>)}
                  </td>
                </tr>
              )))}
              {ings.length === 0 && editing !== 'new' && <tr><td colSpan={4} className="muted">Nenhum ingrediente encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
        {editing && dup(form.name, editing) && <p className="warn-text small">Já existe um ingrediente com esse nome.</p>}
        {renamed && <p className="warn-text small"><IconAlert width={14} height={14} /> As fichas que usam o nome antigo ficam sem preço até você trocar o nome nelas também.</p>}
        {removing && <p className="warn-text small"><IconAlert width={14} height={14} /> As fichas que usam esse ingrediente vão ficar sem preço nessa linha.</p>}
        </>)}
      </section>

      <section className="panel">
        <div className="section-head">
          <button className="collapse-head" aria-expanded={!shut.has('pack')} onClick={() => toggleShut('pack')}>
            <Caret open={!shut.has('pack')} /> <h2 className="section-title">Embalagens</h2> <span className="muted small">{packs.length}</span>
          </button>
        </div>
        {!shut.has('pack') && <div className="table-wrap"><table className="mini-table wide">
          <thead>
            <tr><th scope="col">Produto</th><th scope="col" className="num">Qt.</th><th scope="col" className="num">Preço</th></tr>
          </thead>
          <tbody>
            {packs.map((p, k) => (
              <tr key={k}><td>{p.name}</td><td className="num">{qtyFmt(p.qty)}</td><td className="num">{money(p.price)}</td></tr>
            ))}
            {packs.length === 0 && <tr><td colSpan={3} className="muted">Nenhuma embalagem encontrada.</td></tr>}
          </tbody>
        </table></div>}
      </section>
      <p className="muted small"><IconAlert width={14} height={14} /> As fichas usam os preços da aba INGREDIENTES e se atualizam sozinhas quando um preço muda.</p>
    </div>
  );
}

function describeEdit(a, b) {
  const parts = [];
  if (a.name !== b.name) parts.push(`nome para “${b.name}”`);
  if (Number(a.pack) !== Number(b.pack) || (a.unit || 'g') !== b.unit) parts.push(`pacote ${qtyFmt(a.pack)} ${a.unit || 'g'} → ${qtyFmt(b.pack)} ${b.unit}`);
  if (Number(a.price) !== Number(b.price)) parts.push(`preço ${money(a.price)} → ${money(b.price)}`);
  return parts.join(' · ') || 'sem mudança';
}

const perUnit = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v || 0);
const pretty = (t) => t.charAt(0) + t.slice(1).toLowerCase();
function safeRead(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeWrite(k, v) { try { if (v) localStorage.setItem(k, v); } catch { /* ignore */ } }
