// Marbot Fichas — processo principal do app de desktop.
const { app, BrowserWindow, ipcMain, protocol, shell, net, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const googleAuth = require('./googleAuth.cjs');

const SCHEME = 'app';
const HOST = 'marbot';
const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    title: 'Marbot Fichas',
    backgroundColor: '#f4eceb',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${SCHEME}://${HOST}/index.html`);

  // links externos (ex.: "Abrir planilha") abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    // janelas da Pluggy (login do Meu Pluggy) abrem dentro do app, para a conexão voltar para ele
    try {
      if (/(^|\.)pluggy\.ai$/.test(new URL(url).hostname)) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true, parent: win } };
      }
    } catch { /* endereço inválido */ }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.session.setSpellCheckerLanguages(['pt-BR']);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // serve os arquivos do app (pasta dist) em app://marbot/
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // garante CORS para as APIs usadas (Google Sheets, Claude, Gemini) vindo da origem app://marbot
  const apiHosts = ['https://sheets.googleapis.com/*', 'https://api.anthropic.com/*', 'https://generativelanguage.googleapis.com/*', 'https://api.notion.com/*', 'https://www.googleapis.com/*'];
  session.defaultSession.webRequest.onHeadersReceived({ urls: apiHosts }, (details, cb) => {
    const h = details.responseHeaders || {};
    const has = Object.keys(h).some((k) => k.toLowerCase() === 'access-control-allow-origin');
    if (!has) {
      h['Access-Control-Allow-Origin'] = [`${SCHEME}://${HOST}`];
      h['Access-Control-Allow-Headers'] = ['*'];
      h['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
    }
    cb({ responseHeaders: h });
  });

  // chamadas às APIs feitas aqui, só para os endereços que o app usa
  const allowed = new Set(['sheets.googleapis.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.notion.com', 'www.googleapis.com']);
  ipcMain.handle('http', async (_e, url, init = {}) => {
    const u = new URL(url);
    // a função do Marbot Financeiro roda na Vercel
    const cloudFn = /\.vercel\.app$/.test(u.hostname);
    if (u.protocol !== 'https:' || !(allowed.has(u.hostname) || cloudFn)) throw new Error('Endereço não permitido.');
    const res = await net.fetch(url, { method: init.method, headers: init.headers, body: init.body });
    return { status: res.status, body: await res.text() };
  });

  ipcMain.on('google:has', (e) => { e.returnValue = googleAuth.hasSession(); });
  ipcMain.handle('google:token', (_e, cfg) => googleAuth.getToken(cfg));
  ipcMain.handle('google:invalidate', () => googleAuth.invalidate());
  ipcMain.handle('google:signout', () => googleAuth.signOut());

  createWindow();
});

app.on('window-all-closed', () => app.quit());
