import { useEffect, useState } from 'react';
import { FREE_GEMINI_MODELS, listModels } from '../lib/ai.js';
import { isDesktop } from '../lib/google.js';
import { createRecipesDatabase, isNotionReady, testNotion } from '../lib/notion.js';
import { IconPlus, IconTrash, IconX } from './Icons.jsx';

export default function SettingsDrawer({ open, settings, onClose, onSave, googleConnected, onConnectGoogle, onDisconnectGoogle }) {
  const [s, setS] = useState(settings);
  const [models, setModels] = useState(null);
  const [modelMsg, setModelMsg] = useState('');
  const [notionMsg, setNotionMsg] = useState('');
  const [notionKind, setNotionKind] = useState('');
  useEffect(() => { if (open) { setS(settings); setModels(null); setModelMsg(''); setNotionMsg(''); setNotionKind(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isClaude = s.provider === 'claude';

  async function fetchModels() {
    setModelMsg('Buscando modelos…');
    try {
      const list = await listModels(s);
      setModels(list);
      setModelMsg(list.length ? `Chave aceita · ${list.length} modelos disponíveis` : 'Chave aceita, mas nenhum modelo foi listado.');
    } catch (e) {
      setModels(null);
      setModelMsg(e.message);
    }
  }

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="drawer-head">
          <h2 id="settings-title" className="display">Configurações</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar configurações"><IconX /></button>
        </header>

        <div className="drawer-body">
          <section className="set-group">
            <h3>Inteligência artificial</h3>
            <div className="segmented three" role="radiogroup" aria-label="Como ler as receitas">
              {[['gemini', 'Gemini · grátis'], ['local', 'Sem IA · grátis'], ['claude', 'Claude · pago']].map(([v, label]) => (
                <button key={v} role="radio" aria-checked={s.provider === v} className={s.provider === v ? 'on' : ''} onClick={() => { setS({ ...s, provider: v }); setModels(null); setModelMsg(''); }}>
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small provider-note">
              {s.provider === 'gemini' && 'Usa o plano gratuito do Google AI Studio. Se o limite grátis do dia acabar, o app troca para outro modelo grátis e, por último, para o leitor sem IA. Nada é cobrado enquanto o projeto do AI Studio não tiver faturamento ativado.'}
              {s.provider === 'local' && 'Lê a receita no próprio computador, sem internet e sem custo. Entende linhas como “200 g de chocolate”, “1 xícara de açúcar” e “3 ovos”. Não lê fotos.'}
              {s.provider === 'claude' && 'O Claude é cobrado por uso na sua conta da Anthropic. Para não ter custo, escolha Gemini ou Sem IA.'}
            </p>
            {s.provider !== 'local' && (<>
            <label className="field">
              <span>Chave da API {isClaude ? 'do Claude' : 'do Gemini'}</span>
              <input type="password" autoComplete="off" value={isClaude ? s.claudeKey : s.geminiKey} onChange={set(isClaude ? 'claudeKey' : 'geminiKey')} placeholder={isClaude ? 'sk-ant-…' : 'AQ.… ou AIza…'} />
              <small>
                {isClaude ? 'Crie em console.anthropic.com → API Keys.' : 'Crie em aistudio.google.com → Get API key.'} {isDesktop ? 'Fica salva só neste computador.' : 'Fica salva só neste navegador.'}
              </small>
            </label>
            <label className="field">
              <span>Modelo</span>
              <div className="inline">
                {models?.length ? (
                  <select value={isClaude ? s.claudeModel : s.geminiModel} onChange={set(isClaude ? 'claudeModel' : 'geminiModel')}>
                    {!models.some((m) => m.id === (isClaude ? s.claudeModel : s.geminiModel)) && <option value={isClaude ? s.claudeModel : s.geminiModel}>{isClaude ? s.claudeModel : s.geminiModel}</option>}
                    {models.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.id}){!isClaude && FREE_GEMINI_MODELS.includes(m.id) ? ' · grátis' : ''}</option>)}
                  </select>
                ) : (
                  <input value={isClaude ? s.claudeModel : s.geminiModel} onChange={set(isClaude ? 'claudeModel' : 'geminiModel')} />
                )}
                <button className="btn small" onClick={fetchModels} disabled={!(isClaude ? s.claudeKey : s.geminiKey)}>Testar chave</button>
              </div>
              {modelMsg && <small aria-live="polite">{modelMsg}</small>}
              {!isClaude && !FREE_GEMINI_MODELS.includes(s.geminiModel.trim()) && (
                <small className="warn-text">Este modelo não tem plano grátis. Use um destes: {FREE_GEMINI_MODELS.join(', ')}.</small>
              )}
            </label>
            </>)}
          </section>

          <section className="set-group">
            <h3>Google Sheets</h3>
            <label className="field">
              <span>Client ID do Google (OAuth)</span>
              <input value={s.googleClientId} onChange={set('googleClientId')} placeholder="000000-xxxx.apps.googleusercontent.com" />
              <small>
                {isDesktop
                  ? 'Crie um ID do cliente do tipo “App para computador” (passo a passo no LEIAME).'
                  : `Veja o passo a passo no LEIAME. A origem autorizada é ${window.location.origin}.`}
              </small>
            </label>
            {isDesktop && (
              <label className="field">
                <span>Chave secreta do cliente</span>
                <input type="password" autoComplete="off" value={s.googleClientSecret} onChange={set('googleClientSecret')} placeholder="GOCSPX-…" />
                <small>Aparece junto com o Client ID. O login abre no seu navegador e o app continua conectado depois.</small>
              </label>
            )}
            <label className="field">
              <span>ID da planilha</span>
              <input value={s.spreadsheetId} onChange={set('spreadsheetId')} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Aba modelo</span>
                <input value={s.templateTab} onChange={set('templateTab')} />
              </label>
              <label className="field">
                <span>Aba de ingredientes</span>
                <input value={s.ingredientsTab} onChange={set('ingredientsTab')} />
              </label>
            </div>
            <div className="inline">
              {googleConnected ? (
                <>
                  <span className="status ok">Conectado ao Google</span>
                  <button className="btn small ghost" onClick={onDisconnectGoogle}>Sair</button>
                </>
              ) : (
                <button className="btn small" disabled={!s.googleClientId || (isDesktop && !s.googleClientSecret)} onClick={() => { onSave(s); onConnectGoogle(s); }}>Entrar com o Google</button>
              )}
            </div>
          </section>

          <section className="set-group">
            <h3>Notion</h3>
            <p className="muted small">Quando a receita tiver modo de preparo, o app salva a receita completa (ingredientes e preparo) no Notion. Na planilha continuam só os ingredientes.</p>
            <label className="field">
              <span>Token da integração</span>
              <input type="password" autoComplete="off" value={s.notionToken} onChange={set('notionToken')} placeholder="ntn_…" />
              <small>Crie em notion.so/profile/integrations → Nova integração (interna) e copie o “Token de integração interna”.</small>
            </label>
            <label className="field">
              <span>Link da base de dados ou página</span>
              <input value={s.notionTarget} onChange={set('notionTarget')} placeholder="https://www.notion.so/…" />
              <small>No Notion, abra a página onde quer guardar as receitas, clique em ••• → Conexões e adicione a integração. Cole o link aqui, clique em Testar conexão e depois em Criar base de receitas aqui.</small>
            </label>
            <div className="inline">
              <button className="btn small" disabled={!isNotionReady(s)} onClick={async () => { setNotionMsg('Testando…'); setNotionKind(''); try { const r = await testNotion(s); setNotionMsg(r.text); setNotionKind(r.kind); } catch (e) { setNotionMsg(e.message); } }}>Testar conexão</button>
              {notionKind === 'page' && (
                <button className="btn small primary" onClick={async () => {
                  setNotionMsg('Criando a base…');
                  try {
                    const url = await createRecipesDatabase(s);
                    const next = { ...s, notionTarget: url };
                    setS(next);
                    onSave(next);
                    setNotionKind('database');
                    setNotionMsg('Base “Receitas Marbot” criada e já configurada. As receitas vão entrar nela.');
                  } catch (e) { setNotionMsg(e.message); }
                }}>Criar base de receitas aqui</button>
              )}
              {notionMsg && <small aria-live="polite">{notionMsg}</small>}
            </div>
          </section>

          <section className="set-group">
            <h3>Financeiro (Open Finance)</h3>
            <p className="muted small">O extrato vem do Meu Pluggy por uma função no seu projeto da Vercel (grátis) e fica na planilha Marbot Financeiro.</p>
            <label className="field">
              <span>Endereço da função na Vercel</span>
              <input value={s.financeFunctionUrl} onChange={set('financeFunctionUrl')} placeholder="https://marbot-financeiro.vercel.app/api/financeiro.run.app" />
              <small>Aparece no fim da publicação da função (passo a passo no LEIAME). Não é uma senha: a função só responde para a sua conta Google.</small>
            </label>
            <label className="field">
              <span>ID da planilha Marbot Financeiro</span>
              <input value={s.financeSheetId} onChange={set('financeSheetId')} />
            </label>
          </section>

          <section className="set-group">
            <h3>Substituições fixas</h3>
            <p className="muted small">Quando a receita trouxer o nome da esquerda, a ficha usa o da direita.</p>
            {s.substitutions.map((sub, i) => (
              <div className="sub-row" key={i}>
                <input aria-label="Na receita" value={sub.from} onChange={(e) => setS({ ...s, substitutions: s.substitutions.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                <span aria-hidden="true" className="arrow">vira</span>
                <input aria-label="Na planilha" value={sub.to} onChange={(e) => setS({ ...s, substitutions: s.substitutions.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                <button className="icon-btn" aria-label="Remover substituição" onClick={() => setS({ ...s, substitutions: s.substitutions.filter((_, j) => j !== i) })}><IconTrash width={16} height={16} /></button>
              </div>
            ))}
            <button className="btn text" onClick={() => setS({ ...s, substitutions: [...s.substitutions, { from: '', to: '' }] })}><IconPlus width={16} height={16} /> Adicionar substituição</button>
          </section>

          <section className="set-group">
            <h3>Avançado</h3>
            <label className="field">
              <span>Sintaxe das fórmulas</span>
              <select value={s.formulaSyntax} onChange={set('formulaSyntax')}>
                <option value="ptbr">Português (ponto e vírgula e 0,5)</option>
                <option value="intl">Internacional (vírgula e 0.5)</option>
              </select>
              <small>Se a planilha recusar uma, o app troca para a outra sozinho e lembra.</small>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={s.demo} onChange={set('demo')} />
              <span>Modo demonstração (dados de exemplo, nada é gravado)</span>
            </label>
          </section>
        </div>

        <footer className="drawer-foot">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => { onSave(s); onClose(); }}>Salvar configurações</button>
        </footer>
      </aside>
    </div>
  );
}
