# comprovantes-br

Lê o **texto** de comprovantes, notificações e prints de bancos e carteiras brasileiras (Pix, Pix parcelado, cartão, boleto, transferência) e devolve valor, data, horário, forma de pagamento, parcelas, taxas, cartão e destinatário.

- Sem dependências, sem rede: funções puras que rodam no navegador e no Node 18+.
- Feito para texto de OCR, que vem cheio de ruído: relógio da barra de status, propaganda no fim do comprovante, centavos lidos errado.
- Testado com texto real de prints (Mercado Pago, 99Pay, Bradesco, Amazon e outros), com os dados pessoais trocados.

Nasceu dentro do [Meu Bolso](https://github.com/playart1583-hue/app-financeiro), um app de finanças pessoais open source, e é o mesmo código que o app usa.

> **English:** a dependency-free parser for the text of Brazilian payment receipts and notifications (Pix, Pix installments, credit card, boleto, bank transfer). Feed it OCR or pasted text; it returns amount, date, time, payment method, installments, fees, card and payee. Works in browsers and Node 18+. MIT licensed.

## Instalar

```bash
npm install comprovantes-br
```

É um módulo ES (`import`). Em projetos CommonJS, use `await import('comprovantes-br')` ou Node 22+, que aceita `require`.

## Usar

```js
import { parseReceipt } from 'comprovantes-br';

const texto = `Transferência concluída com sucesso
R$42,96
Para A&M 2BUSINESS LTDA
Valor original R$42,96
Parcelamento 2 x R$24,49
Data 22/10/26 20:34:01
Vincule sua chave Pix e ganhe até
R$5,00`;

parseReceipt(texto);
```

```js
{
  type: 'expense',
  amount: 42.96,                  // valor sem juros; a parcela vem em installmentValue
  merchant: 'A&M 2BUSINESS LTDA',
  description: 'Pix parcelado para A&M 2Business',
  date: '2026-10-22',
  dueDate: null,
  time: '20:34',
  method: 'pix_parcelado',
  card: null,
  installments: 2,
  installmentValue: 24.49,
  cashPrice: 42.96,
  fee: null,
  feeKind: null,
  location: null,
  category: null,
  app: null
}
```

Comprovante com taxa: o valor é o total pago e a taxa vem separada.

```js
parseReceipt('Valor da conta R$30,00\nTaxa de transação R$1,49\nTransferir para BANCO CSF');
// { amount: 31.49, fee: 1.49, feeKind: 'taxa', description: 'BANCO CSF', ... }
```

### Opções

```js
parseReceipt(texto, {
  today: new Date(2026, 9, 22),             // referência para "hoje", "ontem" e datas sem ano
  categorize: (texto, tipo) => 'mercado',   // sua função de categorias (opcional)
});
```

Os tipos TypeScript vêm junto (`index.d.ts`).

### Outras funções

| Função | Exemplo |
|---|---|
| `parseAmount(texto)` | `'1.234,56'` → `1234.56` |
| `findDate(texto, hoje?)` | `'23/out - 07:39'` → `'2026-10-23'` |
| `findTime(texto)` | `'22/10/26 12:47:58'` → `'12:47'` |
| `findInstallments(normalize(texto))` | `'Parcelamento 2xR$24,49'` → `{ n: 2, pmt: 24.49 }` |
| `findCard(texto)` | `'Visa terminando em 2223'` → `{ last4: '2223', brand: 'Visa', bank: null }` |
| `stripAds(texto)` | tira o bloco "Vincule sua chave Pix e ganhe…" |
| `nameCase(nome)` | `'A&M 2BUSINESS LTDA'` → `'A&M 2Business'` |
| `flowDirection(normalize(texto))` | `'pix recebido'` → `'income'` |
| `normalize(texto)` | minúsculas e sem acentos |

## O que ele entende

- **Valores:** `R$ 1.234,56`, `R$1,49`; total pago com taxa; parcela = valor pago ÷ parcelas quando o print só mostra o total.
- **Parcelas:** `6x de R$ 36,35`, `2xR$24,49`, `em 10 parcelas`, `Parcelamento 2`. Não confunde com hora (`12:48` + o X de fechar a tela) nem com "parcela 2/10".
- **Forma de pagamento:** Pix, Pix parcelado (transferência com parcelamento, mesmo com anúncio de "chave Pix" na tela), crédito, débito, boleto, transferência.
- **Taxas:** taxa de transação, tarifa, IOF (`feeKind: 'taxa'`); juros, multa, mora e encargos (`feeKind: 'juros'`). "Sem juros", desconto e taxa em % não contam como cobrança.
- **Cartão:** `final 8238`, `terminando em 8238`, `**** 8238`, número mascarado inteiro, `Cartão: 8238`, `Visa 8238`, banco e bandeira.
- **Destinatário:** `Para NOME`, `Transferido para NOME` (juntando nome quebrado em duas linhas), nome acima de "Pix enviado" (Mercado Pago, Nubank), loja numa linha em maiúsculas; ignora nomes mascarados (`A&M ****`).
- **Datas:** `22/10/2026`, `22/10/26`, `14 de outubro de 2026`, `23/out`, `hoje`, `ontem`; vencimento de boleto separado da data do pagamento.

## Limites

- Ele lê **texto**. Para imagens, rode um OCR antes (ex.: [Tesseract.js](https://github.com/naptha/tesseract.js) com o idioma `por`). Centavos pequenos no alto (`R$ 5 ³²`) costumam se perder no OCR; o Meu Bolso faz uma segunda leitura da imagem para isso (`js/receipt.js` do app).
- Layouts novos de banco podem sair errados. Cada layout corrigido entra na lista de testes para não voltar a quebrar.

## Contribuir

Achou um comprovante lido errado? Abra uma issue com o modelo **"Print lido errado"** no [repositório](https://github.com/playart1583-hue/app-financeiro/issues), colando o texto **com nomes, CPF, IDs e números de conta trocados por dados fictícios** (nunca o print original). Para corrigir:

1. Adicione o texto em `test/fixtures/prints.js` e o resultado esperado em `test/receipts.test.js`.
2. Corrija em `src/index.js` até todos os prints da lista passarem: `npm test`.

Mais detalhes no [CONTRIBUTING](https://github.com/playart1583-hue/app-financeiro/blob/main/CONTRIBUTING.md) do projeto.

## Licença

[MIT](LICENSE)
