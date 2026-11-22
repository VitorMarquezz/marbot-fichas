import { useEffect, useRef, useState } from 'react';

const Chevron = ({ dir }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);

/** Abas da planilha num carrossel: setas dos lados, rolagem suave e a aba ativa sempre visível. */
export default function TabCarousel({ tabs, active, onPick, label }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  function update() {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // mantém a aba escolhida à vista
  useEffect(() => {
    const el = track.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  const go = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  function onKey(e) {
    const i = tabs.findIndex((t) => t.title === active);
    if (e.key === 'ArrowRight' && i < tabs.length - 1) { e.preventDefault(); onPick(tabs[i + 1].title); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onPick(tabs[i - 1].title); }
  }

  return (
    <div className="carousel">
      <button className="carousel-arrow" onClick={() => go(-1)} disabled={edges.start} aria-label="Abas anteriores"><Chevron dir="left" /></button>
      <div className={`carousel-track ${edges.start ? '' : 'fade-start'} ${edges.end ? '' : 'fade-end'}`} ref={track} onScroll={update} role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.title}
            role="tab"
            aria-selected={t.title === active}
            tabIndex={t.title === active ? 0 : -1}
            className={`sheet-tab ${t.title === active ? 'on' : ''} ${t.kind ? `is-${t.kind}` : ''}`}
            onClick={() => onPick(t.title)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button className="carousel-arrow" onClick={() => go(1)} disabled={edges.end} aria-label="Próximas abas"><Chevron dir="right" /></button>
    </div>
  );
}
