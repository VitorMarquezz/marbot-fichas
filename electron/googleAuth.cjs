// Login do Google para o app de desktop.
// Abre o navegador padrão (o Google não permite login dentro de janelas de apps),
// recebe a resposta num endereço local 127.0.0.1 e guarda a sessão criptografada no Windows.
// Assim você entra uma vez e o app continua conectado.
const { app, shell, safeStorage } = require('electron');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// planilhas + uma pasta privada do app no Drive (onde ficam as configurações sincronizadas)
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.appdata';
const FILE = () => path.join(app.getPath('userData'), 'google-session.bin');

let access = null; // { token, expiresAt }
let pending = null;

function readRefresh() {
  try {
    const buf = fs.readFileSync(FILE());
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function writeRefresh(data) {
  const json = JSON.stringify(data);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  fs.writeFileSync(FILE(), buf);
}

function hasSession() {
  return !!(readRefresh()?.refreshToken || (access && access.expiresAt > Date.now() + 60_000));
}

function invalidate() {
  access = null;
}

async function signOut() {
  const saved = readRefresh();
  access = null;
  try { fs.unlinkSync(FILE()); } catch { /* já não existe */ }
  if (saved?.refreshToken) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(saved.refreshToken)}`, { method: 'POST' }).catch(() => {});
  }
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = data.error_description || data.error || `erro ${res.status}`;
    const err = new Error(`O Google recusou o login: ${desc}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

async function getToken({ clientId, clientSecret }) {
  if (access && access.expiresAt > Date.now() + 60_000) return access.token;
  if (!clientId || !clientSecret) throw new Error('Informe o Client ID e a chave secreta do cliente do Google nas configurações.');

  const saved = readRefresh();
  // sessões antigas (sem a permissão do Drive) pedem um novo login, uma vez
  if (saved?.refreshToken && saved.clientId === clientId && saved.scope === SCOPE) {
    try {
      const data = await tokenRequest({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: saved.refreshToken,
        grant_type: 'refresh_token',
      });
      access = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
      return access.token;
    } catch (e) {
      if (e.code !== 'invalid_grant') throw e;
      // sessão expirada ou revogada: pede login de novo
    }
  }
  if (!pending) pending = interactiveLogin(clientId, clientSecret).finally(() => { pending = null; });
  return pending;
}

function interactiveLogin(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    let redirectUri = '';
    let done = false;

    const timer = setTimeout(() => finish(new Error('O login do Google não foi concluído em 5 minutos. Tente de novo.')), 5 * 60_000);

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/') { res.writeHead(404).end(); return; }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (url.searchParams.get('state') !== state || (!code && !error)) { res.writeHead(400).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(error ? 'O login foi cancelado.' : 'Pronto! Você já pode voltar para o Marbot Fichas.', !error));
      if (error) return finish(new Error('O login do Google foi cancelado.'));
      try {
        const data = await tokenRequest({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        });
        if (data.refresh_token) writeRefresh({ clientId, refreshToken: data.refresh_token, scope: SCOPE });
        access = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
        finish(null, access.token);
      } catch (e) {
        finish(e);
      }
    });

    function finish(err, token) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      err ? reject(err) : resolve(token);
    }

    server.on('error', (e) => finish(new Error(`Não foi possível abrir o login local: ${e.message}`)));
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });
}

function page(msg, ok) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Marbot Fichas</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4eceb;font-family:system-ui,sans-serif;color:#3b2420">
<div style="background:#fffdfc;border:1px solid #e2d3cf;border-radius:18px;padding:32px 40px;text-align:center;max-width:420px">
<div style="font-size:34px;margin-bottom:8px;color:${ok ? '#55702a' : '#a2304c'}">${ok ? '✓' : '×'}</div>
<p style="font-size:18px;margin:0">${msg}</p><p style="color:#6e5149;font-size:14px">Pode fechar esta aba.</p></div></body></html>`;
}

module.exports = { getToken, hasSession, invalidate, signOut };
