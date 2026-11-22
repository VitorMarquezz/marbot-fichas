// Análise da receita pela IA (Claude ou Gemini), direto do navegador.
// A IA só lê a receita e devolve dados estruturados; a escrita na planilha é feita pelo app.
import { http } from './http.js';
import { parseRecipeLocally } from './localParser.js';

const SCHEMA = {
  type: 'object',
  properties: {
    nome_receita: { type: 'string', description: 'Nome curto da receita, como vai aparecer no título da ficha.' },
    aba_sugerida: { type: 'string', description: 'Nome EXATO da aba existente que mais combina, ou "" se nenhuma combinar.' },
    nomes_aba_sugeridos: { type: 'array', items: { type: 'string' }, description: '2 ou 3 nomes curtos em MAIÚSCULAS para o caso de criar uma aba nova.' },
    peso_total_massa_g: { type: 'number' },
    tamanho_peca_g: { type: 'number', description: 'Peso típico de uma unidade pronta deste doce, em gramas.' },
    perda_coccao_pct: { type: 'number', description: 'Quanto do peso cru se perde no cozimento, forno ou ponto (ex.: brigadeiro ~20, bolo ~10, biscoito ~12, ganache sem fogo 0).' },
    rendimento_informado: { type: 'number', description: 'Rendimento escrito na própria receita (ex.: "rende 30 unidades" → 30), ou 0 se não houver.' },
    tem_modo_preparo: { type: 'boolean', description: 'true se a receita traz modo de preparo, false se for só a lista de ingredientes.' },
    ingredientes_texto: { type: 'array', items: { type: 'string' }, description: 'As linhas de ingredientes exatamente como estão na receita, incluindo subtítulos como "Massa:".' },
    modo_preparo: { type: 'array', items: { type: 'string' }, description: 'Os passos do modo de preparo, um por item, com o texto da receita. Vazio se não houver.' },
    rendimentos_sugeridos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { unidades: { type: 'number' }, descricao: { type: 'string', description: 'Ex.: "peças de 15 g"' } },
        required: ['unidades', 'descricao'],
      },
    },
    ingredientes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto_original: { type: 'string' },
          secao: { type: 'string', description: 'Parte da receita a que o ingrediente pertence, com o nome dado na receita (ex.: "Massa choux", "Recheio de brigadeiro", "Recheio de doce de leite"). "" se a receita não tiver partes.' },
          quantidade: { type: 'number', description: 'Já convertida para a MEDIDA DO CADASTRADO: gramas, ou unidades quando ele estiver em "un."' },
          quantidade_receita: { type: 'number', description: 'Quantidade como a receita pede, com volume já passado para gramas (ex.: 150 para "150 g de gemas", 3 para "3 gemas").' },
          unidade_receita: { type: 'string', enum: ['g', 'un.'], description: 'Unidade de quantidade_receita.' },
          parte: { type: 'string', description: 'O que a receita pede de fato, quando é parte do cadastrado ou outra forma dele (ex.: "gema", "clara", "suco de limão", "raspas de laranja"). Senão, o próprio nome.' },
          observacao_conversao: { type: 'string', description: 'Só quando a unidade da receita for diferente da do cadastrado: a conta feita, ex.: "150 g de gema ≈ 9 ovos (18 g cada)". Senão, "".' },
          ingrediente_cadastrado: { type: 'string', description: 'Nome EXATO copiado da lista de cadastrados, ou "" se não existir.' },
          similares: { type: 'array', items: { type: 'string' }, description: 'Até 3 nomes EXATOS da lista que são parecidos (só quando não existir).' },
          nome_sugerido_novo: { type: 'string', description: 'Nome para cadastrar, se for preciso criar.' },
          unidade_cadastro: { type: 'string', enum: ['g', 'ml', 'un.'] },
        },
        required: ['texto_original', 'quantidade', 'ingrediente_cadastrado'],
      },
    },
    perguntas: {
      type: 'array',
      description: 'Só dúvidas reais (quantidade ambígua, "a gosto", "1 lata", unidade incerta).',
      items: {
        type: 'object',
        properties: {
          pergunta: { type: 'string' },
          indice_ingrediente: { type: 'number', description: 'Índice em "ingredientes" que a resposta corrige, ou -1.' },
          opcoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { rotulo: { type: 'string' }, quantidade: { type: 'number' } },
              required: ['rotulo'],
            },
          },
        },
        required: ['pergunta', 'opcoes'],
      },
    },
  },
  required: ['nome_receita', 'ingredientes', 'rendimentos_sugeridos', 'tem_modo_preparo'],
};

