// Estado da conexão: sem internet, o app mostra a cópia salva e não deixa mudar nada.
const listeners = new Set();
let offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

export const isOffline = () => offline;

export function setOffline(v) {
  if (offline === !!v) return;
  offline = !!v;
  listeners.forEach((fn) => fn(offline));
}

export function onOfflineChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setOffline(true));
  window.addEventListener('online', () => setOffline(false));
}

export class OfflineError extends Error {
  constructor() {
    super('Sem internet: o app está só mostrando a cópia salva. Conecte-se para fazer mudanças.');
    this.offline = true;
  }
}

/** Erro de rede (sem resposta do servidor), diferente de um erro devolvido pela API. */
export function isNetworkError(e) {
  return !!e && (e.offline || /sem conex|fetch failed|failed to fetch|network|ENOTFOUND|ECONNRE|ETIMEDOUT|EAI_AGAIN|ERR_INTERNET/i.test(String(e.message || e)));
}

export function assertOnline() {
  if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) throw new OfflineError();
}

// ---------- cópia local (para ver tudo offline) ----------

const PREFIX = 'marbot.cache.v1:';

export function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); } catch { return null; }
}

export function cacheSet(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* armazenamento cheio ou indisponível */ }
}

export function cacheClear() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
