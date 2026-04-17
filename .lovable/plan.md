

## Objetivo

Transformar a tela "Cadastrar Transação" em um **modal global** acessível de qualquer página, eliminando a rota `/cadastrar-transacao` como página standalone. O modal deve ter comportamento inteligente baseado na origem (header genérico vs. botão Aplicação/Resgate na Posição Consolidada).

## Análise da situação atual

- **Hoje**: `CadastrarTransacaoPage` é uma página em `/cadastrar-transacao` (1862 linhas). O header tem o botão "Cadastrar Transação" que navega para essa rota.
- **Posição Consolidada**: já abre um modal próprio (`BoletaCustodiaDialog`) ao clicar em "Aplicação"/"Resgate" no botão de cada linha de ativo — esse modal é diferente do "Cadastrar Transação".
- **Slide PPT confirma**: a boleta deve ser um **único modal** com 2 passos. Quando aberto da Posição Consolidada, vem com campos pré-preenchidos do ativo selecionado e:
  - "Aplicação"/"Resgate": campos do título já preenchidos (ativo, classe, corretora, etc.); apenas valor + data editáveis (demais desabilitados).
  - Quando vem do header genérico: somente "Aplicação" disponível como tipo (sem opção Resgate).

## Plano de implementação

### 1. Criar contexto global `BoletaModalContext`

Novo arquivo `src/contexts/BoletaModalContext.tsx`:
- Provê `openBoleta(options)` e estado `isOpen`.
- `options`: `{ origin: 'header' | 'posicao', tipo?: 'Aplicação' | 'Resgate', prefill?: CustodiaRowForBoleta }`.
- Provider colocado no `App.tsx` dentro de `AuthProvider`.

### 2. Converter `CadastrarTransacaoPage` em componente de modal

Novo arquivo `src/components/CadastrarTransacaoDialog.tsx`:
- Reaproveita 100% da lógica existente em `CadastrarTransacaoPage.tsx` (estados, validações, submit, regras de campos por categoria/produto — **não alterar regras dos campos**).
- Renderiza dentro de `<Dialog>/<DialogContent>` (shadcn) com layout dos 2 passos do PPT.
- Recebe props: `open`, `onClose`, `origin`, `tipo` (opcional), `prefill` (opcional).
- Comportamentos por origem:
  - **`origin='header'`**: oculta opção "Resgate" no campo Tipo (apenas "Aplicação"). Fluxo completo dos 2 passos.
  - **`origin='posicao'` + `tipo='Aplicação'`**: passa direto para passo 2 com campos do título (ativo, classe, corretora, modalidade, indexador, taxa, vencimento, banco emissor, periodicidade, PU) **desabilitados e pré-preenchidos** a partir do `prefill`. Apenas Valor + Data editáveis.
  - **`origin='posicao'` + `tipo='Resgate'`**: idem, mas tipo fixo em "Resgate"; mantém validações de saldo/data já existentes.
- Após sucesso: fecha modal, dispara `applyDataReferencia()` para refresh da página atual (sem navegação).

### 3. Remover a página/rota antiga

- Em `src/App.tsx`: remover `import` lazy de `CadastrarTransacaoPage` e a `<Route path="/cadastrar-transacao">`.
- Em `src/pages/AppPages.tsx`: remover export `CadastrarTransacao`.
- Deletar `src/pages/CadastrarTransacaoPage.tsx` após mover lógica.
- Atualizar todos os pontos que faziam `navigate("/cadastrar-transacao")` para chamar `openBoleta({ origin: 'header' })`:
  - `src/components/AppHeader.tsx` (botão "Cadastrar Transação")
  - `src/components/OnboardingRendaFixaModal.tsx` (2 ocorrências)
  - `src/pages/AppPages.tsx` (link "cadastrar")
- **Edição de movimentações** (`PosicaoDetalheDialog.tsx` linha 230 → `navigate('/cadastrar-transacao?edit=...')`): substituir por abertura do modal em modo edição (`openBoleta({ origin: 'edit', editId })`) — manter mesmo fluxo de edição.

### 4. Substituir `BoletaCustodiaDialog` na Posição Consolidada

- Em `PosicaoConsolidadaPage.tsx`: remover uso do `BoletaCustodiaDialog`. O handler `handleAplicarResgateClick` agora chama `openBoleta({ origin: 'posicao', tipo, prefill: dialogRow })`.
- O componente `BoletaCustodiaDialog` deixa de ser usado — pode ser deletado ou mantido por segurança até validação. **Recomendo deletar** após teste.

### 5. Layout do modal (conforme PPT)

- Largura confortável (`max-w-2xl` ou `max-w-3xl`), padding `p-6`.
- Header: título "Cadastrar transação" + indicador "Passo X de 2".
- Passo 1: Ativo (SearchableSelect produtos), Data, Corretora, Tipo, botão "Próximo".
- Passo 2: campos específicos por produto (já existentes), Total no rodapé, botões "Voltar" e "Cadastrar".
- Quando origem = posição consolidada: pular passo 1, abrir direto no passo 2 com campos travados.

## Regras preservadas (não alterar)

- Validações de campos por categoria/produto.
- Cálculo de saldo, cotação, validações de data, dia útil, vencimento, etc.
- Lógica de submit (insert em `movimentacoes`, `fullSyncAfterMovimentacao`, `applyDataReferencia`).
- Fluxo de edição via `?edit=`.

## Detalhes técnicos

**Arquivos novos**:
- `src/contexts/BoletaModalContext.tsx`
- `src/components/CadastrarTransacaoDialog.tsx`

**Arquivos modificados**:
- `src/App.tsx` — adicionar provider, remover rota, renderizar `<CadastrarTransacaoDialog>` global controlado pelo contexto.
- `src/components/AppHeader.tsx` — substituir navigate por openBoleta.
- `src/components/OnboardingRendaFixaModal.tsx` — idem.
- `src/components/PosicaoDetalheDialog.tsx` — substituir navigate de edição.
- `src/pages/PosicaoConsolidadaPage.tsx` — usar openBoleta no lugar de BoletaCustodiaDialog.
- `src/pages/AppPages.tsx` — remover export e uso de navigate.

**Arquivos removidos**:
- `src/pages/CadastrarTransacaoPage.tsx`
- `src/components/BoletaCustodiaDialog.tsx` (após validação)

## Fora de escopo

- Nenhuma alteração em engines de cálculo, regras de validação de campos ou lógica de submit.
- Tela de detalhamento da poupança permanece como está (já implementada anteriormente).

