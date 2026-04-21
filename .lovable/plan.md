

# Ajuste fino do IPCA CDBLIKE — competência da janela e contagem `(inicio, fim]`

## Resumo

Dois ajustes cirúrgicos no helper IPCA, sem mexer no resto da engine, na UI ou em outros indexadores.

## Mudanças

### 1. `getJanelaAtual` — competência alinhada à janela teórica

A competência passa a ser derivada do **aniversário final** da janela (não mais do inicial), refletindo o índice de inflação efetivamente distribuído no ciclo.

Implementação em `src/lib/ipcaHelper.ts`:

- `getJanelaAtual(data, vencimento) → { inicio, fim, competencia }`
  - `inicio` = último aniversário ≤ `data` (com clamp para o último dia do mês quando o dia do vencimento não existir)
  - `fim` = próximo aniversário > `data` (mesmo clamp)
  - `compRefDate = fim - 1 mês`
  - `competencia = primeiro dia do mês de compRefDate` (`YYYY-MM-01`)

Cobertura dos casos críticos:

- **datas fora do aniversário**: `data` cai numa janela cujo `fim` é o próximo aniversário; competência = mês anterior a esse `fim`
- **virada de mês**: o `fim` da janela já está no mês seguinte → competência fica corretamente atualizada
- **datas próximas da divulgação**: a decisão Oficial vs Projetada continua sendo feita por dia em `getRegistroIpcaDaCompetencia`, mas agora sobre a competência correta

### 2. `countDiasUteisJanela` — intervalo `(inicio, fim]`

Função pura única, usada para cálculo do divisor e auditoria:

- excluir aniversário inicial: `data > janela.inicio`
- incluir aniversário final: `data <= janela.fim`
- considerar apenas `dia_util === true`

### 3. `buildIpcaCdblikeDailyFactorMap` — propagar mudanças

Para cada dia útil em `[dataInicio, dataCalculo]`:

- `janela = getJanelaAtual(data, vencimento)`
- `divisor = countDiasUteisJanela(janela, calendario)` — cacheado por `${janela.inicio}|${janela.fim}`
- `{ tipo, variacaoMensal } = getRegistroIpcaDaCompetencia(janela.competencia, data, index)` — reavaliado por dia (sem look-ahead)
- `mult = (1 + variacaoMensal/100)^(1/divisor)`
- `tipoTaxa = tipo`, `taxaMensalPct = variacaoMensal`

Dia não útil:

- `mult = 1`, `tipoTaxa = null`, `taxaMensalPct = null`

### 4. `engineCache.ts`

Bump para `v6-ipca-competencia-fim` para forçar recálculo limpo da Carteira RF e Posição Consolidada.

## Itens fora do escopo

- `rendaFixaEngine.ts` e `CalculadoraTable.tsx`: assinatura externa do helper se mantém — sem mudanças.
- CDI, Prefixado, Poupança, Câmbio, Proventos.
- Estrutura da `calendario_ipca` e jobs de ingestão.

## Detalhes técnicos relevantes

- **Chave de cache da janela**: `${janela.inicio}|${janela.fim}` (não mais `lastAnniversary|competencia`), refletindo que o divisor depende exclusivamente da janela.
- **Sem look-ahead preservado**: Oficial só é usada quando `dataLinha >= data_divulgacao_oficial`; senão Projetada.
- **Tipo por dia**: o tipo (`IPCA`/`Projetada`) é reavaliado a cada dia mesmo dentro da mesma janela, capturando a virada Projetada → Oficial na divulgação.

## QA pós-implementação

- Vencimento dia 11, data 03/mar: janela = `(11/fev, 11/mar]`, competência = `2024-02`.
- Vencimento dia 11, data 12/mar: janela = `(11/mar, 11/abr]`, competência = `2024-03`.
- Vencimento dia 31, mês com 30 dias: aniversário cai no dia 30; competência segue a regra do `fim`.
- Aplicação em 20/mai com vencimento dia 5: janela vigente = `(05/mai, 05/jun]`, competência = `2024-05`.
- Auditar janela com 22 dias úteis: divisor = 22 exato.
- Confirmar que `Tipo Taxa` na Calculadora alterna corretamente em torno da data de divulgação da competência vigente.

