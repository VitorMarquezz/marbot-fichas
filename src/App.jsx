import { useCallback, useEffect, useMemo, useState } from 'react';
import RecipeStep from './components/RecipeStep.jsx';
import FinanceView from './components/FinanceView.jsx';
import SheetBrowser from './components/SheetBrowser.jsx';
import QuestionDeck from './components/QuestionDeck.jsx';
import ReviewStep from './components/ReviewStep.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import { PublishStep, ResultStep } from './components/PublishStep.jsx';
import { IconAlert, IconGear, IconX } from './components/Icons.jsx';
import { DEFAULT_SETTINGS, clearHistory, isAiReady, isSheetsReady, loadHistory, loadSettings, pushHistory, saveHistory, saveSettings } from './lib/settings.js';
import { isOffline, onOfflineChange } from './lib/net.js';
import { loadCloudSettings, saveCloudSettings } from './lib/cloudSettings.js';
import { getGoogleToken, hasGoogleToken, signOutGoogle } from './lib/google.js';
import { SheetsClient, publishRecipe } from './lib/sheets.js';
import { analyzeRecipe } from './lib/ai.js';
import { buildQuestions, prepareAnalysis, resolveDraft } from './lib/flow.js';
import { DemoClient, SAMPLE_RECIPE, demoAnalysis } from './lib/demo.js';
import { isNotionReady, saveRecipeToNotion } from './lib/notion.js';
import logo from './assets/logo.png';