function buildPrompt({ recipeText, catalog, tabs, substitutions }) {
  const list = catalog.map((i) => `${i.name} | ${i.pack} | ${i.unit || 'g'} | ${i.price}`).join('\n');
  const subs = substitutions.filter((s) => s.from && s.to).map((s) => `- ${s.from} → "${s.to}"`).join('\n');
  const system = `Você ajuda o Marbot Ateliê (confeitaria) a cadastrar fichas de custo de receitas numa planilha.
Seu trabalho é LER a receita e devolver os dados da ficha. Para a ficha de custo valem só os ingredientes; o modo de preparo é copiado à parte.

Regras:
1. Se a receita tiver partes (massa, recheios, cobertura, calda…), NÃO misture: liste os ingredientes de cada parte juntos, na ordem da receita, com o nome da parte em "secao" (use o nome que a receita dá; se forem dois recheios sem nome, "Recheio 1" e "Recheio 2"). Um ingrediente que aparece em duas partes entra uma vez em cada parte. Dentro da mesma parte, some as quantidades repetidas. Sem partes, "secao" = "".
2. Converta tudo para gramas. Use conversões usuais de confeitaria (1 xícara de farinha ≈ 120 g, açúcar ≈ 180 g, líquidos ≈ 240 g, 1 colher de sopa ≈ 15 g, 1 lata de leite condensado = 395 g, 1 caixinha de creme de leite = 200 g, 1 ovo ≈ 50 g).
   A "quantidade" fica SEMPRE na medida do ingrediente cadastrado (coluna Medida da lista). Confira cada um:
   - Cadastrado em "un." e a receita pede peso/volume (ex.: "150 g de gemas" e Ovos em un.): calcule quantas unidades usar com pesos médios (gema ≈ 18 g, clara ≈ 32 g, ovo inteiro ≈ 50 g, limão ≈ 80 g ou ≈ 30 ml de suco, laranja ≈ 180 g ou ≈ 90 ml de suco, banana ≈ 100 g, morango ≈ 15 g) e arredonde para cima. Ex.: 150 g de gema → 9 ovos.
   - Cadastrado em g/ml e a receita pede unidades (ex.: "3 ovos" e Ovo em g): passe para gramas (3 × 50 = 150 g).
   - Vale para QUALQUER ingrediente, inclusive partes dele (gema/clara do ovo, suco/raspas da fruta).
   Sempre que fizer essa troca de unidade, explique em observacao_conversao (ex.: "150 g de gema ≈ 9 ovos (18 g cada)") e preencha quantidade_receita, unidade_receita e parte com o que a receita pediu.
3. "ingrediente_cadastrado" deve ser copiado EXATAMENTE como aparece na lista (maiúsculas, acentos, espaços). Se não houver correspondência segura, deixe "" e preencha "similares" com até 3 nomes exatos parecidos.
4. Substituições fixas (use sempre o nome da direita):
${subs || '- (nenhuma)'}
5. Rendimento: some o peso cru de tudo (peso_total_massa_g), estime a perda no cozimento (perda_coccao_pct) e o peso da peça pronta (tamanho_peca_g). Dê 2 ou 3 opções em rendimentos_sugeridos com unidades = peso cru × (1 − perda/100) ÷ peça. Se a receita disser quanto rende, use em rendimento_informado.
6. Só faça perguntas quando a quantidade for realmente ambígua; dê 2 a 4 opções com a quantidade já em gramas/unidades.
7. Para aba_sugerida use apenas um destes nomes: ${tabs.join(', ')}.
8. Copie as linhas de ingredientes em ingredientes_texto e os passos do modo de preparo em modo_preparo, sem reescrever. Quando houver partes, ponha antes de cada grupo uma linha só com o nome da parte terminada em ":" (ex.: "Massa choux:"), tanto em ingredientes_texto quanto em modo_preparo. Se só houver ingredientes, tem_modo_preparo = false e modo_preparo = [].`;

  const user = `INGREDIENTES CADASTRADOS (Nome | Peso/Qt. pacote | Medida | Preço):
${list || '(lista vazia)'}

RECEITA:
${recipeText || '(veja a imagem anexada)'}`;
  return { system, user };
}

// Modelos do Gemini com plano gratuito (sem cobrança), na ordem em que o app tenta.
export const FREE_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite'];

/**
 * Lê a receita. Gratuito por padrão:
 * Gemini (plano grátis) → outros modelos grátis se o limite do dia acabar → leitor local (sem IA).
 * @returns {{ raw: object, source: string, notice: string }}
 */
