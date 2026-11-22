export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'com', 'sem', 'para', 'e', 'a', 'o']);
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));

export function findExact(name, catalog) {
  const n = norm(name);
  return catalog.find((i) => norm(i.name) === n) || null;
}

/** Itens parecidos já cadastrados, do mais ao menos parecido. */
export function similar(name, catalog, limit = 3) {
  const t = tokens(name);
  if (!t.length) return [];
  return catalog
    .map((item) => {
      const it = tokens(item.name);
      let score = 0;
      for (const a of t) {
        for (const b of it) {
          if (a === b) score += 3;
          else if (a.length > 3 && b.length > 3 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) score += 1.5;
        }
      }
      if (norm(item.name).includes(norm(name)) || norm(name).includes(norm(item.name))) score += 2;
      return { item, score: score / Math.max(1, Math.sqrt(it.length)) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}

export function applySubstitution(text, substitutions) {
  const n = norm(text);
  for (const s of substitutions) {
    if (s.from && s.to && n.includes(norm(s.from))) return s.to;
  }
  return null;
}

export function isUnitBased(item) {
  return /^un/i.test(norm(item?.unit || ''));
}
