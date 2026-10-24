# Roteiro do Meu Bolso

## Onde o projeto está (outubro de 2026)

- **Estágio:** pré-1.0, usado no dia a dia por um usuário, sem usuários externos ainda. Versão atual do APK: 1.10.x.
- **Funciona hoje:** lançamentos à mão, por print (OCR no aparelho ou Claude), por arquivo (CSV, OFX, PDF, planilhas, faturas); cartões com fechamento e vencimento; parcelados e Pix parcelado; dívidas, empréstimos e plano de quitação; tela de juros e taxas; cofrinhos; orçamentos; perfis; lembretes no Android. Detalhes no [README](README.md).
- **Qualidade:** 76 testes automáticos (`npm test`); cobertura de cerca de 78% das linhas nos módulos de lógica (cálculos, leitura de texto, importadores). As telas (`js/views`) ainda não têm testes automáticos.
- **Limites conhecidos:** a leitura de prints no aparelho erra em layouts que ainda não estão na lista de testes; dados ficam só no aparelho (sem sincronização fora do app da Claude); só Android (iOS e web funcionam como PWA, sem lembretes).

## Curto prazo (próximos 3 meses) — base para outras pessoas usarem e contribuírem

- [ ] Publicar o código no `main` e o app web no GitHub Pages (qualquer pessoa testa pelo navegador, sem instalar)
- [ ] CI com testes em todo push e pull request (inclusive de forks) e relatório de cobertura
- [ ] Leitura de prints: ampliar a lista de prints reais anonimizados dos principais bancos e carteiras (Nubank, Itaú, Bradesco, Santander, Caixa, BB, Inter, Mercado Pago, PicPay, 99Pay, PagBank) — meta de 30 layouts com teste
- [ ] Modelo de issue para "print lido errado" e guia de anonimização (feito no [CONTRIBUTING](CONTRIBUTING.md))
- [ ] Testes das regras que hoje dependem do navegador (`js/store.js`: perfis, parcelas, vencimentos) com um `localStorage` simulado
- [ ] Testes de ponta a ponta das telas principais com Playwright no CI

## Médio prazo (3 a 9 meses) — v1.0

- [ ] **Privacidade e LGPD:** backup exportado com criptografia por senha; botão "apagar todos os meus dados" em um passo; página explicando quais dados existem e onde ficam
- [ ] Cobertura de testes acima de 80% no total, incluindo telas
- [ ] Acessibilidade: leitor de tela (TalkBack), contraste e tamanho de fonte revisados
- [ ] Importação de fatura e extrato dos principais bancos com teste por banco (arquivos de exemplo anonimizados)
- [ ] Documentação para quem usa (como começar, como importar, perguntas frequentes) e para quem contribui (arquitetura)
- [ ] Lançamento da v1.0 com APK assinado em Releases e PWA estável

## Longo prazo — depende de interesse da comunidade

- [ ] **Sincronização auto-hospedada** opcional entre aparelhos, com criptografia de ponta a ponta (o servidor não lê os dados)
- [ ] Open Finance via agregador autorizado, como módulo opcional para quem hospedar o próprio servidor
- [ ] Contas compartilhadas (casal, família) com divisão de gastos
- [ ] Publicação em lojas (F-Droid e Google Play)
- [ ] Tradução para outros idiomas (o formato de dinheiro e as regras de cartão já são isolados)

## Como acompanhar

As tarefas viram issues com o rótulo `roadmap`. Quer pegar uma? Comente na issue e veja o [CONTRIBUTING](CONTRIBUTING.md).
