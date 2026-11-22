import { useMemo, useState } from 'react';
import { yieldChat } from '../lib/chat.js';
import { NEW, PICK, isAnswered, yieldInfo } from '../lib/flow.js';
import Combo from './Combo.jsx';
import ChatBox from './ChatBox.jsx';
import { IconArrowLeft, IconCheck } from './Icons.jsx';

const PER_PAGE = 4;

/** Perguntas de múltipla escolha, até 4 por vez — igual às opções clicáveis do chat. */
export default function QuestionDeck({ questions, answers, setAnswer, analysis, onBack, onDone, settings, catalog }) {
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < questions.length; i += PER_PAGE) out.push(questions.slice(i, i + PER_PAGE));
    return out;
  }, [questions]);
  const [page, setPage] = useState(0);
  const current = pages[page] || [];
  const pageDone = current.every((q) => isAnswered(q, answers[q.id]));
  const last = page === pages.length - 1;

  return (
    <section className="panel deck" aria-labelledby="deck-title">
      <header className="deck-head">
        <div>
          <h2 id="deck-title" className="display">{analysis.name}</h2>
          <p className="muted">
            {analysis.items.length} ingredientes lidos
            {analysis.items.some((i) => !i.match) ? ` · ${analysis.items.filter((i) => !i.match).length} sem cadastro` : ' · todos cadastrados'}
          </p>
        </div>
        {pages.length > 1 && (
          <p className="deck-count" aria-live="polite">Perguntas {page + 1} de {pages.length}</p>
        )}
      </header>

      {page === 0 && analysis.items.some((it) => it.match && it.note) && (
        <div className="deck-notes" role="note">
          <p>Medidas convertidas para a unidade do cadastro</p>
          <ul>
            {analysis.items.filter((it) => it.match && it.note).map((it, i) => <li key={i}>{it.note}</li>)}
          </ul>
        </div>
      )}

      <div className="questions">
        {current.map((q) => (
          <Question key={q.id} q={q} ans={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} analysis={analysis} settings={settings} catalog={catalog} />
        ))}
      </div>

      <footer className="actions">
        <button className="btn ghost" onClick={() => (page === 0 ? onBack() : setPage(page - 1))}>
          <IconArrowLeft /> Voltar
        </button>
        <button className="btn primary" disabled={!pageDone} onClick={() => (last ? onDone() : setPage(page + 1))}>
          {last ? 'Revisar ficha' : 'Próximas perguntas'}
        </button>
      </footer>
    </section>
  );
}

