import { useEffect, useRef, useState } from 'react';
import { norm } from '../lib/match.js';

/**
 * Campo de texto com lista de sugestões que rola (substitui o <datalist>, que no app
 * abre uma lista sem rolagem e corta os itens de baixo).
 * Digitar filtra a lista; setas ↑/↓ escolhem, Enter confirma, Esc fecha.
 */
export default function Combo({ value, onChange, options, className = '', placeholder, disabled, onBlur, onPick, ...rest }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false); // só filtra depois que a pessoa digita
  const [pos, setPos] = useState(null); // lista flutuante, presa ao campo (tabelas com rolagem lateral cortariam a lista)
  const box = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      setPos({ left: r.left, width: Math.max(r.width, 220), ...(up ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(320, above) } : { top: r.bottom + 4, maxHeight: Math.min(320, below) }) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  const q = norm(value);
  const shown = typed && q ? options.filter((o) => norm(o).includes(q)) : options;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(v) {
    onChange(v);
    onPick?.(v);
    setOpen(false);
    setTyped(false);
    setActive(-1);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className={`combo ${open ? 'open' : ''}`} ref={box}>
      <input
        {...rest}
        className={className}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => { setOpen(true); setTyped(false); }}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); setActive(0); }}
        onKeyDown={onKey}
        onBlur={onBlur}
      />
      <button type="button" className="combo-caret" tabIndex={-1} aria-label="Mostrar opções" disabled={disabled}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); setTyped(false); }}>▾</button>
      {open && !disabled && (
        <ul className="combo-list" role="listbox" ref={list} style={pos || undefined}>
          {shown.length === 0 && <li className="combo-empty">Nada cadastrado com esse nome</li>}
          {shown.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              data-active={i === active}
              className={`${i === active ? 'active' : ''} ${o === value ? 'chosen' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