const STEP_LABELS = [
  ['recipe', 'Receita'],
  ['questions', 'Perguntas'],
  ['review', 'Revisão'],
  ['done', 'Planilha'],
];

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [googleOn, setGoogleOn] = useState(hasGoogleToken());
  const [catalog, setCatalog] = useState(null);
  const [step, setStep] = useState('recipe');
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState(null);
  const [progress, setProgress] = useState({});
  const [publishError, setPublishError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [view, setView] = useState('sheet');
  const [presetTab, setPresetTab] = useState(null);
  const [aiNotice, setAiNotice] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [offline, setOfflineState] = useState(isOffline());
  const [syncNote, setSyncNote] = useState('');
  const [prefetched, setPrefetched] = useState(false);

  const demo = settings.demo;
  const ready = demo || (isAiReady(settings) && isSheetsReady(settings));
  const sheetsOk = demo || isSheetsReady(settings);
  const client = useMemo(() => (demo ? new DemoClient(settings) : new SheetsClient(settings)), [settings, demo]);

  const readOnly = offline && !demo;

  useEffect(() => onOfflineChange(setOfflineState), []);
  useEffect(() => { setCatalog(null); }, [client]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, view]);

  // ---------- configurações guardadas na conta Google (valem em qualquer computador) ----------

  const canSync = (s) => !s.demo && isSheetsReady(s) && hasGoogleToken() && !isOffline();

  async function pushCloud(s, hist = loadHistory()) {
    if (!canSync(s)) return;
    try {
      await saveCloudSettings(s, { settings: s, history: hist, updatedAt: s.updatedAt || 0 });
      setSyncNote('');
    } catch (e) {
      setSyncNote(`Não consegui salvar as configurações na sua conta Google: ${e.message}`);
    }
  }

  async function pullCloud(s) {
    if (!canSync(s)) return s;
    try {
      const remote = await loadCloudSettings(s);
      if (remote && (remote.updatedAt || 0) > (s.updatedAt || 0)) {
        const merged = { ...DEFAULT_SETTINGS, ...remote.settings, demo: s.demo, updatedAt: remote.updatedAt };
        setSettings(merged);
        saveSettings(merged);
        if (Array.isArray(remote.history)) setHistory(saveHistory(remote.history));
        return merged;
      }
      if (!remote || (s.updatedAt || 0) > (remote.updatedAt || 0)) await pushCloud(s);
    } catch (e) {
      setSyncNote(`Não consegui ler as configurações da sua conta Google: ${e.message}`);
    }
    return s;
  }

  const save = useCallback((s) => {
    const next = { ...s, updatedAt: Date.now() };
    setSettings(next);
    saveSettings(next);
    pushCloud(next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ao abrir: traz as configurações da conta e guarda a planilha toda para uso offline
  useEffect(() => {
    if (googleOn && !demo) pullCloud(settings);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!catalog || demo || offline || prefetched) return;
    setPrefetched(true);
    client.prefetchAll(catalog).catch(() => { /* a cópia offline completa fica para a próxima vez */ });
  }, [catalog, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connectGoogle(s = settings) {
    setError('');
    try {
      await getGoogleToken(s.googleClientId, s.googleClientSecret);
      setGoogleOn(true);
      const fresh = await pullCloud(s);
      const c = await new SheetsClient(fresh).loadCatalog();
      setCatalog(c);
    } catch (e) {
      setError(e.message);
    }
  }

  async function ensureCatalog(force = false) {
    if (catalog && !force) return catalog;
    const c = await client.loadCatalog();
    setCatalog(c);
    if (!demo) setGoogleOn(true);
    return c;
  }

  function wipeHistory() {
    const list = clearHistory();
    setHistory(list);
    pushCloud(settings, list);
  }

  async function analyze() {
    setError('');
    try {
      setBusy('Lendo a planilha…');
      const c = await ensureCatalog();
      setBusy('Lendo a receita…');
      const out = demo ? (await new Promise((r) => setTimeout(r, 900)), { raw: demoAnalysis(), notice: '' }) : await analyzeRecipe({
        settings,
        recipeText: text,
        images,
        catalog: c.ingredients,
        tabs: c.tabs.map((t) => t.title),
      });
      const raw = out.raw;
      setAiNotice(out.notice);
      const a = prepareAnalysis(raw, c.ingredients, settings, c.tabs);
      if (!a.items.length) throw new Error('Não encontrei ingredientes nessa receita. Confira o texto ou a foto.');
      const qs = buildQuestions(a, c.tabs);
      setAnalysis(a);
      setQuestions(qs);
      setAnswers(presetTab && c.tabs.some((t) => t.title === presetTab) ? { tab: { value: presetTab } } : {});
      setStep('questions');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function toReview() {
    setDraft(resolveDraft(analysis, answers, questions, catalog?.ingredients || []));
    setStep('review');
  }

  async function publish() {
    setStep('publish');
    setPublishError('');
    setProgress({});
    let fresh;
    try {
      fresh = await client.loadCatalog(); // lista atualizada: evita cadastrar duas vezes numa nova tentativa
    } catch (e) {
      setPublishError(e.message);
      return;
    }
    const tabExists = fresh.tabs.some((t) => t.title === draft.tab.title);
    const plan = {
      tab: { ...draft.tab, isNew: draft.tab.isNew && !tabExists },
      recipe: {
        name: draft.name.trim(),
        yieldUnits: draft.yieldUnits,
        // a conta da troca de medida (ex.: 150 g de gema ≈ 9 ovos) fica numa linha de observação logo abaixo
        // cada parte (massa, recheio…) ganha um subtítulo na ficha
        ingredients: draft.ingredients.flatMap((x, i) => [
          ...(x.section?.trim() && x.section !== draft.ingredients[i - 1]?.section ? [{ type: 'section', name: x.section.trim() }] : []),
          { qty: Number(String(x.qty).replace(',', '.')) || 0, name: x.name.trim() },
          ...(x.note ? [{ type: 'note', name: x.note }] : []),
        ]),
        packaging: (draft.packaging || []).filter((x) => x.name.trim()).map((x) => ({ qty: Number(String(x.qty).replace(',', '.')) || 0, name: x.name.trim() })),
      },
      newIngredients: dedupeNew(draft.ingredients).filter((n) => !fresh.ingredients.some((i) => i.name.toLowerCase() === n.name.toLowerCase())),
    };
    try {
      const step = (k, st) => setProgress((p) => ({ ...p, [k]: st }));
      const res = await publishRecipe(client, plan, fresh, step, settings.formulaSyntax);
      if (res.syntax !== settings.formulaSyntax) save({ ...settings, formulaSyntax: res.syntax });
      if (draft.saveNotion && !demo && isNotionReady(settings)) {
        // a planilha já foi gravada: um erro no Notion só vira aviso
        step('notion', 'run');
        try {
          res.notionUrl = await saveRecipeToNotion(settings, {
            name: plan.recipe.name,
            tab: res.tab,
            yieldUnits: plan.recipe.yieldUnits,
            ingredientLines: draft.ingredientLines?.length
              ? [...draft.ingredientLines, ...plan.recipe.ingredients.filter((x) => x.type === 'note').map((x) => `Obs.: ${x.name}`)]
              : plan.recipe.ingredients.map((x) => (x.type === 'section' ? `${x.name}:` : x.type === 'note' ? `Obs.: ${x.name}` : `${String(x.qty).replace('.', ',')} ${x.name}`)),
            ingredients: plan.recipe.ingredients.filter((x) => !x.type).map((x) => ({ ...x, unit: /^un/i.test(fresh.ingredients.find((i) => i.name === x.name)?.unit || '') ? 'un.' : 'g' })),
            method: draft.method,
            totals: res.totals,
            sheetUrl: `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit#gid=${res.sheetId}&range=B${res.startRow}`,
          });
          res.notes.push('Receita completa salva no Notion.');
        } catch (e) {
          res.notes.push(`Não consegui salvar no Notion: ${e.message}`);
        }
        step('notion', 'done');
      } else {
        step('notion', 'skip');
      }
      setResult(res);
      const hist = pushHistory({ name: plan.recipe.name, tab: res.tab, row: res.startRow, unitPrice: res.totals.unitPrice, date: Date.now(), demo });
      setHistory(hist);
      pushCloud(settings, hist);
      setCatalog(null); // a lista de ingredientes e a próxima linha mudaram
      setDataVersion((v) => v + 1);
      setStep('done');
    } catch (e) {
      setPublishError(e.message);
    }
  }

  function reset() {
    setPresetTab(null);
    setStep('recipe');
    setText('');
    setImages([]);
    setAnalysis(null);
    setDraft(null);
    setResult(null);
  }

  const stepIndex = STEP_LABELS.findIndex(([k]) => k === (step === 'publish' ? 'done' : step));
  const tabUrl = demo ? null : (sheetId, row) => `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit#gid=${sheetId}${row ? `&range=B${row}` : ''}`;
  const sheetUrl = !demo && result ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit#gid=${result.sheetId}&range=B${result.startRow}` : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" aria-hidden="true" />
          <span className="brand-name">Marbot <span>Ateliê</span></span>
          <span className="brand-sub">Fichas de custo</span>
        </div>
        <div className="views" role="tablist" aria-label="Seções">
          <button role="tab" aria-selected={view === 'sheet'} className={view === 'sheet' ? 'on' : ''} onClick={() => setView('sheet')}>Planilha</button>
          <button role="tab" aria-selected={view === 'new'} className={view === 'new' ? 'on' : ''} onClick={() => setView('new')}>Nova receita</button>
          <button role="tab" aria-selected={view === 'finance'} className={view === 'finance' ? 'on' : ''} onClick={() => setView('finance')}>Financeiro</button>
        </div>
        <div className="top-status">
          {demo ? (
            <span className="status demo">Modo demonstração</span>
          ) : (
            <>
              {offline && <span className="status off" title="Sem internet: mostrando a cópia salva neste computador">Offline · só leitura</span>}
              <span className={`status ${googleOn ? 'ok' : 'off'}`}>{googleOn ? (catalog?.title || 'Planilha conectada') : 'Planilha desconectada'}</span>
              <span className={`status ${isAiReady(settings) ? 'ok' : 'off'}`}>
                {settings.provider === 'claude' ? 'IA: Claude (pago)' : settings.provider === 'local' ? 'Leitor sem IA' : settings.geminiKey ? 'IA: Gemini grátis' : 'Leitor sem IA'}
              </span>
            </>
          )}
          <button className="icon-btn gear" onClick={() => setSettingsOpen(true)} aria-label="Abrir configurações"><IconGear /></button>
        </div>
      </header>

      {readOnly && (
        <div className="offline-bar" role="status">
          Sem internet: você está vendo a cópia salva neste computador. Dá para consultar tudo, mas as mudanças ficam bloqueadas até a conexão voltar.
        </div>
      )}
      {syncNote && !offline && (
        <div className="offline-bar warn" role="status">
          {syncNote} <button className="btn text" onClick={() => setSyncNote('')}>Fechar</button>
        </div>
      )}

      {view === 'sheet' && (
        <main className="main">
          {error && (
            <div className="callout bad" role="alert">
              <IconAlert />
              <p>{error}</p>
              <button className="icon-btn" onClick={() => setError('')} aria-label="Fechar aviso"><IconX width={16} height={16} /></button>
            </div>
          )}
          {!sheetsOk ? (
            <div className="callout info">
              <div>
                <p><strong>Conecte a planilha para ver as receitas.</strong> Informe o Client ID do Google nas configurações — ou veja como fica com dados de exemplo.</p>
                <div className="inline">
                  <button className="btn small" onClick={() => setSettingsOpen(true)}>Abrir configurações</button>
                  <button className="btn small ghost" onClick={() => save({ ...settings, demo: true })}>Experimentar com dados de exemplo</button>
                </div>
              </div>
            </div>
          ) : !demo && !googleOn ? (
            <div className="callout info">
              <p>Entre com a conta do Google que tem acesso à planilha <strong>Claude Marbot</strong>.</p>
              <button className="btn small" onClick={() => connectGoogle()}>Entrar com o Google</button>
            </div>
          ) : (
            <SheetBrowser
              key={`${demo}-${dataVersion}`}
              client={client}
              catalog={catalog}
              loadCatalog={(force) => ensureCatalog(force)}
              sheetUrl={tabUrl}
              onError={setError}
              settings={settings}
              readOnly={readOnly}
              onSyntax={(syntax) => save({ ...settings, formulaSyntax: syntax })}
              onNewInTab={(tab) => { setPresetTab(tab); reset(); setPresetTab(tab); setView('new'); }}
            />
          )}
        </main>
      )}

      {view === 'finance' && (
        <main className="main">
          {!demo && !googleOn ? (
            <div className="callout info">
              <p>Entre com a conta do Google para ver o financeiro.</p>
              <button className="btn small" onClick={() => connectGoogle()}>Entrar com o Google</button>
            </div>
          ) : (
            <FinanceView settings={settings} demo={demo} readOnly={readOnly} onOpenSettings={() => setSettingsOpen(true)} onSaveSettings={save} />
          )}
        </main>
      )}

      {view === 'new' && (<>
      {presetTab && step === 'recipe' && (
        <p className="preset-note">Nova receita na aba <strong>{presetTab}</strong> · <button className="btn text" onClick={() => setPresetTab(null)}>escolher outra aba depois</button></p>
      )}
      <nav className="stepper" aria-label="Etapas">
        <ol>
          {STEP_LABELS.map(([k, label], i) => (
            <li key={k} className={i < stepIndex ? 'past' : i === stepIndex ? 'now' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="step-n">{i + 1}</span>
              <span className="step-l">{label}</span>
            </li>
          ))}
        </ol>
      </nav>

      <main className="main">
        {error && (
          <div className="callout bad" role="alert">
            <IconAlert />
            <p>{error}</p>
            <button className="icon-btn" onClick={() => setError('')} aria-label="Fechar aviso"><IconX width={16} height={16} /></button>
          </div>
        )}

        {!ready && step === 'recipe' && (
          <div className="callout info">
            <div>
              <p><strong>Falta configurar.</strong> {isAiReady(settings) ? 'A IA já está pronta; falta o Client ID do Google para ler e gravar a planilha' : 'Informe a chave da IA e o Client ID do Google para ler e gravar a planilha'} — ou experimente o fluxo no modo demonstração.</p>
              <div className="inline">
                <button className="btn small" onClick={() => setSettingsOpen(true)}>Abrir configurações</button>
                <button className="btn small ghost" onClick={() => save({ ...settings, demo: true })}>Experimentar com dados de exemplo</button>
              </div>
            </div>
          </div>
        )}

        {ready && !demo && !googleOn && step === 'recipe' && (
          <div className="callout info">
            <p>Entre com a conta do Google que tem acesso à planilha <strong>Claude Marbot</strong>.</p>
            <button className="btn small" onClick={() => connectGoogle()}>Entrar com o Google</button>
          </div>
        )}

        {step === 'recipe' && (
          <RecipeStep
            text={text}
            setText={setText}
            images={images}
            setImages={setImages}
            onAnalyze={analyze}
            busy={busy}
            history={history}
            onClearHistory={wipeHistory}
            demo={demo}
            onSample={() => setText(SAMPLE_RECIPE)}
            ready={ready}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {aiNotice && (step === 'questions' || step === 'review') && (
          <div className="callout info"><p>{aiNotice}</p></div>
        )}

        {step === 'questions' && analysis && (
          <QuestionDeck
            questions={questions}
            answers={answers}
            setAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
            analysis={analysis}
            onBack={() => setStep('recipe')}
            onDone={toReview}
            settings={settings}
            catalog={catalog}
          />
        )}

        {step === 'review' && draft && catalog && (
          <ReviewStep draft={draft} setDraft={setDraft} catalog={catalog} onBack={() => setStep('questions')} onPublish={publish} settings={settings} notionReady={!demo && isNotionReady(settings)} onOpenSettings={() => setSettingsOpen(true)} readOnly={readOnly} />
        )}

        {step === 'publish' && (
          <PublishStep progress={progress} error={publishError} onBack={() => setStep('review')} onRetry={publish} />
        )}

        {step === 'done' && result && <ResultStep result={result} draft={draft} spreadsheetUrl={sheetUrl} onNew={reset} onSeeTab={() => { try { localStorage.setItem('marbot.tab', result.tab); } catch { /* ignore */ } setView('sheet'); }} />}
      </main>
      </>)}

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={save}
        googleConnected={googleOn}
        onConnectGoogle={(s) => connectGoogle(s)}
        onDisconnectGoogle={() => { signOutGoogle(); setGoogleOn(false); setCatalog(null); }}
      />
    </div>
  );
}

function dedupeNew(ingredients) {
  const seen = new Set();
  return ingredients
    .map((x) => x.newIng)
    .filter((n) => n && !seen.has(n.name.toLowerCase()) && seen.add(n.name.toLowerCase()));
}

export { DEFAULT_SETTINGS };
