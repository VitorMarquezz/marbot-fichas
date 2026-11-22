# Marbot Fichas

**Fichas de custo, receitas e financeiro de uma confeitaria, em um app de desktop gratuito.**

Você cola (ou fotografa) uma receita, a IA lê os ingredientes, o app confere tudo com a lista de preços da planilha e grava a ficha de custo pronta — com preço de venda, margem e lucro — no Google Sheets. A receita completa, com modo de preparo, vai para o Notion. E a aba Financeiro mostra as entradas e saídas das contas bancárias pelo Open Finance.

<!-- Para o vídeo tocar aqui: no github.com, edite este README, arraste o docs/demo.mp4 para esta linha e salve. -->
> ▶ **[Assista ao vídeo de demonstração](docs/demo.mp4)**

---

## Por que eu criei

<!-- TODO: escreva aqui, com as suas palavras, por que você criou o app e que problema ele resolve no dia a dia do ateliê (3 a 6 linhas). -->

## Feito por mim, com estas ferramentas

Este app foi idealizado e construído por **Marbot Ateliê**, com a ajuda do **[Claude](https://claude.ai)** (IA da Anthropic) como parceiro de programação — do código às integrações.

| Ferramenta | Para que serve no app | Custo |
| --- | --- | --- |
| **Claude** (Anthropic) | Desenvolvimento do app junto comigo | — |
| **Google Gemini** | IA que lê a receita (texto ou foto) e entende os ingredientes | plano gratuito |
| **Google Sheets** | Planilha com ingredientes, parâmetros e as fichas de custo | grátis |
| **Google Drive** | Guarda as configurações do app na sua conta Google | grátis |
| **Notion** | Receita completa, com modo de preparo, organizada por categoria | grátis |
| **Meu Pluggy** (Open Finance) | Liga as contas do banco e traz o extrato | grátis |
| **Vercel** | Função na nuvem que conversa com o Meu Pluggy | plano Hobby gratuito |
| **Electron + React + Vite** | O app de desktop para Windows | código aberto |

**O app funciona 100% de graça:** não há nenhuma assinatura paga. Sem a chave do Gemini, ele ainda lê receitas com um leitor próprio, sem IA e sem internet.

## O que ele faz

**Fichas de custo**
- Lê a receita colada ou em foto e separa os ingredientes por parte (massa, recheios, cobertura).
- Confere cada ingrediente com a planilha; se não achar, sugere parecidos, deixa escolher qualquer outro da lista ou cadastrar um novo.
- Converte medidas (xícaras, colheres, latas) e unidades — ex.: "150 g de gemas" com ovos cadastrados por unidade vira "≈ 9 ovos", com a conta anotada na ficha.
- Calcula o rendimento pelo peso da massa, a perda no cozimento e o tamanho da peça (com um chat para explicar casos diferentes).
- Grava a ficha no mesmo layout da planilha, com perda, custo fixo, embalagens, margem, taxa do cartão, preço de venda e lucro.
- Navega por todas as fichas, edita, apaga e mantém o Notion sincronizado.

**Financeiro**
- Conecta o banco pelo Meu Pluggy e grava o extrato em uma planilha.
- Resumo do mês, saldo das contas, gastos por categoria (clicáveis) e busca nos lançamentos.
- Mostra quando o banco foi atualizado e quando será a próxima atualização.

**Outros**
- Modo offline (somente leitura) com a última cópia dos dados.
- Configurações salvas na conta Google, para usar em mais de um computador.
- Modo demonstração, para conhecer o app sem conectar nada.

## Como rodar

Pré-requisitos: [Node.js](https://nodejs.org) 20+ e Windows (para gerar o app de desktop).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Preencha o `.env.local` com as suas chaves (cada uma está explicada no arquivo). Nenhuma é obrigatória para testar: sem elas, use o **modo demonstração**.

```bash
npm run dev
```

```bash
npm run app
```

O primeiro abre no navegador; o segundo abre o app de desktop. Para gerar a versão portátil do Windows, use `npm run portable`.

O passo a passo completo — Google Cloud, Gemini, Notion e a função do financeiro na Vercel — está no [LEIAME.md](LEIAME.md). As variáveis da função ficam em [`vercel/.env.example`](vercel/.env.example) e são cadastradas no painel da Vercel.

## Estrutura

```
src/            telas (React) e lógica: leitura da receita, custos, planilha, Notion, financeiro
electron/       app de desktop: janela, login com o Google, acesso seguro à internet
vercel/api/     função do financeiro (Meu Pluggy → app)
site/           páginas de apresentação e política de privacidade
docs/           vídeo de demonstração
```

## Privacidade

O app só lê e grava as planilhas da própria conta Google e a página do Notion escolhida. Chaves e tokens ficam no computador de quem usa (ou nas variáveis secretas da Vercel) e **nunca** vão para este repositório — veja o `.gitignore`.