function Question({ q, ans, onChange, analysis, settings, catalog }) {
  const value = ans?.value;
  const pick = (v) => onChange({ ...(ans || {}), value: v, note: undefined });
  const item = q.kind === 'ingredient' ? analysis.items[q.ingIndex] : null;

  return (
    <fieldset className={`question ${isAnswered(q, ans) ? 'is-done' : ''}`}>
      <legend>
        <span className="q-chip">{q.header}</span>
        <span className="q-title">{q.title}</span>
      </legend>
      {q.hint && <p className="q-hint">{q.hint}</p>}

      <div className="options" role="radiogroup">
        {q.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`option ${value === o.value ? 'selected' : ''} ${o.value === NEW ? 'is-new' : ''}`}
            onClick={() => pick(o.value)}
          >
            <span className="option-dot" aria-hidden="true">{value === o.value && <IconCheck width={12} height={12} />}</span>
            <span className="option-text">
              <span className="option-label">
                {o.label}
                {o.recommended && <em className="rec">sugerido</em>}
              </span>
              {o.description && <span className="option-desc">{o.description}</span>}
            </span>
          </button>
        ))}
        {q.other && (
          <button
            type="button"
            role="radio"
            aria-checked={value === '__other__'}
            className={`option ${value === '__other__' ? 'selected' : ''}`}
            onClick={() => pick('__other__')}
          >
            <span className="option-dot" aria-hidden="true">{value === '__other__' && <IconCheck width={12} height={12} />}</span>
            <span className="option-text"><span className="option-label">{q.otherLabel || 'Outro valor'}</span></span>
          </button>
        )}
      </div>

      {value === '__other__' && (
        <div className="subform">
          <label className="field">
            <span>{q.kind === 'yield' ? 'Unidades' : q.other === 'number' ? 'Quantidade (g ou un.)' : 'Resposta'}</span>
            <input
              autoFocus
              inputMode={q.other === 'number' ? 'decimal' : 'text'}
              value={ans.other || ''}
              onChange={(e) => onChange({ ...ans, other: e.target.value, note: undefined })}
            />
          </label>
          {ans.note && <p className="q-hint">{ans.note}</p>}
        </div>
      )}

      {q.chat && (
        <ChatBox
          compact
          title="Explique o rendimento para a IA"
          placeholder="Ex.: faço bolinhas de 12 g · vai ao forno e perde 15% · quero 40 unidades"
          suggestions={['Bolinhas de 12 g', 'Peças de 20 g', 'A massa perde 10% no cozimento']}
          onSend={async (message, history) => {
            const r = await yieldChat({ settings, info: yieldInfo(analysis), message, history });
            onChange({ value: '__other__', other: String(r.units), note: r.text });
            return `${r.text} → ${r.units} unidades (já selecionado).`;
          }}
        />
      )}

      {q.kind === 'tab' && value === NEW && (
        <div className="subform">
          <p className="subform-title">Nome da nova aba</p>
          {analysis.tabNames.length > 0 && (
            <div className="chips">
              {analysis.tabNames.map((n) => (
                <button key={n} type="button" className={`chip ${ans.newName === n ? 'on' : ''}`} onClick={() => onChange({ ...ans, newName: n })}>{n}</button>
              ))}
            </div>
          )}
          <label className="field">
            <span>Ou escreva outro nome</span>
            <input value={ans.newName || ''} onChange={(e) => onChange({ ...ans, newName: e.target.value.toUpperCase() })} />
          </label>
        </div>
      )}

      {q.kind === 'ingredient' && value === PICK && (
        <div className="subform">
          <label className="field">
            <span>Ingrediente cadastrado</span>
            <Combo
              autoFocus
              aria-label="Ingrediente cadastrado"
              placeholder="Digite para procurar…"
              value={ans.pick || ''}
              options={[...new Set((catalog?.ingredients || []).map((i) => i.name))]}
              onChange={(v) => onChange({ ...ans, pick: v })}
            />
          </label>
          {ans.pick && !(catalog?.ingredients || []).some((i) => i.name === ans.pick) && <small className="warn-text">Escolha um nome da lista.</small>}
        </div>
      )}

      {q.kind === 'ingredient' && value === NEW && (
        <NewIngredientForm
          form={ans.form || { name: item.newName, unit: item.newUnit, pack: '', price: '' }}
          onChange={(form) => onChange({ ...ans, form })}
        />
      )}
    </fieldset>
  );
}

function NewIngredientForm({ form, onChange }) {
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value });
  return (
    <div className="subform grid-4">
      <label className="field span-2">
        <span>Nome na planilha</span>
        <input value={form.name} onChange={set('name')} />
      </label>
      <label className="field">
        <span>Peso / qt. do pacote</span>
        <input inputMode="decimal" placeholder="ex.: 500" value={form.pack} onChange={set('pack')} />
      </label>
      <label className="field">
        <span>Medida</span>
        <select value={form.unit} onChange={set('unit')}>
          <option value="g">g</option>
          <option value="ml">ml</option>
          <option value="un.">un.</option>
        </select>
      </label>
      <label className="field">
        <span>Preço do pacote (R$)</span>
        <input inputMode="decimal" placeholder="ex.: 29,90" value={form.price} onChange={set('price')} />
      </label>
    </div>
  );
}
