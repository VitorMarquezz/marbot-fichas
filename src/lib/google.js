// Login do Google no navegador (Google Identity Services, fluxo de token).
// Não precisa de servidor: o token fica só nesta aba do navegador.

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'marbot.gtoken';

let gisPromise = null;
let cached = readCached();

function readCached() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    return t && t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function writeCached(t) {
  cached = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Não foi possível carregar o login do Google. Verifique sua internet.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// No app de desktop o login é feito pelo navegador padrão e a sessão fica guardada (ver electron/googleAuth.cjs).
const desktop = typeof window !== 'undefined' ? window.marbotDesktop?.google : null;
export const isDesktop = !!desktop;

export function hasGoogleToken() {
  if (desktop) return desktop.hasSession();
  return !!(cached && cached.expiresAt > Date.now() + 60_000);
}

export function signOutGoogle() {
  if (desktop) { desktop.signOut(); return; }
  if (cached && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cached.token, () => {});
  }
  writeCached(null);
}

export function invalidateGoogleToken() {
  if (desktop) desktop.invalidate();
  writeCached(null);
}

export async function getGoogleToken(clientId, clientSecret) {
  if (desktop) return desktop.getToken({ clientId: clientId?.trim(), clientSecret: clientSecret?.trim() });
  if (hasGoogleToken()) return cached.token;
  if (!clientId) throw new Error('Informe o Client ID do Google nas configurações.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Login do Google recusado: ${resp.error_description || resp.error}`));
          return;
        }
        writeCached({ token: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in) * 1000 });
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const msg = err?.type === 'popup_closed'
          ? 'A janela de login do Google foi fechada antes de terminar.'
          : err?.type === 'popup_failed_to_open'
            ? 'O navegador bloqueou a janela de login do Google. Libere pop-ups para este endereço.'
            : 'Não foi possível entrar no Google.';
        reject(new Error(msg));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}
