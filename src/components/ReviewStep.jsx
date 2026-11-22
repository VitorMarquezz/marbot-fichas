import { draftChat } from '../lib/chat.js';
import { computeCosts, money, pctFmt, qtyFmt } from '../lib/costs.js';
import { isUnitBased } from '../lib/match.js';
import ChatBox from './ChatBox.jsx';
import Combo from './Combo.jsx';
import { IconArrowLeft, IconPlus, IconTrash } from './Icons.jsx';

export default function ReviewStep({ draft, setDraft, catalog, onBack, onPublish, settings, notionReady, onOpenSettings, readOnly }) {
  const packaging = draft.packaging || [];
  const c = computeCosts(draft.ingredients, catalog.ingredients, draft.yieldUnits, { params: catalog.params, tab: draft.tab.title, packaging, packCatalog: catalog.packaging });
  const setPack = (i, patch) => setDraft({ ...draft, packaging: packaging.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setIng = (i, patch) =>
    setDraft({ ...draft, ingredients: draft.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const names = catalog.ingredients.map((x) => x.name);
  // partes da receita (massa, recheios…): cada uma vira um subtítulo na ficha
  const hasParts = draft.ingredients.some((x) => x.section?.trim());
  const sec = (x) => x?.section || '';
  const renamePart = (old, name) => setDraft({ ...draft, ingredients: draft.ingredients.map((x) => (sec(x) === old ? { ...x, section: name } : x)) });
  const addToPart = (part) => {
    const last = draft.ingredients.map(sec).lastIndexOf(part);
    const list = [...draft.ingredients];
    list.splice(last + 1, 0, { qty: 0, name: '', newIng: null, section: part });
    setDraft({ ...draft, ingredients: list });
  };
  const addPart = () => {
    const base = hasParts ? draft.ingredients : draft.ingredients.map((x) => ({ ...x, section: 'Parte 1' }));
    const n = new Set(base.map(sec)).size + 1;
    setDraft({ ...draft, ingredients: [...base, { qty: 0, name: '', newIng: null, section: `Parte ${n}` }] });
  };
  const problems = c.lines.filter((l) => !l.name || (!l.found && !l.newIng));
  const badPack = c.packLines.filter((l) => !l.name || !l.found);
  const canPublish = draft.name.trim() && draft.yieldUnits > 0 && draft.ingredients.length > 0 && problems.length === 0 && badPack.length === 0 && !readOnly;

  return (
    <div className="review">
      <section className="panel review-main" aria-labelledby="review-title">
        <label className="title-edit">
          <span className="sr-only">Nome da receita</span>
          <input id="review-title" className="display" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <p className="muted dest">
          Vai para a aba <strong>{draft.tab.title}</strong>{draft.tab.isNew ? ' (nova, criada a partir da BISCOITOS)' : ''}, duas linhas abaixo da última receita.
        </p>

        <div className="table-wrap">
          <table className="ing-table">
            <thead>
              <tr>
                <th scope="col" className="num">Medidas</th>
                <th scope="col">Ingrediente</th>
                <th scope="col" className="num">Pacote</th>
                <th scope="col" className="num">Custo na receita</th>
                <th scope="col"><span className="sr-only">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {c.lines.map((l, i) => {
                const head = hasParts && (i === 0 || sec(l) !== sec(c.lines[i - 1])) && (
                  <tr key={`p${i}`} className="part-row">
                    <td colSpan={3}>
                      <input aria-label="Nome da parte da receita" placeholder="Nome da parte (ex.: Massa, Recheio)" value={sec(l)} onChange={(e) => renamePart(sec(l), e.target.value)} />
                    </td>
                    <td className="num muted small">{money(c.lines.filter((x) => sec(x) === sec(l)).reduce((a, x) => a + x.cost, 0))}</td>
                    <td>
                      <button className="icon-btn" aria-label={`Adicionar ingrediente em ${sec(l) || 'esta parte'}`} title="Adicionar ingrediente nesta parte" onClick={() => addToPart(sec(l))}>
                        <IconPlus width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                );
                const item = catalog.ingredients.find((x) => x.name === l.name);
                const unit = l.newIng ? l.newIng.unit : isUnitBased(item) ? 'un.' : item?.unit || 'g';
                const bad = !l.found && !l.newIng;
                return [head, (
                  <tr key={i} className={bad ? 'row-bad' : ''}>
                    <td className="num">
                      <div className="qty">
                        <input
                          aria-label={`Quantidade de ${l.name || 'ingrediente'}`}
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => setIng(i, { qty: e.target.value.replace(',', '.') })}
                        />
                        <span>{unit}</span>
                      </div>
                    </td>
                    <td>
                      <Combo
                        className="ing-name"
                        aria-label="Ingrediente"
                        value={l.name}
                        options={names}
                        onChange={(v) => setIng(i, { name: v, newIng: null })}
                      />
                      {l.newIng && <span className="tag new">novo cadastro</span>}
                      {bad && <span className="tag bad">sem preço na planilha</span>}
                      {l.original && <span className="orig">{l.original}</span>}
                      {l.note && (
                        <label className="conv-note" title="Vai como observação na ficha, logo abaixo do ingrediente">
                          <span>obs.</span>
                          <textarea rows={1} ref={growToFit} aria-label={`Observação de ${l.name || 'ingrediente'}`} value={l.note} onChange={(e) => setIng(i, { note: e.target.value.replace(/\n/g, ' ') })} />
                        </label>
                      )}
                    </td>
                    <td className="num muted">{l.found ? `${qtyFmt(l.pack)} ${unit} · ${money(l.price)}` : '—'}</td>
                    <td className="num strong">{l.found ? money(l.cost) : '—'}</td>
                    <td>
                      <button className="icon-btn" aria-label={`Remover ${l.name}`} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== i) })}>
                        <IconTrash width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                )];
              })}
            </tbody>
          </table>
        </div>
        <div className="add-rows">
          <button className="btn text add-row" onClick={() => addToPart(sec(draft.ingredients[draft.ingredients.length - 1]))}>
            <IconPlus width={16} height={16} /> Adicionar ingrediente
          </button>
          <button className="btn text add-row" onClick={addPart} title="Ex.: a massa e cada recheio separados">
            <IconPlus width={16} height={16} /> Adicionar parte da receita
          </button>
        </div>
        <h3 className="section-title pack-title">Embalagens</h3>
        {packaging.length > 0 && (
          <div className="table-wrap">
            <table className="ing-table">
              <thead>
                <tr><th scope="col" className="num">Qt.</th><th scope="col">Embalagem</th><th scope="col" className="num">Custo</th><th scope="col"><span className="sr-only">Remover</span></th></tr>
              </thead>
              <tbody>
                {c.packLines.map((l, i) => (
                  <tr key={i} className={l.name && !l.found ? 'row-bad' : ''}>
                    <td className="num"><div className="qty"><input aria-label="Quantidade" inputMode="decimal" value={l.qty} onChange={(e) => setPack(i, { qty: e.target.value.replace(',', '.') })} /><span>un.</span></div></td>
                    <td><Combo className="ing-name" aria-label="Embalagem" value={l.name} options={catalog.packaging.map((p) => p.name)} onChange={(v) => setPack(i, { name: v })} /></td>
                    <td className="num strong">{l.found ? money(l.cost) : '—'}</td>
                    <td><button className="icon-btn" aria-label={`Remover ${l.name || 'embalagem'}`} onClick={() => setDraft({ ...draft, packaging: packaging.filter((_, j) => j !== i) })}><IconTrash width={16} height={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="btn text add-row" onClick={() => setDraft({ ...draft, packaging: [...packaging, { qty: draft.yieldUnits || 1, name: '' }] })}>
          <IconPlus width={16} height={16} /> Adicionar embalagem
        </button>
        {packaging.length === 0 && <p className="muted small">Sem embalagens: a ficha fica com 3 linhas em branco para escolher depois.</p>}

        <ChatBox
          compact
          title="Ajustar ingredientes com a IA"
          placeholder="Ex.: troque a manteiga por 200 g de Nata · dobre a receita · tire o cacau"
          suggestions={['Dobre a receita', 'Tire o ingrediente mais caro', 'Use 300 g de chocolate em vez de 200 g']}
          onSend={async (message) => {
            const r = await draftChat({ settings, draft, catalog: catalog.ingredients, message });
            if (!r.ingredients.length) throw new Error('A IA não devolveu nenhum ingrediente. Tente explicar de outro jeito.');
            setDraft({ ...draft, ingredients: r.ingredients });
            return r.text;
          }}
        />

        <NotionCard draft={draft} setDraft={setDraft} notionReady={notionReady} onOpenSettings={onOpenSettings} />
      </section>

      <aside className="tag-card" aria-label="Prévia dos preços">
        <div className="tag-hole" aria-hidden="true" />
        <p className="tag-kicker">Preço de venda por unidade</p>
        <p className="tag-price">{money(c.sale)}</p>
        <label className="yield">
          <span>Rendimento</span>
          <span className="yield-input">
            <input inputMode="numeric" value={draft.yieldUnits || ''} onChange={(e) => setDraft({ ...draft, yieldUnits: Number(e.target.value.replace(/\D/g, '')) })} />
            unidades
          </span>
        </label>
        <dl className="tally">
          <div><dt>Ingredientes</dt><dd>{money(c.ingCost)}</dd></div>
          <div><dt>Perda {pctFmt(c.lossPct)}</dt><dd>{money(c.loss)}</dd></div>
          <div><dt>Custo fixo ({money(c.fixedPer)}/un.)</dt><dd>{money(c.fixed)}</dd></div>
          <div><dt>Embalagens</dt><dd>{money(c.packaging)}</dd></div>
          <div className="sum"><dt>Custo total</dt><dd>{money(c.total)}</dd></div>
          <div><dt>Custo por unidade</dt><dd>{money(c.unit)}</dd></div>
          <div className="sum"><dt>Preço da receita</dt><dd>{money(c.recipe)}</dd></div>
          {c.card > 0 && <div><dt>Taxa do cartão</dt><dd>{money(c.cardFee)}</dd></div>}
          <div className="profit"><dt>Lucro da receita</dt><dd>{money(c.profit)}</dd></div>
        </dl>
        {draft.yieldNote && <p className="tag-note">{draft.yieldNote}</p>}
        <p className="tag-note">Margem de {pctFmt(c.margin)} sobre o preço de venda{c.card ? ` e taxa do cartão de ${pctFmt(c.card)}` : ''}, como na aba PARÂMETROS.</p>
      </aside>

      <footer className="actions review-actions">
        <button className="btn ghost" onClick={onBack}><IconArrowLeft /> Voltar às perguntas</button>
        <div className="actions-right">
          {problems.length > 0 && <span className="warn-text">Escolha um ingrediente cadastrado em {problems.length === 1 ? '1 linha' : `${problems.length} linhas`}.</span>}
          {badPack.length > 0 && <span className="warn-text">Escolha uma embalagem cadastrada ou remova a linha.</span>}
          {readOnly && <span className="warn-text">Sem internet: não dá para gravar agora.</span>}
          <button className="btn primary" disabled={!canPublish} onClick={onPublish}>{draft.saveNotion && notionReady ? 'Gravar na planilha e no Notion' : 'Gravar na planilha'}</button>
        </div>
      </footer>
    </div>
  );
}

/** Mostra se a receita veio com modo de preparo e se vai para o Notion. */
/** A caixa da observação cresce até mostrar o texto todo. */
function growToFit(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function NotionCard({ draft, setDraft, notionReady, onOpenSettings }) {
  const steps = draft.method || [];
  return (
    <div className={`notion-card ${draft.hasMethod ? 'has' : ''}`}>
      <p className="notion-head">
        <strong>{draft.hasMethod ? `Modo de preparo encontrado · ${steps.length} ${steps.length === 1 ? 'passo' : 'passos'}` : 'Só ingredientes'}</strong>
        <span className="muted small">
          {draft.hasMethod
            ? 'Na planilha entram só os ingredientes. A receita completa pode ir para o Notion.'
            : 'A receita não tem modo de preparo; na planilha entram os ingredientes.'}
        </span>
      </p>
      {draft.hasMethod && (
        <details className="method">
          <summary>Ver modo de preparo</summary>
          <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </details>
      )}
      {notionReady ? (
        <label className="toggle">
          <input type="checkbox" checked={!!draft.saveNotion} onChange={(e) => setDraft({ ...draft, saveNotion: e.target.checked })} />
          <span>Salvar ingredientes{draft.hasMethod ? ' e modo de preparo' : ''} no Notion</span>
        </label>
      ) : (
        draft.hasMethod && <p className="small muted">Para salvar no Notion, <button className="btn text" onClick={onOpenSettings}>conecte o Notion nas configurações</button>.</p>
      )}
    </div>
  );
}
