# Marbot Fichas

App de desktop em **Electron.js** (Windows, versão portátil) para cadastrar receitas na planilha de precificação **Claude Marbot** (Google Sheets), com leitura da receita por IA (Claude ou Gemini).

Na seção **Planilha**, cada aba vira um botão no topo e as receitas aparecem em cartões que abrem com a ficha completa (ingredientes, custos, preço por unidade e lucro). A aba **Ingredientes** mostra preços e embalagens.

Na seção **Nova receita**, o fluxo é o mesmo que usamos no chat:

1. Você cola a receita (ou anexa uma foto).
2. O app lê as abas e a aba **INGREDIENTES**. A IA extrai os ingredientes, converte para gramas (ou unidades) e estima o rendimento.
3. As dúvidas aparecem como **opções clicáveis**, até 4 por vez: em qual aba adicionar (ou criar uma nova), rendimento, ingredientes não cadastrados e quantidades ambíguas.
4. Você revisa a ficha, com a prévia dos preços calculada pela mesma conta da planilha.
5. O app grava a ficha no modelo da aba **BISCOITOS** (fórmulas, mesclas, menus suspensos e formatos). Depois lê de volta e confere se alguma célula deu erro ou ficou sem preço.

---

## 1. Abrir o app (versão portátil, sem instalar)

1. Descompacte **Marbot-Fichas-Portatil.zip** onde preferir (ex.: `Documentos`). Vai aparecer a pasta **Marbot Fichas**.
2. Dentro dela, dê dois cliques em **Marbot Fichas.exe**.
3. Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem assinatura digital paga, e só acontece na primeira vez.

Dica: clique com o botão direito em **Marbot Fichas.exe → Mostrar mais opções → Enviar para → Área de trabalho (criar atalho)** para abrir pela área de trabalho.

Não precisa instalar nada nem ter Node.js. Para remover, é só apagar a pasta.

Para experimentar antes de configurar: abra o app e clique em **Experimentar com dados de exemplo**. Nesse modo nada é gravado.

---

## 2. Conectar o Google Sheets (uma vez só)

Você vai criar um "ID do cliente" no Google Cloud. É grátis e leva uns 10 minutos.

1. Acesse **https://console.cloud.google.com** com a sua conta Google. No topo, clique no seletor de projeto → **Novo projeto** → nome "Marbot Fichas" → **Criar**. Confira que esse projeto está selecionado.
2. Menu ☰ → **APIs e serviços → Biblioteca** → procure **Google Sheets API** → **Ativar**.
3. Menu ☰ → **APIs e serviços → Tela de consentimento OAuth** (pode aparecer como **Google Auth Platform**) → **Começar**:
   - Nome do app: `Marbot Fichas`; e-mail de suporte: o seu.
   - Público: **Externo**.
   - Dados de contato: o seu e-mail → aceite os termos → **Criar**.
4. Em **Público-alvo**, clique em **Publicar app** e confirme. Sem esse passo, o Google desconecta o app a cada 7 dias.
5. Em **Clientes** (ou **Credenciais → Criar credenciais → ID do cliente OAuth**):
   - Tipo de aplicativo: **App para computador**; nome: `Marbot Fichas` → **Criar**.
   - Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e a **Chave secreta do cliente** (começa com `GOCSPX-`).
6. No app, abra **Configurações** (engrenagem) → cole os dois em **Google Sheets** → **Entrar com o Google**.
7. O login abre no navegador. O Google vai avisar que "o Google não verificou este app". Clique em **Avançado → Acessar Marbot Fichas (não seguro)** → marque o acesso às planilhas → **Continuar**. O aviso aparece porque o app é seu, não de uma empresa verificada.

Depois disso o app continua conectado, mesmo fechando e abrindo de novo.

---

## 3. IA gratuita

O app funciona **sem nenhum custo**. Em **Configurações → Inteligência artificial** há três opções:

| Opção | Custo | Como funciona |
|---|---|---|
| **Gemini · grátis** (padrão) | Grátis | Usa o plano gratuito do Google AI Studio. Lê texto e fotos. |
| **Sem IA · grátis** | Grátis | Leitor no próprio computador, sem internet. Lê só texto. |
| **Claude · pago** | Cobrado por uso | Opcional. Só use se quiser pagar. |

Com o Gemini, se o limite grátis do dia acabar, o app passa sozinho para outro modelo grátis. Se todos acabarem, ou se faltar internet, ele usa o leitor sem IA e avisa na tela. Os limites renovam todo dia.

