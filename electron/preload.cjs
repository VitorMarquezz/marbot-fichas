const { contextBridge, ipcRenderer } = require('electron');

const clean = (e) => {
  const msg = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  return new Error(msg);
};

contextBridge.exposeInMainWorld('marbotDesktop', {
  isDesktop: true,
  http: (url, init) => ipcRenderer.invoke('http', url, init),
  google: {
    hasSession: () => ipcRenderer.sendSync('google:has'),
    getToken: (cfg) => ipcRenderer.invoke('google:token', cfg).catch((e) => { throw clean(e); }),
    invalidate: () => ipcRenderer.invoke('google:invalidate'),
    signOut: () => ipcRenderer.invoke('google:signout'),
  },
});
