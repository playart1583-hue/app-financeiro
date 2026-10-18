# Meu Bolso — controle financeiro do dia a dia

Protótipo de app de finanças pessoais (PWA, funciona no celular e pode ser instalado na tela inicial).
Visual inspirado em apps como o iDinheiro: cabeçalho verde com saldo, atalhos redondos, cartões e barra inferior com botão **+**.

Abre com **dados de exemplo** para você explorar. Em *Início → Apagar exemplos* você começa do zero.

## O que tem

| Recurso | Onde |
|---|---|
| Registrar gastos e ganhos (categoria, classificação, data, horário, forma de pagamento, cartão, parcelas, conta fixa mensal) | botão **+** |
| **Registro rápido por texto**: `almoço 32,90 débito`, `+ freela 300`, `tênis 3x 120 crédito`, `uber 18 ontem` | Início |
| **Ler print da compra**: identifica onde, quando, horário, cartão (final/bandeira/banco), forma de pagamento, parcelas e valor, e preenche o lançamento para você conferir | Início → *Ler print* ou dentro do **+** |
| Categorização automática (palavras-chave: iFood, Uber, Drogasil, Assaí…) e classificação essencial / importante / supérfluo | formulário |
| Extrato por mês com busca e filtros; toque para editar ou excluir (inclusive todas as parcelas) | Extrato |
| Relatórios mensais: categorias, regra 50/30/20, receitas × despesas em 6 meses, maiores gastos, formas de pagamento | Relatórios |
| **Projeção de gastos**: fim do mês no ritmo atual, quanto pode gastar por dia, e os próximos 6 meses (parcelas, contas fixas, dívidas + média do dia a dia) | Início e Relatórios |
| **Pix parcelado: quanto de juros** — taxa ao mês, ao ano, juros em R$ e se compensa parcelar | formulário e Planejar → Simulador |
| **Empréstimos e dívidas**: parcelados (calcula a taxa a partir da parcela), cartão rotativo/cheque especial, negativadas; pagar parcela, simular amortização | Planejar → Dívidas |
| **Dívidas do Serasa**: importar por print ou texto do Serasa Limpa Nome, com oferta de desconto | Dívidas → *Importar do Serasa* |
| **Plano para zerar dívidas**: compara *Nome limpo primeiro*, *Avalanche* (menos juros) e *Bola de neve*; mostra o mês em que cada dívida acaba | Dívidas |
| Cofrinhos (metas) com quanto guardar por mês até o prazo e rendimento estimado | Planejar → Cofrinhos |
| Orçamento por categoria com alertas em 80% e 100% | Planejar → Orçamentos |
| Sugestões automáticas: onde cortar, gastos pequenos, arredondamento para o cofrinho, reserva de emergência, dívida mais cara, plano de quitação | Início e Planejar → Dicas |
| Ocultar valores, tema claro/escuro, backup (exportar/importar JSON) | Ajustes |

## Como rodar

Não precisa instalar nada nem compilar:

```bash
npm start            # ou: python3 -m http.server 8080
# abra http://localhost:8080
```

No celular, abra o endereço e use *Adicionar à tela inicial*. Para publicar de graça, ative o GitHub Pages neste repositório (branch e pasta raiz).

Testes dos cálculos e dos leitores de texto:

```bash
npm test
```

## Leitura de prints

A leitura tenta, nesta ordem:

1. **Claude dentro do app da Claude** (quando aberto como Artifact): usa a sua conta, sem chave.
2. **Claude API com sua chave** (*Ajustes → Leitura de prints*): a chave fica só no aparelho. Usa o modelo `claude-opus-5-5` com saída estruturada (JSON validado).
3. **OCR no aparelho** (Tesseract.js) + interpretação por regras em `js/parser.js`: funciona sem conta, com menos precisão.

Também é possível colar o texto de uma notificação ou comprovante.

## Sobre o Serasa

O Serasa não oferece uma API para apps pessoais consultarem o CPF: o acesso deles é só para empresas parceiras, com contrato. Por isso o app **importa** as dívidas a partir de um print (ou do texto copiado) da tela *Limpa Nome*. Elas entram no plano como "negativadas" e, na estratégia *Nome limpo primeiro*, são quitadas antes das demais, da menor oferta para a maior.

## Seus dados

- Fora do app da Claude: tudo fica no `localStorage` do navegador. Use *Exportar backup* de vez em quando.
- Como Artifact no app da Claude: os dados também ficam numa pasta privada da sua conta (`data/users/<você>/`), e aparecem em qualquer aparelho em que você abrir.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   app instalável (PWA) com cache offline
css/app.css                                visual (tokens de cor para claro/escuro)
js/finance.js                              matemática: Price, taxa embutida, saldo devedor, plano de quitação
js/parser.js                               registro rápido, comprovantes, lista do Serasa
js/categories.js                           categorias, palavras-chave, formas de pagamento
js/analytics.js                            resumos, médias, projeções, dívidas
js/insights.js                             sugestões automáticas
js/receipt.js                              leitura de imagem (Claude / API / OCR)
js/store.js                                estado, persistência e sincronização
js/views/*.js                              telas
tests/                                     testes (node --test)
```

Os cálculos são estimativas e não substituem orientação financeira profissional.