Modelos grátis usados: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash` e `gemini-3.1-flash-lite`.

**Para ter certeza de que nunca será cobrado:**
1. Em **aistudio.google.com → API keys**, veja o plano do projeto da sua chave. Ele deve aparecer como **Free** (gratuito).
2. Não clique em "Set up billing" ou "Ativar faturamento". Sem faturamento, o Google não tem como cobrar; ele só bloqueia até o dia seguinte.

No plano gratuito, o Google pode usar o conteúdo enviado (as receitas) para melhorar os produtos dele.

O Google Sheets e o login do Google também são gratuitos.

---|---|---|
| **Claude** | console.anthropic.com → API Keys | `claude-sonnet-5-5` |
| **Gemini** | aistudio.google.com → Get API key (chaves `AQ.` ou `AIza`) | `gemini-3.8-flash` |

Clique em **Testar chave**. Se a chave for aceita, aparece a lista de modelos disponíveis para você escolher.

---

## Como a ficha é gravada

- **Aba existente:** a ficha entra 2 linhas abaixo da última linha usada em B:I. Nenhuma outra receita é alterada.
- **Nova aba:** o app duplica a BISCOITOS e apaga tudo da linha 4 para baixo (valores, mesclas e menus suspensos). Depois troca o título de B1 para `MARBOT ATELIÊ  ·  NOME DA ABA` e monta a ficha a partir da linha 4.
- **Ingrediente novo:** entra no fim da tabela B:E da aba INGREDIENTES antes de a ficha ser gravada, para o PROCV já puxar o preço.
- **Embalagem:** as 3 linhas ficam em branco, com menu suspenso, para você escolher na planilha.
- **Cores:** nenhuma cor é pintada. A formatação condicional da aba cuida disso.
- **Fórmulas:** o app usa a sintaxe em português (`;` e `0,5`). Se a planilha recusar, ele regrava com a sintaxe internacional e passa a usar essa.

## Segurança

- As chaves da IA ficam salvas só neste computador.
- O login do Google fica guardado criptografado pelo Windows.
- Suas configurações ficam em `%APPDATA%\marbot-fichas`, fora da pasta do app. Por isso, ao trocar a pasta por uma versão nova, nada se perde. Para zerar tudo, apague essa pasta.

---

## Para quem for mexer no código

O app precisa de Node.js 18 ou mais novo.

```bash
npm install
npm run dev        # versão de navegador em http://localhost:5173 (usa ID do cliente "Aplicativo da Web")
npm start          # abre o app Electron
npm run portable   # gera release/Marbot-Fichas-Portatil.zip (Windows x64)
```

Para lançar uma versão nova, mude `version` no `package.json`, rode `npm run portable` e troque a pasta antiga pela nova. Configurações e login são mantidos.

```
electron/      app de desktop (janela, login Google pelo navegador, chamadas às APIs)
build/         ícone do app
src/           interface em React (etapas, perguntas, revisão, gravação)
src/lib/       IA, planilha, modelo da ficha, prévia de custos, modo demonstração
```

## Notion (receita completa com modo de preparo)

Quando a receita colada tiver modo de preparo, o app grava só os ingredientes na planilha e salva a receita completa (ingredientes + modo de preparo) no Notion.

1. Em notion.so/profile/integrations, clique em **Nova integração**, dê o nome "Marbot Fichas", tipo **Interna**, e copie o **Token de integração interna** (começa com `ntn_`).
2. No Notion, abra a base de dados (ou a página) onde as receitas devem ficar, clique em **•••** → **Conexões** e adicione **Marbot Fichas**.
3. No app, em **Configurações → Notion**, cole o token e o link da base/página e clique em **Testar conexão**.

Se você colar o link de uma página, o botão **Criar base de receitas aqui** cria a base "Receitas Marbot" (Nome, Aba, Rendimento, Modo de preparo, Criada em) dentro dela e já deixa configurada. Numa base de dados, cada receita vira uma linha; colunas chamadas "Aba"/"Categoria" e "Rendimento" são preenchidas se existirem. Numa página, cada receita vira uma subpágina.

## Financeiro (extratos pelo Open Finance)

O app mostra entradas, saídas e saldos das suas contas. O caminho é: **Meu Pluggy** (grátis, até 5 conexões suas) → **função na Vercel** (plano Hobby, grátis e sem cartão; guarda o segredo da Pluggy) → planilha **Marbot Financeiro** → tela **Financeiro** do app. A função só responde para a conta Google que consegue abrir a planilha Marbot Financeiro.

1. **Conectar os bancos:** em meu.pluggy.ai, conecte seus bancos pelo Open Finance (o login do banco é feito por você).
2. **Vercel:** crie uma conta grátis em vercel.com.
3. **Publicar a função** (na pasta `vercel` do código):
   `npx vercel login` e depois `npx vercel deploy --prod` (nome do projeto: `marbot-financeiro`).
4. **Variáveis de ambiente:** no painel da Vercel, em **Project → Settings → Environment Variables**, crie (ambiente Production):
   - `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (credenciais da Pluggy, marcadas como *Sensitive*)
   - `FINANCE_SHEET_ID` = o ID da sua planilha Financeiro (o trecho entre `/d/` e `/edit` no link)
   Depois rode `npx vercel deploy --prod` de novo para valer.
5. **No app:** Configurações → Financeiro → cole `https://marbot-financeiro.vercel.app/api/financeiro` (ou o endereço que a Vercel mostrar). Na tela Financeiro, clique em **Conectar banco**, escolha **MeuPluggy** e entre com a sua conta do meu.pluggy.ai. Depois clique em **Buscar no banco**.

As novidades do banco chegam ao Meu Pluggy uma vez por dia. Categoria e observação editadas na planilha (ou no app) são mantidas nas próximas buscas.
