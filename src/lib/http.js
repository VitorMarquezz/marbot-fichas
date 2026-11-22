// No app de desktop, as chamadas às APIs passam pelo processo principal (sem restrições de CORS
// e usando o proxy do Windows). No navegador, é o fetch normal.
const bridge = typeof window !== 'undefined' ? window.marbotDesktop?.http : null;

export async function http(url, init = {}) {
  if (!bridge) return fetch(url, init);
  let r;
  try {
    r = await bridge(url, { method: init.method || 'GET', headers: init.headers || {}, body: init.body });
  } catch (e) {
    throw new Error(`Sem conexão com ${new URL(url).host}. Verifique a internet. (${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')})`);
  }
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => JSON.parse(r.body),
    text: async () => r.body,
  };
}
