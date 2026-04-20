

# Refactor IPCA → calendario_ipca (CDBLIKE)

## Escopo

Substituir `historico_ipca` + `historico_ipca_projecao` por `calendario_ipca` no caminho `engine = CDBLIKE` + `indexador = IPCA`. Sem look-ahead. Nova coluna `Tipo_Taxa` (`IPCA` | `Projetada`) na Calculadora individual.

## Premissas

- `calendario_ipca` já existe e populada (colunas: `data`, `tipo`, `competencia`, `variacao_mensal`).
- Tabelas legadas saem do código (DROP manual depois).
- Outras engines, Proventos, e `daily-market-sync` não são tocados.

## Mudanças por arquivo

**`src/lib/ipcaHelper.ts`** (reescrita parcial)
- Novo tipo `CalendarioIpcaRecord { data, tipo: 'Oficial'|'Projetada', competencia, variacao_mensal }`.
- `fetchCalendarioIpca(dataInicio, dataFim)` e `fetchCalendarioIpcaBatch(products, dataFim)` lendo `calendario_ipca` (±2 meses na competência).
- `computeJanelaTeorica(dataAplicacao, vencimento) → ISO date` (3 regras com `clampDay`).
- `selectTipoTaxaInicial(dataAplicacao, vencimento, calIpca) → 'IPCA' | 'Projetada'`:
  - `dia_aplicacao = dia_vencimento`: regra do enunciado item 5 (≥15 → Projetada; senão IPCA antes da divulgação, Projetada após).
  - `dia_aplicacao ≠ dia_vencimento`: **fallback temporário** — se existir Oficial da competência vigente e `data_linha >= data_divulgacao_oficial` → `IPCA`; senão `Projetada`. Emite `console.warn("[IPCA] Regras A1–A7 não implementadas — usando fallback temporário")` uma vez por produto.
- `buildIpcaCdbLikeDailyMap(dataInicio, dataCalculo, vencimento, calendario, calIpca) → Map<date, { mult, tipoTaxa }>`:
  - Para cada dia útil, identifica competência via JanelaTeorica.
  - Decide `tipoTaxa` pela mesma regra de seleção (Oficial se `data_linha >= data_divulgação_oficial`, senão Projetada).
  - Distribui `variacao_mensal` pelos dias úteis do ciclo (mecânica equivalente à atual `buildIpcaCdbDailyMultMap`).
- **Remove** `buildIpcaCdbDailyMultMap`, `buildIpcaCycleDailyFactorMap`, `selectIpcaFactor`, `fetchIpcaRecords`, `fetchIpcaRecordsBatch`, tipos `IpcaRecord`/`IpcaProjecaoRecord`.

**`src/lib/rendaFixaEngine.ts`**
- `EngineInput`: troca `ipcaOficialRecords`+`ipcaProjecaoRecords` por `calendarioIpcaRecords?: CalendarioIpcaRecord[]`.
- `DailyRow`: adiciona `tipoTaxa?: 'IPCA' | 'Projetada' | null`.
- Caminho `isPosFixadoIPCA` chama `buildIpcaCdbLikeDailyMap` apenas quando `engine === 'CDBLIKE'`; popula `tipoTaxa` no row.

**`src/lib/engines/registry.ts`** — garantir que `engine` está sendo passado no input.

**`src/components/CalculadoraTable.tsx`** — nova coluna `Tipo Taxa` após `Multiplicador` mostrando `r.tipoTaxa ?? "—"`.

**Call-sites** (substituir fetch + parâmetros):
- `src/pages/AnaliseIndividualPage.tsx`
- `src/pages/CarteiraInvestimentosPage.tsx`
- `src/lib/syncEngine.ts`
- Qualquer outra referência a `fetchIpcaRecords`/`ipcaOficialRecords`.

**`src/lib/engineCache.ts`** — bump de versão para invalidar cache RF.

**`src/integrations/supabase/types.ts`** — adicionar tipagem de `calendario_ipca`. Tipos das tabelas legadas permanecem.

## Fallback A1–A7

Função `selectTipoTaxaInicial` no caso `dia_aplicacao ≠ dia_vencimento` usa: **Oficial se `data_linha >= data_divulgacao_oficial`, senão Projetada**, com `console.warn` único por produto. Trocar pela regra definitiva quando a spec A1–A7 chegar.

## QA pós-implementação

- Smoke test em CDBLIKE IPCA com `dia_aplicacao = dia_vencimento` (regra definitiva).
- Smoke test em CDBLIKE IPCA com `dia_aplicacao ≠ dia_vencimento` (fallback) — confirmar warning no console.
- Conferir nova coluna `Tipo Taxa` na Calculadora.
- Carteira RF e Posição Consolidada devem manter os valores.

