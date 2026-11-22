import { useRef, useState } from 'react';
import { fileToImage } from '../lib/ai.js';
import { money } from '../lib/costs.js';
import { IconImage, IconX } from './Icons.jsx';

export default function RecipeStep({ text, setText, images, setImages, onAnalyze, busy, history, onClearHistory, demo, onSample, ready, onOpenSettings }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function addFiles(files) {
    const imgs = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).slice(0, 4).map(fileToImage));
    setImages([...images, ...imgs].slice(0, 4));
  }

  const canGo = (text.trim().length > 10 || images.length > 0) && !busy;

  return (
    <div className="home">
      <section
        className={`panel recipe-in ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <h1 className="display hero">Qual receita vamos precificar?</h1>
        <p className="lede">Cole a receita como ela veio — com modo de preparo e tudo. O app lê os ingredientes, pergunta só o que tiver dúvida e monta a ficha na planilha.</p>

        <label htmlFor="recipe" className="sr-only">Receita</label>
        <textarea
          id="recipe"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Brigadeiro de pistache\n\n1 lata de leite condensado\n1 colher de sopa de manteiga sem sal\n50 g de pasta de pistache\n…'}
          rows={12}
        />

        {images.length > 0 && (
          <ul className="thumbs">
            {images.map((img, i) => (
              <li key={i}>
                <img src={img.url} alt={`Foto da receita ${i + 1}`} />
                <button className="icon-btn" aria-label="Remover foto" onClick={() => setImages(images.filter((_, j) => j !== i))}><IconX width={14} height={14} /></button>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <div className="actions-left">
            <button className="btn ghost" onClick={() => fileRef.current?.click()}><IconImage /> Anexar foto</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {demo && <button className="btn text" onClick={onSample}>Usar receita de exemplo</button>}
          </div>
          {ready ? (
            <button className="btn primary" disabled={!canGo} onClick={onAnalyze}>
              {busy ? <><span className="spinner" aria-hidden="true" /> {busy}</> : 'Ler receita'}
            </button>
          ) : (
            <button className="btn primary" onClick={onOpenSettings}>Configurar IA e planilha</button>
          )}
        </div>
      </section>

      <aside className="history" aria-labelledby="hist-title">
        <div className="side-head">
          <h2 id="hist-title" className="side-title">Últimas fichas</h2>
          {history.length > 0 && (confirmClear ? (
            <span className="confirm-del">
              <button className="btn text small" onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button className="btn text small danger-text" onClick={() => { onClearHistory(); setConfirmClear(false); }}>Limpar tudo</button>
            </span>
          ) : (
            <button className="btn text small" onClick={() => setConfirmClear(true)}>Limpar</button>
          ))}
        </div>
        {history.length === 0 ? (
          <p className="muted small">As receitas que você gravar aparecem aqui, com a aba e o preço por unidade.</p>
        ) : (
          <ol className="hist-list">
            {history.slice(0, 8).map((h, i) => (
              <li key={i}>
                <span className="hist-name">{h.name}</span>
                <span className="hist-meta">{h.tab} · linha {h.row}{h.demo ? ' · exemplo' : ''}</span>
                <span className="hist-price">{money(h.unitPrice)}<small>/un.</small></span>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
