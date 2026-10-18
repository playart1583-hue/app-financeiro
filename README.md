# Meu Bolso — controle financeiro do dia a dia

Protótipo de app de finanças pessoais (PWA, funciona no celular e pode ser instalado na tela inicial).
Visual inspirado em apps como o iDinheiro: cabeçalho verde com saldo, atalhos redondos, cartões e barra inferior com botão **+**.

Abre com **dados de exemplo** para você explorar. Em *Início → Apagar exemplos* você começa do zero.

## O que tem

| Recurso | Onde |
|---|---|
| Registrar gastos e ganhos (categoria, classificação, data, horário, forma de pagamento, cartão, parcelas, conta fixa mensal) | botão **+** |
| **Registro rápido por texto**: `almoço 32,90 débito`, `+ freela 300`, `tênis 3x 120 crédito`, `uber 18 ontem` | Início |
| **Ler print da compra**: identifica onde, quando, horário, cartão (final/bandeira/banco), forma de pagamento, parcelas e valor, e **registra sozinho** (com Desfazer; repetidos e prints sem valor abrem para você conferir; dá para desligar em Ajustes) | Início → *Ler print* ou dentro do **+** |
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
| **Importar arquivos** de bancos e outros apps: CSV, TSV, TXT, **OFX**, Excel (XLSX/XLS/ODS), JSON e PDF de extrato. Reconhece Nubank, Inter, Mercado Pago, Mobills/Organizze e planilhas genéricas; você ajusta as colunas, revê categorias e os repetidos ficam desmarcados | Extrato → *Importar arquivo* · Início → *Arquivo* |
| **Importar a fatura do cartão** (PDF, prints das páginas, CSV ou OFX): lê cartão, vencimento e total, ignora o pagamento da fatura, marca estornos e juros/IOF, detecta parcelas ("3/10") e cria as parcelas futuras; confere a soma com o total da fatura | Extrato → *Importar fatura* · Início → *Fatura* |
| Cofrinhos (metas) com quanto guardar por mês até o prazo e rendimento estimado | Planejar → Cofrinhos |
| Orçamento por categoria com alertas em 80% e 100% | Planejar → Orçamentos |
| Sugestões automáticas: onde cortar, gastos pequenos, arredondamento para o cofrinho, reserva de emergência, dívida mais cara, plano de quitação | Início e Planejar → Dicas |
| Ocultar valores, tema claro/escuro, backup (exportar/importar JSON) | Ajustes |
| **Botão +** com todas as entradas: preencher à mão, ler print, documento ou fatura, colar texto, contrato de empréstimo | Barra inferior |
| **Colar texto**: linhas de extrato, texto de fatura ou anotações ("almoço 32,90 débito", uma por linha) viram lançamentos para conferir | + → *Colar texto* |
| **Transferências entre suas contas** (ex.: Santander → Mercado Pago): escolha *↔ Entre contas* no lançamento; aparece no extrato e não conta como gasto nem ganho. O app lembra o seu nome e marca a outra ponta (mesmo valor, até 30 min) | Extrato · Ajustes → *Seu nome completo* |
| **Navegação no Android**: o botão voltar do celular fecha a janela aberta e volta para a tela anterior do app; no Início ele não sai (use o botão de início ou o de apps recentes). a engrenagem de Ajustes fica no canto de cima de todas as telas | Todas as telas |
| **Vários de uma vez**: escolha vários prints de compras (cada um vira um lançamento, numa lista para conferir), vários arquivos de extrato/fatura (CSV, OFX, PDF, DOCX, planilhas e prints juntos), várias telas do Serasa ou várias páginas do contrato. O Compartilhar do celular também aceita seleções com vários arquivos | + → *Ler prints* · *Documento ou fatura* |
| **Meus cartões**: cadastre o final (ex.: 8238), o banco, o dia em que a fatura fecha e o dia em que vence. Compra antes do fechamento entra na fatura aberta; no dia do fechamento ou depois, a 1ª parcela vai para o vencimento seguinte. No lançamento o cartão tem campo próprio (*Final do cartão* + *Banco*); compra parcelada ganha *Vencimento da 1ª parcela*, preenchido pelo cartão cadastrado, e cada parcela entra no mês em que vence. Toda compra no crédito (à vista ou parcelada) entra no mês em que a fatura vence; o Extrato mostra a data da compra. Em prints e arquivos o app acha o final do cartão no texto ("final 8238", "terminando em 8238", "Cartão 8238", "•••• 8238" ou um final já cadastrado) e lança as próximas parcelas nos meses seguintes | Ajustes → *Meus cartões* · Planejar |
| **Bloqueio por digital** (app Android): pede digital, rosto ou senha do celular ao abrir e ao voltar depois de 30 s | Ajustes → *Bloqueio por digital* |

## App Android (APK)

O app também é empacotado como APK com o [Capacitor](https://capacitorjs.com). Ele **não lê notificações** e não registra nada sozinho: os lançamentos entram pelo formulário, por print, por documento ou por texto colado. Use **Compartilhar → Meu Bolso** para prints, textos, PDF de fatura, CSV, OFX e planilhas.

Instalar: baixe o APK mais recente em **Releases** (ou `dist/`) no celular, abra e permita "instalar apps desconhecidos" para o app que você usou para abrir o arquivo.

Gerar de novo:

```bash
npm install
npm run android:apk        # precisa de JDK 21 e Android SDK (ANDROID_HOME)
# saída: android/app/build/outputs/apk/release/
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

Também é possível colar o texto de um comprovante.

## Importar de outros apps e da fatura

Formatos aceitos: **PDF** (inclusive escaneado: as páginas são lidas como prints), **DOCX/ODT/RTF/HTML** (texto e tabelas), **CSV/TSV/TXT** (vírgula, ponto e vírgula, tab; UTF-8 ou Windows-1252), **OFX/QFX**, **XLSX/XLS/ODS** (via SheetJS), **JSON** (backup deste app — juntar ou substituir — ou lista de outro app), **PDF** (texto extraído com pdf.js) e **imagens**. Quando o formato não é reconhecido, o texto é organizado pelo Claude (no app da Claude ou com a chave da API).

Na fatura, o pagamento da fatura anterior vem desmarcado (para não contar o gasto duas vezes), estornos entram como reembolso e juros/IOF/anuidade como "Impostos e taxas". Compras parceladas importam a parcela do mês e, se você quiser, as próximas — numa fatura seguinte, as parcelas que já existem aparecem como repetidas.

## Mercado Pago e 99

Nenhum dos dois oferece uma API para apps pessoais lerem o extrato, e o registro automático pelas notificações do celular erra demais (Pix enviado lido como recebido, transferências entre contas próprias contadas como gasto). Por isso o app não usa notificações: importe o extrato (CSV/PDF) ou mande o print do comprovante e confira antes de salvar.

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
