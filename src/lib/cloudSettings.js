// Guarda as configurações (chaves, IDs, Notion, substituições…) na conta Google, numa pasta
// privada do app no Google Drive (appDataFolder). Só este app enxerga esse arquivo.
// Assim, ao entrar com a mesma conta em outro computador, tudo volta sozinho.
import { getGoogleToken } from './google.js';
import { http } from './http.js';

const NAME = 'marbot-fichas-config.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const LOCAL_ONLY = ['demo']; // o modo demonstração é só deste computador

let fileId = null;

async function auth(s) {
  return { Authorization: `Bearer ${await getGoogleToken(s.googleClientId, s.googleClientSecret)}` };
}

async function findFile(s) {
  if (fileId) return fileId;
  const q = encodeURIComponent(`name='${NAME}'`);
  const res = await http(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`, { headers: await auth(s) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(driveError(res.status, data));
  fileId = data.files?.[0]?.id || null;
  return fileId;
}

function driveError(status, data) {
  if (status === 403 && /scope|insufficient/i.test(JSON.stringify(data))) return 'Entre de novo com o Google para liberar o salvamento das configurações na sua conta.';
  return `Google Drive respondeu com erro ${status}${data?.error?.message ? `: ${data.error.message}` : ''}.`;
}

/** Lê as configurações guardadas na conta (ou null se ainda não houver). */
export async function loadCloudSettings(s) {
  const id = await findFile(s);
  if (!id) return null;
  const res = await http(`${API}/${id}?alt=media`, { headers: await auth(s) });
  if (!res.ok) throw new Error(driveError(res.status, await res.json().catch(() => ({}))));
  return JSON.parse(await res.text());
}

/** Grava as configurações na conta. */
export async function saveCloudSettings(s, payload) {
  const body = JSON.stringify(strip(payload));
  const id = await findFile(s);
  if (id) {
    const res = await http(`${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { ...(await auth(s)), 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error(driveError(res.status, await res.json().catch(() => ({}))));
    return;
  }
  const boundary = `marbot${Date.now()}`;
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: NAME, parents: ['appDataFolder'] }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
  ].join('\r\n');
  const res = await http(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { ...(await auth(s)), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(driveError(res.status, data));
  fileId = data.id;
}

function strip(p) {
  const out = { ...p, settings: { ...p.settings } };
  LOCAL_ONLY.forEach((k) => delete out.settings[k]);
  return out;
}

export function forgetCloudFile() {
  fileId = null;
}
