import { money } from '../lib/costs.js';
import { IconAlert, IconArrowLeft, IconCheck, IconExternal } from './Icons.jsx';

const STEPS = [
  ['ingredients', 'Cadastrar ingredientes novos'],
  ['tab', 'Criar a nova aba a partir da BISCOITOS'],
  ['write', 'Escrever a ficha'],
  ['format', 'Aplicar mesclas, menus suspensos e formatos'],
  ['verify', 'Conferir fórmulas e preços'],
  ['notion', 'Salvar a receita completa no Notion'],
];

export function PublishStep({ progress, error, onBack, onRetry }) {
  return (
    <section className="panel publish" aria-live="polite">
      <h2 className="display">{error ? 'A gravação parou' : 'Gravando na planilha…'}</h2>
      <ol className="progress">
        {STEPS.filter(([k]) => progress[k] !== 'skip').map(([k, label]) => {
          const st = progress[k];
          return (
            <li key={k} className={`p-${st || 'wait'}`}>
              <span className="p-mark" aria-hidden="true">{st === 'done' ? <IconCheck width={14} height={14} /> : st === 'run' && !error ? <span className="spinner" /> : null}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="callout bad" role="alert">
          <IconAlert />
          <div>
            <p>{error}</p>
            <p className="small">Os passos marcados já foram feitos na planilha; confira antes de tentar de novo.</p>
          </div>
        </div>
      )}
      {error && (
        <div className="actions">
          <button className="btn ghost" onClick={onBack}><IconArrowLeft /> Voltar à revisão</button>
          <button className="btn primary" onClick={onRetry}>Tentar de novo</button>
        </div>
      )}
    </section>
  );
}

export function ResultStep({ result, draft, spreadsheetUrl, onNew, onSeeTab }) {
  const t = result.totals;
  const attention = [
    ...(draft.yieldEstimated ? [`Rendimento de ${draft.yieldUnits} unidades é uma estimativa; ajuste na célula I${result.layout.R + 5} se precisar.`] : []),
    ...result.notes,
    ...(result.missingPrice.length ? [`Sem preço na planilha: ${result.missingPrice.join(', ')}.`] : []),
    ...(result.errors.length ? [`Células com erro: ${result.errors.join(', ')}.`] : []),
  ];
  const ok = !result.errors.length && !result.missingPrice.length;

  return (
    <section className="panel result">
      <div className={`result-badge ${ok ? 'ok' : 'warn'}`} aria-hidden="true">{ok ? <IconCheck width={22} height={22} /> : <IconAlert width={22} height={22} />}</div>
      <h2 className="display">{draft.name}</h2>
      <p className="lede">
        Gravada na aba <strong>{result.tab}</strong>, linha {result.startRow}{ok ? ', sem erros nas fórmulas.' : '.'}
      </p>

      <dl className="result-grid">
        <div><dt>Custo dos ingredientes</dt><dd>{money(t.ingredients)}</dd></div>
        <div className="hero-num"><dt>Preço de venda por unidade</dt><dd>{money(t.unitPrice)}</dd></div>
        <div><dt>Preço da receita</dt><dd>{money(t.recipePrice)}</dd></div>
        <div><dt>Lucro da receita</dt><dd>{money(t.profit)}</dd></div>
      </dl>

      {attention.length > 0 && (
        <ul className="attention">
          {attention.map((a, i) => <li key={i}><IconAlert width={16} height={16} /> {a}</li>)}
        </ul>
      )}

      <div className="actions">
        {spreadsheetUrl ? (
          <a className="btn ghost" href={spreadsheetUrl} target="_blank" rel="noreferrer"><IconExternal /> Abrir planilha</a>
        ) : <span />}
        <div className="actions-right">
          {result.notionUrl && <a className="btn ghost" href={result.notionUrl} target="_blank" rel="noreferrer"><IconExternal /> Abrir no Notion</a>}
          <button className="btn ghost" onClick={onSeeTab}>Ver na aba {result.tab}</button>
          <button className="btn primary" onClick={onNew}>Nova receita</button>
        </div>
      </div>
    </section>
  );
}
