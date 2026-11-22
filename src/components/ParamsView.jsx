import { useEffect, useState } from 'react';
import { money, pctFmt } from '../lib/costs.js';
import { toNum } from '../lib/flow.js';
import { IconAlert, IconPlus, IconTrash } from './Icons.jsx';

const pctIn = (v) => (v == null ? '' : String(Math.round(v * 1000) / 10).replace('.', ','));
const moneyIn = (v) => (v == null ? '' : String(v.toFixed(2)).replace('.', ','));
const fromPct = (s) => (String(s).trim() === '' ? null : toNum(s) / 100);
const fromMoney = (s) => (String(s).trim() === '' ? null : toNum(s));

/** Aba PARÂMETROS: perda, taxa do cartão, margem e custo fixo — gerais e por aba. */
export default function ParamsView({ params, tabs, client, reload, onError, readOnly }) {
  const toForm = (p) => ({
    loss: pctIn(p.loss), card: pctIn(p.card), margin: pctIn(p.margin), fixed: moneyIn(p.fixed),
    perTab: p.perTab.map((x) => ({ tab: x.tab, fixed: moneyIn(x.fixed), margin: pctIn(x.margin) })),
  });
  const [f, setF] = useState(() => toForm(params));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setF(toForm(params)); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = tabs.filter((t) => !f.perTab.some((x) => x.tab.toLowerCase() === t.title.toLowerCase()));
  const setRow = (i, patch) => setF({ ...f, perTab: f.perTab.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function save() {
    setBusy(true);
    try {
      await client.saveParams({
        loss: fromPct(f.loss) ?? 0,
        card: fromPct(f.card) ?? 0,
        margin: fromPct(f.margin) ?? 0,
        fixed: fromMoney(f.fixed) ?? 0,
        perTab: f.perTab.filter((x) => x.tab.trim()).map((x) => ({ tab: x.tab.trim().toUpperCase(), fixed: fromMoney(x.fixed), margin: fromPct(x.margin) })),
      });
      await reload();
      setEditing(false);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const general = [
    ['loss', 'Perda de ingredientes', '%', 'Sobre o custo dos ingredientes', pctFmt(params.loss)],
    ['card', 'Taxa do cartão', '%', 'Sobre o preço de venda', pctFmt(params.card)],
    ['margin', 'Margem padrão', '%', 'Sobre o preço de venda; vale para abas sem margem própria', pctFmt(params.margin)],
    ['fixed', 'Custo fixo padrão por unidade', 'R$', 'Aluguel, limpeza, energia, água…; vale para abas sem valor próprio', money(params.fixed)],
  ];

  return (
    <div className="params-view">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="section-title">Valores gerais</h2>
            <p className="muted small">Usados por todas as fichas. Mudou aqui, todas as receitas recalculam.</p>
          </div>
          {!editing ? (
            <button className="btn small" onClick={() => setEditing(true)} disabled={readOnly}>Editar parâmetros</button>
          ) : (
            <div className="inline">
              <button className="btn small ghost" onClick={() => { setEditing(false); setF(toForm(params)); }} disabled={busy}>Cancelar</button>
              <button className="btn small primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar na planilha'}</button>
            </div>
          )}
        </div>
        <dl className="params-grid">
          {general.map(([k, label, unit, hint, shown]) => (
            <div key={k} className="param">
              <dt>{label}<small>{hint}</small></dt>
              <dd>
                {editing ? (
                  <span className={`unit-in ${unit === 'R$' ? 'pre' : ''}`}>
                    {unit === 'R$' && <span>R$</span>}
                    <input inputMode="decimal" aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                    {unit === '%' && <span>%</span>}
                  </span>
                ) : shown}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2 className="section-title">Valores por aba</h2>
        <p className="muted small">Deixe em branco para usar o valor padrão.</p>
        <div className="table-wrap">
          <table className="mini-table wide">
            <thead><tr><th scope="col">Aba</th><th scope="col" className="num">Custo fixo por unidade</th><th scope="col" className="num">Margem</th>{editing && <th scope="col"><span className="sr-only">Remover</span></th>}</tr></thead>
            <tbody>
              {(editing ? f.perTab : params.perTab.map((x) => ({ tab: x.tab, fixed: x.fixed, margin: x.margin }))).map((x, i) => (
                <tr key={i}>
                  {editing ? (<>
                    <td><input aria-label="Aba" value={x.tab} onChange={(e) => setRow(i, { tab: e.target.value })} /></td>
                    <td className="num"><span className="unit-in pre"><span>R$</span><input inputMode="decimal" aria-label="Custo fixo" value={x.fixed} placeholder={moneyIn(params.fixed)} onChange={(e) => setRow(i, { fixed: e.target.value })} /></span></td>
                    <td className="num"><span className="unit-in"><input inputMode="decimal" aria-label="Margem" value={x.margin} placeholder={pctIn(params.margin)} onChange={(e) => setRow(i, { margin: e.target.value })} /><span>%</span></span></td>
                    <td><button className="icon-btn trash" aria-label={`Remover ${x.tab}`} onClick={() => setF({ ...f, perTab: f.perTab.filter((_, j) => j !== i) })}><IconTrash width={15} height={15} /></button></td>
                  </>) : (<>
                    <td>{x.tab}</td>
                    <td className="num">{x.fixed == null ? <span className="muted">padrão</span> : money(x.fixed)}</td>
                    <td className="num">{x.margin == null ? <span className="muted">padrão</span> : pctFmt(x.margin)}</td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <div className="chips params-add">
            {missing.map((t) => (
              <button key={t.title} className="chip" onClick={() => setF({ ...f, perTab: [...f.perTab, { tab: t.title, fixed: '', margin: '' }] })}><IconPlus width={13} height={13} /> {t.title}</button>
            ))}
            <button className="chip" onClick={() => setF({ ...f, perTab: [...f.perTab, { tab: '', fixed: '', margin: '' }] })}><IconPlus width={13} height={13} /> Outra aba</button>
          </div>
        )}
        {!editing && missing.length > 0 && <p className="muted small"><IconAlert width={14} height={14} /> Sem linha própria (usam o padrão): {missing.map((t) => t.title).join(', ')}.</p>}
      </section>
      <p className="muted small">Margem diferente só para uma receita: edite a linha Margem da ficha direto na planilha; o app mantém esse valor quando você edita a ficha.</p>
    </div>
  );
}