export async function analyzeRecipe({ settings, recipeText, images = [], catalog, tabs }) {
  const { system, user } = buildPrompt({ recipeText, catalog, tabs, substitutions: settings.substitutions });
  const local = (why) => {
    if (!String(recipeText || '').trim()) {
      throw new Error(`${why} O leitor sem IA só lê texto: cole a receita escrita em vez da foto.`);
    }
    return {
      raw: parseRecipeLocally({ recipeText, catalog, tabs: tabs, substitutions: settings.substitutions }),
      source: 'local',
      notice: why ? `${why} Li a receita com o leitor sem IA — confira as quantidades na revisão.` : '',
    };
  };

  if (settings.provider === 'local') return local('');

  if (settings.provider === 'claude') {
    return { raw: await callClaude(settings, system, user, images), source: 'claude', notice: '' };
  }

  if (!settings.geminiKey.trim()) return local('Nenhuma chave do Gemini configurada.');
  try {
    return await geminiChain(settings, system, user, images, SCHEMA);
  } catch (e) {
    return local(`O Gemini não respondeu (${e.message || 'erro desconhecido'}).`);
  }
}

// Tenta o modelo escolhido e depois os outros modelos grátis.
async function geminiChain(settings, system, user, images, schema) {
  const chain = [settings.geminiModel.trim(), ...FREE_GEMINI_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr = null;
  for (const model of chain) {
    try {
      const raw = await callGemini({ ...settings, geminiModel: model }, system, user, images, schema);
      const switched = model !== chain[0];
      return { raw, source: model, notice: switched ? `O limite grátis do ${chain[0]} acabou por hoje; usei o ${model}.` : '' };
    } catch (e) {
      lastErr = e;
      if (!e.retryable) break; // chave recusada, sem internet etc.: não adianta tentar outro modelo
    }
  }
  throw lastErr || new Error('erro desconhecido');
}

/** Pergunta à IA configurada e devolve o JSON no formato do schema. Sem IA disponível, lança erro. */
export async function askAi(settings, system, user, schema) {
  if (settings.provider === 'claude' && settings.claudeKey.trim()) return callClaude(settings, system, user, [], schema);
  if (settings.provider !== 'local' && settings.geminiKey.trim()) return (await geminiChain(settings, system, user, [], schema)).raw;
  throw new Error('O chat precisa da IA ligada. Escolha Gemini ou Claude nas configurações.');
}

async function callClaude(s, system, user, images, schema = SCHEMA) {
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })),
    { type: 'text', text: user },
  ];
  const res = await http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.claudeKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: s.claudeModel.trim(),
      max_tokens: 4096,
      system,
      tools: [{ name: 'registrar_ficha', description: 'Registra os dados pedidos.', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'registrar_ficha' },
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(aiError('Claude', res.status, data?.error?.message));
  const block = (data.content || []).find((b) => b.type === 'tool_use');
  if (!block) throw new Error('O Claude não devolveu a ficha. Tente de novo.');
  return block.input;
}

async function callGemini(s, system, user, images, schema = SCHEMA) {
  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })),
    { text: `${user}\n\nResponda SOMENTE com um JSON válido neste formato (JSON Schema):\n${JSON.stringify(schema)}` },
  ];
  const model = s.geminiModel.trim().replace(/^models\//, '');
  const res = await geminiFetch(s, `models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(aiError('Gemini', res.status, data?.error?.message));
    err.retryable = res.status === 429 || res.status === 404 || res.status >= 500 || (res.status === 400 && /model/i.test(data?.error?.message || ''));
    throw err;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return parseJson(text);
}

export async function listModels(s) {
  if (s.provider === 'gemini') {
    const res = await geminiFetch(s, 'models?pageSize=200', {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(aiError('Gemini', res.status, data?.error?.message));
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
  }
  const res = await http('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': s.claudeKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(aiError('Claude', res.status, data?.error?.message));
  return (data.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
}

// Chaves do AI Studio podem ser do formato antigo (AIza…) ou novo (AQ.…).
// Envia no cabeçalho; se o Google recusar, tenta de novo com ?key= na URL.
async function geminiFetch(s, path, init) {
  const key = s.geminiKey.trim();
  const base = 'https://generativelanguage.googleapis.com/v1beta/';
  const res = await http(base + path, { ...init, headers: { ...(init.headers || {}), 'x-goog-api-key': key } });
  if (res.status !== 401 && res.status !== 403) return res;
  const sep = path.includes('?') ? '&' : '?';
  return http(`${base}${path}${sep}key=${encodeURIComponent(key)}`, init);
}

function aiError(name, status, msg) {
  if (status === 401 || status === 403) return `A chave do ${name} foi recusada. Confira a chave nas configurações.`;
  if (status === 404) return `O modelo do ${name} não foi encontrado. Escolha outro modelo nas configurações.`;
  if (status === 429) return `limite gratuito do ${name} atingido`;
  return `${name} respondeu com erro ${status}${msg ? `: ${msg}` : ''}.`;
}

function parseJson(text) {
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('A IA devolveu uma resposta que não deu para ler. Tente de novo.');
  }
}

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const [head, data] = String(r.result).split(',');
      resolve({ name: file.name, mime: head.match(/data:(.*?);/)[1], data, url: r.result });
    };
    r.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    r.readAsDataURL(file);
  });
}
