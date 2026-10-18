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
| **Contrato de empréstimo por print**: lê valor liberado, valor financiado, parcelas, taxa, CET, IOF, tarifas e seguro; mostra o custo real, **o que melhora, o que piora e o impacto no dia a dia** (sobra mensal antes × depois, % da renda comprometida, metas que atrasam) antes de você contratar; pode quitar dívidas caras com o dinheiro | Início → *Empréstimo* · Planejar · Dívidas |
| **Encerre primeiro**: ranking de Pix parcelados, parcelamentos com juros e empréstimos do mais caro para o mais barato, com valor para quitar hoje e juros economizados (desconto obrigatório na quitação antecipada, CDC art. 52) | Dívidas e Dicas |
| **Notificações do Mercado Pago, 99, 99Pay e bancos**: várias de uma vez por print ou texto, com aviso de lançamento repetido | Início → *Notificações* |
| **Importar arquivos** de bancos e outros apps: CSV, TSV, TXT, **OFX**, Excel (XLSX/XLS/ODS), JSON e PDF de extrato. Reconhece Nubank, Inter, Mercado Pago, Mobills/Organizze e planilhas genéricas; você ajusta as colunas, revê categorias e os repetidos ficam desmarcados | Extrato → *Importar arquivo* · Início → *Arquivo* |
| **Importar a fatura do cartão** (PDF, prints das páginas, CSV ou OFX): lê cartão, vencimento e total, ignora o pagamento da fatura, marca estornos e juros/IOF, detecta parcelas ("3/10") e cria as parcelas futuras; confere a soma com o total da fatura | Extrato → *Importar fatura* · Início → *Fatura* |
| **Registro automático** (Android): compartilhe um print/texto para o app instalado, ou use uma automação (MacroDroid) que abre `…/?registrar=<texto da notificação>` | Ajustes → Mercado Pago, 99 e notificações |
| Cofrinhos (metas) com quanto guardar por mês até o prazo e rendimento estimado | Planejar → Cofrinhos |
| Orçamento por categoria com alertas em 80% e 100% | Planejar → Orçamentos |
| Sugestões automáticas: onde cortar, gastos pequenos, arredondamento para o cofrinho, reserva de emergência, dívida mais cara, plano de quitação | Início e Planejar → Dicas |
| Ocultar valores, tema claro/escuro, backup (exportar/importar JSON) | Ajustes |

## App Android (APK)

O app também é empacotado como APK com o [Capacitor](https://capacitorjs.com), em duas variantes (mesmo app, mesma assinatura — dá para trocar de uma para a outra sem perder dados):

- **`meu-bolso-X.apk` (leve, recomendada):** instala normalmente fora da Play Store. O registro automático das notificações é feito com o **MacroDroid** (Play Store), que repassa cada notificação para o Meu Bolso pelo broadcast `br.com.meubolso.app.REGISTRAR` (extra `texto`), sem abrir o app. O passo a passo está em *Ajustes*.
- **`meu-bolso-X-completo.apk`** (só nos *Artifacts* da execução do Actions, não em Releases): o próprio app lê as notificações do Mercado Pago, 99, 99Pay e bancos. **No Brasil, o Google Play Protect bloqueia a instalação** de APKs baixados da internet que pedem acesso às notificações; essa variante serve para instalar via computador (`adb install`) ou para uma futura publicação na Play Store.

Nas duas: **Compartilhar → Meu Bolso** para prints, textos, PDF de fatura, CSV, OFX e planilhas.

Instalar: baixe o APK mais recente em **Releases** (ou `dist/`) no celular, abra e permita "instalar apps desconhecidos" para o app que você usou para abrir o arquivo.

Gerar de novo:

```bash
npm install
npm run android:apk        # precisa de JDK 21 e Android SDK (ANDROID_HOME)
# saída: android/app/build/outputs/apk/{leve,completo}/release/
```

Ou pelo GitHub: *Actions → APK Android → Run workflow* (também roda a cada push). O APK é publicado em **Releases**, pronto para baixar no celular, e fica também em *Artifacts* da execução. Em repositório privado, o GitHub Actions precisa estar liberado na conta (Settings → Billing and plans).

A chave de assinatura fica **criptografada** em `android/keystore/meubolso.jks.enc`. O GitHub Actions a abre com o secret `ANDROID_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions); sem esse secret o build para com aviso. Para gerar no computador, abra a chave com `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in android/keystore/meubolso.jks.enc -out android/keystore/meubolso.jks` e exporte `ANDROID_KEYSTORE_PASSWORD`. Guarde a senha: sem ela não dá para lançar atualizações que instalem por cima. Ao lançar uma versão nova, aumente `versionCode` em `android/app/build.gradle`.

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

## Importar de outros apps e da fatura

Formatos aceitos: **CSV/TSV/TXT** (vírgula, ponto e vírgula, tab; UTF-8 ou Windows-1252), **OFX/QFX**, **XLSX/XLS/ODS** (via SheetJS), **JSON** (backup deste app — juntar ou substituir — ou lista de outro app), **PDF** (texto extraído com pdf.js) e **imagens**. Quando o formato não é reconhecido, o texto é organizado pelo Claude (no app da Claude ou com a chave da API).

Na fatura, o pagamento da fatura anterior vem desmarcado (para não contar o gasto duas vezes), estornos entram como reembolso e juros/IOF/anuidade como "Impostos e taxas". Compras parceladas importam a parcela do mês e, se você quiser, as próximas — numa fatura seguinte, as parcelas que já existem aparecem como repetidas.

## Mercado Pago e 99

Nenhum dos dois oferece uma API para apps pessoais lerem o extrato: a API do Mercado Pago é voltada a vendedores (pagamentos recebidos) e exige servidor próprio, e a 99 não tem API pública. Um app de navegador também não consegue ler as notificações do celular. Por isso o app oferece três caminhos:

1. **Print ou texto** (Android e iPhone): Início → *Notificações*.
2. **Compartilhar** (Android, app instalado na tela inicial): o app aparece no menu Compartilhar e recebe prints e textos.
3. **Automação** (Android): no MacroDroid, gatilho *Notificação recebida* (Mercado Pago, 99, 99Pay, banco) e ação *Abrir site* com `https://SEU-ENDERECO/?registrar=[not_title] [notification]`. O app registra sozinho e mostra "Desfazer"; repetidos pedem confirmação.

A conexão direta com bancos e carteiras exige Open Finance via um agregador autorizado (Pluggy, Belvo), com servidor e contrato: é o próximo passo natural se o protótipo virar produto.

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
