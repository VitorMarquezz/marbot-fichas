import { useEffect, useState } from 'react';
import { computeCosts, money, pctFmt } from '../lib/costs.js';
import { toNum } from '../lib/flow.js';
import { getRecipeMethod } from '../lib/notion.js';
import Combo from './Combo.jsx';
import { IconPlus, IconTrash } from './Icons.jsx';

const toRow = (l) => ({ type: l.type || 'item', qty: l.qty ?? '', name: l.name });

/** Edição de uma ficha já gravada: nome, rendimento, ingredientes (com subtítulos) e embalagens. */
export default function FichaEditor({ ficha, tab, catalog, onCancel, onSave, settings, notionOn }) {
  const ingOptions = [...new Set(catalog.ingredients.map((i) => i.name))];
  const packOptions = [...new Set(catalog.packaging.map((p) => p.name))];
  const ingNames = new Set(ingOptions);
  const packNames = new Set(catalog.packaging.map((i) => i.name));

  // fichas antigas sem a linha "Embalagem": as embalagens aparecem misturadas aos ingredientes
  const [initIngs, initPacks] = (() => {
    const ing = ficha.ingredients.map(toRow);
    const pack = ficha.packaging.map(toRow);
    if (pack.length) return [ing, pack];
    const isPack = (x) => x.type === 'item' && packNames.has(x.name) && !ingNames.has(x.name);
    return [ing.filter((x) => !isPack(x)), ing.filter(isPack)];
  })();

  const [name, setName] = useState(ficha.name);
  const [yieldUnits, setYield] = useState(String(ficha.totals.yieldUnits ?? ''));
  const [ings, setIngs] = useState(initIngs);
  const [packs, setPacks] = useState(initPacks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // modo de preparo: fica só no Notion (a planilha guarda os ingredientes)
  const [method, setMethod] = useState('');
  const [methodState, setMethodState] = useState(notionOn ? 'loading' : 'off'); // loading | ready | new | error | off

  useEffect(() => {
    if (!notionOn) return;
    let alive = true;
    getRecipeMethod(settings, tab, ficha.name)
      .then((steps) => { if (!alive) return; setMethod((steps || []).join('\n')); setMethodState(steps ? 'ready' : 'new'); })
      .catch(() => { if (alive) setMethodState('error'); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = (list) => list.filter((x) => x.type === 'item' && x.name.trim()).map((x) => ({ qty: toNum(x.qty), name: x.name.trim() }));
  const clean = (list) => list
    .filter((x) => x.name.trim())
    .map((x) => (x.type === 'item' ? { type: 'item', qty: toNum(x.qty), name: x.name.trim() } : { type: x.type, name: x.name.trim() }));
  const y = Math.round(toNum(yieldUnits));
  const c = computeCosts(items(ings), catalog.ingredients, y, { params: catalog.params, tab, packaging: items(packs), packCatalog: catalog.packaging });

  const badIng = ings.filter((x) => x.type === 'item' && x.name.trim() && !ingNames.has(x.name.trim())).length;
  const badPack = packs.filter((x) => x.type === 'item' && x.name.trim() && !packNames.has(x.name.trim())).length;
  const valid = name.trim() && y > 0 && items(ings).length > 0 && !badIng && !badPack;

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const steps = method.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
      await onSave({ name: name.trim(), yieldUnits: y, ingredients: clean(ings), packaging: clean(packs), method: ['ready', 'new'].includes(methodState) ? steps : undefined });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const rowsFor = (list, setList, names, kind) => list.map((x, i) => {
    const set = (patch) => setList(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const del = <td><button className="icon-btn trash" aria-label="Remover linha" onClick={() => setList(list.filter((_, j) => j !== i))}><IconTrash width={15} height={15} /></button></td>;
    if (x.type === 'section') {
      return (
        <tr key={i} className="fe-section">
          <td colSpan={2}><input aria-label="Subtítulo" placeholder="Subtítulo (ex.: Massa, Recheio, Cobertura)" value={x.name} onChange={(e) => set({ name: e.target.value })} /></td>
          {del}
        </tr>
      );
    }
    if (x.type === 'note') {
      return (
        <tr key={i} className="fe-note">
          <td className="num muted small">obs.</td>
          <td><input aria-label="Observação" value={x.name} onChange={(e) => set({ name: e.target.value })} /></td>
          {del}
        </tr>
      );
    }
    const bad = x.name.trim() && !names.has(x.name.trim());
    return (
      <tr key={i} className={bad ? 'row-bad' : ''}>
        <td className="num"><input className="qty-in" aria-label="Medida" inputMode="decimal" value={x.qty} onChange={(e) => set({ qty: e.target.value })} /></td>
        <td>
          <Combo className="ing-name" aria-label={kind === 'ing' ? 'Ingrediente' : 'Embalagem'} value={x.name} options={kind === 'ing' ? ingOptions : packOptions} onChange={(v) => set({ name: v })} />
          {bad && <span className="tag bad">não cadastrado</span>}
        </td>
        {del}
      </tr>
    );
  });

  return (
    <div className="ficha-editor">
      <div className="fe-head">
        <label className="field fe-name"><span>Nome da receita</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field fe-yield"><span>Rendimento (unidades)</span><input inputMode="numeric" value={yieldUnits} onChange={(e) => setYield(e.target.value)} /></label>
      </div>

      <div className="fe-cols">
        <div>
          <table className="mini-table fe-table">
            <thead><tr><th scope="col" className="num">Medida</th><th scope="col">Ingrediente</th><th scope="col"><span className="sr-only">Remover</span></th></tr></thead>
            <tbody>{rowsFor(ings, setIngs, ingNames, 'ing')}</tbody>
          </table>
          <div className="fe-add">
            <button className="btn text add-row" onClick={() => setIngs([...ings, { type: 'item', qty: '', name: '' }])}><IconPlus width={15} height={15} /> Adicionar ingrediente</button>
            <button className="btn text add-row" onClick={() => setIngs([...ings, { type: 'section', name: '' }])}><IconPlus width={15} height={15} /> Adicionar subtítulo</button>
          </div>

          <table className="mini-table fe-table">
            <thead><tr><th scope="col" className="num">Qt.</th><th scope="col">Embalagem</th><th scope="col"><span className="sr-only">Remover</span></th></tr></thead>
            <tbody>{rowsFor(packs, setPacks, packNames, 'pack')}</tbody>
          </table>
          <button className="btn text add-row" onClick={() => setPacks([...packs, { type: 'item', qty: y || '', name: '' }])}><IconPlus width={15} height={15} /> Adicionar embalagem</button>

        </div>

        <dl className="ficha-sum">
          <div><dt>Custo dos ingredientes</dt><dd>{money(c.ingCost)}</dd></div>
          <div><dt>Embalagens</dt><dd>{money(c.packaging)}</dd></div>
          <div><dt>Custo total</dt><dd>{money(c.total)}</dd></div>
          <div className="big"><dt>Preço por unidade</dt><dd>{money(c.sale)}</dd></div>
          <div><dt>Preço da receita</dt><dd>{money(c.recipe)}</dd></div>
          <div className="profit"><dt>Lucro</dt><dd>{money(c.profit)}</dd></div>
          <div><dt className="small">Prévia com margem de {pctFmt(c.margin)}; a planilha confere ao gravar.</dt></div>
        </dl>
      </div>

      {notionOn && (
        <label className="field fe-method">
          <span>Modo de preparo <small className="muted">· um passo por linha · fica salvo no Notion</small></span>
          <textarea
            rows={6}
            value={method}
            disabled={methodState === 'loading' || methodState === 'error'}
            placeholder={methodState === 'loading' ? 'Carregando do Notion…' : 'Ex.: Leve o leite condensado e a manteiga ao fogo baixo.\nMexa até desgrudar do fundo da panela.\nDeixe esfriar e enrole.'}
            onChange={(e) => setMethod(e.target.value)}
          />
          {methodState === 'new' && <small>Esta receita ainda não está no Notion: ela será criada lá ao salvar.</small>}
          {methodState === 'error' && <small className="warn-text">Não consegui ler o Notion agora; o modo de preparo de lá fica como está.</small>}
        </label>
      )}

      {(badIng > 0 || badPack > 0) && <p className="warn-text small">Use nomes cadastrados na aba Ingredientes (a lista aparece ao digitar).</p>}
      {err && <p className="warn-text small" role="alert">{err}</p>}
      <div className="fe-actions">
        <button className="btn small ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn small primary" onClick={save} disabled={busy || !valid}>{busy ? 'Gravando…' : 'Salvar na planilha'}</button>
      </div>
    </div>
  );
}
