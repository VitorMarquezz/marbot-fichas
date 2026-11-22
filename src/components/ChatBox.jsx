import { useState } from 'react';
import { IconSpark } from './Icons.jsx';

/**
 * Caixinha de conversa com a IA. onSend(texto, histórico) devolve a resposta (texto) ou lança erro.
 * Sugestões viram botões que preenchem a mensagem.
 */
export default function ChatBox({ title, placeholder, suggestions = [], onSend, compact = false }) {
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  async function send(text = msg) {
    const t = text.trim();
    if (!t || busy) return;
    setMsg('');
    const history = [...log, { role: 'user', text: t }];
    setLog(history);
    setBusy(true);
    try {
      const reply = await onSend(t, log);
      setLog([...history, { role: 'ai', text: reply }]);
    } catch (e) {
      setLog([...history, { role: 'error', text: e.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`chat ${compact ? 'compact' : ''}`}>
      <p className="chat-title"><IconSpark width={15} height={15} /> {title}</p>
      {log.length > 0 && (
        <ol className="chat-log" aria-live="polite">
          {log.map((m, i) => <li key={i} className={`msg ${m.role}`}>{m.text}</li>)}
          {busy && <li className="msg ai"><span className="spinner" aria-hidden="true" /> Pensando…</li>}
        </ol>
      )}
      {log.length === 0 && suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={placeholder} aria-label={title} disabled={busy} />
        <button className="btn small primary" disabled={busy || !msg.trim()}>{busy ? '…' : 'Enviar'}</button>
      </form>
    </div>
  );
}
