# Como contribuir com o Meu Bolso

Obrigado pelo interesse! O Meu Bolso é um app de finanças pessoais em português, sem servidor: os dados ficam no aparelho de quem usa. Toda contribuição precisa manter isso.

## Preparar o ambiente

Não há etapa de build para o app web:

```bash
git clone https://github.com/playart1583-hue/app-financeiro.git
cd app-financeiro
npm start          # serve a pasta em http://localhost:8080 (ou: python3 -m http.server 8080)
npm test           # testes com o runner nativo do Node (node --test), Node 22+
```

Para o app Android é preciso JDK 21 e Android SDK (veja *App Android* no [README](README.md)). Os APKs assinados são gerados só pelo GitHub Actions do repositório principal; para testar no seu celular, gere um build de debug (`cd android && ./gradlew assembleDebug`).

## Onde fica cada coisa

| Pasta / arquivo | O que tem | Tem teste? |
|---|---|---|
| `packages/comprovantes-br/` | leitura de comprovantes (pacote npm [`comprovantes-br`](packages/comprovantes-br/README.md), usado pelo app) | sim, com texto real de prints (`packages/comprovantes-br/test/fixtures/prints.js`) |
| `js/parser.js` | registro rápido, notificações coladas, contratos, Serasa | sim |
| `js/finance.js`, `js/analytics.js`, `js/interest.js` | cálculos: juros, Price, projeções, juros por operação | sim |
| `js/importers.js`, `js/documents.js` | CSV, OFX, planilhas, PDF, faturas | sim |
| `js/cards.js`, `js/transfers.js`, `js/insights.js` | ciclo do cartão, transferências entre contas, conselhos | parcial |
| `js/store.js` | estado, persistência no aparelho, perfis | pouco (depende do navegador) |
| `js/views/*.js` | telas | não (testadas à mão e com Playwright local) |
| `android/` | casca Android (Capacitor) e plugins Java | não |

Prefira colocar regras em funções puras (sem DOM) em `js/*.js` e testar lá; as telas só montam HTML e chamam essas funções.

## Padrões de código

- JavaScript moderno em módulos ES, sem framework e sem etapa de build. Não adicione dependências sem discutir antes numa issue.
- Comentários e textos da interface em português do Brasil, curtos e explicando o *porquê*.
- Valores em reais sempre com duas casas (`round2`) e formatados com `money()` de `js/ui.js`.
- **O app não inventa números**: taxa de juros, valor de quitação e afins só entram quando vêm do usuário, de um documento ou de uma conta com os números dele. Não adicione "taxas médias de mercado" nem estimativas apresentadas como fato.
- Cores e espaçamentos pelos tokens de `css/app.css` (tema claro e escuro). Confira em 360 px de largura.
- Rode `npm test` antes de abrir o PR.

## Leitura de prints com erro (a contribuição mais útil)

Se um comprovante foi lido errado (valor, parcelas, data, destinatário):

1. Abra uma issue com o modelo **"Print lido errado"**, dizendo o banco/app e o que saiu errado.
2. **Não anexe o print original.** Cole o texto lido (ou descreva o layout) trocando nomes, CPF, IDs de transação, endereço e números de conta por dados fictícios.
3. Num PR, adicione o texto anonimizado em `packages/comprovantes-br/test/fixtures/prints.js` e o resultado esperado em `packages/comprovantes-br/test/receipts.test.js`, junto com a correção em `packages/comprovantes-br/src/index.js`. Todos os prints da lista precisam continuar passando: é assim que uma correção não quebra outro banco.

## Dados pessoais e segurança

- Nunca faça commit de dados reais: nomes, CPF, prints, extratos, backups (`.json` exportado), chaves de API ou a chave de assinatura (`android/keystore/meubolso.jks`, `keystore.properties`, que estão no `.gitignore`).
- O app não envia dados para servidor nenhum. A única saída de rede opcional é a leitura de prints pela API do Claude, com a chave do próprio usuário. Mudanças que enviem dados para fora precisam ser discutidas numa issue antes.
- Bibliotecas de CDN ficam todas em `js/libs.js`, com versão fixa e hash de integridade (SRI) quando são `<script>` comuns. A `Content-Security-Policy` do `index.html` só libera esses hosts, bloqueia `eval` e não deixa a página mandar dados nem carregar imagens de outros sites. Para trocar ou adicionar uma biblioteca, mexa nos dois lugares; `tests/security.test.js` confere.
- Encontrou uma falha de segurança? Não abra issue pública: escreva para o mantenedor pelo e-mail do perfil do GitHub.

## Issues e pull requests

- **Issue primeiro** para mudanças grandes (tela nova, formato de dados, dependência nova); correções pequenas podem ir direto em PR.
- Um assunto por PR, com descrição do que mudou e de como testar (prints de tela ajudam em mudanças visuais).
- Mensagens de commit em português, no imperativo ou descritivas: `Lê "Parcelamento 2" como 2 parcelas`.
- O CI roda `npm test` em todo PR; ele precisa passar.
- Ao contribuir, você concorda que seu código seja distribuído sob a [licença MIT](LICENSE) do projeto.

## Conduta

Seja respeitoso e paciente: muita gente que usa o app não é da área de tecnologia, e as issues vão chegar escritas do jeito de cada um.
